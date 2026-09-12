import { GET_STARTED_HREF } from './site-nav';
import {
  clearHandoverToken,
  isHandoverToken,
  lookupStatusForResponse,
  readHandoverToken,
  type HandoverLookup,
} from './calculator-handover';

/**
 * The calculator-to-signup handoff deliberately keeps financial values out of
 * the URL. Page URLs are routinely collected by analytics and appear in
 * browser history, logs, referrers, and screenshots; sessionStorage keeps the
 * scenario in this tab instead.
 *
 * A visitor who asked for their results by email arrives later with no
 * sessionStorage at all, possibly on another device. That path carries an
 * opaque token, which gets the same treatment as the figures: it reaches the
 * page through `/retirement/continue` and a short-lived cookie rather than
 * through the URL. See `calculator-handover`.
 */
export const RETIREMENT_SIGNUP_SOURCE = 'retirement-calculator';
export const RETIREMENT_SIGNUP_HREF =
  `${GET_STARTED_HREF}?source=${RETIREMENT_SIGNUP_SOURCE}`;

export const RETIREMENT_SIGNUP_STORAGE_KEY = 'asklinc.retirement-signup-context.v1';

/** Where the link in a results email lands, before any page has rendered. */
export const RETIREMENT_CONTINUE_PATH = '/retirement/continue';
export const RETIREMENT_REF_COOKIE = 'asklinc_rt_ref';

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

/**
 * The verdict the email actually carried. Shown instead of anything recomputed:
 * the token lives for 90 days, and both the engine and the market dataset it
 * runs against change, so a fresh run could disagree with the inbox.
 */
export interface RetirementEmailedOutcome {
  survivalRate: number;
  sequencesTested: number;
  sequencesSurvived: number;
}

export interface RetirementSignupContext {
  version: typeof CONTEXT_VERSION;
  savedAt: number;
  inputs: RetirementSignupInputs;
  /** Prefills the signup form when the scenario came from an emailed link. */
  email?: string;
  /** Token that produced this context, so a newer emailed link supersedes it. */
  sourceToken?: string;
  /** Absent for a same-tab click-through, where nothing can have drifted. */
  emailedOutcome?: RetirementEmailedOutcome;
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

/** Same rule as the inputs: a figure we would not have produced is discarded. */
function parseEmailedOutcome(value: unknown): RetirementEmailedOutcome | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const outcome = value as Record<string, unknown>;
  if (
    !numberInRange(outcome.survivalRate, 0, 1) ||
    !numberInRange(outcome.sequencesTested, 1, 10_000, true) ||
    !numberInRange(outcome.sequencesSurvived, 0, 10_000, true) ||
    outcome.sequencesSurvived > outcome.sequencesTested
  ) {
    return null;
  }
  return {
    survivalRate: outcome.survivalRate,
    sequencesTested: outcome.sequencesTested,
    sequencesSurvived: outcome.sequencesSurvived,
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
  options: {
    email?: string;
    sourceToken?: string;
    emailedOutcome?: RetirementEmailedOutcome;
    now?: number;
  } = {},
): boolean {
  if (typeof window === 'undefined') return false;
  const now = options.now ?? Date.now();
  const inputs = parseInputs(value);
  if (!inputs || !numberInRange(now, 0, Number.MAX_SAFE_INTEGER)) return false;
  if (options.sourceToken && !isHandoverToken(options.sourceToken)) return false;
  const emailedOutcome = options.emailedOutcome
    ? parseEmailedOutcome(options.emailedOutcome)
    : null;
  if (options.emailedOutcome && !emailedOutcome) return false;

  const context: RetirementSignupContext = {
    version: CONTEXT_VERSION,
    savedAt: now,
    inputs,
    ...(options.email ? { email: options.email } : {}),
    ...(options.sourceToken ? { sourceToken: options.sourceToken } : {}),
    ...(emailedOutcome ? { emailedOutcome } : {}),
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

    const emailedOutcome = parseEmailedOutcome(value.emailedOutcome);
    return {
      version: CONTEXT_VERSION,
      savedAt,
      inputs,
      ...(typeof value.email === 'string' ? { email: value.email } : {}),
      ...(isHandoverToken(value.sourceToken) ? { sourceToken: value.sourceToken } : {}),
      ...(emailedOutcome ? { emailedOutcome } : {}),
    };
  } catch {
    removeStoredContext();
    return null;
  }
}

export function hasRetirementSignupSource(searchParams: Pick<URLSearchParams, 'get'>): boolean {
  return searchParams.get('source') === RETIREMENT_SIGNUP_SOURCE;
}

/**
 * The emailed link's token, handed over by `/retirement/continue` in a cookie
 * rather than in the URL. Null for anything that is not one of ours.
 */
export function readRetirementSignupRef(): string | null {
  return readHandoverToken(RETIREMENT_REF_COOKIE);
}

/** Drop the handover cookie once it has been spent. */
export function clearRetirementSignupRef(): void {
  clearHandoverToken(RETIREMENT_REF_COOKIE);
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Exchange an emailed token for the plan behind it, and the verdict the email
 * actually stated.
 *
 * Resolves to null for an unknown, expired, or malformed token, and for any
 * network failure. Every caller treats null as "show the generic page", so a
 * signup is never blocked by this lookup.
 */
export async function fetchRetirementSignupContext(
  token: string,
  signal?: AbortSignal,
): Promise<HandoverLookup<{
  inputs: RetirementSignupInputs;
  email?: string;
  emailedOutcome?: RetirementEmailedOutcome;
}>> {
  if (!isHandoverToken(token)) return { status: 'not-found' };

  try {
    const response = await fetch(`${API_URL}/api/retirement-quickplan/signup-context/${token}`, { signal });
    if (!response.ok) return { status: lookupStatusForResponse(response.status) };

    const body = await response.json() as {
      inputs?: unknown;
      email?: unknown;
      outcome?: unknown;
    };
    const inputs = parseInputs(body?.inputs);
    // A 200 we cannot read is a problem with the stored row, not a passing
    // one, so the token is spent rather than retried forever.
    if (!inputs) return { status: 'not-found' };

    const emailedOutcome = parseEmailedOutcome(body?.outcome);
    return {
      status: 'resolved',
      context: {
        inputs,
        ...(typeof body.email === 'string' && body.email.includes('@')
          ? { email: body.email }
          : {}),
        ...(emailedOutcome ? { emailedOutcome } : {}),
      },
    };
  } catch {
    // An aborted request is the component unmounting, not a verdict on the
    // token; treating it as unavailable keeps the cookie for the next mount.
    return { status: 'unavailable' };
  }
}
