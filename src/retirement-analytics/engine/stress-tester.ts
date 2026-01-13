// Stress Tester - Rolling Window Engine
// Phase 3: Rolling Window Engine

import { HistoricalSequence, TimelineBucket } from '../types';
import { DataProviderFactory } from '../data/data-provider-factory';
import { FREDProvider } from '../../data/providers/fred';

// Asset basket proxies
const ASSET_BASKET = {
  usEquity: 'VTI',
  internationalEquity: 'VXUS',
  nominalBonds: 'AGG',
  cash: 'CASHX' // Will use treasury bill rate
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
 */
export async function generateRollingSequences(
  withdrawalYears: number,
  dataProviderFactory: DataProviderFactory,
  fredProvider: FREDProvider,
  minHistoryYears: number = 50
): Promise<HistoricalSequence[]> {
  // Snap to supported bucket
  const snappedYears = parseInt(snapToHorizonBucket(withdrawalYears));
  const sequences: HistoricalSequence[] = [];
  
  const startYear = new Date().getFullYear() - minHistoryYears;
  const endYear = new Date().getFullYear();
  const fullStartDate = new Date(startYear, 0, 1);
  const fullEndDate = new Date();
  
  console.log(`📊 Generating rolling sequences: ${snappedYears}-year horizon, ${minHistoryYears} years of history`);
  console.log(`📅 Fetching full historical data once for date range: ${fullStartDate.toISOString().split('T')[0]} to ${fullEndDate.toISOString().split('T')[0]}`);
  
  // OPTIMIZATION: Fetch full historical data once per ticker upfront
  // This reduces API calls from hundreds to just 3 (one per asset basket)
  const [usEquityFull, intlEquityFull, bondsFull] = await Promise.all([
    dataProviderFactory.getPriceHistory(ASSET_BASKET.usEquity, fullStartDate, fullEndDate).catch((err) => {
      console.error(`Failed to fetch ${ASSET_BASKET.usEquity}:`, err);
      return null;
    }),
    dataProviderFactory.getPriceHistory(ASSET_BASKET.internationalEquity, fullStartDate, fullEndDate).catch((err) => {
      console.error(`Failed to fetch ${ASSET_BASKET.internationalEquity}:`, err);
      return null;
    }),
    dataProviderFactory.getPriceHistory(ASSET_BASKET.nominalBonds, fullStartDate, fullEndDate).catch((err) => {
      console.error(`Failed to fetch ${ASSET_BASKET.nominalBonds}:`, err);
      return null;
    })
  ]);
  
  if (!usEquityFull || !intlEquityFull || !bondsFull) {
    throw new Error('Failed to fetch required asset basket data');
  }
  
  console.log(`✅ Fetched full history: VTI (${usEquityFull.data.dates.length} months), VXUS (${intlEquityFull.data.dates.length} months), AGG (${bondsFull.data.dates.length} months)`);
  
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
          usEquityFull.data,
          intlEquityFull.data,
          bondsFull.data
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
  
  return sequences;
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
  
  // Validate that all ranges are available
  if (!usRange || !intlRange || !bondsRange) {
    throw new Error(`Date range ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} not available in asset basket data`);
  }
  
  // Slice returns arrays for the date range
  // IMPORTANT: Returns are calculated between dates, so if we have dates[startIdx:endIdx+1],
  // we need returns[startIdx:endIdx] (one fewer return than dates)
  // Example: dates[1:4] = [d1, d2, d3] (3 dates) needs returns[1:3] = [r1, r2] (2 returns between the 3 dates)
  const usEquity = usEquityFull.returns.slice(usRange.startIdx, usRange.endIdx);
  const internationalEquity = intlEquityFull.returns.slice(intlRange.startIdx, intlRange.endIdx);
  const nominalBonds = bondsFull.returns.slice(bondsRange.startIdx, bondsRange.endIdx);
  
  // Cash returns are near-zero (treasury bill rate, approximated as 0 for simplicity)
  const maxLength = Math.max(usEquity.length, internationalEquity.length, nominalBonds.length);
  const cash = new Array(maxLength).fill(0);
  
  // Ensure all arrays have same length (pad with zeros if needed)
  return {
    usEquity: padArray(usEquity, maxLength, 0),
    internationalEquity: padArray(internationalEquity, maxLength, 0),
    nominalBonds: padArray(nominalBonds, maxLength, 0),
    cash: padArray(cash, maxLength, 0)
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
