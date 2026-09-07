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
  /**
   * The trial framed alongside the price, e.g.
   * "Try free for 30 days, no credit card. Then $19/month."
   *
   * For places that have to quote the price — a pricing card, a comparison
   * table's Price row. Plain CTA microcopy uses TRIAL_CTA_MICROCOPY instead,
   * which carries no price at all.
   */
  trialThenPriceLine: string;
  /**
   * @deprecated Claims the trial converts to a paid subscription on its own.
   * The trial no longer collects a card, so nothing auto-bills when it ends.
   * Only unrouted legacy components still read these; use trialThenPriceLine
   * or TRIAL_CTA_MICROCOPY.
   */
  trialLine: string;
  /** @deprecated See trialLine. */
  trialLineShort: string;
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
    trialThenPriceLine: `Try free for 30 days, no credit card. Then ${label}.`,
    trialLine: `1 month free, then ${label}. Cancel anytime.`,
    trialLineShort: `1 month free, then ${label}.`,
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
