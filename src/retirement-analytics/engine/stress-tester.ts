// Stress Tester - Rolling Window Engine
// Phase 3: Rolling Window Engine
//
// Uses local historical data from data/historical_market_returns.csv.
// Fully deterministic and offline. No ETF or FRED API calls for sequence data.

import { HistoricalSequence, PortfolioMapping, TimelineBucket } from '../types';
import { DataProviderFactory } from '../data/data-provider-factory';
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

/**
 * Weighted coverage of the active historical proxy sleeves. The loader rejects
 * malformed values, so coverage reflects the actual number of usable monthly
 * observations rather than a persisted placeholder.
 */
export function calculateHistoricalPriceCoverage(
  mapping: PortfolioMapping,
  minimumMonths = 120
): number {
  if (minimumMonths <= 0) throw new Error('minimumMonths must be positive');
  const data = loadHistoricalReturns();
  const sleeves: Array<[number, number[]]> = [
    [mapping.usEquityWeight, data.usEquityReturns],
    [mapping.internationalEquityWeight, data.intlEquityReturns],
    [mapping.nominalBondsWeight, data.bondReturns],
    [mapping.cashWeight, data.cashReturns],
  ];
  const activeWeight = sleeves.reduce((total, [weight]) => total + weight, 0);
  if (activeWeight <= 0) return 0;

  const weightedCoverage = sleeves.reduce((total, [weight, observations]) => {
    if (weight <= 0) return total;
    const usable = observations.filter(Number.isFinite).length;
    return total + weight * Math.min(1, usable / minimumMonths);
  }, 0);
  return weightedCoverage / activeWeight;
}

/** Return the withdrawal-period portion of a full accumulation + withdrawal sequence. */
export function sliceHistoricalSequence(
  sequence: HistoricalSequence,
  startMonth: number
): HistoricalSequence {
  const offset = Math.max(0, Math.round(startMonth));
  const dates = sequence.assetBasketReturns.usEquity.length;
  if (offset >= dates) throw new Error('Withdrawal start must fall inside the historical sequence');
  const startDate = new Date(sequence.startDate);
  startDate.setMonth(startDate.getMonth() + offset);
  return {
    ...sequence,
    startDate,
    sequenceId: `${sequence.sequenceId}:withdrawal-month-${offset}`,
    assetBasketReturns: {
      usEquity: sequence.assetBasketReturns.usEquity.slice(offset),
      internationalEquity: sequence.assetBasketReturns.internationalEquity.slice(offset),
      nominalBonds: sequence.assetBasketReturns.nominalBonds.slice(offset),
      cash: sequence.assetBasketReturns.cash.slice(offset),
    },
    inflationRates: sequence.inflationRates.slice(offset),
    portfolioOutcome: undefined,
  };
}
