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
  
  // Generate rolling windows: each month as a potential start date
  for (let year = startYear; year <= endYear - snappedYears; year++) {
    for (let month = 0; month < 12; month++) {
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year + snappedYears, month, 1);
      
      // Skip if end date exceeds available data
      if (endDate > new Date()) continue;
      
      try {
        // Fetch asset basket returns and inflation for this window
        const [assetBasketReturns, inflationRates] = await Promise.all([
          fetchAssetBasketReturns(startDate, endDate, dataProviderFactory),
          fetchInflationRates(startDate, endDate, fredProvider)
        ]);
        
        const sequenceId = `${year}-${String(month + 1).padStart(2, '0')}_to_${year + snappedYears}-${String(month + 1).padStart(2, '0')}`;
        
        sequences.push({
          startDate,
          endDate,
          sequenceId,
          assetBasketReturns,
          inflationRates
        });
      } catch (error) {
        console.warn(`Failed to generate sequence ${year}-${month + 1}:`, error);
        // Skip sequences with insufficient data
        continue;
      }
    }
  }
  
  return sequences;
}

/**
 * Fetch asset basket returns for a date range
 */
async function fetchAssetBasketReturns(
  startDate: Date,
  endDate: Date,
  dataProviderFactory: DataProviderFactory
): Promise<{
  usEquity: number[];
  internationalEquity: number[];
  nominalBonds: number[];
  cash: number[];
}> {
  // Fetch returns for each asset class proxy
  const [usEquityData, intlEquityData, bondsData] = await Promise.all([
    dataProviderFactory.getPriceHistory(ASSET_BASKET.usEquity, startDate, endDate).catch(() => null),
    dataProviderFactory.getPriceHistory(ASSET_BASKET.internationalEquity, startDate, endDate).catch(() => null),
    dataProviderFactory.getPriceHistory(ASSET_BASKET.nominalBonds, startDate, endDate).catch(() => null)
  ]);

  // Extract monthly returns from time series
  const usEquity = usEquityData?.data.returns || [];
  const internationalEquity = intlEquityData?.data.returns || [];
  const nominalBonds = bondsData?.data.returns || [];
  
  // Cash returns are near-zero (treasury bill rate, approximated as 0 for simplicity)
  // In production, could fetch treasury bill rates from FRED
  const cash = new Array(Math.max(usEquity.length, internationalEquity.length, nominalBonds.length)).fill(0);

  // Ensure all arrays have same length (pad with zeros if needed)
  const maxLength = Math.max(usEquity.length, internationalEquity.length, nominalBonds.length);
  
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
