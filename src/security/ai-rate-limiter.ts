/**
 * Rate limiter for AI /ask endpoints.
 * Per-user limits with an IP fallback for malformed or unauthenticated requests.
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../auth/utils';

const AUTHENTICATED_LIMIT = parseInt(process.env.AI_RATE_LIMIT_AUTHENTICATED || '30', 10);
const UNAUTHENTICATED_LIMIT = parseInt(process.env.AI_RATE_LIMIT_UNAUTHENTICATED || '20', 10);
const WINDOW_MS = 60 * 1000; // 1 minute

interface WindowEntry {
  count: number;
  resetAt: number;
}

const authenticatedWindows = new Map<string, WindowEntry>();
const unauthenticatedWindows = new Map<string, WindowEntry>();

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
 * Uses userId for authenticated requests and IP only as a pre-auth fallback.
 */
export function aiRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let userId = (req as any).user?.id;

  // Decode token for routes that do auth inline (e.g. /ask/display-real)
  if (!userId && req.headers.authorization) {
    try {
      const token = extractTokenFromHeader(req.headers.authorization);
      const payload = token ? verifyToken(token) : null;
      if (payload?.userId) userId = payload.userId;
    } catch {
      // Ignore - will fall back to IP
    }
  }

  let key: string;
  let limit: number;

  if (userId) {
    key = `user:${userId}`;
    limit = AUTHENTICATED_LIMIT;
  } else {
    key = `ip:${getClientIdentifier(req)}`;
    limit = UNAUTHENTICATED_LIMIT;
  }

  const store = key.startsWith('user:') ? authenticatedWindows : unauthenticatedWindows;
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
