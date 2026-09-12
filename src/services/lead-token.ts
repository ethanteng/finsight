/**
 * The opaque key in a calculator results email.
 *
 * One shape, shared by every calculator that can email someone their result,
 * because the frontend recognizes a handover token by its length before it
 * will spend a request on it. Two shapes would mean two patterns to keep in
 * step across the two TypeScript projects.
 *
 * The token is random rather than derived from anything, so it cannot be
 * guessed from an address or enumerated from a sequence, and it is the only
 * thing the emailed link carries: page URLs are collected by analytics and
 * appear in browser history, referrers, and screenshots, so the figures
 * themselves must never be in one.
 */

import crypto from 'crypto';

/**
 * Long enough that guessing is hopeless, short enough for one clean URL line.
 *
 * Mirrored by `TOKEN_PATTERN` in `frontend/src/lib/calculator-handover.ts`,
 * so changing this means changing that too — and old links stop personalizing
 * until they expire.
 */
export const LEAD_TOKEN_BYTES = 24;

/**
 * How long an email's link keeps carrying the scenario. Past this the link
 * still works — it lands on the normal /getstarted — it simply stops
 * personalizing, which is the right failure for a marketing link that may sit
 * in an inbox for a year.
 */
export const LEAD_CONTEXT_TTL_DAYS = 90;

const TOKEN_PATTERN = new RegExp(`^[a-f0-9]{${LEAD_TOKEN_BYTES * 2}}$`);

export function generateLeadToken(): string {
  return crypto.randomBytes(LEAD_TOKEN_BYTES).toString('hex');
}

/** Rejects anything that is not one of our tokens before it reaches the database. */
export function isLeadToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

export function leadExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + LEAD_CONTEXT_TTL_DAYS * 24 * 60 * 60 * 1000);
}
