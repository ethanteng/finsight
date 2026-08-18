// Data Normalizer
// Phase 2: Historical Data Plumbing

import { PriceTimeSeries } from '../types';

/**
 * Normalize provider responses to common PriceTimeSeries format
 * Currently Tiingo provider handles normalization internally
 * This function is reserved for future provider integrations
 */
export function normalizeProviderResponse(
  provider: 'polygon' | 'tiingo' | 'alpha_vantage',
  rawData: any,
  ticker: string
): PriceTimeSeries {
  // Tiingo provider already returns normalized format
  if (provider === 'tiingo' && rawData.ticker && rawData.dates && rawData.returns) {
    return rawData as PriceTimeSeries;
  }

  // For other providers, normalization would happen here
  // Phase 2: Polygon/Alpha Vantage normalization pending if needed
  throw new Error(`Normalization not implemented for provider: ${provider}`);
}
