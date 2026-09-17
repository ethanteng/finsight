/**
 * Public Coast FIRE endpoints.
 *
 * The seven-number formula itself still runs in the browser, and the result
 * panel still paints with no network at all. These routes exist for the three
 * things a browser cannot do on its own:
 *
 *   POST /interpretation  have a model read the result back in plain language
 *   POST /email-results   send someone their result and put them on the list
 *   GET  /signup-context  hand the scenario back to /getstarted from the email
 *
 * All three are unauthenticated, because the whole point is reaching someone
 * who has no account yet. Each costs something different, so each has its own
 * window: the interpretation is a model call we pay for, the email puts mail
 * in an inbox chosen by the caller, and the context read is performed by a
 * recipient opening a link.
 *
 * Two of them recompute the result here rather than reading it out of the
 * request. Prose and mail carrying our branding may only describe figures we
 * calculated — otherwise either endpoint becomes a way to have Ask Linc state
 * an arbitrary number.
 */

import express, { Request, Response } from 'express';
import { createFixedWindowRateLimit, positiveIntFromEnv } from './fixed-window-rate-limit';
import { validateEmail } from '../auth/utils';
import { sendCoastFireResultsEmail } from '../auth/resend-email';
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
import { interpretCoastFire } from '../services/coast-fire-interpretation';
import { coastFireGroupIds, subscribeToMailerLite } from '../services/mailerlite-subscribe';
import { parseCalculatorLeadAttribution } from '../services/calculator-lead-attribution';

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
function signupUrl(token: string | null): string {
  const base = getBaseUrl();
  return token
    ? `${base}/coast-fire/continue?ref=${token}`
    : `${base}/getstarted?source=coast-fire-calculator`;
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
  // A failed write costs personalization, not the email: the CTA falls back to
  // plain /getstarted.
  const token = generateLeadToken();
  const attribution = parseCalculatorLeadAttribution(req.body?.attribution);
  const stored = await recordCoastFireLead({ email, token, result, attribution });

  const emailSent = await sendCoastFireResultsEmail(
    email,
    result,
    signupUrl(stored ? token : null),
  );

  if (!emailSent) {
    res.status(502).json({
      error: 'We could not send that email just now. Please try again in a moment.',
    });
    return;
  }

  /*
   * Handed back so the page can take this visitor straight to signup instead
   * of asking them to go and find the email. The same token the message
   * carries, so both routes restore the same run — but disclosed tokens are
   * marked first, and registration reads that mark to withhold the emailed
   * verification code. See `src/auth/routes.ts`.
   *
   * Marked before it is returned, and not returned at all if the mark did not
   * take: a token loose in a page while the row still claims it was only
   * emailed is exactly the bypass the column exists to prevent. The fallback
   * is the behaviour that shipped before this — the results are in the inbox
   * and the emailed link still works.
   */
  const ref = stored && (await markCoastFireLeadTokenDisclosed(token)) ? token : null;

  // The token is a bearer credential for this lead. Nothing about this
  // response may sit in a shared cache.
  res.setHeader('Cache-Control', 'no-store');
  res.json({ message: 'Your Coast FIRE results are on their way.', ref });

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
 * Tighter again than the email window, and for a different cost.
 *
 * Every accepted request that misses the cache is a model call we pay for, on
 * a page with no account behind it. The limit is set where a visitor trying
 * two or three variations of their scenario never notices it and a script
 * paying us to generate text does.
 */
const INTERPRETATION_REQUESTS_PER_WINDOW = positiveIntFromEnv(
  'COAST_FIRE_INTERPRETATION_RATE_LIMIT',
  8,
);

const interpretationRateLimit = createFixedWindowRateLimit({
  limit: INTERPRETATION_REQUESTS_PER_WINDOW,
  trustedHops: TRUSTED_HOPS,
});

/**
 * The plain-language reading of a result, written by a model.
 *
 * Separate from the browser's own calculation on purpose. The formula is the
 * page's answer and paints with no network; this takes a model round trip, so
 * the page shows the number first and fills this in when it arrives. That
 * split is also what lets the reading fail — for a rate limit, a provider
 * outage, or a draft that stated a figure the formula never produced — without
 * taking the answer down with it.
 *
 * The seven inputs are re-run here rather than read out of the request, for
 * the same reason the email route re-runs them.
 *
 * A null interpretation is a 204, not an error. There is nothing wrong with
 * the request, and the page has nothing to show for it either way.
 */
router.post('/interpretation', interpretationRateLimit, async (req: Request, res: Response) => {
  let result;
  try {
    result = calculateCoastFire(parseCoastFireInputs(req.body));
  } catch (error) {
    if (error instanceof CoastFireValidationError) {
      res.status(400).json({ error: error.message, field: error.field });
      return;
    }
    console.error('❌ Coast FIRE interpretation failed to run the formula:', error);
    res.status(400).json({ error: 'Check your numbers and try again.' });
    return;
  }

  const interpretation = await interpretCoastFire(result);
  if (!interpretation) {
    res.status(204).end();
    return;
  }

  res.json(interpretation);
});

/**
 * The scenario behind an emailed link, for the signup page to continue.
 *
 * Returns the seven inputs and the address the email went to, which is exactly
 * what the holder of this link already has in their inbox. An unknown or
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
  // Include the emailed outcome, not just the inputs: signup must show the
  // same Coast FIRE number the inbox carried, even after a formula change.
  res.json({
    email: lead.email,
    inputs: lead.inputs,
    coastFireNumber: lead.coastFireNumber,
    hasReachedCoastFire: lead.hasReachedCoastFire,
  });
});

export default router;
