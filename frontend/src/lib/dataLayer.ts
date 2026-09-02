/**
 * Analytics event tracking through the dataLayer and GTM.
 *
 * Nothing here reaches GA4 on its own: every event is a dataLayer push, and the
 * GTM container (GTM-PL362L36) is what turns it into a GA4 hit. For each event
 * name below, GTM needs a Custom Event trigger plus a GA4 Event tag bound to it
 * — and for "purchase", the tag must map transaction_id, value, currency and
 * tier, and the event must be marked as a key event in GA4 Admin.
 */
interface DataLayerWindow {
  dataLayer?: Array<Record<string, unknown> | unknown[]>;
}

type GtagWindow = Window & {
  gtag?: (command: 'event', event: string, params?: Record<string, unknown>) => void;
};

function pushToDataLayer(payload: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const win = window as unknown as DataLayerWindow;
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push(payload);
}

function getContentType(pathname: string): string {
  if (pathname === '/retirement-answers') return 'retirement_answers_hub';
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

  const analyticsWindow = window as GtagWindow;
  analyticsWindow.gtag?.('event', 'begin_checkout', payload);
}

export function pushViewExamples(): void {
  const payload = {
    event: 'view_examples',
    source_page: window.location.pathname,
  };
  pushToDataLayer(payload);

  // GA4 via gtag (when loaded directly, e.g. NEXT_PUBLIC_GA_ID)
  if (typeof window !== 'undefined' && typeof (window as Window & { gtag?: unknown }).gtag === 'function') {
    (window as Window & { gtag: (c: 'event', e: string, p?: Record<string, unknown>) => void }).gtag('event', 'view_examples', { source_page: window.location.pathname });
  }
}

export function pushViewMoreExamples(): void {
  const payload = {
    event: 'view_more_examples',
    source_page: window.location.pathname,
  };
  pushToDataLayer(payload);

  // GA4 via gtag (when loaded directly)
  if (typeof window !== 'undefined' && typeof (window as Window & { gtag?: unknown }).gtag === 'function') {
    (window as Window & { gtag: (c: 'event', e: string, p?: Record<string, unknown>) => void }).gtag('event', 'view_more_examples', { source_page: window.location.pathname });
  }
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
 * fired yet": GA4 dedupes on transaction_id, so a repeat push is recoverable
 * where a dropped conversion is not.
 */
function hasFired(transactionId: string): boolean {
  try {
    return window.sessionStorage.getItem(PURCHASE_FIRED_KEY_PREFIX + transactionId) !== null;
  } catch {
    return false;
  }
}

function markFired(transactionId: string): void {
  try {
    window.sessionStorage.setItem(PURCHASE_FIRED_KEY_PREFIX + transactionId, 'true');
  } catch {
    // Nothing to do: the push already happened, and GA4 will dedupe a repeat.
  }
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
  if (hasFired(transactionId)) return false;

  const payload: Record<string, unknown> = {
    event: 'purchase',
    transaction_id: transactionId,
    tier: normalizeTier(tier),
  };

  // Revenue is reported only when both halves are usable. GA4 discards a value
  // with no currency, and a purchase with the wrong amount is worse than a
  // purchase with none — the event still counts as a conversion either way.
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && typeof currency === 'string' && currency) {
    payload.value = value;
    payload.currency = currency.toUpperCase();
  } else {
    console.warn('Purchase event is missing a usable value/currency pair', { value, currency });
  }

  pushToDataLayer(payload);
  markFired(transactionId);
  return true;
}
