/**
 * A per-caller fixed-window limiter for the public marketing endpoints.
 *
 * These routes are unauthenticated by design — they are landing-page features
 * — so the only thing standing between them and a script is this. It was
 * written for the retirement quick plan, where the cost being protected is
 * CPU; the Coast FIRE results endpoint reuses it because there the cost is
 * outbound email in someone else's inbox, which is worth protecting more.
 *
 * Each limiter gets its own window map: sharing one would let a burst against
 * one endpoint lock a visitor out of the other.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const DEFAULT_WINDOW_MS = 60 * 1000;

/**
 * Read a positive integer from the environment, falling back to the default
 * for anything else. A misconfigured value must not silently disable the
 * limit: `parseInt` on a typo yields NaN, and every `count > NaN` comparison
 * is false, so the endpoint would run unmetered with no error anywhere.
 */
export function positiveIntFromEnv(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Ceiling on tracked windows. Distinct source addresses in a minute are far
 * fewer than this in practice, so the cap only binds under abuse -- and there
 * it bounds memory instead of letting the map grow with every new key.
 */
const MAX_TRACKED_WINDOWS = 10_000;

/** An over-long forwarded value cannot bloat the window map with one enormous key. */
const MAX_KEY_LENGTH = 64;

interface WindowEntry {
  count: number;
  resetAt: number;
}

export interface FixedWindowRateLimitOptions {
  /** Requests allowed per window, per caller. */
  limit: number;
  /**
   * How many proxies sit between a visitor and this process. On Render that is
   * the platform's single edge; behind an additional CDN it would be two.
   *
   * It decides which entry of `X-Forwarded-For` is the caller. The header is a
   * list the client writes the start of and each proxy appends to, so the
   * *leftmost* entry is whatever the caller typed and the last `trustedHops`
   * entries are the ones proxies added. Reading the leftmost would let a caller
   * mint a fresh rate-limit window per request just by rotating a header value.
   */
  trustedHops: number;
  windowMs?: number;
  message?: string;
}

/**
 * Identify the caller for the per-window count.
 *
 * Reads the hop the trusted proxy chain appended, never the leftmost entry:
 * when a reverse proxy appends the real peer, everything to the left of it is
 * whatever the client typed, and believing it lets an attacker rotate
 * identities around an unauthenticated endpoint.
 */
function clientKey(req: Request, trustedHops: number): string {
  const socketAddress = req.ip || req.socket?.remoteAddress || 'unknown';
  const forwarded = req.headers['x-forwarded-for'];
  const header = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
  if (typeof header !== 'string' || header.length === 0) {
    return socketAddress;
  }

  const hops = header.split(',').map((hop) => hop.trim()).filter(Boolean);
  // The socket peer is the last trusted hop, so the caller is `trustedHops`
  // from the right of the list. A header too short for that many hops was not
  // written by the expected proxy chain, so fall back to the socket address
  // rather than believe it.
  const index = hops.length - trustedHops;
  if (index < 0 || index >= hops.length) return socketAddress;
  const caller = hops[index];
  return caller.length <= MAX_KEY_LENGTH ? caller : socketAddress;
}

/**
 * Drop expired windows, and if every window is still live, drop the oldest
 * ones by reset time. Map preserves insertion order, so the entries created
 * first are the ones nearest expiry.
 */
function pruneWindows(windows: Map<string, WindowEntry>, now: number): void {
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

/**
 * Fixed window per caller. Expired entries are dropped lazily rather than by
 * sweeping the whole map on every request: a full scan per request is itself
 * quadratic work under exactly the flood it is meant to survive.
 */
export function createFixedWindowRateLimit(
  options: FixedWindowRateLimitOptions,
): RequestHandler {
  const {
    limit,
    trustedHops,
    windowMs = DEFAULT_WINDOW_MS,
    message = 'Too many requests. Please wait a moment and try again.',
  } = options;
  const windows = new Map<string, WindowEntry>();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();

    const key = clientKey(req, trustedHops);
    let entry = windows.get(key);
    if (!entry || now >= entry.resetAt) {
      if (!entry && windows.size >= MAX_TRACKED_WINDOWS) {
        pruneWindows(windows, now);
      }
      entry = { count: 0, resetAt: now + windowMs };
      windows.set(key, entry);
    }
    entry.count += 1;

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > limit) {
      res.status(429).json({ error: message });
      return;
    }
    next();
  };
}
