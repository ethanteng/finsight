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

interface DataLayerWindow {
  dataLayer?: Array<Record<string, unknown> | unknown[]>;
}

function pushToDataLayer(payload: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const win = window as unknown as DataLayerWindow;
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push(payload);
}

function getContentType(pathname: string): string {
  if (pathname === '/retirement-calculator') return 'retirement_calculator';
  if (pathname === '/retirement-answers') return 'retirement_answers_hub';
  // Its own type rather than the generic bucket: this is the page the header's
  // Retirement link and paid search both land on, and a CTA taken after running
  // the model is a different visitor from one who read a guide.
  if (pathname === '/retirement-calculator') return 'retirement_calculator';
  if (/^\/can-i-retire-(at|with)-/.test(pathname)) return 'retirement_answer';
  return 'marketing_page';
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

const SIGNUP_FLOWS = ['free_trial', 'paid_checkout', 'direct'] as const;
export type SignupFlow = (typeof SIGNUP_FLOWS)[number];

export interface SignUpEvent {
  signupFlow: SignupFlow;
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
    content_type: getContentType(window.location.pathname),
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
