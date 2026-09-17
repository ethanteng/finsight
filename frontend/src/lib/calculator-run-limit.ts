/**
 * How many times a visitor may run a public calculator before the only thing
 * left to do is save the result to an account.
 *
 * The page is free and unauthenticated, and three runs is enough to answer the
 * question it asks: one for the plan as it stands, and two for the obvious
 * what-ifs. Past that the page is being used as a free modelling tool rather
 * than as an argument for the product, and the argument is the reason it
 * exists.
 *
 * This is a nudge and is written as one. The count lives in session storage,
 * so it survives a reload and goes when the tab does; a visitor who wants
 * another three can open a new tab, and one who returns tomorrow is not still
 * locked out. Nothing here is a security control — the calculation runs in the
 * browser, and the endpoints behind the page have their own rate limits.
 */

/** Runs allowed before the button locks. The fourth press is the one refused. */
export const CALCULATOR_RUN_LIMIT = 3;

/**
 * Read a stored count, tolerating everything a browser can do to it.
 *
 * Private windows, blocked storage and a cleared tab all read as zero, which
 * unlocks the page rather than locking it — the right direction to fail for
 * something whose whole purpose is to be persuasive rather than binding.
 */
export function readRunCount(storageKey: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) return 0;
    return Math.min(parsed, CALCULATOR_RUN_LIMIT);
  } catch {
    return 0;
  }
}

/** Record one more run and return the new count. Never throws. */
export function recordRun(storageKey: string, current: number): number {
  const next = Math.min(current + 1, CALCULATOR_RUN_LIMIT);
  if (typeof window === 'undefined') return next;
  try {
    window.sessionStorage.setItem(storageKey, String(next));
  } catch {
    // A visitor who blocks storage simply keeps their three runs per page load.
  }
  return next;
}

export function isRunLimitReached(count: number): boolean {
  return count >= CALCULATOR_RUN_LIMIT;
}

export const RETIREMENT_RUN_COUNT_KEY = 'asklinc.retirement-calculator.runs.v1';
export const COAST_FIRE_RUN_COUNT_KEY = 'asklinc.coast-fire-calculator.runs.v1';
