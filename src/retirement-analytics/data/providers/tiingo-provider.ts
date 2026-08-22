// Tiingo Provider
// Phase 2: Historical Data Plumbing

import { PriceTimeSeries } from '../../types';
import { TimeSeriesCache } from '../time-series-cache';
import { dbCache } from '../db-cache';
import { TiingoEodPrice, TiingoHttpError, TiingoProvider as TiingoClient } from '../../../data/providers/tiingo';

/** Thrown instead of re-requesting a symbol Tiingo is known not to cover. */
export class TiingoCoverageGapError extends Error {
  readonly ticker: string;

  constructor(ticker: string) {
    super(`Tiingo has no coverage for ${ticker} (cached); skipping request`);
    this.name = 'TiingoCoverageGapError';
    this.ticker = ticker;
  }
}

export class TiingoProvider {
  private apiKey: string;
  private cache: TimeSeriesCache;
  private client: TiingoClient;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.cache = new TimeSeriesCache();
    this.client = new TiingoClient(apiKey);
  }

  /**
   * Fetch price history from Tiingo API
   * Returns dividend/split adjusted monthly returns
   */
  async getPriceHistory(ticker: string, startDate: Date, endDate: Date): Promise<PriceTimeSeries> {
    // Check in-memory cache first (fastest)
    const cached = await this.cache.get(ticker, startDate, endDate);
    if (cached) {
      console.log(`📦 Tiingo: Using in-memory cache for ${ticker}`);
      return cached;
    }

    // Check database cache (persistent across restarts)
    const dbCached = await dbCache.getPriceHistory(ticker, startDate, endDate, 'tiingo');
    if (dbCached) {
      console.log(`💾 Tiingo: Using database cache for ${ticker}`);
      // Also populate in-memory cache for faster subsequent access
      await this.cache.set(ticker, startDate, endDate, dbCached, 24 * 60 * 60 * 1000);
      return dbCached;
    }

    // Use mock data for test environment
    if (this.apiKey === 'test_tiingo_key' || this.apiKey.startsWith('test_') || process.env.GITHUB_ACTIONS) {
      console.log('Tiingo Provider: Using mock data for test environment');
      const mockData = this.generateMockData(ticker, startDate, endDate);
      // Still save mock data to database for consistency (but only in non-CI environments)
      if (!process.env.GITHUB_ACTIONS) {
        await dbCache.savePriceHistory(ticker, mockData, 'tiingo').catch((err) => {
          console.error(`Failed to save mock data to database for ${ticker}:`, err);
        });
      }
      return mockData;
    }

    // Tiingo has already said it does not carry this symbol. Caching only
    // successes meant every uncovered holding was re-requested on every user
    // request, forever, on the critical path. Skip until the entry expires.
    if (await dbCache.isCoverageGap(ticker, 'tiingo')) {
      throw new TiingoCoverageGapError(ticker);
    }

    try {
      console.log(`🌐 Tiingo: Fetching from API for ${ticker} (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`);
      // Fetch one prior month so the first requested month's adjusted return is
      // calculable. Power supports server-side monthly resampling, which avoids
      // downloading thousands of daily rows for long retirement histories.
      const queryStartDate = new Date(startDate);
      queryStartDate.setUTCMonth(queryStartDate.getUTCMonth() - 1);
      const startStr = queryStartDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      const data = await this.client.getEodPrices(ticker, startStr, endStr, 'monthly');
      const timeSeries = this.convertToMonthlyReturns(data, ticker, startDate, endDate);
      
      console.log(`✅ Tiingo: Successfully fetched ${timeSeries.dates.length} data points for ${ticker}`);
      
      // Cache in memory for 24 hours (historical data changes infrequently)
      await this.cache.set(ticker, startDate, endDate, timeSeries, 24 * 60 * 60 * 1000);
      
      // Also persist to database for long-term storage
      console.log(`💾 Tiingo: Saving to database cache for ${ticker}`);
      await dbCache.savePriceHistory(ticker, timeSeries, 'tiingo').catch((err) => {
        console.error(`⚠️ Failed to save price history to database for ${ticker}:`, err);
        // Don't throw - cache failures shouldn't break the analysis
      });
      
      return timeSeries;
    } catch (error) {
      // A 404 is a statement about coverage, not a transient failure. Record it
      // so the next request short-circuits instead of re-asking.
      if (error instanceof TiingoHttpError && error.status === 404) {
        await dbCache.recordCoverageGap({
          ticker,
          provider: 'tiingo',
          statusCode: 404,
          endpoint: '/tiingo/daily',
        });
        console.warn(`Tiingo does not cover ${ticker}; skipping until the coverage gap expires`);
        throw error;
      }
      console.error(`Error fetching Tiingo data for ${ticker}:`, error);
      throw error;
    }
  }

  /**
   * Convert Tiingo daily prices to monthly returns
   */
  private convertToMonthlyReturns(
    data: TiingoEodPrice[],
    ticker: string,
    startDate: Date,
    endDate: Date,
  ): PriceTimeSeries {
    if (!data.length) {
      throw new Error(`No price data returned for ${ticker}`);
    }

    const observations = data
      .flatMap(price => {
        const date = new Date(price.date);
        const adjustedClose = price.adjClose ?? price.close;
        return Number.isFinite(date.getTime()) && typeof adjustedClose === 'number' && adjustedClose > 0
          ? [{ date, adjustedClose }]
          : [];
      })
      // Tiingo labels an in-progress monthly bar with month-end. Exclude it
      // when that label falls beyond the caller's requested as-of date.
      .filter(observation => {
        if (observation.date > endDate) return false;
        const now = new Date();
        const endIsCurrentMonth = endDate.getUTCFullYear() === now.getUTCFullYear()
          && endDate.getUTCMonth() === now.getUTCMonth();
        return !endIsCurrentMonth
          || observation.date.getUTCFullYear() !== endDate.getUTCFullYear()
          || observation.date.getUTCMonth() !== endDate.getUTCMonth();
      })
      .sort((left, right) => left.date.getTime() - right.date.getTime());
    if (observations.length < 2) throw new Error(`Insufficient monthly price data returned for ${ticker}`);

    const dates: Date[] = [];
    const prices: number[] = [];
    const returns: number[] = [];
    for (let index = 1; index < observations.length; index++) {
      const previous = observations[index - 1];
      const current = observations[index];
      if (current.date < startDate) continue;
      dates.push(current.date);
      prices.push(current.adjustedClose);
      returns.push((current.adjustedClose - previous.adjustedClose) / previous.adjustedClose);
    }
    if (!dates.length) throw new Error(`No complete monthly price data returned for ${ticker}`);

    return {
      ticker,
      dates,
      prices,
      returns,
      provider: 'tiingo'
    };
  }

  /**
   * Generate mock data for testing
   */
  private generateMockData(ticker: string, startDate: Date, endDate: Date): PriceTimeSeries {
    const dates: Date[] = [];
    const prices: number[] = [];
    const returns: number[] = [];

    let currentDate = new Date(startDate);
    let currentPrice = 100; // Starting price

    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      prices.push(currentPrice);
      
      // Generate random monthly return between -10% and +10%
      if (dates.length > 1) {
        const monthlyReturn = (Math.random() * 0.2 - 0.1); // -0.1 to 0.1
        returns.push(monthlyReturn);
        currentPrice = currentPrice * (1 + monthlyReturn);
      }
      
      // Move to next month
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    }

    return {
      ticker,
      dates: dates.slice(1), // Align with returns
      prices: prices.slice(1),
      returns,
      provider: 'tiingo'
    };
  }
}
