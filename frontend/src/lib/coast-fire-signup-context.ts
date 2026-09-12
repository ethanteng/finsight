import { GET_STARTED_HREF } from './site-nav';
import {
  clearHandoverToken,
  HANDOVER_COOKIE_MAX_AGE_SECONDS,
  HANDOVER_COOKIE_PATH,
  isHandoverToken,
  lookupStatusForResponse,
  readHandoverToken,
  type HandoverLookup,
} from './calculator-handover';
import { calculateCoastFire, type CoastFireInputs, type CoastFireResult } from './coast-fire';

/**
 * The Coast FIRE calculator's handoff into signup.
 *
 * Two ways in, one destination. A visitor who clicks through in the same tab
 * carries the scenario in sessionStorage; a visitor who asked for their
 * results by email arrives days later with an opaque token that the backend
 * exchanges for the same seven numbers.
 *
 * Neither route puts a financial value in the URL, and neither leaves the
 * token in one either. Page URLs are collected by analytics — Google Tag
 * Manager loads in `<head>` on every page — and appear in browser history,
 * logs, referrers, and screenshots. So the emailed link lands on
 * `/coast-fire/continue`, which moves the token into a short-lived
 * first-party cookie server-side and redirects to a clean address before any
 * page renders.
 */

export const COAST_FIRE_SIGNUP_SOURCE = 'coast-fire-calculator';
export const COAST_FIRE_SIGNUP_HREF =
  `${GET_STARTED_HREF}?source=${COAST_FIRE_SIGNUP_SOURCE}`;

export const COAST_FIRE_SIGNUP_STORAGE_KEY = 'asklinc.coast-fire-signup-context.v1';

/** Where the link in a results email lands, before any page has rendered. */
export const COAST_FIRE_CONTINUE_PATH = '/coast-fire/continue';
export const COAST_FIRE_REF_COOKIE = 'asklinc_cf_ref';
export const COAST_FIRE_REF_COOKIE_PATH = HANDOVER_COOKIE_PATH;
export const COAST_FIRE_REF_COOKIE_MAX_AGE_SECONDS = HANDOVER_COOKIE_MAX_AGE_SECONDS;

const CONTEXT_VERSION = 1 as const;
const CONTEXT_TTL_MS = 2 * 60 * 60 * 1000;

export interface CoastFireSignupContext {
  version: typeof CONTEXT_VERSION;
  savedAt: number;
  inputs: CoastFireInputs;
  /** Prefills the signup form when the scenario came from an emailed link. */
  email?: string;
  /** Token that produced this context, when it came from an emailed link. */
  sourceToken?: string;
  /**
   * Figures the email actually carried. When present, signup shows these
   * instead of recomputing, so a later formula change cannot disagree with
   * the inbox.
   */
  emailedOutcome?: {
    coastFireNumber: number;
    hasReachedCoastFire: boolean;
  };
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

/**
 * Treat both sources as untrusted input. sessionStorage is editable by
 * extensions and any same-origin code, and an API response is still a response
 * — neither gets to put a figure on the page that the calculator itself would
 * have refused.
 */
function parseInputs(value: unknown): CoastFireInputs | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const inputs = value as Record<string, unknown>;

  if (
    !numberInRange(inputs.currentAge, 18, 90, true) ||
    !numberInRange(inputs.retirementAge, 30, 95, true) ||
    !numberInRange(inputs.currentSavings, 0, 100_000_000) ||
    !numberInRange(inputs.annualRetirementSpending, 1_000, 10_000_000) ||
    !numberInRange(inputs.annualRetirementIncome, 0, 10_000_000) ||
    !numberInRange(inputs.realReturnRate, 0, 12) ||
    !numberInRange(inputs.withdrawalRate, 2, 8) ||
    inputs.retirementAge <= inputs.currentAge
  ) {
    return null;
  }

  // Copy only the allowlisted fields so an injected extra property can never
  // hitch a ride if this context is later handed farther into onboarding.
  return {
    currentAge: inputs.currentAge,
    retirementAge: inputs.retirementAge,
    currentSavings: inputs.currentSavings,
    annualRetirementSpending: inputs.annualRetirementSpending,
    annualRetirementIncome: inputs.annualRetirementIncome,
    realReturnRate: inputs.realReturnRate,
    withdrawalRate: inputs.withdrawalRate,
  };
}

function removeStoredContext(): void {
  try {
    window.sessionStorage.removeItem(COAST_FIRE_SIGNUP_STORAGE_KEY);
  } catch {
    // Storage can be blocked by browser privacy settings. The signup still
    // works; it simply falls back to its normal generic framing.
  }
}

/**
 * Save a scenario the calculator accepted. Returns false if the values are
 * invalid or browser storage is unavailable; navigation must never depend on
 * this succeeding.
 */
function parseEmailedOutcome(
  value: unknown,
): CoastFireSignupContext['emailedOutcome'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const outcome = value as Record<string, unknown>;
  if (
    !numberInRange(outcome.coastFireNumber, 0, 1_000_000_000_000) ||
    typeof outcome.hasReachedCoastFire !== 'boolean'
  ) {
    return undefined;
  }
  return {
    coastFireNumber: outcome.coastFireNumber,
    hasReachedCoastFire: outcome.hasReachedCoastFire,
  };
}

export function storeCoastFireSignupContext(
  value: CoastFireInputs,
  options: {
    email?: string;
    now?: number;
    sourceToken?: string;
    emailedOutcome?: CoastFireSignupContext['emailedOutcome'];
  } = {},
): boolean {
  if (typeof window === 'undefined') return false;
  const now = options.now ?? Date.now();
  const inputs = parseInputs(value);
  if (!inputs || !numberInRange(now, 0, Number.MAX_SAFE_INTEGER)) return false;
  if (options.sourceToken && !isHandoverToken(options.sourceToken)) return false;
  const emailedOutcome = options.emailedOutcome
    ? parseEmailedOutcome(options.emailedOutcome)
    : undefined;
  if (options.emailedOutcome && !emailedOutcome) return false;

  const context: CoastFireSignupContext = {
    version: CONTEXT_VERSION,
    savedAt: now,
    inputs,
    ...(options.email ? { email: options.email } : {}),
    ...(options.sourceToken ? { sourceToken: options.sourceToken } : {}),
    ...(emailedOutcome ? { emailedOutcome } : {}),
  };

  try {
    window.sessionStorage.setItem(COAST_FIRE_SIGNUP_STORAGE_KEY, JSON.stringify(context));
    return true;
  } catch {
    return false;
  }
}

/** Return a recent, valid scenario and discard malformed or expired values. */
export function readCoastFireSignupContext(
  now = Date.now(),
): CoastFireSignupContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(COAST_FIRE_SIGNUP_STORAGE_KEY);
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
    const sourceToken =
      isHandoverToken(value.sourceToken) ? value.sourceToken : undefined;

    return {
      version: CONTEXT_VERSION,
      savedAt,
      inputs,
      ...(typeof value.email === 'string' ? { email: value.email } : {}),
      ...(sourceToken ? { sourceToken } : {}),
      ...(emailedOutcome ? { emailedOutcome } : {}),
    };
  } catch {
    removeStoredContext();
    return null;
  }
}

export function hasCoastFireSignupSource(searchParams: Pick<URLSearchParams, 'get'>): boolean {
  return searchParams.get('source') === COAST_FIRE_SIGNUP_SOURCE;
}

/** True only for a token of the shape `services/lead-token` mints. */
export function isCoastFireSignupRef(value: unknown): value is string {
  return isHandoverToken(value);
}

/**
 * The emailed link's token, handed over by `/coast-fire/continue` in a cookie
 * rather than in the URL. Null for anything that is not one of ours.
 *
 * It used to be read straight off the query string, which put a 90-day bearer
 * credential for someone's address and seven figures into the URL of a page
 * that loads Google Tag Manager in `<head>`.
 */
export function readCoastFireSignupRef(): string | null {
  return readHandoverToken(COAST_FIRE_REF_COOKIE);
}

/** Drop the handover cookie once it has been spent. */
export function clearCoastFireSignupRef(): void {
  clearHandoverToken(COAST_FIRE_REF_COOKIE);
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Exchange an emailed token for the scenario behind it.
 *
 * Resolves to null for an unknown, expired, or malformed token, and for any
 * network failure. Every caller treats null as "show the generic page", so a
 * signup is never blocked by this lookup.
 */
export async function fetchCoastFireSignupContext(
  token: string,
  signal?: AbortSignal,
): Promise<HandoverLookup<{
  inputs: CoastFireInputs;
  email?: string;
  emailedOutcome?: CoastFireSignupContext['emailedOutcome'];
}>> {
  if (!isHandoverToken(token)) return { status: 'not-found' };

  try {
    const response = await fetch(`${API_URL}/api/coast-fire/signup-context/${token}`, { signal });
    if (!response.ok) return { status: lookupStatusForResponse(response.status) };

    const body = await response.json() as {
      inputs?: unknown;
      email?: unknown;
      coastFireNumber?: unknown;
      hasReachedCoastFire?: unknown;
    };
    const inputs = parseInputs(body?.inputs);
    // A 200 we cannot read is a problem with the stored row, not a passing
    // one, so the token is spent rather than retried forever.
    if (!inputs) return { status: 'not-found' };

    const emailedOutcome = parseEmailedOutcome({
      coastFireNumber: body.coastFireNumber,
      hasReachedCoastFire: body.hasReachedCoastFire,
    });
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

/**
 * The figures the signup page shows back.
 *
 * Same-tab CTA handoffs recompute from the seven inputs (the calculator is the
 * definition of those). Emailed handoffs also pass the outcome the message
 * carried, so a formula change during the token's lifetime cannot show a
 * different Coast FIRE number than the inbox.
 */
export function coastFireSignupSummary(
  inputs: CoastFireInputs,
  emailedOutcome?: CoastFireSignupContext['emailedOutcome'],
): CoastFireResult | null {
  try {
    const computed = calculateCoastFire(inputs);
    if (!emailedOutcome) return computed;
    return {
      ...computed,
      coastFireNumber: emailedOutcome.coastFireNumber,
      hasReachedCoastFire: emailedOutcome.hasReachedCoastFire,
    };
  } catch {
    return null;
  }
}
