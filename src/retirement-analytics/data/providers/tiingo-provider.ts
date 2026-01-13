// Tiingo Provider
// Phase 2: Historical Data Plumbing

import { PriceTimeSeries } from '../../types';
import { TimeSeriesCache } from '../time-series-cache';
import { dbCache } from '../db-cache';

interface TiingoDailyPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose: number;
  adjOpen: number;
  adjHigh: number;
  adjLow: number;
  adjVolume: number;
  divCash: number;
  splitFactor: number;
}

interface TiingoResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: TiingoDailyPrice[];
}

export class TiingoProvider {
  private baseUrl = 'https://api.tiingo.com/tiingo/daily';
  private apiKey: string;
  private cache: TimeSeriesCache;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.cache = new TimeSeriesCache();
  }

  /**
   * Fetch price history from Tiingo API
   * Returns dividend/split adjusted monthly returns
   */
  async getPriceHistory(ticker: string, startDate: Date, endDate: Date): Promise<PriceTimeSeries> {
    // Check in-memory cache first (fastest)
    const cached = await this.cache.get(ticker, startDate, endDate);
    if (cached) {
      return cached;
    }

    // Check database cache (persistent across restarts)
    const dbCached = await dbCache.getPriceHistory(ticker, startDate, endDate, 'tiingo');
    if (dbCached) {
      // Also populate in-memory cache for faster subsequent access
      await this.cache.set(ticker, startDate, endDate, dbCached, 24 * 60 * 60 * 1000);
      return dbCached;
    }

    // Use mock data for test environment
    if (this.apiKey === 'test_tiingo_key' || this.apiKey.startsWith('test_') || process.env.GITHUB_ACTIONS) {
      console.log('Tiingo Provider: Using mock data for test environment');
      return this.generateMockData(ticker, startDate, endDate);
    }

    try {
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      const url = `${this.baseUrl}/${ticker}/prices?startDate=${startStr}&endDate=${endStr}&format=json&resampleFreq=daily`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Tiingo API error: ${response.status} ${response.statusText}`);
      }

      const data: TiingoResponse = await response.json();
      
      // Convert daily prices to monthly returns
      const timeSeries = this.convertToMonthlyReturns(data, ticker);
      
      // Cache in memory for 24 hours (historical data changes infrequently)
      await this.cache.set(ticker, startDate, endDate, timeSeries, 24 * 60 * 60 * 1000);
      
      // Also persist to database for long-term storage
      await dbCache.savePriceHistory(ticker, timeSeries, 'tiingo');
      
      return timeSeries;
    } catch (error) {
      console.error(`Error fetching Tiingo data for ${ticker}:`, error);
      throw error;
    }
  }

  /**
   * Convert Tiingo daily prices to monthly returns
   */
  private convertToMonthlyReturns(data: TiingoResponse, ticker: string): PriceTimeSeries {
    if (!data.results || data.results.length === 0) {
      throw new Error(`No price data returned for ${ticker}`);
    }

    // Group by month and take last price of each month
    const monthlyPrices = new Map<string, number>();
    const dates: Date[] = [];

    for (const price of data.results) {
      const date = new Date(price.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      // Use adjusted close price (dividend/split adjusted)
      monthlyPrices.set(monthKey, price.adjClose);
      
      // Track dates (only add first date of each month)
      if (!dates.length || dates[dates.length - 1].getMonth() !== date.getMonth()) {
        dates.push(date);
      }
    }

    // Convert to arrays sorted by date
    const sortedMonths = Array.from(monthlyPrices.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const prices = sortedMonths.map(([, price]) => price);
    
    // Calculate monthly returns
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const returnValue = (prices[i] - prices[i - 1]) / prices[i - 1];
      returns.push(returnValue);
    }

    // Adjust dates array to match returns (one less date)
    const returnDates = dates.slice(1);

    return {
      ticker,
      dates: returnDates,
      prices: prices.slice(1), // Prices aligned with returns
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
