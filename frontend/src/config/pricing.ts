/**
 * Pricing copy is derived from the live Stripe price (see lib/pricing.ts), not
 * written into components. These helpers turn a resolved amount into the strings
 * the marketing pages show, and the FALLBACK_* values keep a page renderable
 * when the API cannot be reached.
 */

export type BillingInterval = 'day' | 'week' | 'month' | 'year';

export interface Pricing {
  /** Amount in major units, e.g. 19 for $19. */
  amount: number;
  currency: string;
  interval: BillingInterval;
  intervalCount: number;
  /** e.g. "$19" */
  dollars: string;
  /** Currency symbol on its own, e.g. "$", for markup that superscripts it. */
  symbol: string;
  /** Amount without the currency symbol, e.g. "19". */
  amountText: string;
  /** Interval phrase, e.g. "month" or "3 months". */
  intervalLabel: string;
  /** e.g. "$19/month" */
  label: string;
  /** e.g. "1 month free, then $19/month. Cancel anytime." */
  trialLine: string;
  /** Amount formatted for schema.org offers, e.g. "19.00". */
  schemaPrice: string;
  /** False when this came from the fallback rather than from Stripe. */
  live: boolean;
}

// Only used when the pricing API is unreachable at render time. Mirrors the
// backend fallback in src/config/stripe-pricing.ts, so a page rendered during a
// Stripe outage advertises the same price checkout would charge.
export const FALLBACK_PRICE_AMOUNT = 19;
export const FALLBACK_PRICE_CURRENCY = 'usd';
export const FALLBACK_PRICE_INTERVAL: BillingInterval = 'month';

const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

export function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      // Whole amounts read better without a trailing ".00" in marketing copy.
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

/** Split a formatted amount into its currency symbol and numeric parts. */
function splitFormattedAmount(amount: number, currency: string): { symbol: string; amountText: string } {
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).formatToParts(amount);

    const symbol = parts
      .filter((part) => part.type === 'currency')
      .map((part) => part.value)
      .join('');
    const amountText = parts
      .filter((part) => part.type !== 'currency' && part.type !== 'literal')
      .map((part) => part.value)
      .join('');

    return { symbol, amountText: amountText || String(amount) };
  } catch {
    return { symbol: currency.toUpperCase(), amountText: String(amount) };
  }
}

export function buildPricing(input: {
  amount: number;
  currency?: string;
  interval?: BillingInterval;
  intervalCount?: number;
  live?: boolean;
}): Pricing {
  const currency = input.currency || FALLBACK_PRICE_CURRENCY;
  const interval = input.interval || FALLBACK_PRICE_INTERVAL;
  const intervalCount = input.intervalCount && input.intervalCount > 0 ? input.intervalCount : 1;
  const dollars = formatAmount(input.amount, currency);
  const { symbol, amountText } = splitFormattedAmount(input.amount, currency);
  const intervalLabel = intervalCount > 1 ? `${intervalCount} ${interval}s` : interval;
  const label = intervalCount > 1 ? `${dollars} every ${intervalLabel}` : `${dollars}/${interval}`;
  const decimals = ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 0 : 2;

  return {
    amount: input.amount,
    currency,
    interval,
    intervalCount,
    dollars,
    symbol,
    amountText,
    intervalLabel,
    label,
    trialLine: `1 month free, then ${label}. Cancel anytime.`,
    schemaPrice: input.amount.toFixed(decimals),
    live: input.live ?? false,
  };
}

export const FALLBACK_PRICING: Pricing = buildPricing({
  amount: FALLBACK_PRICE_AMOUNT,
  currency: FALLBACK_PRICE_CURRENCY,
  interval: FALLBACK_PRICE_INTERVAL,
  live: false,
});
