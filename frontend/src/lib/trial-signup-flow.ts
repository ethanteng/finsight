/**
 * Non-sensitive attribution for the no-card signup funnel.
 *
 * The URL flag makes the continuation explicit, while the short-lived
 * sessionStorage record proves that this tab actually visited /getstarted.
 * Requiring both keeps ordinary verify-email and login visits out of the
 * free-trial funnel, even when a stale storage record exists.
 */
export const FREE_TRIAL_SIGNUP_FLOW = 'free_trial' as const;
export const SIGNUP_FLOW_QUERY_PARAM = 'signup_flow';
export const TRIAL_SIGNUP_FLOW_STORAGE_KEY = 'asklinc.trial-signup-flow.v1';

const FLOW_VERSION = 1 as const;
const FLOW_TTL_MS = 2 * 60 * 60 * 1000;

interface StoredTrialSignupFlow {
  version: typeof FLOW_VERSION;
  signupFlow: typeof FREE_TRIAL_SIGNUP_FLOW;
  startedAt: number;
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function removeStoredFlow(): void {
  try {
    window.sessionStorage.removeItem(TRIAL_SIGNUP_FLOW_STORAGE_KEY);
  } catch {
    // Analytics attribution must never block authentication.
  }
}

/** Start (or refresh) attribution when the no-card /getstarted page is viewed. */
export function beginFreeTrialSignupFlow(now = Date.now()): boolean {
  if (typeof window === 'undefined' || !isValidTimestamp(now)) return false;

  const value: StoredTrialSignupFlow = {
    version: FLOW_VERSION,
    signupFlow: FREE_TRIAL_SIGNUP_FLOW,
    startedAt: now,
  };

  try {
    window.sessionStorage.setItem(TRIAL_SIGNUP_FLOW_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * A later auth page belongs to this funnel only when the URL and recent
 * same-tab state agree. sessionStorage is treated as untrusted input.
 */
export function isFreeTrialSignupContinuation(
  searchParams: Pick<URLSearchParams, 'get'>,
  now = Date.now(),
): boolean {
  if (
    typeof window === 'undefined' ||
    searchParams.get(SIGNUP_FLOW_QUERY_PARAM) !== FREE_TRIAL_SIGNUP_FLOW ||
    !isValidTimestamp(now)
  ) {
    return false;
  }

  try {
    const raw = window.sessionStorage.getItem(TRIAL_SIGNUP_FLOW_STORAGE_KEY);
    if (!raw) return false;

    const value = JSON.parse(raw) as Partial<StoredTrialSignupFlow>;
    const isRecent =
      isValidTimestamp(value.startedAt) &&
      value.startedAt <= now &&
      now - value.startedAt <= FLOW_TTL_MS;

    if (
      value.version !== FLOW_VERSION ||
      value.signupFlow !== FREE_TRIAL_SIGNUP_FLOW ||
      !isRecent
    ) {
      removeStoredFlow();
      return false;
    }

    return true;
  } catch {
    removeStoredFlow();
    return false;
  }
}

/** Add only the fixed, non-sensitive flow marker to an internal route. */
export function withFreeTrialSignupFlow(path: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${SIGNUP_FLOW_QUERY_PARAM}=${FREE_TRIAL_SIGNUP_FLOW}`;
}

/** End attribution only after the user has successfully authenticated. */
export function completeFreeTrialSignupFlow(): void {
  if (typeof window === 'undefined') return;
  removeStoredFlow();
}
