import {
  PENDING_FIRST_DECISION_STORAGE_KEY,
  markFirstDecisionPending,
  resetPendingFirstDecisionCache,
  takePendingFirstDecision,
} from '../pending-first-decision';

describe('pending first decision marker', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetPendingFirstDecisionCache();
  });

  it('reports a fresh marker once and clears it from storage', () => {
    markFirstDecisionPending();

    expect(takePendingFirstDecision()).toBe(true);
    expect(sessionStorage.getItem(PENDING_FIRST_DECISION_STORAGE_KEY)).toBeNull();
  });

  /*
   * The read clears the marker, so a second one finds nothing. React's
   * development Strict Mode remounts every component once — without the cached
   * answer the second mount would skip a wait the first had correctly begun,
   * making dev behave unlike production for the one case this exists to handle.
   */
  it('keeps answering the same way when a remount reads it again', () => {
    markFirstDecisionPending();

    expect(takePendingFirstDecision()).toBe(true);
    expect(takePendingFirstDecision()).toBe(true);
  });

  it('answers a later signup in the same tab on its own terms', () => {
    markFirstDecisionPending();
    expect(takePendingFirstDecision()).toBe(true);

    // No new signup: still the same answer, not a second wait.
    expect(takePendingFirstDecision()).toBe(true);

    markFirstDecisionPending();
    expect(takePendingFirstDecision()).toBe(true);
  });

  it('reports nothing pending when no signup left a marker', () => {
    expect(takePendingFirstDecision()).toBe(false);
    expect(takePendingFirstDecision()).toBe(false);
  });

  it('ignores a marker older than its lifetime', () => {
    const now = Date.now();
    markFirstDecisionPending(now - 61 * 1000);

    expect(takePendingFirstDecision(now)).toBe(false);
  });

  it('ignores a marker that is not a timestamp', () => {
    sessionStorage.setItem(PENDING_FIRST_DECISION_STORAGE_KEY, 'soon');

    expect(takePendingFirstDecision()).toBe(false);
    expect(sessionStorage.getItem(PENDING_FIRST_DECISION_STORAGE_KEY)).toBeNull();
  });
});
