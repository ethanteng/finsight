// Database-backed cache for price history and security metadata
// Provides persistence across server restarts and shared cache across instances

import { getPrismaClient } from '../../prisma-client';
import { PriceTimeSeries } from '../types';
import { SecurityMetadata } from '../types';

export class DatabaseCache {
  private prisma = getPrismaClient();

  /**
   * Get cached price history from database
   */
  async getPriceHistory(
    ticker: string,
    startDate: Date,
    endDate: Date,
    provider: string = 'tiingo'
  ): Promise<PriceTimeSeries | null> {
    try {
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

      if (records.length === 0) {
        return null;
      }

      // Convert database records to PriceTimeSeries format
      const dates: Date[] = [];
      const prices: number[] = [];
      const returns: number[] = [];

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        dates.push(record.date);
        prices.push(record.adjustedClose || record.close);
        
        // Calculate monthly return if we have previous price
        if (i > 0 && prices[i - 1] > 0) {
          const monthlyReturn = (prices[i] - prices[i - 1]) / prices[i - 1];
          returns.push(monthlyReturn);
        } else {
          returns.push(0);
        }
      }

      return {
        ticker,
        dates,
        prices,
        returns,
        provider: 'tiingo'
      };
    } catch (error) {
      console.error(`Error fetching price history from database for ${ticker}:`, error);
      return null;
    }
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
