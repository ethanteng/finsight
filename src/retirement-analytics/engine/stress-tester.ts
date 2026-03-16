// Stress Tester - Rolling Window Engine
// Phase 3: Rolling Window Engine
//
// Uses local historical data from data/historical_market_returns.csv.
// Fully deterministic and offline. No ETF or FRED API calls for sequence data.

import { HistoricalSequence, TimelineBucket } from '../types';
import { DataProviderFactory } from '../data/data-provider-factory';
import { FREDProvider } from '../../data/providers/fred';
import { loadHistoricalReturns } from './historical-data-loader';

/**
 * Return exact withdrawal years as string (no bucketing).
 * Kept for interface compatibility.
 */
export function snapToHorizonBucket(withdrawalYears: number): TimelineBucket {
  return String(Math.round(withdrawalYears)) as TimelineBucket;
}

/**
 * Generate rolling historical sequences from local CSV data.
 * Only generates sequences with full horizon data (no truncation).
 * Uses monthly start windows.
 */
export async function generateRollingSequences(
  withdrawalYears: number,
  _dataProviderFactory: DataProviderFactory,
  _fredProvider: FREDProvider,
  _minHistoryYears: number = 50
): Promise<{ sequences: HistoricalSequence[]; missingData: string[] }> {
  const data = loadHistoricalReturns();
  const { dates, usEquityReturns, intlEquityReturns, bondReturns, cashReturns, inflationRates } = data;

  const horizonMonths = Math.round(withdrawalYears * 12);
  const today = new Date();
  const latestStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
  latestStartDate.setMonth(latestStartDate.getMonth() - horizonMonths);

  const sequences: HistoricalSequence[] = [];
  const missingData: string[] = [];

  for (let i = 0; i <= dates.length - horizonMonths; i++) {
    const startDate = dates[i];
    if (startDate > latestStartDate) break;

    const endIndex = i + horizonMonths - 1;
    const endDate = dates[endIndex];

    const usEquity = usEquityReturns.slice(i, endIndex + 1);
    const internationalEquity = intlEquityReturns.slice(i, endIndex + 1);
    const nominalBonds = bondReturns.slice(i, endIndex + 1);
    const cash = cashReturns.slice(i, endIndex + 1);
    const seqInflationRates = inflationRates.slice(i, endIndex + 1);

    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth() + 1;

    const sequenceId = `${startYear}-${String(startMonth).padStart(2, '0')}_to_${endYear}-${String(endMonth).padStart(2, '0')}`;

    sequences.push({
      startDate,
      endDate,
      sequenceId,
      assetBasketReturns: {
        usEquity,
        internationalEquity,
        nominalBonds,
        cash,
      },
      inflationRates: seqInflationRates,
    });
  }

  console.log(
    `Generated ${sequences.length} rolling sequences (monthly starts, ${withdrawalYears}-year horizon, full data only)`
  );

  return { sequences, missingData };
}
