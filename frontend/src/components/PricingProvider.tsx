'use client';

import { createContext, useContext } from 'react';
import { FALLBACK_PRICING, type Pricing } from '@/config/pricing';

/**
 * Carries the live Stripe price from the server-rendered layout down to client
 * components, so no component has to hardcode or refetch it.
 */
const PricingContext = createContext<Pricing>(FALLBACK_PRICING);

export function PricingProvider({
  pricing,
  children,
}: {
  pricing: Pricing;
  children: React.ReactNode;
}) {
  return <PricingContext.Provider value={pricing}>{children}</PricingContext.Provider>;
}

/**
 * The current subscription price. Falls back to the advertised default when a
 * component renders outside the provider (e.g. in an isolated unit test).
 */
export function usePricing(): Pricing {
  return useContext(PricingContext);
}
