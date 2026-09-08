// Stress Tester - Rolling Window Engine
// Phase 3: Rolling Window Engine
//
// Uses local historical data from data/historical_market_returns.csv.
// Fully deterministic and offline. No ETF or FRED API calls for sequence data.

import {
  DEFAULT_SHORT_SERIES_POLICY,
  HistoricalDataSummary,
  HistoricalSequence,
  PortfolioMapping,
  ProxiedSeriesRange,
  ProxiedSeriesReport,
  ShortSeriesPolicy,
  TimelineBucket,
} from '../types';
import { loadHistoricalReturns } from './historical-data-loader';
import { mappingFromResolvedExposures } from './portfolio-mapper';

export class InsufficientHistoricalDataError extends Error {
  constructor(
    public readonly requestedMonths: number,
    public readonly availableMonths: number,
    public readonly firstMonth: string | null,
    public readonly lastMonth: string | null,
    public readonly minimumHistoryMonths: number = 0,
    /** True when an active international sleeve is what narrowed the window. */
    public readonly limitedByInternationalHistory: boolean = false
  ) {
    const requestedYears = requestedMonths / 12;
    const availableYears = availableMonths / 12;
    const requirement = availableMonths < requestedMonths
      ? `the requested ${requestedYears.toFixed(1)}-year horizon exceeds`
      : `the analysis requires at least ${(minimumHistoryMonths / 12).toFixed(1)} years, but found`;
    super(
      `Insufficient historical market data: ${requirement} ` +
      `${availableYears.toFixed(1)} years of complete active-sleeve history` +
      (firstMonth && lastMonth ? ` (${firstMonth} through ${lastMonth})` : '') +
      (limitedByInternationalHistory ? ", limited by the portfolio's international sleeve" : '')
    );
    this.name = 'InsufficientHistoricalDataError';
  }

  /**
   * Longest horizon this portfolio can actually be modeled over, in whole years.
   *
   * Zero when the window is below the engine's own minimum, because then no
   * timeline works and asking the user to shorten one would send them in
   * circles.
   */
  get maxTimelineYears(): number {
    if (this.availableMonths < this.minimumHistoryMonths) return 0;
    return Math.floor(this.availableMonths / 12);
  }
}

function dateString(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Index of the series' first observation, or -1 when it has none. */
function firstObservation(series: Array<number | null>): number {
  return series.findIndex(value => value !== null);
}

/** Index of the series' last observation, or -1 when it has none. */
function lastObservation(series: Array<number | null>): number {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index] !== null) return index;
  }
  return -1;
}

/**
 * Group the proxied months of the tested window into contiguous ranges, so the
 * disclosure reads as periods rather than a count.
 */
function proxiedRanges(
  dates: Date[],
  series: Array<number | null>,
  windowStart: number,
  windowEnd: number
): ProxiedSeriesRange[] {
  const ranges: ProxiedSeriesRange[] = [];
  let runStart: number | null = null;

  for (let index = windowStart; index <= windowEnd + 1; index += 1) {
    const proxied = index <= windowEnd && series[index] === null;
    if (proxied && runStart === null) runStart = index;
    if (!proxied && runStart !== null) {
      ranges.push({
        firstMonth: dateString(dates[runStart]),
        lastMonth: dateString(dates[index - 1]),
        months: index - runStart,
      });
      runStart = null;
    }
  }

  return ranges;
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
  minHistoryYears: number = 50,
  shortSeriesPolicy: ShortSeriesPolicy = DEFAULT_SHORT_SERIES_POLICY
): Promise<{
  sequences: HistoricalSequence[];
  missingData: string[];
  historicalData?: HistoricalDataSummary;
}> {
  const resolvedMapping = mappingFromResolvedExposures(mapping);
  const data = loadHistoricalReturns();
  const { dates, usEquityReturns, intlEquityReturns, bondReturns, cashReturns, inflationRates } = data;

  const horizonMonths = Math.round(analysisYears * 12);
  if (!Number.isFinite(horizonMonths) || horizonMonths <= 0) {
    throw new Error('Historical analysis horizon must be positive');
  }

  const internationalRequired = Math.abs(resolvedMapping.internationalEquityWeight) > 1e-12;

  // The international series starts in 1975; every other series starts in 1926
  // and runs six months later. Restricting the window to months that series
  // covers is what used to cost a portfolio holding any international at all
  // the 1929, 1937, 1966 and 1973 starts — the ones that decide whether a plan
  // is actually safe. Outside its own span the sleeve is represented by the US
  // market return instead, and the substitution is reported.
  const proxyInternational = internationalRequired && shortSeriesPolicy === 'proxy';
  const intlFirst = firstObservation(intlEquityReturns);
  const intlLast = lastObservation(intlEquityReturns);

  const usable = dates.map((_, index) => {
    if (!internationalRequired) return true;
    if (intlEquityReturns[index] !== null) return true;
    // Only the edges are proxied. A hole inside the series means the dataset
    // builder produced something unexpected, and splicing across it would hide
    // that, so an interior gap still narrows the window and is caught below.
    return proxyInternational && (index < intlFirst || index > intlLast);
  });
  const firstUsable = usable.indexOf(true);
  const lastUsable = usable.lastIndexOf(true);
  const availableMonths = firstUsable < 0 ? 0 : lastUsable - firstUsable + 1;
  const firstMonth = firstUsable < 0 ? null : dateString(dates[firstUsable]);
  const lastMonth = lastUsable < 0 ? null : dateString(dates[lastUsable]);

  if (
    firstUsable < 0 ||
    usable.slice(firstUsable, lastUsable + 1).some(value => !value) ||
    availableMonths < horizonMonths ||
    availableMonths < minHistoryYears * 12
  ) {
    throw new InsufficientHistoricalDataError(
      horizonMonths,
      availableMonths,
      firstMonth,
      lastMonth,
      minHistoryYears * 12,
      // Only claim the international sleeve is the constraint when it actually
      // cost months; otherwise the whole dataset is simply too short.
      internationalRequired && availableMonths < dates.length
    );
  }

  const activeDates = dates.slice(firstUsable, lastUsable + 1);
  const activeUsEquity = usEquityReturns.slice(firstUsable, lastUsable + 1);
  // Substitution happens once, here, so every sequence and every consumer of
  // them sees the same series.
  const effectiveInternational = proxyInternational
    ? intlEquityReturns.map((value, index) => (value === null ? usEquityReturns[index] : value))
    : intlEquityReturns;
  const activeInternational = effectiveInternational.slice(firstUsable, lastUsable + 1);
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

  const internationalProxyRanges = proxyInternational
    ? proxiedRanges(dates, intlEquityReturns, firstUsable, lastUsable)
    : [];
  const proxiedSeries: ProxiedSeriesReport[] = internationalProxyRanges.length === 0 ? [] : [{
    series: 'intl_equity',
    proxy: 'us_equity',
    description:
      'International equity returns outside the series\'s own span use the US market return; ' +
      'those months carry no distinct international behaviour',
    ranges: internationalProxyRanges,
    months: internationalProxyRanges.reduce((total, range) => total + range.months, 0),
    windowMonths: availableMonths,
  }];

  const historicalData = data.metadata && firstMonth && lastMonth ? {
    firstMonth,
    lastMonth,
    sourceRetrievedAt: data.metadata.generatedFromSourceRetrieval,
    monthlyStartWindowsOverlap: true as const,
    series: data.metadata.series,
    ...(proxiedSeries.length > 0 ? { proxiedSeries } : {}),
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
  const resolvedMapping = mappingFromResolvedExposures(mapping);
  const data = loadHistoricalReturns();
  const sleeves: Array<[number, Array<number | null>]> = [
    [resolvedMapping.usEquityWeight, data.usEquityReturns],
    [resolvedMapping.internationalEquityWeight, data.intlEquityReturns],
    [resolvedMapping.nominalBondsWeight, data.bondReturns],
    [resolvedMapping.cashWeight, data.cashReturns],
  ];
  const activeWeight = sleeves.reduce((total, [weight]) => total + Math.abs(weight), 0);
  if (activeWeight <= 0) return 0;

  const weightedCoverage = sleeves.reduce((total, [weight, observations]) => {
    if (Math.abs(weight) <= 1e-12) return total;
    const usable = observations.filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value)
    ).length;
    return total + Math.abs(weight) * Math.min(1, usable / minimumMonths);
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
