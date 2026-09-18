/**
 * How many times a visitor may run a public calculator before the only thing
 * left to do is save the result to an account.
 *
 * The page is free and unauthenticated, and three runs is enough to answer the
 * question it asks: one for the plan as it stands, and two for the obvious
 * what-ifs. Past that the page is being used as a free modelling tool rather
 * than as an argument for the product, and the argument is the reason it
 * exists. Three is the default rather than a finding, which is why it is
 * settable — see `CALCULATOR_RUN_LIMIT`.
 *
 * This is a nudge and is written as one. The count lives in session storage,
 * so it survives a reload and goes when the tab does; a visitor who wants
 * another allowance can open a new tab, and one who returns tomorrow is not
 * still locked out. Nothing here is a security control — the calculation runs
 * in the browser, and the endpoints behind the page have their own rate limits.
 */

const DEFAULT_CALCULATOR_RUN_LIMIT = 3;

/**
 * Runs allowed before the button locks. The next press is the one refused.
 *
 * Set with `NEXT_PUBLIC_CALCULATOR_RUN_LIMIT`. **It is read at build time, not
 * at run time**: Next.js replaces the reference below with a literal while
 * compiling, so changing the variable takes a rebuild and redeploy of the
 * frontend, not a restart. Nothing reads it in the browser to notice a change.
 *
 * Anything that is not a positive integer — unset, empty, `0`, `-1`, `two`,
 * `2.5` — falls back to the default, on the same principle as
 * `positiveIntFromEnv` on the backend. There is deliberately no value meaning
 * "no limit": switching the nudge off is a product decision that should be
 * visible in the code rather than inferred from an unset variable.
 *
 * `Number` rather than `parseInt`, which truncates: `parseInt('2.5')` is 2,
 * and an integer check downstream of it passes something nobody set.
 *
 * The reference has to be spelled out in full. Next.js inlines these by
 * matching the literal text `process.env.NEXT_PUBLIC_...`, so reading it
 * through a variable name would compile to `undefined` in the browser and
 * silently give every visitor the default.
 */
export const CALCULATOR_RUN_LIMIT = ((): number => {
  const raw = process.env.NEXT_PUBLIC_CALCULATOR_RUN_LIMIT?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_CALCULATOR_RUN_LIMIT;
})();

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
    // A visitor who blocks storage simply keeps their allowance per page load.
  }
  return next;
}

/**
 * The limit as the lock copy says it: "3 runs", or "1 run".
 *
 * Shared so both calculators agree, and a function because the number stopped
 * being three. Hardcoding the plural was fine while it was; at a limit of one
 * the page read "That is 1 runs."
 */
export function runLimitPhrase(): string {
  return `${CALCULATOR_RUN_LIMIT} ${CALCULATOR_RUN_LIMIT === 1 ? 'run' : 'runs'}`;
}

export function isRunLimitReached(count: number): boolean {
  return count >= CALCULATOR_RUN_LIMIT;
}

export const RETIREMENT_RUN_COUNT_KEY = 'asklinc.retirement-calculator.runs.v1';
export const COAST_FIRE_RUN_COUNT_KEY = 'asklinc.coast-fire-calculator.runs.v1';
