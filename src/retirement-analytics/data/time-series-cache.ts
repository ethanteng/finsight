// Time Series Cache
// Phase 2: Historical Data Plumbing

import { PriceTimeSeries } from '../types';
import { cacheService } from '../../data/cache';

export class TimeSeriesCache {
  /**
   * Get cached price time series
   */
  async get(ticker: string, startDate: Date, endDate: Date): Promise<PriceTimeSeries | null> {
    const cacheKey = this.buildCacheKey(ticker, startDate, endDate);
    return await cacheService.get<PriceTimeSeries>(cacheKey);
  }
  
  /**
   * Cache price time series with TTL
   */
  async set(
    ticker: string,
    startDate: Date,
    endDate: Date,
    data: PriceTimeSeries,
    ttlMs: number
  ): Promise<void> {
    const cacheKey = this.buildCacheKey(ticker, startDate, endDate);
    await cacheService.set(cacheKey, data, ttlMs);
  }

  /**
   * Build cache key from ticker and date range
   */
  private buildCacheKey(ticker: string, startDate: Date, endDate: Date): string {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    return `price_history:${ticker}:${startStr}:${endStr}`;
  }
}
