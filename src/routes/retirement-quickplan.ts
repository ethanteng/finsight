/**
 * Public retirement quick-plan endpoint.
 *
 * Unauthenticated by design: it is the landing page's calculation, and it
 * touches no user data. It reads nothing from the database, calls no external
 * provider, and stores nothing — the historical dataset it runs against is a
 * checked-in CSV, so a request is pure CPU.
 *
 * That CPU is the only thing worth protecting, hence the per-IP window below.
 */

import express, { Request, Response } from 'express';
import {
  QuickPlanValidationError,
  QUICKPLAN_ALLOCATIONS,
  DEFAULT_ALLOCATION_ID,
  DEFAULT_LIFE_EXPECTANCY,
  DEFAULT_SOCIAL_SECURITY_START_AGE,
  runRetirementQuickPlan,
} from '../services/retirement-quickplan';

const router = express.Router();

const WINDOW_MS = 60 * 1000;
const REQUESTS_PER_WINDOW = parseInt(process.env.RETIREMENT_QUICKPLAN_RATE_LIMIT || '20', 10);

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Fixed window per IP, with expired entries dropped on the way through so an
 * open endpoint cannot grow the map without bound.
 */
export function quickPlanRateLimit(req: Request, res: Response, next: express.NextFunction): void {
  const now = Date.now();
  for (const [key, entry] of windows) {
    if (now >= entry.resetAt) windows.delete(key);
  }

  const key = clientKey(req);
  let entry = windows.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(key, entry);
  }
  entry.count += 1;

  res.setHeader('X-RateLimit-Limit', REQUESTS_PER_WINDOW);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, REQUESTS_PER_WINDOW - entry.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

  if (entry.count > REQUESTS_PER_WINDOW) {
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    return;
  }
  next();
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
  try {
    const result = await runRetirementQuickPlan(req.body);
    res.json(result);
  } catch (error) {
    if (error instanceof QuickPlanValidationError) {
      res.status(400).json({ error: error.message, field: error.field });
      return;
    }
    console.error('❌ Retirement quick plan failed:', error);
    res.status(500).json({ error: 'Could not run this plan right now. Please try again.' });
  }
});

export default router;
