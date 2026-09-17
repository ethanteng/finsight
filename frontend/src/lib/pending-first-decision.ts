/**
 * A one-shot, same-tab note that an account was created with a calculator run
 * still being written as its first decision.
 *
 * `POST /auth/register` answers *before* `seedFirstDecisionFromLead` finishes,
 * deliberately: a signup must never wait on that write and must never fail for
 * it. Until the workspace opened directly from registration, the visitor spent
 * that window on the sign-in form, which was more than enough. They now arrive
 * one round trip later, which can beat the seed's insert — and an empty
 * workspace is the wrong answer for someone who was promised their saved run.
 *
 * So the page that knows a seed is in flight says so, and only the page that
 * would render the wrong answer reads it. sessionStorage rather than the URL:
 * this concerns one navigation in one tab, and `/app` should not carry a
 * signup artifact in its address.
 */
export const PENDING_FIRST_DECISION_STORAGE_KEY = 'asklinc.pending-first-decision.v1';

/**
 * Long enough to outlive one client-side navigation, short enough that a tab
 * left open on the signup page cannot make a later visit wait for a decision
 * that was written — or abandoned — minutes ago.
 */
const PENDING_TTL_MS = 60 * 1000;

/**
 * The answer this page load already got, so a second read cannot contradict the
 * first. `takePendingFirstDecision` clears the marker as it reads it, which
 * makes the raw read a one-shot: React's development Strict Mode remounts every
 * component once, and the second mount would otherwise see the marker gone and
 * skip a wait the first mount had correctly begun — dev quietly behaving unlike
 * production for the one case this file exists to handle.
 */
let takenThisPageLoad: boolean | undefined;

/** Record that registration accepted a lead and is writing the decision. */
export function markFirstDecisionPending(now = Date.now()): void {
  if (typeof window === 'undefined') return;
  // A fresh signup is a fresh answer, so the tab's previous one is void. Two
  // registrations in one tab are rare but entirely possible.
  takenThisPageLoad = undefined;
  try {
    window.sessionStorage.setItem(PENDING_FIRST_DECISION_STORAGE_KEY, String(now));
  } catch {
    // Blocked storage costs the visitor a reload, never the account.
  }
}

/**
 * Read the marker and clear it in the same breath, then keep answering with
 * what that read found for the rest of this page load.
 *
 * The wait belongs to this one arrival in the workspace. Leaving the marker in
 * storage would make every later visit in the tab re-poll for a decision that
 * either landed long ago or is never coming; answering differently on a second
 * read would make a remount lose a wait that had already started.
 */
export function takePendingFirstDecision(now = Date.now()): boolean {
  if (typeof window === 'undefined') return false;
  if (takenThisPageLoad !== undefined) return takenThisPageLoad;
  try {
    const raw = window.sessionStorage.getItem(PENDING_FIRST_DECISION_STORAGE_KEY);
    window.sessionStorage.removeItem(PENDING_FIRST_DECISION_STORAGE_KEY);
    const markedAt = raw === null ? Number.NaN : Number(raw);
    takenThisPageLoad =
      Number.isFinite(markedAt) && markedAt <= now && now - markedAt <= PENDING_TTL_MS;
    return takenThisPageLoad;
  } catch {
    takenThisPageLoad = false;
    return false;
  }
}

/** Test seam: drops the cached answer the way a fresh page load would. */
export function resetPendingFirstDecisionCache(): void {
  takenThisPageLoad = undefined;
}
