// Stress Tester - Rolling Window Engine
// Phase 3: Rolling Window Engine
//
// Uses local historical data from data/historical_market_returns.csv.
// Fully deterministic and offline. No ETF or FRED API calls for sequence data.

import { HistoricalDataSummary, HistoricalSequence, PortfolioMapping, TimelineBucket } from '../types';
import { loadHistoricalReturns } from './historical-data-loader';

export class InsufficientHistoricalDataError extends Error {
  constructor(
    public readonly requestedMonths: number,
    public readonly availableMonths: number,
    public readonly firstMonth: string | null,
    public readonly lastMonth: string | null,
    public readonly minimumHistoryMonths: number = 0
  ) {
    const requestedYears = requestedMonths / 12;
    const availableYears = availableMonths / 12;
    const requirement = availableMonths < requestedMonths
      ? `the requested ${requestedYears.toFixed(1)}-year horizon exceeds`
      : `the analysis requires at least ${(minimumHistoryMonths / 12).toFixed(1)} years, but found`;
    super(
      `Insufficient historical market data: ${requirement} ` +
      `${availableYears.toFixed(1)} years of complete active-sleeve history` +
      (firstMonth && lastMonth ? ` (${firstMonth} through ${lastMonth})` : '')
    );
    this.name = 'InsufficientHistoricalDataError';
  }
}

function dateString(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

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
  analysisYears: number,
  mapping: PortfolioMapping,
  _minHistoryYears: number = 50
): Promise<{
  sequences: HistoricalSequence[];
  missingData: string[];
  historicalData?: HistoricalDataSummary;
}> {
  const data = loadHistoricalReturns();
  const { dates, usEquityReturns, intlEquityReturns, bondReturns, cashReturns, inflationRates } = data;

  const horizonMonths = Math.round(analysisYears * 12);
  if (!Number.isFinite(horizonMonths) || horizonMonths <= 0) {
    throw new Error('Historical analysis horizon must be positive');
  }

  const internationalRequired = mapping.internationalEquityWeight > 0;
  const usable = dates.map((_, index) =>
    !internationalRequired || intlEquityReturns[index] !== null
  );
  const firstUsable = usable.indexOf(true);
  const lastUsable = usable.lastIndexOf(true);
  const availableMonths = firstUsable < 0 ? 0 : lastUsable - firstUsable + 1;
  const firstMonth = firstUsable < 0 ? null : dateString(dates[firstUsable]);
  const lastMonth = lastUsable < 0 ? null : dateString(dates[lastUsable]);

  if (
    firstUsable < 0 ||
    usable.slice(firstUsable, lastUsable + 1).some(value => !value) ||
    availableMonths < horizonMonths ||
    availableMonths < _minHistoryYears * 12
  ) {
    throw new InsufficientHistoricalDataError(
      horizonMonths,
      availableMonths,
      firstMonth,
      lastMonth,
      _minHistoryYears * 12
    );
  }

  const activeDates = dates.slice(firstUsable, lastUsable + 1);
  const activeUsEquity = usEquityReturns.slice(firstUsable, lastUsable + 1);
  const activeInternational = intlEquityReturns.slice(firstUsable, lastUsable + 1);
  const activeBonds = bondReturns.slice(firstUsable, lastUsable + 1);
  const activeCash = cashReturns.slice(firstUsable, lastUsable + 1);
  const activeInflation = inflationRates.slice(firstUsable, lastUsable + 1);

  const sequences: HistoricalSequence[] = [];
  const missingData: string[] = [];

  for (let i = 0; i <= activeDates.length - horizonMonths; i++) {
    const startDate = activeDates[i];
    const endIndex = i + horizonMonths - 1;
    const endDate = activeDates[endIndex];

    const usEquity = activeUsEquity.slice(i, endIndex + 1);
    const internationalEquity = activeInternational
      .slice(i, endIndex + 1)
      .map(value => value ?? 0);
    const nominalBonds = activeBonds.slice(i, endIndex + 1);
    const cash = activeCash.slice(i, endIndex + 1);
    const seqInflationRates = activeInflation.slice(i, endIndex + 1);

    const startYear = startDate.getUTCFullYear();
    const startMonth = startDate.getUTCMonth() + 1;
    const endYear = endDate.getUTCFullYear();
    const endMonth = endDate.getUTCMonth() + 1;

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
    `Generated ${sequences.length} rolling sequences (monthly overlapping starts, ${analysisYears}-year horizon, full data only)`
  );

  const historicalData = data.metadata && firstMonth && lastMonth ? {
    firstMonth,
    lastMonth,
    sourceRetrievedAt: data.metadata.generatedFromSourceRetrieval,
    monthlyStartWindowsOverlap: true as const,
    series: data.metadata.series,
  } : undefined;

  return { sequences, missingData, historicalData };
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
  const sleeves: Array<[number, Array<number | null>]> = [
    [mapping.usEquityWeight, data.usEquityReturns],
    [mapping.internationalEquityWeight, data.intlEquityReturns],
    [mapping.nominalBondsWeight, data.bondReturns],
    [mapping.cashWeight, data.cashReturns],
  ];
  const activeWeight = sleeves.reduce((total, [weight]) => total + weight, 0);
  if (activeWeight <= 0) return 0;

  const weightedCoverage = sleeves.reduce((total, [weight, observations]) => {
    if (weight <= 0) return total;
    const usable = observations.filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value)
    ).length;
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
  // Sequence boundaries are UTC month starts (see loadHistoricalReturns).
  startDate.setUTCMonth(startDate.getUTCMonth() + offset);
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
