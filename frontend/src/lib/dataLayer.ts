/**
 * Analytics event tracking through the dataLayer and GTM.
 *
 * Nothing here reaches GA4 on its own: every event is a dataLayer push, and the
 * GTM container (GTM-PL362L36) is what turns it into a GA4 hit. For each event
 * name below, GTM needs a Custom Event trigger plus a GA4 Event tag bound to it
 * — and for "purchase", the tag must map transaction_id, value, currency and
 * tier. Conversion events must also be marked as key events in GA4 Admin.
 */
import { GET_STARTED_HREF } from './site-nav';
import { trackContentsquareEvent } from './contentsquare';
import { isInternalAnalyticsBrowser } from './internal-analytics';

interface DataLayerWindow {
  dataLayer?: Array<Record<string, unknown> | unknown[]>;
}

export type RetirementInteractionEvent =
  | 'retirement_calculator_started'
  | 'retirement_calculator_field_edited'
  | 'retirement_model_clicked'
  | 'retirement_model_requested'
  | 'retirement_validation_error'
  | 'retirement_api_error'
  | 'retirement_request_error';

export type CoastFireStatus = 'reached' | 'not_yet';

/**
 * Whether the visitor was shown the page's default scenario or one they
 * submitted. Both are results the page put in front of them, so both count as
 * the scorecard's "Result shown"; the field keeps them separable in reporting.
 */
export type CoastFireTrigger = 'default' | 'submitted';

/**
 * Every input the calculator can blame an error on, including the two the form
 * does not render (`lifeExpectancy` is derived server-side, `body` means the
 * request was not a plan at all). An allowlist rather than a passthrough: the
 * field name on an API error arrives in a server response, and analytics
 * dimensions should not be open to whatever a response happens to contain.
 */
export const RETIREMENT_ERROR_FIELDS = [
  'currentAge',
  'retirementAge',
  'investableAssets',
  'annualSpending',
  'annualContributions',
  'socialSecurityAnnual',
  'socialSecurityStartAge',
  'allocation',
  'lifeExpectancy',
  'body',
] as const;
export type RetirementErrorField = (typeof RETIREMENT_ERROR_FIELDS)[number];

/** Anything outside the allowlist is reported under one bucket, never dropped. */
function normalizeRetirementErrorField(field: unknown): string {
  return (RETIREMENT_ERROR_FIELDS as readonly unknown[]).includes(field)
    ? field as RetirementErrorField
    : 'unrecognized';
}

export interface RetirementInteractionDetail {
  /** Which input the error was about. Omitted when the error names none. */
  errorField?: unknown;
  /** How many inputs failed together, so a one-field stumble reads differently from a blank form. */
  invalidFieldCount?: number;
  /** HTTP status, so a 429 from the rate limiter is not filed as a bad number. */
  errorStatus?: number;
}

/**
 * One event per destination; no financial inputs — only which field was at
 * fault, never what was typed into it. GTM forwards these to GA4, where
 * `error_field` needs registering as a custom dimension for the breakdown to
 * appear in reports.
 */
export function pushRetirementInteraction(
  event: RetirementInteractionEvent,
  detail: RetirementInteractionDetail = {},
): void {
  if (typeof window === 'undefined') return;
  trackContentsquareEvent(event);
  pushToDataLayer({
    event,
    source_page: window.location.pathname,
    content_type: 'retirement_calculator',
    ...(detail.errorField === undefined
      ? {}
      : { error_field: normalizeRetirementErrorField(detail.errorField) }),
    ...(detail.invalidFieldCount === undefined
      ? {}
      : { invalid_field_count: detail.invalidFieldCount }),
    ...(detail.errorStatus === undefined ? {} : { error_status: detail.errorStatus }),
  });
}

function pushToDataLayer(payload: Record<string, unknown>): void {
  if (typeof window === 'undefined' || isInternalAnalyticsBrowser()) return;
  const win = window as unknown as DataLayerWindow;
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push(payload);
}

function getContentType(pathname: string): string {
  if (pathname === '/retirement-answers') return 'retirement_answers_hub';
  // Its own type so the beachhead page's traffic cannot be silently folded
  // into the generic retirement baseline. Matched by prefix, which also keeps
  // any later /coast-fire-* variant out of the generic bucket by default.
  if (pathname.startsWith('/coast-fire')) return 'coast_fire_calculator';
  // Its own type rather than the generic bucket: this is the page the header's
  // Retirement link and paid search both land on, and a CTA taken after running
  // the model is a different visitor from one who read a guide.
  if (pathname === '/retirement-calculator') return 'retirement_calculator';
  if (/^\/can-i-retire-(at|with)-/.test(pathname)) return 'retirement_answer';
  return 'marketing_page';
}

/**
 * Record the calculator outcome as a funnel event, never the figures used to
 * reach it. GTM needs a Custom Event trigger on `coast_fire_calculated` plus a
 * GA4 Event tag that forwards `coast_fire_status`, `calculation_trigger`,
 * `years_to_retirement`, `source_page`, and `content_type`; without that tag
 * the beachhead scorecard's Result shown stage stays at zero even when the
 * page is live and visitors are calculating.
 */
export function pushCoastFireCalculated(
  status: CoastFireStatus,
  yearsToRetirement: number,
  trigger: CoastFireTrigger = 'submitted',
): void {
  if (typeof window === 'undefined') return;
  trackContentsquareEvent('coast_fire_calculated');
  pushToDataLayer({
    event: 'coast_fire_calculated',
    source_page: window.location.pathname,
    content_type: 'coast_fire_calculator',
    coast_fire_status: status,
    calculation_trigger: trigger,
    years_to_retirement: Math.max(0, Math.min(77, Math.round(yearsToRetirement))),
  });
}

/**
 * A visitor asked for their Coast FIRE results by email — the first point in
 * this funnel where an anonymous calculator user becomes a known prospect, and
 * the thing the beachhead experiment most needs to measure.
 *
 * GTM needs a Custom Event trigger on `coast_fire_results_emailed` plus a GA4
 * Event tag forwarding `coast_fire_status`, `source_page`, and `content_type`;
 * mark it a key event in GA4 Admin so it reports as a conversion. The address
 * itself is never pushed — only that one was given.
 */
export function pushCoastFireResultsEmailed(status: CoastFireStatus): void {
  if (typeof window === 'undefined') return;
  trackContentsquareEvent('coast_fire_results_emailed');
  pushToDataLayer({
    event: 'coast_fire_results_emailed',
    source_page: window.location.pathname,
    content_type: 'coast_fire_calculator',
    coast_fire_status: status,
  });
}

/**
 * A visitor asked for their retirement model run by email — the point where an
 * anonymous calculator user becomes a known prospect, and the counterpart to
 * `coast_fire_results_emailed` on the other calculator.
 *
 * GTM needs a Custom Event trigger on `retirement_results_emailed` plus a GA4
 * Event tag forwarding `survival_band`, `source_page`, and `content_type`;
 * mark it a key event in GA4 Admin so it reports as a conversion. The address
 * is never pushed — only that one was given, and roughly how the plan did.
 */
export function pushRetirementResultsEmailed(survivalRate: number): void {
  if (typeof window === 'undefined') return;
  trackContentsquareEvent('retirement_results_emailed');
  pushToDataLayer({
    event: 'retirement_results_emailed',
    source_page: window.location.pathname,
    content_type: 'retirement_calculator',
    // The band, not the rate: a percentage to two decimals is close enough to
    // a fingerprint of one person's plan to be worth not sending.
    survival_band: survivalRate >= 0.9 ? 'strong' : survivalRate >= 0.7 ? 'mixed' : 'weak',
  });
}

export function pushBeginCheckout(ctaLocation = 'marketing_cta'): void {
  if (typeof window === 'undefined') return;

  const sourcePage = window.location.pathname;
  const contentType = getContentType(sourcePage);
  const payload = {
    event: 'begin_checkout',
    source_page: sourcePage,
    cta_location: ctaLocation,
    content_type: contentType,
  };
  pushToDataLayer(payload);
}

/**
 * Fired when the primary no-card "Start free" CTA sends a visitor into the
 * account-creation funnel. This is deliberately separate from begin_checkout:
 * /getstarted does not open Stripe or collect payment details.
 */
export function pushStartFreeClick(ctaLocation = 'marketing_cta'): void {
  if (typeof window === 'undefined') return;
  trackContentsquareEvent('start_free_click');

  const sourcePage = window.location.pathname;
  pushToDataLayer({
    event: 'start_free_click',
    source_page: sourcePage,
    cta_location: ctaLocation,
    content_type: getContentType(sourcePage),
    destination_page: GET_STARTED_HREF,
  });
}

export type SignupFlow = 'free_trial' | 'paid_checkout' | 'direct';

export interface SignUpEvent {
  signupFlow: SignupFlow;
}

export const TRIAL_FUNNEL_ERROR_CATEGORIES = [
  'server_rejected',
  'network_error',
  'unknown',
] as const;
export type TrialFunnelErrorCategory = (typeof TRIAL_FUNNEL_ERROR_CATEGORIES)[number];

type TrialFunnelEvent =
  | 'trial_signup_viewed'
  | 'trial_signup_started'
  | 'trial_signup_submit'
  | 'trial_signup_validation_error'
  | 'trial_signup_registration_error'
  | 'trial_verify_viewed'
  | 'trial_verify_submit'
  | 'trial_verify_error'
  | 'trial_verify_success'
  | 'trial_login_viewed'
  | 'trial_login_submit'
  | 'trial_login_error'
  | 'trial_login_success';

function pushTrialFunnelEvent(
  event: TrialFunnelEvent,
  parameters: Record<string, string> = {},
): void {
  if (typeof window === 'undefined') return;
  trackContentsquareEvent(event);
  pushToDataLayer({
    event,
    source_page: window.location.pathname,
    signup_flow: 'free_trial',
    ...parameters,
  });
}

function normalizeTrialErrorCategory(category: unknown): TrialFunnelErrorCategory {
  return (TRIAL_FUNNEL_ERROR_CATEGORIES as readonly unknown[]).includes(category)
    ? category as TrialFunnelErrorCategory
    : 'unknown';
}

export function pushTrialSignupViewed(): void {
  pushTrialFunnelEvent('trial_signup_viewed');
}

export function pushTrialSignupStarted(): void {
  pushTrialFunnelEvent('trial_signup_started');
}

export function pushTrialSignupSubmit(): void {
  pushTrialFunnelEvent('trial_signup_submit');
}

/** The client currently has one allowlisted registration-validation reason. */
export function pushTrialSignupValidationError(): void {
  pushTrialFunnelEvent('trial_signup_validation_error', {
    validation_reason: 'password_requirements',
  });
}

export function pushTrialSignupRegistrationError(category: unknown): void {
  pushTrialFunnelEvent('trial_signup_registration_error', {
    error_category: normalizeTrialErrorCategory(category),
  });
}

export function pushTrialVerifyViewed(): void {
  pushTrialFunnelEvent('trial_verify_viewed');
}

export function pushTrialVerifySubmit(): void {
  pushTrialFunnelEvent('trial_verify_submit');
}

export function pushTrialVerifyError(category: unknown): void {
  pushTrialFunnelEvent('trial_verify_error', {
    error_category: normalizeTrialErrorCategory(category),
  });
}

export function pushTrialVerifySuccess(): void {
  pushTrialFunnelEvent('trial_verify_success');
}

export function pushTrialLoginViewed(): void {
  pushTrialFunnelEvent('trial_login_viewed');
}

export function pushTrialLoginSubmit(): void {
  pushTrialFunnelEvent('trial_login_submit');
}

export function pushTrialLoginError(category: unknown): void {
  pushTrialFunnelEvent('trial_login_error', {
    error_category: normalizeTrialErrorCategory(category),
  });
}

export function pushTrialLoginSuccess(): void {
  pushTrialFunnelEvent('trial_login_success');
}

/**
 * Fired only after /auth/register confirms that an account was created.
 * `sign_up` is GA4's recommended account-registration event; no user id or
 * email is included in the analytics payload.
 */
export function pushSignUp({ signupFlow }: SignUpEvent): void {
  if (typeof window === 'undefined') return;
  trackContentsquareEvent('sign_up');
  if (signupFlow === 'free_trial') trackContentsquareEvent('sign_up_free_trial');

  pushToDataLayer({
    event: 'sign_up',
    method: 'email',
    source_page: window.location.pathname,
    signup_flow: signupFlow,
  });
}

/**
 * Fired when a visitor runs the retirement model on /retirement-calculator.
 * GTM needs a Custom Event trigger on `retirement_model_run` plus a GA4 tag
 * mapping retirement_age and content_type; without them this push goes
 * nowhere.
 */
export function pushRetirementModelRun(retirementAge: number): void {
  if (typeof window === 'undefined') return;
  trackContentsquareEvent('retirement_model_run');

  const sourcePage = window.location.pathname;
  pushToDataLayer({
    event: 'retirement_model_run',
    source_page: sourcePage,
    content_type: getContentType(sourcePage),
    retirement_age: retirementAge,
  });
}

export function pushViewExamples(): void {
  if (typeof window === 'undefined') return;

  pushToDataLayer({
    event: 'view_examples',
    source_page: window.location.pathname,
  });
}

export function pushViewMoreExamples(): void {
  if (typeof window === 'undefined') return;

  pushToDataLayer({
    event: 'view_more_examples',
    source_page: window.location.pathname,
  });
}

/**
 * Tiers the checkout flow can sell. Anything else is a stale or tampered link.
 */
const KNOWN_TIERS = ['starter', 'standard', 'premium'] as const;
type PurchaseTier = (typeof KNOWN_TIERS)[number];

/** Single-tier pricing sells `premium`, so that is the safe stand-in. */
const DEFAULT_TIER: PurchaseTier = 'premium';

/**
 * Keyed by transaction so a second genuine purchase in the same tab still
 * reports, while a reload of the same success page does not double-count.
 */
const PURCHASE_FIRED_KEY_PREFIX = 'purchase_event_fired:';
const TRIAL_STARTED_FIRED_KEY_PREFIX = 'trial_started_verified_event_fired:';

export interface PurchaseEvent {
  /** The Stripe checkout session id. GA4 dedupes purchases on this. */
  transactionId: unknown;
  /** Revenue in major units (dollars), as the payment-success API reports it. */
  value: unknown;
  /** ISO currency code. GA4 ignores `value` without it. */
  currency: unknown;
  /** Tier label; anything unrecognised falls back to DEFAULT_TIER. */
  tier: unknown;
}

function normalizeTier(tier: unknown): PurchaseTier {
  if (typeof tier !== 'string') return DEFAULT_TIER;
  const normalized = tier.trim().toLowerCase();
  return (KNOWN_TIERS as readonly string[]).includes(normalized)
    ? (normalized as PurchaseTier)
    : DEFAULT_TIER;
}

/**
 * sessionStorage throws rather than no-ops when storage is blocked (Safari
 * private browsing, cookie-blocking extensions). Treat any failure as "not
 * fired yet": a possible later duplicate is preferable to dropping the
 * current conversion.
 */
function hasFired(storageKey: string): boolean {
  try {
    return window.sessionStorage.getItem(storageKey) !== null;
  } catch {
    return false;
  }
}

function markFired(storageKey: string): void {
  try {
    window.sessionStorage.setItem(storageKey, 'true');
  } catch {
    // Nothing to do: the data-layer push already happened.
  }
}

export interface TrialStartedEvent {
  /** The Stripe checkout session id, used to suppress retries in this tab. */
  transactionId: unknown;
  /** Tier returned by the backend after it verifies the Stripe session. */
  tier: unknown;
  /** The account-setup destination selected by the verified callback. */
  signupPath: unknown;
}

/**
 * Report a verified free-trial start as soon as the Stripe callback succeeds.
 *
 * GTM currently infers this event from a later page view whose URL contains
 * `checkout=success`. This explicit event lets GTM move to a Custom Event
 * trigger without depending on the visitor waiting for that redirect. Until
 * the GTM trigger is migrated, this data-layer push is intentionally inert.
 */
export function pushTrialStartedVerified({ transactionId, tier, signupPath }: TrialStartedEvent): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof transactionId !== 'string' || !transactionId) return false;

  const storageKey = TRIAL_STARTED_FIRED_KEY_PREFIX + transactionId;
  if (hasFired(storageKey)) return false;

  const payload: Record<string, unknown> = {
    event: 'trial_started_verified',
    transaction_id: transactionId,
    tier: normalizeTier(tier),
  };

  if (typeof signupPath === 'string' && signupPath.startsWith('/')) {
    payload.signup_path = signupPath;
  }

  pushToDataLayer(payload);
  markFired(storageKey);
  return true;
}

/**
 * Report a completed, paid checkout.
 *
 * Callers must gate this on a *paid* session — a free trial charges nothing and
 * is not a purchase. Returns whether the event was pushed, so a caller can log
 * the difference between "reported" and "already reported".
 */
export function pushPurchase({ transactionId, value, currency, tier }: PurchaseEvent): boolean {
  if (typeof window === 'undefined') return false;

  // Without a transaction id there is no way to dedupe, in this tab or in GA4.
  if (typeof transactionId !== 'string' || !transactionId) return false;
  const storageKey = PURCHASE_FIRED_KEY_PREFIX + transactionId;
  if (hasFired(storageKey)) return false;

  const normalizedTier = normalizeTier(tier);
  const payload: Record<string, unknown> = {
    event: 'purchase',
    transaction_id: transactionId,
    tier: normalizedTier,
  };

  // Revenue is reported only when both halves are usable. GA4 discards a value
  // with no currency, and a purchase with the wrong amount is worse than a
  // purchase with none — the event still counts as a conversion either way.
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && typeof currency === 'string' && currency) {
    payload.value = value;
    payload.currency = currency.toUpperCase();
    // Matches what the server-side Measurement Protocol sends for a trial
    // conversion, so the two paths describe the same sale the same way. Inert
    // until the GA4 tag in GTM maps ecommerce items.
    payload.items = [
      {
        item_id: `subscription_${normalizedTier}`,
        item_name: `Ask Linc ${normalizedTier}`,
        item_category: 'subscription',
        price: value,
        quantity: 1,
      },
    ];
  } else {
    console.warn('Purchase event is missing a usable value/currency pair', { value, currency });
  }

  pushToDataLayer(payload);
  markFired(storageKey);
  return true;
}
