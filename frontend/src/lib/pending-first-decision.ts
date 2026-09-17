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

/** Record that registration accepted a lead and is writing the decision. */
export function markFirstDecisionPending(now = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PENDING_FIRST_DECISION_STORAGE_KEY, String(now));
  } catch {
    // Blocked storage costs the visitor a reload, never the account.
  }
}

/**
 * Read the marker and clear it in the same breath.
 *
 * The wait belongs to this one arrival in the workspace. Leaving the marker
 * behind would make every later visit in the tab re-poll for a decision that
 * either landed long ago or is never coming.
 */
export function takePendingFirstDecision(now = Date.now()): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.sessionStorage.getItem(PENDING_FIRST_DECISION_STORAGE_KEY);
    window.sessionStorage.removeItem(PENDING_FIRST_DECISION_STORAGE_KEY);
    if (!raw) return false;
    const markedAt = Number(raw);
    return Number.isFinite(markedAt) && markedAt <= now && now - markedAt <= PENDING_TTL_MS;
  } catch {
    return false;
  }
}
