/**
 * Public retirement quick-plan endpoint.
 *
 * Unauthenticated by design: it is the landing page's calculation, and it
 * touches no user data. It reads nothing from the database and calls no
 * external provider — the historical dataset it runs against is a checked-in
 * CSV, so answering a request is pure CPU.
 *
 * That CPU is the only thing worth protecting, hence the per-IP window below.
 *
 * It does write one row per run, after the response, for pattern analysis on
 * the admin side. That write is deliberately incapable of affecting the
 * answer: see `services/retirement-quickplan-log`.
 */

import express, { Request, Response } from 'express';
import { createFixedWindowRateLimit, positiveIntFromEnv } from './fixed-window-rate-limit';
import { validateEmail } from '../auth/utils';
import { sendRetirementResultsEmail } from '../auth/resend-email';
import { getBaseUrl } from '../email/templates';
import {
  generateLeadToken,
  isLeadToken,
  markRetirementLeadDelivery,
  readRetirementLead,
  recordRetirementLead,
} from '../services/retirement-leads';
import {
  retirementGroupIds,
  subscribeToMailerLite,
} from '../services/mailerlite-subscribe';
import {
  readSubmittedPlan,
  recordQuickPlanRejection,
  recordQuickPlanRun,
} from '../services/retirement-quickplan-log';
import {
  QuickPlanValidationError,
  QUICKPLAN_ALLOCATIONS,
  DEFAULT_ALLOCATION_ID,
  DEFAULT_LIFE_EXPECTANCY,
  DEFAULT_SOCIAL_SECURITY_START_AGE,
  runRetirementQuickPlan,
} from '../services/retirement-quickplan';

const router = express.Router();

const REQUESTS_PER_WINDOW = positiveIntFromEnv('RETIREMENT_QUICKPLAN_RATE_LIMIT', 20);

/**
 * How many proxies sit between a visitor and this process. On Render that is
 * the platform's single edge; behind an additional CDN it would be two. See
 * `createFixedWindowRateLimit` for why the leftmost forwarded entry is never
 * the one believed.
 */
const TRUSTED_HOPS = positiveIntFromEnv('RETIREMENT_QUICKPLAN_TRUSTED_PROXIES', 1);

/**
 * The CPU is the only thing worth protecting here, and this endpoint runs
 * several simulations per call.
 */
export const quickPlanRateLimit = createFixedWindowRateLimit({
  limit: REQUESTS_PER_WINDOW,
  trustedHops: TRUSTED_HOPS,
});

/**
 * Deliberately far below the plan limit. Every accepted request sends mail to
 * an address the caller chose, so the limit is set where a person correcting a
 * typo and re-sending is comfortable and a script is not.
 */
const EMAIL_REQUESTS_PER_WINDOW = positiveIntFromEnv('RETIREMENT_EMAIL_RATE_LIMIT', 5);
const CONTEXT_REQUESTS_PER_WINDOW = positiveIntFromEnv('RETIREMENT_CONTEXT_RATE_LIMIT', 30);

const emailRateLimit = createFixedWindowRateLimit({
  limit: EMAIL_REQUESTS_PER_WINDOW,
  trustedHops: TRUSTED_HOPS,
});

/**
 * Its own window, and a wider one: this is a read the recipient performs by
 * opening a link, and it must not be spent by the send that preceded it. It is
 * still limited, because the token is the only thing guarding the plan behind it.
 */
const contextRateLimit = createFixedWindowRateLimit({
  limit: CONTEXT_REQUESTS_PER_WINDOW,
  trustedHops: TRUSTED_HOPS,
});

/** Long enough for any real address, short enough to not be a payload. */
const MAX_EMAIL_LENGTH = 254;

function readEmail(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new QuickPlanValidationError('email', 'Enter your email address.');
  }
  const email = raw.trim().toLowerCase();
  if (email.length === 0) {
    throw new QuickPlanValidationError('email', 'Enter your email address.');
  }
  if (email.length > MAX_EMAIL_LENGTH || !validateEmail(email)) {
    throw new QuickPlanValidationError('email', 'Enter a valid email address.');
  }
  return email;
}

/**
 * The link in the email.
 *
 * It carries an opaque token and nothing else — no figures, no address. And it
 * points at `/retirement/continue` rather than at signup directly: that
 * handler moves the token into a short-lived first-party cookie and redirects
 * to a clean URL, so the token is never in the address of a rendered page,
 * where Google Tag Manager and every tag in the container would see it.
 */
function signupUrl(token: string | null): string {
  const base = getBaseUrl();
  return token
    ? `${base}/retirement/continue?ref=${token}`
    : `${base}/getstarted?source=retirement-calculator`;
}

/** Everything the form needs to render without hardcoding the model's bounds. */
router.get('/options', (_req: Request, res: Response) => {
  res.json({
    allocations: Object.values(QUICKPLAN_ALLOCATIONS).map((allocation) => ({
      id: allocation.id,
      label: allocation.label,
      description: allocation.description,
      equityPercent: Math.round(allocation.usEquity * 100),
    })),
    defaults: {
      allocation: DEFAULT_ALLOCATION_ID,
      lifeExpectancy: DEFAULT_LIFE_EXPECTANCY,
      socialSecurityStartAge: DEFAULT_SOCIAL_SECURITY_START_AGE,
    },
  });
});

router.post('/', quickPlanRateLimit, async (req: Request, res: Response) => {
  // Read before running: the normalizer assumes blanks and throws on bad
  // figures, so afterwards there is no way back to what was actually typed.
  const submitted = readSubmittedPlan(req.body);

  try {
    const result = await runRetirementQuickPlan(req.body);
    res.json(result);
    // After the response, and unawaited. The visitor has their answer; the
    // row is bookkeeping, and `record*` never rejects.
    void recordQuickPlanRun(submitted, result);
  } catch (error) {
    if (error instanceof QuickPlanValidationError) {
      res.status(400).json({ error: error.message, field: error.field });
      void recordQuickPlanRejection(submitted, error);
      return;
    }
    console.error('❌ Retirement quick plan failed:', error);
    res.status(500).json({ error: 'Could not run this plan right now. Please try again.' });
  }
});

/**
 * Email someone the plan they just ran.
 *
 * The model is re-run here from the submitted figures rather than reading a
 * result out of the request body: an emailed figure carries our branding, so
 * it has to be one we computed. A plan the visitor has already run this
 * minute is served from the in-process cache, so the usual path costs nothing.
 *
 * `rates` mode has no verdict to send — a survival rate needs both a portfolio
 * and a spending level — so it is refused rather than emailed as a blank.
 */
router.post('/email-results', emailRateLimit, async (req: Request, res: Response) => {
  let email: string;
  let result;

  try {
    email = readEmail(req.body?.email);
    result = await runRetirementQuickPlan(req.body);
  } catch (error) {
    if (error instanceof QuickPlanValidationError) {
      res.status(400).json({ error: error.message, field: error.field });
      return;
    }
    console.error('❌ Retirement results email failed to compute:', error);
    res.status(500).json({ error: 'Could not run this plan right now. Please try again.' });
    return;
  }

  const primary = result.primary;
  if (!primary) {
    res.status(400).json({
      error: 'Fill in your investments and annual spending to get a plan we can send.',
      field: result.missing[0] ?? 'investableAssets',
    });
    return;
  }

  // Stored before the send so the link in that email resolves. A failed write
  // costs personalization, not the email: the CTA falls back to plain
  // /getstarted.
  const token = generateLeadToken();
  const outcome = {
    survivalRate: primary.survivalRate,
    sequencesTested: primary.sequencesTested,
    sequencesSurvived: primary.sequencesSurvived,
    projectedPortfolioAtRetirement: primary.projectedPortfolioAtRetirement,
    firstYearWithdrawalRate: primary.firstYearWithdrawalRate,
  };
  const stored = await recordRetirementLead({ email, token, inputs: result.inputs, outcome });

  const emailSent = await sendRetirementResultsEmail(
    email,
    result,
    primary,
    signupUrl(stored ? token : null),
  );

  if (!emailSent) {
    res.status(502).json({
      error: 'We could not send that email just now. Please try again in a moment.',
    });
    return;
  }

  res.json({ message: 'Your retirement results are on their way.' });

  // After the response. Joining the list is what the form promised, but a slow
  // or failing MailerLite must not hold up the results the visitor asked for,
  // and it is already recorded here either way.
  void (async () => {
    const subscribed = await subscribeToMailerLite({
      email,
      groups: retirementGroupIds(),
      fields: {
        retirement_survival_rate: Math.round(primary.survivalRate * 100),
        retirement_age: result.inputs.retirementAge,
        retirement_years_to_go: Math.max(0, result.inputs.retirementAge - result.inputs.currentAge),
      },
    });
    if (stored) {
      await markRetirementLeadDelivery(token, {
        emailSent: true,
        mailerliteSynced: subscribed === 'subscribed',
      });
    }
  })();
});

/**
 * The plan behind an emailed link, for the signup page to continue.
 *
 * Returns the inputs, the verdict the email stated, and the address it went to
 * — exactly what the holder of this link already has in their inbox. The
 * stored verdict is returned rather than recomputed so the page cannot drift
 * away from the email as the engine and its dataset change. An unknown or
 * expired token is a 404 with no detail, so the endpoint cannot be used to
 * test whether a token was ever real.
 */
router.get('/signup-context/:token', contextRateLimit, async (req: Request, res: Response) => {
  const token = req.params.token;
  if (!isLeadToken(token)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const lead = await readRetirementLead(token);
  if (!lead) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // Never cached by an intermediary: the response is personal to one link.
  res.setHeader('Cache-Control', 'no-store');
  res.json({ email: lead.email, inputs: lead.inputs, outcome: lead.outcome });
});

export default router;
