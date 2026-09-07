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

/**
 * Read a positive integer from the environment, falling back to the default
 * for anything else. A misconfigured value must not silently disable the
 * limit: `parseInt` on a typo yields NaN, and every `count > NaN` comparison
 * is false, so the endpoint would run unmetered with no error anywhere.
 */
function positiveIntFromEnv(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const REQUESTS_PER_WINDOW = positiveIntFromEnv('RETIREMENT_QUICKPLAN_RATE_LIMIT', 20);

/**
 * How many proxies sit between a visitor and this process. On Render that is
 * the platform's single edge; behind an additional CDN it would be two.
 *
 * It decides which entry of `X-Forwarded-For` is the caller. The header is a
 * list the client writes the start of and each proxy appends to, so the
 * *leftmost* entry is whatever the caller typed and the last `TRUSTED_HOPS`
 * entries are the ones proxies added. Reading the leftmost would let a caller
 * mint a fresh rate-limit window per request just by rotating a header value
 * -- and, on an endpoint that runs several simulations per call, that is the
 * whole limit defeated.
 */
const TRUSTED_HOPS = positiveIntFromEnv('RETIREMENT_QUICKPLAN_TRUSTED_PROXIES', 1);

/**
 * Ceiling on tracked windows. Distinct source addresses in a minute are far
 * fewer than this in practice, so the cap only binds under abuse -- and there
 * it bounds memory instead of letting the map grow with every new key.
 */
const MAX_TRACKED_WINDOWS = 10_000;

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

/**
 * Identify the caller for the per-window count.
 *
 * Reads the hop the trusted proxy chain appended, never the leftmost entry:
 * when a reverse proxy appends the real peer, everything to the left of it is
 * whatever the client typed, and believing it lets an attacker rotate
 * identities around a CPU-heavy unauthenticated endpoint. An over-long value
 * is rejected too, so a junk header cannot bloat the window map with one
 * enormous key.
 */
const MAX_KEY_LENGTH = 64;
function clientKey(req: Request): string {
  const socketAddress = req.ip || req.socket?.remoteAddress || 'unknown';
  const forwarded = req.headers['x-forwarded-for'];
  const header = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
  if (typeof header !== 'string' || header.length === 0) {
    return socketAddress;
  }

  const hops = header.split(',').map((hop) => hop.trim()).filter(Boolean);
  // The socket peer is the last trusted hop, so the caller is `TRUSTED_HOPS`
  // from the right of the list. A header too short for that many hops was not
  // written by the expected proxy chain, so fall back to the socket address
  // rather than believe it.
  const index = hops.length - TRUSTED_HOPS;
  if (index < 0 || index >= hops.length) return socketAddress;
  const caller = hops[index];
  return caller.length <= MAX_KEY_LENGTH ? caller : socketAddress;
}

/**
 * Fixed window per caller. Expired entries are dropped lazily rather than by
 * sweeping the whole map on every request: a full scan per request is itself
 * quadratic work under exactly the flood it is meant to survive.
 */
export function quickPlanRateLimit(req: Request, res: Response, next: express.NextFunction): void {
  const now = Date.now();

  const key = clientKey(req);
  let entry = windows.get(key);
  if (!entry || now >= entry.resetAt) {
    if (!entry && windows.size >= MAX_TRACKED_WINDOWS) {
      pruneWindows(now);
    }
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

/**
 * Drop expired windows, and if every window is still live, drop the oldest
 * ones by reset time. Map preserves insertion order, so the entries created
 * first are the ones nearest expiry.
 */
function pruneWindows(now: number): void {
  for (const [key, entry] of windows) {
    if (now >= entry.resetAt) windows.delete(key);
  }
  if (windows.size < MAX_TRACKED_WINDOWS) return;

  const overflow = windows.size - Math.floor(MAX_TRACKED_WINDOWS / 2);
  let dropped = 0;
  for (const key of windows.keys()) {
    if (dropped >= overflow) break;
    windows.delete(key);
    dropped += 1;
  }
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
