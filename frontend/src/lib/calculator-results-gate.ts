/**
 * Whether this visitor has given an email address in exchange for seeing
 * calculator results.
 *
 * Both public calculators compute an answer and then hold it back behind the
 * results email: the visitor enters an address, the email goes out, and the
 * answer appears on the page. The first address unlocks every later run in
 * the tab, on either calculator. Asking again for each what-if would put the
 * same form in front of someone who has already filled it in.
 *
 * This is a nudge, like `calculator-run-limit`, and is written as one. The
 * flag lives in session storage, the Coast FIRE calculation runs in the
 * browser, and the retirement model's response reaches the browser before the
 * gate hides it. Nothing here is a security control. It only decides what the
 * page renders.
 *
 * Only the address is stored, so later captures can prefill it. The figures
 * never are.
 */

export const CALCULATOR_RESULTS_UNLOCK_KEY = 'asklinc.calculator-results-unlocked.v1';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The address that unlocked results in this tab, or null.
 *
 * Blocked storage, a private window and a cleared tab all read as locked:
 * the visitor sees the email form again, which costs one form rather than an
 * answer they never gave an address for.
 */
export function readUnlockedEmail(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CALCULATOR_RESULTS_UNLOCK_KEY);
    return raw && EMAIL_PATTERN.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Remember an unlock for the rest of this tab.
 *
 * A write that fails still reveals the current run. The caller reveals it
 * from its own state, not from storage, so a refused write only costs the
 * next run another form.
 */
export function rememberUnlock(email: string): void {
  if (typeof window === 'undefined') return;
  const address = email.trim();
  if (!EMAIL_PATTERN.test(address)) return;
  try {
    window.sessionStorage.setItem(CALCULATOR_RESULTS_UNLOCK_KEY, address);
  } catch {
    // Storage refused. See above.
  }
}
