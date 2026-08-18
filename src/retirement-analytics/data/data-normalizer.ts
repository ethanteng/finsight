// Data Normalizer
// Phase 2: Historical Data Plumbing

import { PriceTimeSeries } from '../types';

/**
 * Normalize provider responses to common PriceTimeSeries format
 * Currently Tiingo provider handles normalization internally
 * This function is reserved for future provider integrations
 */
export function normalizeProviderResponse(
  provider: 'polygon' | 'tiingo',
  rawData: any,
  ticker: string
): PriceTimeSeries {
  // Tiingo provider already returns normalized format
  if (provider === 'tiingo' && rawData.ticker && rawData.dates && rawData.returns) {
    return rawData as PriceTimeSeries;
  }

  // For other providers, normalization would happen here
  // Polygon normalization can be added if it becomes a price-history source.
  throw new Error(`Normalization not implemented for provider: ${provider}`);
}
