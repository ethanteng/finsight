/**
 * Single source of truth for the subscription price we charge and display.
 *
 * The price ID comes from STRIPE_PRICE_DEFAULT, and the amount itself is read
 * back from Stripe rather than duplicated in code, so changing the price in the
 * Stripe dashboard changes both checkout and every price shown on the site.
 *
 * The Stripe client is imported lazily: config/stripe.ts imports from
 * types/stripe.ts, which imports this module, so a static import would close a
 * require cycle at module load.
 */

export type BillingInterval = 'day' | 'week' | 'month' | 'year';

// Checked in order, so an existing deployment that only sets the legacy
// per-tier variables keeps working until it moves over to STRIPE_PRICE_DEFAULT.
const PRICE_ID_ENV_VARS = [
  'STRIPE_PRICE_DEFAULT',
  'STRIPE_PRICE_PREMIUM',
  'STRIPE_PRICE_STANDARD',
  'STRIPE_PRICE_STARTER',
] as const;

// Used only when nothing is configured or Stripe cannot be reached. Checkout
// and every displayed price fall back to this rather than failing.
export const FALLBACK_PRICE_ID = 'price_1UAKSrBDHiWEJZBM6gupEC9p';
export const FALLBACK_PRICE_UNIT_AMOUNT = 1900; // $19.00, in cents
export const FALLBACK_PRICE_CURRENCY = 'usd';
export const FALLBACK_PRICE_INTERVAL: BillingInterval = 'month';

// How long a resolved price is reused before we ask Stripe again. Prices change
// rarely, and every marketing page render would otherwise be a Stripe call.
const SUCCESS_TTL_MS = Number(process.env.STRIPE_PRICE_CACHE_TTL_MS) || 5 * 60 * 1000;
// A failure is cached briefly too, so a Stripe outage cannot turn one page view
// into one API call per render.
const FAILURE_TTL_MS = 30 * 1000;

export interface ResolvedPrice {
  priceId: string;
  /** Amount in the currency's minor unit, exactly as Stripe reports it. */
  unitAmount: number;
  /** Amount in major units (e.g. dollars). */
  amount: number;
  currency: string;
  interval: BillingInterval;
  intervalCount: number;
  /** e.g. "$19" (or "$19.99" when the amount is not whole). */
  formattedAmount: string;
  /** e.g. "$19/month". */
  label: string;
  /** False when this is the built-in fallback rather than a live Stripe lookup. */
  live: boolean;
}

interface CacheEntry {
  expiresAt: number;
  value: ResolvedPrice;
}

let cache: CacheEntry | null = null;

/** Reset the memoized price. Exported for tests and for the admin refresh path. */
export function clearDefaultPriceCache(): void {
  cache = null;
}

/** The configured price ID, if any environment variable supplies one. */
export function getConfiguredStripePriceId(): string | null {
  for (const name of PRICE_ID_ENV_VARS) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/**
 * The Stripe price ID to charge: STRIPE_PRICE_DEFAULT when set, otherwise the
 * fallback price so checkout still works in an environment that is missing it.
 */
export function getDefaultStripePriceId(): string {
  return getConfiguredStripePriceId() || FALLBACK_PRICE_ID;
}

/** Alias kept for call sites that read as "this must produce an ID". */
export function requireDefaultStripePriceId(): string {
  return getDefaultStripePriceId();
}

/** The advertised price used when Stripe cannot be reached. */
export function getFallbackPrice(): ResolvedPrice {
  const formattedAmount = formatPriceAmount(FALLBACK_PRICE_UNIT_AMOUNT, FALLBACK_PRICE_CURRENCY);
  return {
    priceId: getDefaultStripePriceId(),
    unitAmount: FALLBACK_PRICE_UNIT_AMOUNT,
    amount: minorToMajor(FALLBACK_PRICE_UNIT_AMOUNT, FALLBACK_PRICE_CURRENCY),
    currency: FALLBACK_PRICE_CURRENCY,
    interval: FALLBACK_PRICE_INTERVAL,
    intervalCount: 1,
    formattedAmount,
    label: `${formattedAmount}/${FALLBACK_PRICE_INTERVAL}`,
    live: false,
  };
}

/** True when the configured price ID looks like a real Stripe price. */
export function isLikelyStripePriceId(priceId: string | null | undefined): boolean {
  return typeof priceId === 'string' && priceId.startsWith('price_');
}

export function formatPriceAmount(unitAmount: number, currency: string): string {
  const amount = minorToMajor(unitAmount, currency);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      // Whole amounts read better without the trailing ".00" in marketing copy.
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Intl throws on an unknown currency code; never let formatting break checkout.
    return `${amount} ${currency.toUpperCase()}`;
  }
}

/** Stripe reports zero-decimal currencies (JPY, KRW, ...) in whole units. */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

export function minorToMajor(unitAmount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? unitAmount : unitAmount / 100;
}

function buildLabel(formattedAmount: string, interval: BillingInterval, intervalCount: number): string {
  return intervalCount > 1
    ? `${formattedAmount} every ${intervalCount} ${interval}s`
    : `${formattedAmount}/${interval}`;
}

/** One live Stripe lookup for the configured price. Throws on any failure. */
async function fetchLivePrice(): Promise<ResolvedPrice> {
  const priceId = getDefaultStripePriceId();
  const { stripe } = await import('./stripe');
  const price = await stripe.client.prices.retrieve(priceId);

  if (price.unit_amount === null || price.unit_amount === undefined) {
    // Tiered or metered prices have no single amount to advertise.
    throw new Error(`Stripe price ${priceId} has no unit_amount to display`);
  }

  const currency = price.currency || FALLBACK_PRICE_CURRENCY;
  const interval = (price.recurring?.interval || FALLBACK_PRICE_INTERVAL) as BillingInterval;
  const intervalCount = price.recurring?.interval_count || 1;
  const formattedAmount = formatPriceAmount(price.unit_amount, currency);

  return {
    priceId: price.id,
    unitAmount: price.unit_amount,
    amount: minorToMajor(price.unit_amount, currency),
    currency,
    interval,
    intervalCount,
    formattedAmount,
    label: buildLabel(formattedAmount, interval, intervalCount),
    live: true,
  };
}

/**
 * The subscription price to charge and display, read from Stripe and memoized.
 *
 * Never throws: if Stripe is unreachable or no price is configured, it returns
 * the fallback price (live: false) so checkout and the marketing pages keep
 * working with a sane amount instead of erroring or rendering a blank price.
 */
export async function getDefaultPrice(options: { forceRefresh?: boolean } = {}): Promise<ResolvedPrice> {
  const now = Date.now();
  if (!options.forceRefresh && cache && cache.expiresAt > now) {
    return cache.value;
  }

  try {
    const resolved = await fetchLivePrice();
    cache = { expiresAt: now + SUCCESS_TTL_MS, value: resolved };
    return resolved;
  } catch (error) {
    console.warn(
      'Falling back to the default advertised Stripe price:',
      error instanceof Error ? error.message : error
    );
    // Cache the fallback briefly too, so a Stripe outage cannot turn one page
    // view into one API call per render.
    const fallback = getFallbackPrice();
    cache = { expiresAt: now + FAILURE_TTL_MS, value: fallback };
    return fallback;
  }
}
