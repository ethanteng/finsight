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

export const CALCULATOR_SIGNUP_ORIGINS = [
  'coast_fire_calculator',
  'retirement_calculator',
] as const;
export type CalculatorSignupOrigin = (typeof CALCULATOR_SIGNUP_ORIGINS)[number];

export const CALCULATOR_SIGNUP_ENTRIES = ['calculator_cta', 'results_email'] as const;
export type CalculatorSignupEntry = (typeof CALCULATOR_SIGNUP_ENTRIES)[number];

export interface TrialSignupAttribution {
  signupOrigin: CalculatorSignupOrigin;
  signupEntry: CalculatorSignupEntry;
}

interface StoredTrialSignupFlow {
  version: typeof FLOW_VERSION;
  signupFlow: typeof FREE_TRIAL_SIGNUP_FLOW;
  startedAt: number;
  signupOrigin?: CalculatorSignupOrigin;
  signupEntry?: CalculatorSignupEntry;
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

function includes<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number]);
}

function parseStoredFlow(raw: string, now: number): StoredTrialSignupFlow | null {
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
    return null;
  }

  const hasAttribution =
    includes(CALCULATOR_SIGNUP_ORIGINS, value.signupOrigin) &&
    includes(CALCULATOR_SIGNUP_ENTRIES, value.signupEntry);
  return {
    version: FLOW_VERSION,
    signupFlow: FREE_TRIAL_SIGNUP_FLOW,
    startedAt: value.startedAt as number,
    ...(hasAttribution
      ? { signupOrigin: value.signupOrigin, signupEntry: value.signupEntry }
      : {}),
  };
}

/** Start (or refresh) attribution when the no-card /getstarted page is viewed. */
export function beginFreeTrialSignupFlow(
  now = Date.now(),
  attribution?: TrialSignupAttribution,
): boolean {
  if (typeof window === 'undefined' || !isValidTimestamp(now)) return false;

  const value: StoredTrialSignupFlow = {
    version: FLOW_VERSION,
    signupFlow: FREE_TRIAL_SIGNUP_FLOW,
    startedAt: now,
    ...(attribution || {}),
  };

  try {
    window.sessionStorage.setItem(TRIAL_SIGNUP_FLOW_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Fixed, non-sensitive calculator attribution for subsequent auth events. */
export function readTrialSignupAttribution(
  now = Date.now(),
): TrialSignupAttribution | null {
  if (typeof window === 'undefined' || !isValidTimestamp(now)) return null;
  try {
    const raw = window.sessionStorage.getItem(TRIAL_SIGNUP_FLOW_STORAGE_KEY);
    if (!raw) return null;
    const value = parseStoredFlow(raw, now);
    if (!value) {
      removeStoredFlow();
      return null;
    }
    return value.signupOrigin && value.signupEntry
      ? { signupOrigin: value.signupOrigin, signupEntry: value.signupEntry }
      : null;
  } catch {
    removeStoredFlow();
    return null;
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

    const value = parseStoredFlow(raw, now);
    if (!value) {
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
