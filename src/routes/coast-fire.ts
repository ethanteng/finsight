/**
 * Public Coast FIRE endpoints.
 *
 * The calculator itself still runs entirely in the browser — the page promises
 * that, and nothing here changes it. These two routes exist for the one thing
 * a browser cannot do on its own:
 *
 *   POST /email-results   send someone their result and put them on the list
 *   GET  /signup-context  hand the scenario back to /getstarted from the email
 *
 * Both are unauthenticated, because the whole point is reaching someone who
 * has no account yet. What that costs is different from the quick plan's CPU:
 * this endpoint puts mail in an inbox chosen by the caller, so the per-caller
 * window is much tighter and the figures in that mail are always recomputed
 * here rather than read out of the request.
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
  readCoastFireLead,
  recordCoastFireLead,
} from '../services/coast-fire-leads';
import { coastFireGroupIds, subscribeToMailerLite } from '../services/mailerlite-subscribe';

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
  const stored = await recordCoastFireLead({ email, token, result });

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

  res.json({ message: 'Your Coast FIRE results are on their way.' });

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
