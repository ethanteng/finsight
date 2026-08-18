// Database-backed cache for price history and security metadata
// Provides persistence across server restarts and shared cache across instances

import { getPrismaClient } from '../../prisma-client';
import { PriceTimeSeries } from '../types';
import { SecurityMetadata } from '../types';

// Fund composition and classification data change much less often than prices,
// but they still need a bounded lifetime. Keeping the TTL here makes both the
// single-symbol and batch FMP paths obey the same cache contract.
export const SECURITY_METADATA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
      // FIXED: Query for one month before startDate to get reference point for first return calculation
      // This ensures we can calculate returns for all months in the requested range while matching
      // Tiingo format (all arrays same length after slicing)
      const queryStartDate = new Date(startDate);
      queryStartDate.setMonth(queryStartDate.getMonth() - 1);
      
      // First try: query with one month lookback to get reference point
      const records = await this.prisma.assetPriceHistory.findMany({
        where: {
          tickerSymbol: ticker,
          provider: provider,
          date: {
            gte: queryStartDate, // Include one month before for reference
            lte: endDate
          }
        },
        orderBy: {
          date: 'asc'
        }
      });

      // Filter to requested range (startDate to endDate) for the final output
      // The extra month before is only used for calculating the first return
      const requestedRecords = records.filter(r => r.date >= startDate && r.date <= endDate);
      
      if (requestedRecords.length > 0 && this.coversLatestCompleteMonth(requestedRecords, endDate)) {
        // Pass all records (including reference month) to conversion function
        // It will use the reference month to calculate first return, then slice to match Tiingo format
        return this.convertRecordsToTimeSeries(records, ticker, startDate, endDate, provider);
      }

      // Second try: check if we have broader range that covers the requested range
      // OPTIMIZATION: Limit lookback to 50 years to avoid fetching millions of records
      const maxLookbackYears = 50;
      const minLookbackDate = new Date(queryStartDate);
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
        
        // If we have data that covers the requested range (with reference month), use it
        if (earliestDate <= queryStartDate && this.coversLatestCompleteMonth(broaderRecords, endDate)) {
          const filteredRecords = broaderRecords.filter(r => r.date >= queryStartDate && r.date <= endDate);
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

  /** Historical monthly data is current through the last completed month. */
  private coversLatestCompleteMonth(records: Array<{ date: Date }>, endDate: Date): boolean {
    if (!records.length) return false;
    const requestedMonth = new Date(Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate(),
    ));
    const followingDay = new Date(requestedMonth);
    followingDay.setUTCDate(followingDay.getUTCDate() + 1);
    const endsAtMonthEnd = followingDay.getUTCMonth() !== requestedMonth.getUTCMonth();
    const now = new Date();
    const isCurrentMonth = requestedMonth.getUTCFullYear() === now.getUTCFullYear()
      && requestedMonth.getUTCMonth() === now.getUTCMonth();
    if (!endsAtMonthEnd || isCurrentMonth) requestedMonth.setUTCMonth(requestedMonth.getUTCMonth() - 1);

    const latest = records[records.length - 1].date;
    const latestKey = latest.getUTCFullYear() * 12 + latest.getUTCMonth();
    const requestedKey = requestedMonth.getUTCFullYear() * 12 + requestedMonth.getUTCMonth();
    return latestKey >= requestedKey;
  }

  /**
   * Convert database records to PriceTimeSeries format
   * FIXED: Now matches Tiingo provider format (all arrays same length) for compatibility with
   * sliceAssetBasketReturns and other code that expects this format.
   * 
   * The records parameter may include one month before startDate (reference point for first return).
   * We filter to the requested range, calculate returns, then slice to match Tiingo format where
   * all arrays have the same length. This ensures:
   * 1. No data loss - all months in requested range are included
   * 2. Format compatibility - matches Tiingo format expected by sliceAssetBasketReturns
   * 
   * Format: dates, prices, and returns all have length N-1 (after slicing)
   * - dates[i] = end date of period i (second month onwards in requested range)
   * - prices[i] = price at end of period i
   * - returns[i] = return from dates[i-1] to dates[i] (where dates[-1] is the reference month)
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

    // Filter records to requested range (startDate to endDate)
    // Records may include one month before startDate for reference, which we'll use but not include in output
    const requestedRecords = records.filter(r => r.date >= startDate && r.date <= endDate);
    
    if (requestedRecords.length === 0) {
      throw new Error('No records in requested date range');
    }

    // New cache rows persist the provider-calculated adjusted period return,
    // so they do not require a separate reference row.
    const hasStoredReturns = requestedRecords.every(record =>
      typeof record.periodReturn === 'number' && Number.isFinite(record.periodReturn)
    );
    if (hasStoredReturns) {
      return {
        ticker,
        dates: requestedRecords.map(record => record.date),
        prices: requestedRecords.map(record => record.adjustedClose || record.close),
        returns: requestedRecords.map(record => record.periodReturn),
        provider: provider as 'polygon' | 'tiingo',
      };
    }

    // Legacy rows need a reference month (one month before startDate) for calculating first return
    // This must be checked BEFORE minimum record validation, as a reference record allows
    // valid output with just 1 requested record (dates=[1], prices=[1], returns=[1] from reference)
    const referenceRecord = records.find(r => {
      const refDate = new Date(startDate);
      refDate.setMonth(refDate.getMonth() - 1);
      // Check if record date is in the same month as reference month
      return r.date.getFullYear() === refDate.getFullYear() && 
             r.date.getMonth() === refDate.getMonth();
    });

    // FIXED: Check minimum record count AFTER checking for reference record
    // With reference record: 1 requested record is valid (can calculate return from reference)
    // Without reference record: need at least 2 records (to calculate 1 return, then slice to match format)
    // - With 1 record + reference: dates=[1], prices=[1], returns=[1] ✅ (all length 1, valid)
    // - With 1 record + no reference: dates=[1], prices=[1], returns=[0], after slice: all empty ❌
    // - With 2 records + no reference: dates=[2], prices=[2], returns=[1], after slice: dates=[1], prices=[1], returns=[1] ✅
    if (!referenceRecord && requestedRecords.length < 2) {
      throw new Error(
        `Insufficient records for time series conversion: need at least 2 records in date range (or 1 record with reference month), ` +
        `got ${requestedRecords.length} record(s) without reference month. ` +
        `This violates Tiingo format contract which requires non-empty aligned arrays.`
      );
    }

    const dates: Date[] = [];
    const prices: number[] = [];
    const returns: number[] = [];

    // Build dates and prices arrays from requested records
    for (let i = 0; i < requestedRecords.length; i++) {
      const record = requestedRecords[i];
      dates.push(record.date);
      prices.push(record.adjustedClose || record.close);
    }

    // Calculate monthly returns
    // If we have a reference record, use it to calculate the first return
    // This ensures we can calculate returns for all months in the requested range
    if (referenceRecord && dates.length > 0) {
      // Use reference month to calculate first return (from reference month to first month in range)
      const refPrice = referenceRecord.adjustedClose || referenceRecord.close;
      if (refPrice > 0 && prices[0] > 0) {
        const firstReturn = (prices[0] - refPrice) / refPrice;
        returns.push(firstReturn);
      } else {
        returns.push(0);
      }
    }

    // Calculate remaining returns between consecutive dates in requested range
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) {
        const monthlyReturn = (prices[i] - prices[i - 1]) / prices[i - 1];
        returns.push(monthlyReturn);
      } else {
        returns.push(0);
      }
    }

    // FIXED: When we have a reference month, we can calculate returns for ALL dates in the requested range
    // Format: dates[i] and prices[i] correspond to returns[i], where returns[i] is the return TO dates[i]
    // - returns[0] = return from reference month TO dates[0] (first month in requested range)
    // - returns[1] = return from dates[0] TO dates[1] (second month)
    // - etc.
    // This preserves all requested months and matches Tiingo format (all arrays same length)
    if (referenceRecord && returns.length === dates.length) {
      // We have returns for all dates including first month - no slicing needed!
      // All arrays already have the same length, matching Tiingo format
      // This preserves the requested date range (no data loss)
      if (dates.length === 0 || prices.length === 0 || returns.length === 0) {
        throw new Error('Internal error: empty arrays despite validation');
      }
      
      return {
        ticker,
        dates, // All dates in requested range (preserved)
        prices, // All prices in requested range (preserved)
        returns, // Returns for all periods (same length as dates/prices)
        provider: provider as 'polygon' | 'tiingo'
      };
    } else {
      // No reference month - we're missing the first return
      // We must slice dates/prices to match returns length (Tiingo format requirement)
      // This causes data loss of the first month, but it's unavoidable without a reference
      if (returns.length === 0) {
        throw new Error(`Cannot produce valid time series: no returns calculated. Need at least 2 records or a reference month to calculate returns.`);
      }
      
      const slicedDates = dates.slice(1);
      const slicedPrices = prices.slice(1);
      
      // Final validation: ensure we have non-empty arrays
      if (slicedDates.length === 0 || slicedPrices.length === 0 || returns.length === 0) {
        throw new Error('Internal error: slicing resulted in empty arrays despite validation');
      }
      
      // Validate that sliced arrays match returns length
      if (slicedDates.length !== returns.length || slicedPrices.length !== returns.length) {
        throw new Error(`Internal error: array length mismatch after slicing. dates: ${slicedDates.length}, prices: ${slicedPrices.length}, returns: ${returns.length}`);
      }
      
      return {
        ticker,
        dates: slicedDates, // First month lost (unavoidable without reference)
        prices: slicedPrices, // First month lost (unavoidable without reference)
        returns, // Returns start from second month
        provider: provider as 'polygon' | 'tiingo'
      };
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
      // FIXED: Use batch operations with increased timeout to avoid transaction timeouts
      // For large datasets (50 years = ~600 records), individual upserts in a transaction can exceed 5s timeout
      // Solution: Use createMany with skipDuplicates, or batch upserts with increased timeout
      const batchSize = 100; // Process in batches to avoid memory issues
      const timeout = 30000; // 30 seconds timeout for large batches
      
      for (let i = 0; i < priceData.dates.length; i += batchSize) {
        const batch = priceData.dates.slice(i, Math.min(i + batchSize, priceData.dates.length));
        
        await this.prisma.$transaction(async (tx) => {
          // Use Promise.all for parallel upserts within batch
          await Promise.all(batch.map((date, batchIdx) => {
            const globalIdx = i + batchIdx;
            const price = priceData.prices[globalIdx];
            return tx.assetPriceHistory.upsert({
              where: {
                tickerSymbol_date_provider: {
                  tickerSymbol: ticker,
                  date: date,
                  provider: provider
                }
              },
              update: {
                open: price,
                high: price,
                low: price,
                close: price,
                adjustedClose: price,
                periodReturn: priceData.returns[globalIdx],
                volume: BigInt(0),
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
                periodReturn: priceData.returns[globalIdx],
                volume: BigInt(0),
                provider: provider,
                cachedAt: new Date()
              }
            });
          }));
        }, {
          timeout: timeout,
          maxWait: timeout
        });
      }
      
      console.log(`✅ Saved ${priceData.dates.length} price history records for ${ticker} to database`);
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

      if (record.lastUpdated.getTime() < Date.now() - SECURITY_METADATA_TTL_MS) {
        return null;
      }

      // Convert database record to SecurityMetadata format
      return {
        tickerSymbol: record.tickerSymbol,
        securityName: record.securityName,
        assetClass: record.assetClass || undefined,
        fundCategory: record.fundCategory || undefined,
        expenseRatio: record.expenseRatio ?? undefined,
        geographicFocus: record.geographicFocus || undefined,
        isETF: record.isETF,
        fundData: record.fundData
          ? record.fundData as unknown as SecurityMetadata['fundData']
          : undefined,
        metadataVersion: record.metadataVersion,
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
          expenseRatio: metadata.expenseRatio ?? null,
          geographicFocus: metadata.geographicFocus || null,
          isETF: metadata.isETF,
          fundData: metadata.fundData as any,
          metadataVersion: metadata.metadataVersion ?? 1,
          provider: provider,
          lastUpdated: new Date()
        },
        create: {
          tickerSymbol: ticker,
          securityName: metadata.securityName,
          assetClass: metadata.assetClass || null,
          fundCategory: metadata.fundCategory || null,
          expenseRatio: metadata.expenseRatio ?? null,
          geographicFocus: metadata.geographicFocus || null,
          isETF: metadata.isETF,
          fundData: metadata.fundData as any,
          metadataVersion: metadata.metadataVersion ?? 1,
          provider: provider,
          lastUpdated: new Date()
        }
      });
    } catch (error) {
      console.error(`Error saving security metadata to database for ${ticker}:`, error);
      // Don't throw - cache failures shouldn't break the analysis
    }
  }

  /**
   * Fetch security metadata for multiple tickers in a single query (avoids N+1 SELECTs).
   * Returns a Map keyed by ticker symbol.
   */
  async getSecurityMetadataBatch(tickers: string[]): Promise<Map<string, SecurityMetadata>> {
    const result = new Map<string, SecurityMetadata>();
    if (tickers.length === 0) return result;
    try {
      const records = await this.prisma.securityMetadata.findMany({
        where: {
          tickerSymbol: { in: tickers },
          lastUpdated: { gte: new Date(Date.now() - SECURITY_METADATA_TTL_MS) }
        }
      });
      for (const record of records) {
        result.set(record.tickerSymbol, {
          tickerSymbol: record.tickerSymbol,
          securityName: record.securityName,
          assetClass: record.assetClass || undefined,
          fundCategory: record.fundCategory || undefined,
          expenseRatio: record.expenseRatio ?? undefined,
          geographicFocus: record.geographicFocus || undefined,
          isETF: record.isETF,
          fundData: record.fundData
            ? record.fundData as unknown as SecurityMetadata['fundData']
            : undefined,
          metadataVersion: record.metadataVersion,
          provider: record.provider as 'fmp' | 'inferred',
          lastUpdated: record.lastUpdated
        });
      }
    } catch (error) {
      console.error('Error fetching security metadata batch from database:', error);
    }
    return result;
  }

  /**
   * Save security metadata for multiple tickers in a single transaction (avoids N+1 INSERTs).
   */
  async saveSecurityMetadataBatch(
    records: Array<{ ticker: string; metadata: SecurityMetadata; provider?: string }>
  ): Promise<void> {
    if (records.length === 0) return;
    try {
      const now = new Date();
      await this.prisma.$transaction(
        records.map(({ ticker, metadata, provider = 'fmp' }) =>
          this.prisma.securityMetadata.upsert({
            where: { tickerSymbol: ticker },
            update: {
              securityName: metadata.securityName,
              assetClass: metadata.assetClass || null,
              fundCategory: metadata.fundCategory || null,
              expenseRatio: metadata.expenseRatio ?? null,
              geographicFocus: metadata.geographicFocus || null,
              isETF: metadata.isETF,
              fundData: metadata.fundData as any,
              metadataVersion: metadata.metadataVersion ?? 1,
              provider,
              lastUpdated: now
            },
            create: {
              tickerSymbol: ticker,
              securityName: metadata.securityName,
              assetClass: metadata.assetClass || null,
              fundCategory: metadata.fundCategory || null,
              expenseRatio: metadata.expenseRatio ?? null,
              geographicFocus: metadata.geographicFocus || null,
              isETF: metadata.isETF,
              fundData: metadata.fundData as any,
              metadataVersion: metadata.metadataVersion ?? 1,
              provider,
              lastUpdated: now
            }
          })
        )
      );
    } catch (error) {
      console.error('Error saving security metadata batch to database:', error);
      // Don't throw - cache failures shouldn't break the analysis
    }
  }
}

export const dbCache = new DatabaseCache();
