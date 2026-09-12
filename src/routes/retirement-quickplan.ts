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

export default router;
