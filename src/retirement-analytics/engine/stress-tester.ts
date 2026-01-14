// Stress Tester - Rolling Window Engine
// Phase 3: Rolling Window Engine

import { HistoricalSequence, TimelineBucket, PriceHistory, PriceTimeSeries } from '../types';
import { DataProviderFactory } from '../data/data-provider-factory';
import { FREDProvider } from '../../data/providers/fred';

// Asset basket proxies
const ASSET_BASKET = {
  usEquity: 'VTI',
  internationalEquity: 'VXUS',
  nominalBonds: 'AGG',
  cash: 'CASHX' // Will use treasury bill rate
};

// Fallback proxies for graceful degradation
const FALLBACK_PROXIES = {
  internationalEquity: ['VEU', 'EFA', 'IXUS'], // Alternative international ETFs
  usEquity: ['SPY', 'VOO'], // Alternative US equity ETFs
  nominalBonds: ['BND', 'TLT'] // Alternative bond ETFs
};

/**
 * Snap withdrawal years to nearest supported horizon bucket
 */
export function snapToHorizonBucket(withdrawalYears: number): TimelineBucket {
  const SUPPORTED_BUCKETS: TimelineBucket[] = ['10', '20', '30'];
  const snapped = SUPPORTED_BUCKETS.reduce((prev, curr) => 
    Math.abs(parseInt(curr) - withdrawalYears) < Math.abs(parseInt(prev) - withdrawalYears) ? curr : prev
  );
  return snapped;
}

/**
 * Generate rolling historical sequences for fixed horizon buckets
 * OPTIMIZED: Fetches full history once per ticker, then slices in memory
 * Uses quarterly rolling windows instead of monthly to reduce sequence count
 * GRACEFUL DEGRADATION: Continues with partial data if some asset baskets fail
 */
export async function generateRollingSequences(
  withdrawalYears: number,
  dataProviderFactory: DataProviderFactory,
  fredProvider: FREDProvider,
  minHistoryYears: number = 50
): Promise<{ sequences: HistoricalSequence[]; missingData: string[] }> {
  // Snap to supported bucket
  const snappedYears = parseInt(snapToHorizonBucket(withdrawalYears));
  const sequences: HistoricalSequence[] = [];
  
  const startYear = new Date().getFullYear() - minHistoryYears;
  const endYear = new Date().getFullYear();
  const fullStartDate = new Date(startYear, 0, 1);
  const fullEndDate = new Date();
  
  console.log(`📊 Generating rolling sequences: ${snappedYears}-year horizon, ${minHistoryYears} years of history`);
  console.log(`📅 Fetching full historical data once for date range: ${fullStartDate.toISOString().split('T')[0]} to ${fullEndDate.toISOString().split('T')[0]}`);
  
  // GRACEFUL DEGRADATION: Try primary proxies first, then fallbacks, then use zero returns
  const missingData: string[] = [];
  
  // Helper function to try primary and fallback proxies
  const fetchWithFallback = async (
    primaryTicker: string,
    fallbackTickers: string[],
    assetName: string
  ): Promise<PriceHistory | null> => {
    // Try primary ticker first
    try {
      const data = await dataProviderFactory.getPriceHistory(primaryTicker, fullStartDate, fullEndDate);
      console.log(`✅ Successfully fetched ${assetName} data from ${primaryTicker}`);
      return data;
    } catch (err) {
      console.warn(`⚠️ Failed to fetch ${assetName} from ${primaryTicker}, trying fallbacks...`);
      
      // Try fallback tickers
      for (const fallbackTicker of fallbackTickers) {
        try {
          const data = await dataProviderFactory.getPriceHistory(fallbackTicker, fullStartDate, fullEndDate);
          console.log(`✅ Successfully fetched ${assetName} data from fallback ${fallbackTicker}`);
          missingData.push(`${assetName} (using fallback ${fallbackTicker} instead of ${primaryTicker})`);
          return data;
        } catch (fallbackErr) {
          console.warn(`⚠️ Fallback ${fallbackTicker} also failed for ${assetName}`);
          continue;
        }
      }
      
      // All attempts failed
      console.error(`❌ All attempts failed for ${assetName} (primary: ${primaryTicker}, fallbacks: ${fallbackTickers.join(', ')})`);
      missingData.push(`${assetName} (all proxies failed, using zero returns)`);
      return null;
    }
  };
  
  // Fetch asset basket data with fallbacks
  const [usEquityFull, intlEquityFull, bondsFull] = await Promise.all([
    fetchWithFallback(ASSET_BASKET.usEquity, FALLBACK_PROXIES.usEquity, 'US Equity'),
    fetchWithFallback(ASSET_BASKET.internationalEquity, FALLBACK_PROXIES.internationalEquity, 'International Equity'),
    fetchWithFallback(ASSET_BASKET.nominalBonds, FALLBACK_PROXIES.nominalBonds, 'Bonds')
  ]);
  
  // GRACEFUL DEGRADATION: Use zero returns for missing asset classes
  // This allows analysis to continue with partial data (conservative approach)
  const createZeroReturns = (referenceData: PriceHistory | null): PriceTimeSeries => {
    if (referenceData) {
      // Use same date structure as reference data
      return {
        ticker: 'ZERO',
        dates: referenceData.data.dates,
        prices: referenceData.data.prices.map(() => 1), // Constant price
        returns: new Array(referenceData.data.returns.length).fill(0), // Zero returns
        provider: 'tiingo'
      };
    }
    // If no reference, create minimal structure (will be handled by date alignment)
    return {
      ticker: 'ZERO',
      dates: [],
      prices: [],
      returns: [],
      provider: 'tiingo'
    };
  };
  
  // Determine reference data for date alignment (use first available)
  const referenceData = usEquityFull || intlEquityFull || bondsFull;
  if (!referenceData) {
    // All asset baskets failed - cannot proceed
    throw new Error('Failed to fetch any asset basket data. Cannot generate stress test sequences without at least one asset class.');
  }
  
  // Use actual data or zero returns for each asset class
  const usEquity = usEquityFull || { data: createZeroReturns(referenceData) };
  const intlEquity = intlEquityFull || { data: createZeroReturns(referenceData) };
  const bonds = bondsFull || { data: createZeroReturns(referenceData) };
  
  // Log what we're using
  const usEquityTicker = usEquityFull ? ASSET_BASKET.usEquity : 'ZERO (fallback)';
  const intlEquityTicker = intlEquityFull ? ASSET_BASKET.internationalEquity : 'ZERO (fallback)';
  const bondsTicker = bondsFull ? ASSET_BASKET.nominalBonds : 'ZERO (fallback)';
  
  console.log(`✅ Asset basket data: ${usEquityTicker} (${usEquity.data.dates.length} months), ${intlEquityTicker} (${intlEquity.data.dates.length} months), ${bondsTicker} (${bonds.data.dates.length} months)`);
  
  if (missingData.length > 0) {
    console.warn(`⚠️ Graceful degradation active. Missing data: ${missingData.join('; ')}`);
  }
  
  // FIXED: Find the earliest date when all asset baskets have data (intersection start)
  // This ensures we only generate sequences where all ETFs have data
  let earliestCommonDate: Date | null = null;
  if (usEquityFull && intlEquityFull && bondsFull) {
    const usFirstDate = usEquityFull.data.dates[0];
    const intlFirstDate = intlEquityFull.data.dates[0];
    const bondsFirstDate = bondsFull.data.dates[0];
    // Latest start date = when all three have data
    earliestCommonDate = new Date(Math.max(usFirstDate.getTime(), intlFirstDate.getTime(), bondsFirstDate.getTime()));
    console.log(`📅 Earliest common date for all asset baskets: ${earliestCommonDate.toISOString().split('T')[0]}`);
  }
  
  // OPTIMIZATION: Use quarterly rolling windows instead of monthly
  // Reduces sequence count from ~480 to ~120 for 10-year horizon
  const rollingWindowMonths = 3; // Quarterly instead of monthly
  
  // Generate rolling windows: each quarter as a potential start date
  // FIXED: Start from the earliest common date if available, otherwise use startYear
  const effectiveStartYear = earliestCommonDate ? earliestCommonDate.getFullYear() : startYear;
  const effectiveStartMonth = earliestCommonDate ? earliestCommonDate.getMonth() : 0;
  // Start from the quarter containing the earliest common date
  const effectiveStartQuarter = earliestCommonDate ? Math.floor(effectiveStartMonth / 3) : 0;
  
  // FIXED: For partial sequences, we need to iterate through all years up to current year
  // The old condition `year <= endYear - snappedYears` would skip all sequences when horizon > available years
  // Instead, iterate up to current year, allowing partial sequences
  const currentYear = new Date().getFullYear();
  const maxStartYear = Math.min(endYear, currentYear); // Don't start sequences in the future
  
  console.log(`📊 Generating sequences from ${effectiveStartYear}-Q${effectiveStartQuarter + 1} onwards (ensuring all ETFs have data)`);
  console.log(`📊 Max start year: ${maxStartYear}, Horizon: ${snappedYears} years, Current year: ${currentYear}`);
  
  for (let year = effectiveStartYear; year <= maxStartYear; year++) {
    // Start from effectiveStartQuarter if this is the first year, otherwise start from Q1
    const startQuarter = (year === effectiveStartYear) ? effectiveStartQuarter : 0;
    for (let quarter = startQuarter; quarter < 4; quarter++) {
      const month = quarter * 3;
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year + snappedYears, month, 1);
      
      // FIXED: For sequences that extend into the future, use current date as end date
      // This allows us to generate sequences even if they haven't completed yet
      // We'll use available historical data up to today
      const effectiveEndDate = endDate > new Date() ? new Date() : endDate;
      
      // Skip if start date is in the future or if we don't have enough data
      if (startDate > new Date()) continue;
      
      // Skip if the effective range is too short (less than 1 year)
      const rangeYears = (effectiveEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
      if (rangeYears < 1) {
        console.log(`⏭️ Skipping sequence ${year}-Q${quarter + 1}: range too short (${rangeYears.toFixed(1)} years)`);
        continue;
      }
      
      try {
        // OPTIMIZATION: Slice from pre-fetched full history instead of making new API calls
        const assetBasketReturns = sliceAssetBasketReturns(
          startDate,
          effectiveEndDate,
          usEquity.data,
          intlEquity.data,
          bonds.data
        );
        
        // Validate that we got valid returns (non-empty arrays)
        if (!assetBasketReturns.usEquity || assetBasketReturns.usEquity.length === 0) {
          console.warn(`⏭️ Skipping sequence ${year}-Q${quarter + 1}: empty asset basket returns`);
          continue;
        }
        
        const inflationRates = await fetchInflationRates(startDate, effectiveEndDate, fredProvider);
        
        const sequenceId = `${year}-Q${quarter + 1}_to_${effectiveEndDate.getFullYear()}-Q${Math.floor(effectiveEndDate.getMonth() / 3) + 1}`;
        
        sequences.push({
          startDate,
          endDate: effectiveEndDate,
          sequenceId,
          assetBasketReturns,
          inflationRates
        });
        
        console.log(`✅ Generated sequence ${sequenceId} (${assetBasketReturns.usEquity.length} months)`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`❌ Failed to generate sequence ${year}-Q${quarter + 1}: ${errorMsg}`);
        // Skip sequences with insufficient data
        continue;
      }
    }
  }
  
  console.log(`✅ Generated ${sequences.length} rolling sequences (quarterly windows)`);
  
  return { sequences, missingData };
}

/**
 * Slice asset basket returns from pre-fetched full history
 * OPTIMIZATION: Avoids redundant API calls by slicing in memory
 */
function sliceAssetBasketReturns(
  startDate: Date,
  endDate: Date,
  usEquityFull: { dates: Date[]; returns: number[] },
  intlEquityFull: { dates: Date[]; returns: number[] },
  bondsFull: { dates: Date[]; returns: number[] }
): {
  usEquity: number[];
  internationalEquity: number[];
  nominalBonds: number[];
  cash: number[];
} {
  // Find indices for date range in each time series
  // Returns null if the requested range is not available in the data
  const findDateRange = (dates: Date[], start: Date, end: Date): { startIdx: number; endIdx: number } | null => {
    if (dates.length === 0) {
      return null;
    }
    
    let startIdx: number | null = null;
    let endIdx: number | null = null;
    
    for (let i = 0; i < dates.length; i++) {
      // Find first date >= start (only set once)
      if (startIdx === null && dates[i] >= start) {
        startIdx = i;
      }
      // Update endIdx to last date <= end
      if (dates[i] <= end) {
        endIdx = i;
      }
    }
    
    // Validate that we found both start and end dates
    // If either is missing, the requested range is not available
    if (startIdx === null || endIdx === null) {
      return null;
    }
    
    // Validate that startIdx <= endIdx (range is valid)
    if (startIdx > endIdx) {
      return null;
    }
    
    return { startIdx, endIdx };
  };
  
  const usRange = findDateRange(usEquityFull.dates, startDate, endDate);
  const intlRange = findDateRange(intlEquityFull.dates, startDate, endDate);
  const bondsRange = findDateRange(bondsFull.dates, startDate, endDate);
  
  // GRACEFUL DEGRADATION: If a range is missing, use zero returns for that asset class
  // Use the first available range as reference for length
  const referenceRange = usRange || intlRange || bondsRange;
  if (!referenceRange) {
    throw new Error(`Date range ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} not available in any asset basket data`);
  }
  
  // FIXED: Handle different ETF inception dates by finding the intersection of available dates
  // ETFs have different start dates (VTI: 2001, VXUS: 2011, AGG: 2003), so we need to find
  // the common date range where all assets have data, then align to that intersection
  if (usRange && intlRange && bondsRange) {
    // Find the latest start date (when all three assets have data)
    const usStartDate = usEquityFull.dates[usRange.startIdx];
    const intlStartDate = intlEquityFull.dates[intlRange.startIdx];
    const bondsStartDate = bondsFull.dates[bondsRange.startIdx];
    const alignedStartDate = new Date(Math.max(usStartDate.getTime(), intlStartDate.getTime(), bondsStartDate.getTime()));
    
    // Find the earliest end date (when all three assets still have data)
    const usEndDate = usEquityFull.dates[usRange.endIdx];
    const intlEndDate = intlEquityFull.dates[intlRange.endIdx];
    const bondsEndDate = bondsFull.dates[bondsRange.endIdx];
    const alignedEndDate = new Date(Math.min(usEndDate.getTime(), intlEndDate.getTime(), bondsEndDate.getTime()));
    
    // If the aligned range is invalid (start >= end) or too short, skip this sequence
    if (alignedStartDate >= alignedEndDate) {
      throw new Error(
        `No overlapping date range available for ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}. ` +
        `VTI starts ${usStartDate.toISOString().split('T')[0]}, VXUS starts ${intlStartDate.toISOString().split('T')[0]}, AGG starts ${bondsStartDate.toISOString().split('T')[0]}.`
      );
    }
    
    // Re-find ranges using the aligned dates (intersection)
    const alignedUsRange = findDateRange(usEquityFull.dates, alignedStartDate, alignedEndDate);
    const alignedIntlRange = findDateRange(intlEquityFull.dates, alignedStartDate, alignedEndDate);
    const alignedBondsRange = findDateRange(bondsFull.dates, alignedStartDate, alignedEndDate);
    
    if (!alignedUsRange || !alignedIntlRange || !alignedBondsRange) {
      throw new Error(`Failed to find aligned date ranges after intersection calculation`);
    }
    
    // Extract dates from aligned ranges
    const usDates = usEquityFull.dates.slice(alignedUsRange.startIdx, alignedUsRange.endIdx + 1);
    const intlDates = intlEquityFull.dates.slice(alignedIntlRange.startIdx, alignedIntlRange.endIdx + 1);
    const bondsDates = bondsFull.dates.slice(alignedBondsRange.startIdx, alignedBondsRange.endIdx + 1);
    
    // Validate lengths match (they should, since we're using the intersection)
    if (usDates.length !== intlDates.length || usDates.length !== bondsDates.length) {
      throw new Error(
        `Date misalignment after intersection: VTI has ${usDates.length} data points, VXUS has ${intlDates.length}, AGG has ${bondsDates.length}`
      );
    }
    
    // Validate dates match exactly at each index
    for (let i = 0; i < usDates.length; i++) {
      const usDateStr = `${usDates[i].getUTCFullYear()}-${String(usDates[i].getUTCMonth() + 1).padStart(2, '0')}-${String(usDates[i].getUTCDate()).padStart(2, '0')}`;
      const intlDateStr = `${intlDates[i].getUTCFullYear()}-${String(intlDates[i].getUTCMonth() + 1).padStart(2, '0')}-${String(intlDates[i].getUTCDate()).padStart(2, '0')}`;
      const bondsDateStr = `${bondsDates[i].getUTCFullYear()}-${String(bondsDates[i].getUTCMonth() + 1).padStart(2, '0')}-${String(bondsDates[i].getUTCDate()).padStart(2, '0')}`;
      
      if (usDateStr !== intlDateStr || usDateStr !== bondsDateStr) {
        throw new Error(
          `Date misalignment at index ${i}: VTI=${usDateStr}, VXUS=${intlDateStr}, AGG=${bondsDateStr}`
        );
      }
    }
    
    // Slice returns using aligned ranges
    const usEquity = usEquityFull.returns.slice(alignedUsRange.startIdx, alignedUsRange.endIdx + 1);
    const internationalEquity = intlEquityFull.returns.slice(alignedIntlRange.startIdx, alignedIntlRange.endIdx + 1);
    const nominalBonds = bondsFull.returns.slice(alignedBondsRange.startIdx, alignedBondsRange.endIdx + 1);
    
    // Validate lengths match
    if (usEquity.length !== internationalEquity.length || usEquity.length !== nominalBonds.length) {
      throw new Error(
        `Returns array length mismatch: VTI=${usEquity.length}, VXUS=${internationalEquity.length}, AGG=${nominalBonds.length}`
      );
    }
    
    // Cash returns are near-zero (treasury bill rate, approximated as 0 for simplicity)
    const cash = new Array(usEquity.length).fill(0);
    
    return {
      usEquity,
      internationalEquity,
      nominalBonds,
      cash
    };
  }
  
  // Fallback: If not all ranges are available, use graceful degradation
  const expectedLength = referenceRange.endIdx - referenceRange.startIdx + 1;
  
  // Slice returns arrays for the date range
  // IMPORTANT: Returns are calculated between dates, so if we have dates[startIdx:endIdx] (inclusive),
  // we need returns[startIdx:endIdx] (inclusive) to cover all returns between those dates
  // Since JavaScript's slice() uses exclusive end indices, we use endIdx + 1
  // Example: dates[1:3] (inclusive) = [d1, d2, d3] needs returns[1:3] (inclusive) = [r1, r2, r3]
  // where r1 = return from d0 to d1, r2 = return from d1 to d2, r3 = return from d2 to d3
  // GRACEFUL DEGRADATION: Use zero returns if range is missing
  const usEquity = usRange 
    ? usEquityFull.returns.slice(usRange.startIdx, usRange.endIdx + 1)
    : new Array(expectedLength).fill(0);
  const internationalEquity = intlRange
    ? intlEquityFull.returns.slice(intlRange.startIdx, intlRange.endIdx + 1)
    : new Array(expectedLength).fill(0);
  const nominalBonds = bondsRange
    ? bondsFull.returns.slice(bondsRange.startIdx, bondsRange.endIdx + 1)
    : new Array(expectedLength).fill(0);
  
  // FIXED: Validate that sliced returns arrays have the same length (should be guaranteed by date alignment)
  // This is a final safety check - if lengths differ, something is wrong with the data structure
  if (usEquity.length !== internationalEquity.length || usEquity.length !== nominalBonds.length) {
    throw new Error(
      `Returns array length mismatch after slicing: ` +
      `VTI returns=${usEquity.length}, VXUS returns=${internationalEquity.length}, AGG returns=${nominalBonds.length}. ` +
      `This indicates a data structure issue despite date alignment validation.`
    );
  }
  
  // Cash returns are near-zero (treasury bill rate, approximated as 0 for simplicity)
  const length = usEquity.length; // All arrays have same length (validated above)
  const cash = new Array(length).fill(0);
  
  // All arrays are guaranteed to have the same length (no padding needed)
  return {
    usEquity,
    internationalEquity,
    nominalBonds,
    cash
  };
}

/**
 * Fetch inflation rates (monthly) for a date range from FRED
 */
async function fetchInflationRates(
  startDate: Date,
  endDate: Date,
  fredProvider: FREDProvider
): Promise<number[]> {
  // FRED CPIAUCSL is monthly data
  // We need to fetch historical CPI values and calculate month-over-month inflation
  
  // For now, use a simplified approach: fetch CPI data points
  // In production, would need to fetch full historical series and calculate MoM inflation
  
  // Mock implementation for Phase 3 - will be enhanced with full FRED series fetch
  const months = calculateMonthsBetween(startDate, endDate);
  const inflationRates: number[] = [];
  
  // Generate mock monthly inflation rates (average ~0.2% per month = ~2.4% annually)
  // In production, fetch actual CPI data and calculate: (CPI[t] - CPI[t-1]) / CPI[t-1]
  for (let i = 0; i < months; i++) {
    // Mock: random inflation between 0.1% and 0.3% per month
    inflationRates.push((Math.random() * 0.002 + 0.001)); // 0.1% to 0.3%
  }
  
  return inflationRates;
}

/**
 * Helper: Calculate number of months between two dates
 */
function calculateMonthsBetween(startDate: Date, endDate: Date): number {
  const years = endDate.getFullYear() - startDate.getFullYear();
  const months = endDate.getMonth() - startDate.getMonth();
  return years * 12 + months;
}

/**
 * Helper: Pad array to target length
 */
function padArray<T>(arr: T[], targetLength: number, padValue: T): T[] {
  if (arr.length >= targetLength) {
    return arr.slice(0, targetLength);
  }
  return [...arr, ...new Array(targetLength - arr.length).fill(padValue)];
}
