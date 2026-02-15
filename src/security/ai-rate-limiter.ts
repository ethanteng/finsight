/**
 * Rate limiter for AI /ask endpoints.
 * Per-user (authenticated) and per-session (demo) limits.
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../auth/utils';

const AUTHENTICATED_LIMIT = parseInt(process.env.AI_RATE_LIMIT_AUTHENTICATED || '30', 10);
const DEMO_LIMIT = parseInt(process.env.AI_RATE_LIMIT_DEMO || '20', 10);
const WINDOW_MS = 60 * 1000; // 1 minute

interface WindowEntry {
  count: number;
  resetAt: number;
}

const authenticatedWindows = new Map<string, WindowEntry>();
const demoWindows = new Map<string, WindowEntry>();

function getOrCreateWindow(
  store: Map<string, WindowEntry>,
  key: string,
  limit: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(key, entry);
  }

  entry.count += 1;
  const allowed = entry.count <= limit;
  const remaining = Math.max(0, limit - entry.count);

  return { allowed, remaining, resetAt: entry.resetAt };
}

function getClientIdentifier(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

/**
 * Express middleware for AI rate limiting.
 * Uses userId for authenticated requests (from token or req.user), sessionId or IP for demo.
 */
export function aiRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const isDemo = req.body?.isDemo === true;
  let userId = (req as any).user?.id;

  // Decode token for routes that do auth inline (e.g. /ask/display-real)
  if (!userId && !isDemo && req.headers.authorization) {
    try {
      const token = extractTokenFromHeader(req.headers.authorization);
      const payload = token ? verifyToken(token) : null;
      if (payload?.userId) userId = payload.userId;
    } catch {
      // Ignore - will fall back to IP
    }
  }

  const sessionId = req.body?.sessionId;

  let key: string;
  let limit: number;

  if (!isDemo && userId) {
    key = `user:${userId}`;
    limit = AUTHENTICATED_LIMIT;
  } else if (isDemo && sessionId) {
    key = `demo:${sessionId}`;
    limit = DEMO_LIMIT;
  } else {
    key = `ip:${getClientIdentifier(req)}`;
    limit = DEMO_LIMIT;
  }

  const store = key.startsWith('user:') ? authenticatedWindows : demoWindows;
  const { allowed, remaining, resetAt } = getOrCreateWindow(store, key, limit);

  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));

  if (!allowed) {
    res.status(429).json({
      error: 'Too many requests. Please wait a moment before asking another question.',
    });
    return;
  }

  next();
}
