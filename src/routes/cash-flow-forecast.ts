/**
 * Public cash-flow forecast endpoint.
 *
 *   POST /sample-request   put a visitor on the list for the sample forecast
 *
 * The cash-flow forecast page has no calculator to run, so nothing before
 * signup used to ask for an address and nobody could ever enter its no-trial
 * email sequence. This is that ask. It stores nothing of its own: MailerLite
 * is the list, joining the cash-flow group starts the sequence, and its first
 * email is the sample the visitor asked for.
 *
 * Unauthenticated, because the visitor has no account yet, and limited like
 * the calculator email routes, because every accepted request starts mail to
 * an address the caller chose.
 */

import express, { Request, Response } from 'express';
import { createFixedWindowRateLimit, positiveIntFromEnv } from './fixed-window-rate-limit';
import { validateEmail } from '../auth/utils';
import { cashFlowGroupIds, subscribeToMailerLite } from '../services/mailerlite-subscribe';
import { lookupAccountForEmail } from '../services/calculator-account-lookup';

const router = express.Router();

const SAMPLE_REQUESTS_PER_WINDOW = positiveIntFromEnv('CASH_FLOW_SAMPLE_RATE_LIMIT', 5);
const TRUSTED_HOPS = positiveIntFromEnv('CASH_FLOW_TRUSTED_PROXIES', 1);

const sampleRateLimit = createFixedWindowRateLimit({
  limit: SAMPLE_REQUESTS_PER_WINDOW,
  trustedHops: TRUSTED_HOPS,
  message: 'Too many requests. Please wait a moment and try again.',
});

/** Long enough for any real address, short enough to not be a payload. */
const MAX_EMAIL_LENGTH = 254;

function readEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !validateEmail(email)) {
    return null;
  }
  return email;
}

router.post('/sample-request', sampleRateLimit, async (req: Request, res: Response) => {
  const email = readEmail(req.body?.email);
  if (!email) {
    res.status(400).json({ error: 'Enter a valid email address.', field: 'email' });
    return;
  }

  /*
   * Someone who already has an account does not need the no-trial sequence,
   * which exists to get them to start one; it would ask a paying customer to
   * start a free trial. The page sends them to sign in instead, the same way
   * the calculators do for an existing address.
   *
   * A lookup that could not answer is a failure here, not a new address: the
   * calculators recover from that guess at signup, but nothing after this
   * request would take an existing customer back off the sequence.
   */
  const existingAccount = await lookupAccountForEmail(email);
  if (existingAccount === null) {
    res.status(503).json({ error: 'We could not send that just now. Please try again in a moment.' });
    return;
  }
  if (existingAccount) {
    res.json({ existingAccount: true });
    return;
  }

  /*
   * Unlike the calculators, the list is the only record of this request, so a
   * subscribe that did not happen is a failure the visitor should retry, not
   * something to finish after the response. Without the group configured the
   * sequence can never start, which is the same outcome.
   */
  const groups = cashFlowGroupIds();
  if (groups.length === 0) {
    console.error('Cash-flow sample request refused: MAILER_LITE_CASH_FLOW_GROUP_ID is not set');
    res.status(503).json({ error: 'We could not send that just now. Please try again in a moment.' });
    return;
  }

  const outcome = await subscribeToMailerLite({ email, groups });
  if (outcome !== 'subscribed') {
    res.status(503).json({ error: 'We could not send that just now. Please try again in a moment.' });
    return;
  }

  res.json({ message: 'Your sample forecast is on its way.' });
});

export default router;
