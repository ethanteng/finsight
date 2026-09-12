import { GET_STARTED_HREF } from './site-nav';
import { calculateCoastFire, type CoastFireInputs, type CoastFireResult } from './coast-fire';

/**
 * The Coast FIRE calculator's handoff into signup.
 *
 * Two ways in, one destination. A visitor who clicks through in the same tab
 * carries the scenario in sessionStorage; a visitor who asked for their
 * results by email arrives days later with an opaque `ref` token that the
 * backend exchanges for the same seven numbers.
 *
 * Neither route puts a financial value in the URL. Page URLs are routinely
 * collected by analytics and appear in browser history, logs, referrers, and
 * screenshots, so the token carries nothing but its own randomness.
 */

export const COAST_FIRE_SIGNUP_SOURCE = 'coast-fire-calculator';
export const COAST_FIRE_SIGNUP_HREF =
  `${GET_STARTED_HREF}?source=${COAST_FIRE_SIGNUP_SOURCE}`;

export const COAST_FIRE_SIGNUP_STORAGE_KEY = 'asklinc.coast-fire-signup-context.v1';

const CONTEXT_VERSION = 1 as const;
const CONTEXT_TTL_MS = 2 * 60 * 60 * 1000;

/** 24 random bytes, hex encoded — the shape `services/coast-fire-leads` mints. */
const TOKEN_PATTERN = /^[a-f0-9]{48}$/;

export interface CoastFireSignupContext {
  version: typeof CONTEXT_VERSION;
  savedAt: number;
  inputs: CoastFireInputs;
  /** Prefills the signup form when the scenario came from an emailed link. */
  email?: string;
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
export function storeCoastFireSignupContext(
  value: CoastFireInputs,
  options: { email?: string; now?: number } = {},
): boolean {
  if (typeof window === 'undefined') return false;
  const now = options.now ?? Date.now();
  const inputs = parseInputs(value);
  if (!inputs || !numberInRange(now, 0, Number.MAX_SAFE_INTEGER)) return false;

  const context: CoastFireSignupContext = {
    version: CONTEXT_VERSION,
    savedAt: now,
    inputs,
    ...(options.email ? { email: options.email } : {}),
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

    return {
      version: CONTEXT_VERSION,
      savedAt,
      inputs,
      ...(typeof value.email === 'string' ? { email: value.email } : {}),
    };
  } catch {
    removeStoredContext();
    return null;
  }
}

export function hasCoastFireSignupSource(searchParams: Pick<URLSearchParams, 'get'>): boolean {
  return searchParams.get('source') === COAST_FIRE_SIGNUP_SOURCE;
}

/** The emailed link's token, or null for anything that is not one of ours. */
export function readCoastFireSignupRef(
  searchParams: Pick<URLSearchParams, 'get'>,
): string | null {
  const ref = searchParams.get('ref');
  return typeof ref === 'string' && TOKEN_PATTERN.test(ref) ? ref : null;
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
): Promise<{ inputs: CoastFireInputs; email?: string } | null> {
  if (!TOKEN_PATTERN.test(token)) return null;

  try {
    const response = await fetch(`${API_URL}/api/coast-fire/signup-context/${token}`, { signal });
    if (!response.ok) return null;

    const body = await response.json() as { inputs?: unknown; email?: unknown };
    const inputs = parseInputs(body?.inputs);
    if (!inputs) return null;

    return {
      inputs,
      ...(typeof body.email === 'string' && body.email.includes('@')
        ? { email: body.email }
        : {}),
    };
  } catch {
    return null;
  }
}

/**
 * The figures the signup page shows back. Derived rather than stored: the
 * calculator is the single definition of what these seven numbers mean, and a
 * stored copy is a second one waiting to disagree with it.
 */
export function coastFireSignupSummary(inputs: CoastFireInputs): CoastFireResult | null {
  try {
    return calculateCoastFire(inputs);
  } catch {
    return null;
  }
}
