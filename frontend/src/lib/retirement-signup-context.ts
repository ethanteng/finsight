import { GET_STARTED_HREF } from './site-nav';

/**
 * The calculator-to-signup handoff deliberately keeps financial values out of
 * the URL. Page URLs are routinely collected by analytics and appear in
 * browser history, logs, referrers, and screenshots; sessionStorage keeps the
 * scenario in this tab instead.
 */
export const RETIREMENT_SIGNUP_SOURCE = 'retirement-calculator';
export const RETIREMENT_SIGNUP_HREF =
  `${GET_STARTED_HREF}?source=${RETIREMENT_SIGNUP_SOURCE}`;

export const RETIREMENT_SIGNUP_STORAGE_KEY = 'asklinc.retirement-signup-context.v1';

const CONTEXT_VERSION = 1 as const;
const CONTEXT_TTL_MS = 2 * 60 * 60 * 1000;
const ALLOCATION_IDS = new Set(['conservative', 'balanced', 'growth']);

export interface RetirementSignupInputs {
  currentAge: number;
  retirementAge: number;
  investableAssets: number;
  annualSpending: number;
  annualContributions: number;
  socialSecurityAnnual: number;
  socialSecurityStartAge: number;
  lifeExpectancy: number;
  allocation: 'conservative' | 'balanced' | 'growth';
}

export interface RetirementSignupContext {
  version: typeof CONTEXT_VERSION;
  savedAt: number;
  inputs: RetirementSignupInputs;
}

function numberInRange(
  value: unknown,
  min: number,
  max: number,
  integer = false,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isInteger(value))
  );
}

/** Treat sessionStorage as untrusted input: extensions and same-origin code can edit it. */
function parseInputs(value: unknown): RetirementSignupInputs | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const inputs = value as Record<string, unknown>;

  if (
    !numberInRange(inputs.currentAge, 18, 90, true) ||
    !numberInRange(inputs.retirementAge, 30, 95, true) ||
    !numberInRange(inputs.investableAssets, 1_000, 100_000_000) ||
    !numberInRange(inputs.annualSpending, 1_000, 10_000_000) ||
    !numberInRange(inputs.annualContributions, 0, 5_000_000) ||
    !numberInRange(inputs.socialSecurityAnnual, 0, 250_000) ||
    !numberInRange(inputs.socialSecurityStartAge, 50, 80, true) ||
    !numberInRange(inputs.lifeExpectancy, 60, 110, true) ||
    typeof inputs.allocation !== 'string' ||
    !ALLOCATION_IDS.has(inputs.allocation) ||
    inputs.retirementAge < inputs.currentAge ||
    inputs.lifeExpectancy <= inputs.retirementAge
  ) {
    return null;
  }

  // Copy only the allowlisted fields so an injected extra property can never
  // hitch a ride if this context is later handed farther into onboarding.
  return {
    currentAge: inputs.currentAge,
    retirementAge: inputs.retirementAge,
    investableAssets: inputs.investableAssets,
    annualSpending: inputs.annualSpending,
    annualContributions: inputs.annualContributions,
    socialSecurityAnnual: inputs.socialSecurityAnnual,
    socialSecurityStartAge: inputs.socialSecurityStartAge,
    lifeExpectancy: inputs.lifeExpectancy,
    allocation: inputs.allocation as RetirementSignupInputs['allocation'],
  };
}

function removeStoredContext(): void {
  try {
    window.sessionStorage.removeItem(RETIREMENT_SIGNUP_STORAGE_KEY);
  } catch {
    // Storage can be blocked by browser privacy settings. The signup still
    // works; it simply falls back to its normal generic framing.
  }
}

/**
 * Save only a calculator result the server has already accepted. Returns false
 * if the values are invalid or browser storage is unavailable; navigation must
 * never depend on this succeeding.
 */
export function storeRetirementSignupContext(
  value: RetirementSignupInputs,
  now = Date.now(),
): boolean {
  if (typeof window === 'undefined') return false;
  const inputs = parseInputs(value);
  if (!inputs || !numberInRange(now, 0, Number.MAX_SAFE_INTEGER)) return false;

  const context: RetirementSignupContext = {
    version: CONTEXT_VERSION,
    savedAt: now,
    inputs,
  };

  try {
    window.sessionStorage.setItem(RETIREMENT_SIGNUP_STORAGE_KEY, JSON.stringify(context));
    return true;
  } catch {
    return false;
  }
}

/** Return a recent, valid scenario and discard malformed or expired values. */
export function readRetirementSignupContext(
  now = Date.now(),
): RetirementSignupContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(RETIREMENT_SIGNUP_STORAGE_KEY);
    if (!raw) return null;

    const value = JSON.parse(raw) as Record<string, unknown>;
    const inputs = parseInputs(value?.inputs);
    const savedAt = value?.savedAt;
    const isRecent =
      numberInRange(savedAt, 0, Number.MAX_SAFE_INTEGER) &&
      savedAt <= now &&
      now - savedAt <= CONTEXT_TTL_MS;

    if (value?.version !== CONTEXT_VERSION || !inputs || !isRecent) {
      removeStoredContext();
      return null;
    }

    return { version: CONTEXT_VERSION, savedAt, inputs };
  } catch {
    removeStoredContext();
    return null;
  }
}

export function hasRetirementSignupSource(searchParams: Pick<URLSearchParams, 'get'>): boolean {
  return searchParams.get('source') === RETIREMENT_SIGNUP_SOURCE;
}
