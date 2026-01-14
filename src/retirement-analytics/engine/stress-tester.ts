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
  
  // OPTIMIZATION: Use quarterly rolling windows instead of monthly
  // Reduces sequence count from ~480 to ~120 for 10-year horizon
  const rollingWindowMonths = 3; // Quarterly instead of monthly
  
  // Generate rolling windows: each quarter as a potential start date
  for (let year = startYear; year <= endYear - snappedYears; year++) {
    for (let quarter = 0; quarter < 4; quarter++) {
      const month = quarter * 3;
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year + snappedYears, month, 1);
      
      // Skip if end date exceeds available data
      if (endDate > new Date()) continue;
      
      try {
        // OPTIMIZATION: Slice from pre-fetched full history instead of making new API calls
        const assetBasketReturns = sliceAssetBasketReturns(
          startDate,
          endDate,
          usEquity.data,
          intlEquity.data,
          bonds.data
        );
        
        const inflationRates = await fetchInflationRates(startDate, endDate, fredProvider);
        
        const sequenceId = `${year}-Q${quarter + 1}_to_${year + snappedYears}-Q${quarter + 1}`;
        
        sequences.push({
          startDate,
          endDate,
          sequenceId,
          assetBasketReturns,
          inflationRates
        });
      } catch (error) {
        console.warn(`Failed to generate sequence ${year}-Q${quarter + 1}:`, error);
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
  
  const expectedLength = referenceRange.endIdx - referenceRange.startIdx + 1;
  
  // GRACEFUL DEGRADATION: Validate date alignment only for available ranges
  // If a range is null, we'll use zero returns (handled below)
  if (usRange && intlRange && bondsRange) {
    // FIXED: Validate date alignment between assets before slicing
    // Extract the actual dates in each range to verify they match
    const usDates = usEquityFull.dates.slice(usRange.startIdx, usRange.endIdx + 1);
    const intlDates = intlEquityFull.dates.slice(intlRange.startIdx, intlRange.endIdx + 1);
    const bondsDates = bondsFull.dates.slice(bondsRange.startIdx, bondsRange.endIdx + 1);
    
    // Validate that all three assets have the same dates in the requested range
    // This ensures returns are aligned and prevents false zero returns from padding
    if (usDates.length !== intlDates.length || usDates.length !== bondsDates.length) {
      throw new Error(
        `Date misalignment detected in asset basket data for range ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}: ` +
        `VTI has ${usDates.length} data points, VXUS has ${intlDates.length}, AGG has ${bondsDates.length}. ` +
        `All assets must have the same dates in the requested range to ensure aligned returns.`
      );
    }
    
    // Validate that dates match exactly (not just count)
    // FIXED: Use UTC date normalization to avoid timezone-dependent comparisons
    // Comparing date strings (YYYY-MM-DD) is timezone-independent and more reliable
    for (let i = 0; i < usDates.length; i++) {
      const usDate = usDates[i];
      const intlDate = intlDates[i];
      const bondsDate = bondsDates[i];
      
      // Extract date strings (YYYY-MM-DD) for timezone-independent comparison
      // This compares the calendar date, ignoring time-of-day and timezone
      const usDateStr = `${usDate.getUTCFullYear()}-${String(usDate.getUTCMonth() + 1).padStart(2, '0')}-${String(usDate.getUTCDate()).padStart(2, '0')}`;
      const intlDateStr = `${intlDate.getUTCFullYear()}-${String(intlDate.getUTCMonth() + 1).padStart(2, '0')}-${String(intlDate.getUTCDate()).padStart(2, '0')}`;
      const bondsDateStr = `${bondsDate.getUTCFullYear()}-${String(bondsDate.getUTCMonth() + 1).padStart(2, '0')}-${String(bondsDate.getUTCDate()).padStart(2, '0')}`;
      
      if (usDateStr !== intlDateStr || usDateStr !== bondsDateStr) {
        throw new Error(
          `Date misalignment at index ${i} in asset basket data: ` +
          `VTI date=${usDateStr}, ` +
          `VXUS date=${intlDateStr}, ` +
          `AGG date=${bondsDateStr}. ` +
          `All assets must have identical dates at each index.`
        );
      }
    }
  }
  
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
