// Database-backed cache for price history and security metadata
// Provides persistence across server restarts and shared cache across instances

import { getPrismaClient } from '../../prisma-client';
import { PriceTimeSeries } from '../types';
import { SecurityMetadata } from '../types';

export class DatabaseCache {
  private prisma = getPrismaClient();

  /**
   * Get cached price history from database
   * OPTIMIZATION: If exact range not found, check if we have a broader range and slice from it
   */
  async getPriceHistory(
    ticker: string,
    startDate: Date,
    endDate: Date,
    provider: string = 'tiingo'
  ): Promise<PriceTimeSeries | null> {
    try {
      // First try: exact date range match
      const records = await this.prisma.assetPriceHistory.findMany({
        where: {
          tickerSymbol: ticker,
          provider: provider,
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: {
          date: 'asc'
        }
      });

      // If we have records within the requested range, return them
      // The query filters to date >= startDate AND date <= endDate,
      // so any records returned are within the requested range
      if (records.length > 0) {
        return this.convertRecordsToTimeSeries(records, ticker, startDate, endDate, provider);
      }

      // Second try: check if we have broader range that covers the requested range
      // OPTIMIZATION: Limit lookback to 50 years to avoid fetching millions of records
      const maxLookbackYears = 50;
      const minLookbackDate = new Date(startDate);
      minLookbackDate.setFullYear(minLookbackDate.getFullYear() - maxLookbackYears);
      
      const broaderRecords = await this.prisma.assetPriceHistory.findMany({
        where: {
          tickerSymbol: ticker,
          provider: provider,
          date: {
            gte: minLookbackDate, // Limit lookback to 50 years
            lte: endDate
          }
        },
        orderBy: {
          date: 'asc'
        }
      });

      if (broaderRecords.length > 0) {
        const earliestDate = broaderRecords[0].date;
        const latestDate = broaderRecords[broaderRecords.length - 1].date;
        
        // If we have data that covers the requested range, slice it
        if (earliestDate <= startDate && latestDate >= endDate) {
          const filteredRecords = broaderRecords.filter(r => r.date >= startDate && r.date <= endDate);
          if (filteredRecords.length > 0) {
            return this.convertRecordsToTimeSeries(filteredRecords, ticker, startDate, endDate, provider);
          }
        }
      }

      return null;
    } catch (error) {
      console.error(`Error fetching price history from database for ${ticker}:`, error);
      return null;
    }
  }

  /**
   * Convert database records to PriceTimeSeries format
   * Matches Tiingo provider format: N-1 elements for dates, prices, and returns
   * (returns are calculated between dates, so there's one fewer return than dates)
   */
  private convertRecordsToTimeSeries(
    records: any[],
    ticker: string,
    startDate: Date,
    endDate: Date,
    provider: string = 'tiingo'
  ): PriceTimeSeries {
    if (records.length === 0) {
      throw new Error('Cannot convert empty records to PriceTimeSeries');
    }

    const dates: Date[] = [];
    const prices: number[] = [];
    const returns: number[] = [];

    // Build dates and prices arrays (one per record)
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      dates.push(record.date);
      prices.push(record.adjustedClose || record.close);
    }

    // Calculate monthly returns (one fewer than dates/prices)
    // This matches Tiingo provider format where returns are between dates
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) {
        const monthlyReturn = (prices[i] - prices[i - 1]) / prices[i - 1];
        returns.push(monthlyReturn);
      } else {
        returns.push(0);
      }
    }

    // Align dates and prices with returns (remove first element to match returns length)
    // This matches Tiingo provider: dates.slice(1), prices.slice(1), returns
    return {
      ticker,
      dates: dates.slice(1), // Remove first date to align with returns
      prices: prices.slice(1), // Remove first price to align with returns
      returns,
      provider: provider as 'polygon' | 'tiingo' | 'alpha_vantage'
    };
  }

  /**
   * Save price history to database
   */
  async savePriceHistory(
    ticker: string,
    priceData: PriceTimeSeries,
    provider: string = 'tiingo'
  ): Promise<void> {
    try {
      // Use transaction to ensure atomicity
      await this.prisma.$transaction(async (tx) => {
        for (let i = 0; i < priceData.dates.length; i++) {
          const date = priceData.dates[i];
          const price = priceData.prices[i];
          await tx.assetPriceHistory.upsert({
            where: {
              tickerSymbol_date_provider: {
                tickerSymbol: ticker,
                date: date,
                provider: provider
              }
            },
            update: {
              open: price, // Use price as open/high/low/close if we don't have separate values
              high: price,
              low: price,
              close: price,
              adjustedClose: price,
              volume: BigInt(0), // Volume not available in PriceTimeSeries
              cachedAt: new Date()
            },
            create: {
              tickerSymbol: ticker,
              date: date,
              open: price,
              high: price,
              low: price,
              close: price,
              adjustedClose: price,
              volume: BigInt(0),
              provider: provider,
              cachedAt: new Date()
            }
          });
        }
      });
    } catch (error) {
      console.error(`Error saving price history to database for ${ticker}:`, error);
      // Don't throw - cache failures shouldn't break the analysis
    }
  }

  /**
   * Get cached security metadata from database
   */
  async getSecurityMetadata(ticker: string): Promise<SecurityMetadata | null> {
    try {
      const record = await this.prisma.securityMetadata.findUnique({
        where: {
          tickerSymbol: ticker
        }
      });

      if (!record) {
        return null;
      }

      // Convert database record to SecurityMetadata format
      return {
        tickerSymbol: record.tickerSymbol,
        securityName: record.securityName,
        assetClass: record.assetClass || undefined,
        fundCategory: record.fundCategory || undefined,
        expenseRatio: record.expenseRatio || undefined,
        geographicFocus: record.geographicFocus || undefined,
        isETF: record.isETF,
        provider: record.provider as 'fmp' | 'inferred',
        lastUpdated: record.lastUpdated
      };
    } catch (error) {
      console.error(`Error fetching security metadata from database for ${ticker}:`, error);
      return null;
    }
  }

  /**
   * Save security metadata to database
   */
  async saveSecurityMetadata(
    ticker: string,
    metadata: SecurityMetadata,
    provider: string = 'fmp'
  ): Promise<void> {
    try {
      await this.prisma.securityMetadata.upsert({
        where: {
          tickerSymbol: ticker
        },
        update: {
          securityName: metadata.securityName,
          assetClass: metadata.assetClass || null,
          fundCategory: metadata.fundCategory || null,
          expenseRatio: metadata.expenseRatio || null,
          geographicFocus: metadata.geographicFocus || null,
          isETF: metadata.isETF,
          provider: provider,
          lastUpdated: new Date()
        },
        create: {
          tickerSymbol: ticker,
          securityName: metadata.securityName,
          assetClass: metadata.assetClass || null,
          fundCategory: metadata.fundCategory || null,
          expenseRatio: metadata.expenseRatio || null,
          geographicFocus: metadata.geographicFocus || null,
          isETF: metadata.isETF,
          provider: provider,
          lastUpdated: new Date()
        }
      });
    } catch (error) {
      console.error(`Error saving security metadata to database for ${ticker}:`, error);
      // Don't throw - cache failures shouldn't break the analysis
    }
  }
}

export const dbCache = new DatabaseCache();
