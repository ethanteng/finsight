/**
 * Public Coast FIRE endpoints.
 *
 * The seven-number formula itself still runs in the browser. These routes
 * exist for the two things a browser cannot do on its own:
 *
 *   POST /email-results   store the run, email the visitor, put them on the list
 *   GET  /signup-context  hand the scenario back to signup or sign-in
 *
 * Both are unauthenticated, because the whole point is reaching someone who
 * has no account yet. Each costs something different, so each has its own
 * window: the email puts mail in an inbox chosen by the caller, and the
 * context read is performed by a recipient opening a link.
 *
 * The email route recomputes the result here rather than reading it out of
 * the request: the run it stores becomes a decision in an account, so it may
 * only hold figures we calculated.
 */

import express, { Request, Response } from 'express';
import { createFixedWindowRateLimit, positiveIntFromEnv } from './fixed-window-rate-limit';
import { validateEmail } from '../auth/utils';
import { sendCalculatorReadyEmail } from '../auth/resend-email';
import { coastFireInputRows } from '../email/calculator-input-rows';
import { getBaseUrl } from '../email/templates';
import {
  calculateCoastFire,
  CoastFireValidationError,
  parseCoastFireInputs,
} from '../services/coast-fire';
import {
  generateLeadToken,
  isLeadToken,
  markCoastFireLeadDelivery,
  markCoastFireLeadTokenDisclosed,
  readCoastFireLead,
  recordCoastFireLead,
} from '../services/coast-fire-leads';
import {
  LIFECYCLE_EMAIL_SIGNUP_ENTRY,
  coastFireGroupIds,
  subscribeToMailerLite,
} from '../services/mailerlite-subscribe';
import { parseCalculatorLeadAttribution } from '../services/calculator-lead-attribution';
import { accountExistsForEmail } from '../services/calculator-account-lookup';

const router = express.Router();

/**
 * Deliberately far below the quick plan's twenty. Every accepted request sends
 * mail to an address the caller chose, so the limit is set where a person
 * correcting a typo and re-sending is comfortable and a script is not.
 */
const EMAIL_REQUESTS_PER_WINDOW = positiveIntFromEnv('COAST_FIRE_EMAIL_RATE_LIMIT', 5);
const CONTEXT_REQUESTS_PER_WINDOW = positiveIntFromEnv('COAST_FIRE_CONTEXT_RATE_LIMIT', 30);
const TRUSTED_HOPS = positiveIntFromEnv('COAST_FIRE_TRUSTED_PROXIES', 1);

const emailRateLimit = createFixedWindowRateLimit({
  limit: EMAIL_REQUESTS_PER_WINDOW,
  trustedHops: TRUSTED_HOPS,
  message: 'Too many requests. Please wait a moment and try again.',
});

/**
 * Its own window, and a wider one: this is a read the recipient performs by
 * opening a link, and it must not be spent by the send that preceded it. It is
 * still limited, because the token is the only thing guarding the scenario
 * behind it.
 */
const contextRateLimit = createFixedWindowRateLimit({
  limit: CONTEXT_REQUESTS_PER_WINDOW,
  trustedHops: TRUSTED_HOPS,
});

/** Long enough for any real address, short enough to not be a payload. */
const MAX_EMAIL_LENGTH = 254;

function readEmail(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new CoastFireValidationError('Enter your email address.', 'email');
  }
  const email = raw.trim().toLowerCase();
  if (email.length === 0) {
    throw new CoastFireValidationError('Enter your email address.', 'email');
  }
  if (email.length > MAX_EMAIL_LENGTH || !validateEmail(email)) {
    throw new CoastFireValidationError('Enter a valid email address.', 'email');
  }
  return email;
}

/**
 * The link in the email.
 *
 * It carries an opaque token and nothing else — no figures, no address. And it
 * points at `/coast-fire/continue` rather than at signup directly: that
 * handler moves the token into a short-lived first-party cookie and redirects
 * to a clean URL, so the token is never in the address of a rendered page,
 * where Google Tag Manager and every tag in the container would see it.
 */
function continueUrl(token: string, existingAccount: boolean): string {
  const url = `${getBaseUrl()}/coast-fire/continue?ref=${token}`;
  // An address that already has an account cannot register again, so its
  // link lands on sign-in, where the run is attached, instead of on signup.
  return existingAccount ? `${url}&to=sign-in` : url;
}

/**
 * The same link, stored on the MailerLite subscriber for the follow-up emails
 * a lead gets before starting a trial. Their buttons open the saved run, and
 * the signup then records the lead's own attribution rather than the email's.
 *
 * `entry=drip_email` keeps those clicks out of the results-email funnel: the
 * signup page counts them as their own entry, not as opens of this email.
 */
function lifecycleContinueUrl(token: string, existingAccount: boolean): string {
  return `${continueUrl(token, existingAccount)}&entry=${LIFECYCLE_EMAIL_SIGNUP_ENTRY}`;
}

router.post('/email-results', emailRateLimit, async (req: Request, res: Response) => {
  let email: string;
  let result;

  try {
    email = readEmail(req.body?.email);
    // Recomputed here, never read from the body: an emailed figure carries our
    // branding, so it has to be one we calculated.
    result = calculateCoastFire(parseCoastFireInputs(req.body));
  } catch (error) {
    if (error instanceof CoastFireValidationError) {
      res.status(400).json({ error: error.message, field: error.field });
      return;
    }
    console.error('❌ Coast FIRE email request failed validation:', error);
    res.status(400).json({ error: 'Check your numbers and try again.' });
    return;
  }

  // The scenario is stored before the send so the link in that email resolves.
  // A failed write is a 503 with no email: there is no account-side copy to
  // point at, and the page shows no result itself.
  const token = generateLeadToken();
  const attribution = parseCalculatorLeadAttribution(req.body?.attribution);
  const [stored, existingAccount] = await Promise.all([
    recordCoastFireLead({ email, token, result, attribution }),
    accountExistsForEmail(email),
  ]);

  /*
   * Nothing stored means nothing any account could open, and the page shows
   * no result itself, so it says so and the visitor retries. No email either:
   * a retry would send another, and the answer belongs in Ask Linc.
   */
  if (!stored) {
    res.status(503).json({
      error: 'We could not save your result just now. Please try again in a moment.',
    });
    return;
  }

  /*
   * Every stored lead gets the "ready in Ask Linc" message, which states no
   * figures: the answer is shown in the account. A new address is linked to
   * signup; one that already has an account is linked to sign-in, where the
   * run is attached.
   */
  const emailSent = await sendCalculatorReadyEmail({
    calculator: 'coast_fire',
    inputs: coastFireInputRows(result),
    email,
    ctaUrl: continueUrl(token, existingAccount),
    existingAccount,
  });

  if (!emailSent) {
    res.status(502).json({
      error: 'We could not send that email just now. Please try again in a moment.',
    });
    return;
  }

  /*
   * Handed back so the page can take this visitor into Ask Linc with the run
   * rather than asking them to go and find the email: to signup for a new
   * address, to sign-in for an existing account, where it is attached
   * (`POST /auth/calculator-lead`, which checks the lead's address against the
   * signed-in account). Disclosed tokens are marked first, and registration
   * reads that mark to decide whether the address is recorded as verified.
   * See `src/auth/routes.ts`.
   *
   * Marked before it is returned, and not returned at all if the mark did not
   * take: a token loose in a page while the row still claims it was only
   * emailed would record a stranger's address as verified. Without a ref the
   * page asks the visitor to use the emailed link; that link still works.
   */
  const ref = (await markCoastFireLeadTokenDisclosed(token)) ? token : null;

  // The token is a bearer credential for this lead. Nothing about this
  // response may sit in a shared cache.
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    message: 'Your Coast FIRE result is ready in Ask Linc.',
    ref,
    // Lets the page send this visitor to sign in rather than to a signup that
    // would refuse the address.
    ...(existingAccount ? { existingAccount: true } : {}),
  });

  // After the response. Joining the list is what the checkbox promised, but a
  // slow or failing MailerLite must not hold up the results the visitor asked
  // for, and it is already recorded here either way.
  void (async () => {
    // The send is recorded first and on its own. The subscribe below can take
    // up to its eight-second timeout, and a restart inside that window would
    // otherwise leave a delivered email marked unsent forever — which is
    // exactly the figure this bookkeeping exists to report.
    if (stored) await markCoastFireLeadDelivery(token, { emailSent: true });

    const outcome = await subscribeToMailerLite({
      email,
      groups: coastFireGroupIds(),
      fields: {
        coast_fire_status: result.hasReachedCoastFire ? 'reached' : 'not_yet',
        coast_fire_number: Math.round(result.coastFireNumber),
        coast_fire_years_to_retirement: result.yearsToRetirement,
        coast_fire_continue_url: lifecycleContinueUrl(token, existingAccount),
      },
    });
    if (stored) {
      await markCoastFireLeadDelivery(token, {
        mailerliteSynced: outcome === 'subscribed',
      });
    }
  })();
});

/**
 * The scenario behind an emailed link, for signup or sign-in to continue.
 *
 * Returns the seven inputs and the address the email went to, which is exactly
 * what the holder of this link already has in their inbox. Never the result:
 * the answer opens in Ask Linc, not on the page that asks for this. An unknown or
 * expired token is a 404 with no detail, so the endpoint cannot be used to
 * test whether a token ever existed.
 */
router.get('/signup-context/:token', contextRateLimit, async (req: Request, res: Response) => {
  const token = req.params.token;
  if (!isLeadToken(token)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const lead = await readCoastFireLead(token);
  if (!lead) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // Never cached by an intermediary: the response is personal to one link.
  res.setHeader('Cache-Control', 'no-store');
  res.json({ email: lead.email, inputs: lead.inputs });
});

export default router;
