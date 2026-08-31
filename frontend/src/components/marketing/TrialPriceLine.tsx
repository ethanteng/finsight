'use client';

import { usePricing } from '@/components/PricingProvider';

/**
 * The "1 month free, then $X/month" line, read from the live price.
 *
 * A client component so the server components that show it stay synchronous and
 * do not each have to resolve the price themselves.
 */
export function TrialPriceLine() {
  return <>{usePricing().trialLine}</>;
}
