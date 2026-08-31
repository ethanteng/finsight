import { buildPricing, FALLBACK_PRICING, type BillingInterval, type Pricing } from '@/config/pricing';

/**
 * Resolves the subscription price the backend charges (STRIPE_PRICE_DEFAULT,
 * looked up in Stripe) so displayed and charged prices always match.
 *
 * Called from server components and revalidated on a timer, so a price change
 * in Stripe reaches the marketing pages without a redeploy.
 */

// How long a rendered page may show a cached price before Next refetches it.
const REVALIDATE_SECONDS = 300;

// A build renders many pages; one warning is enough to explain a fallback.
let warnedAboutFallback = false;

interface PriceApiResponse {
  success?: boolean;
  price?: {
    amount?: number;
    currency?: string;
    interval?: string;
    intervalCount?: number;
  };
}

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
}

export async function getPricing(): Promise<Pricing> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/stripe/price`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ['stripe-price'] },
    });

    if (!response.ok) {
      throw new Error(`Pricing request failed with ${response.status}`);
    }

    const body = (await response.json()) as PriceApiResponse;
    const amount = body.price?.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new Error('Pricing response did not include a usable amount');
    }

    return buildPricing({
      amount,
      currency: body.price?.currency,
      interval: body.price?.interval as BillingInterval | undefined,
      intervalCount: body.price?.intervalCount,
      live: true,
    });
  } catch (error) {
    // A marketing page with no price is worse than one with a stale price.
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      console.warn('Falling back to the default advertised price:', error);
    }
    return FALLBACK_PRICING;
  }
}
