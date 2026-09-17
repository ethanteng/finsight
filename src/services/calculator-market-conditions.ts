/**
 * The starting conditions a retirement begun today would actually begin from.
 *
 * The quick-plan engine answers by replaying a century of overlapping
 * historical windows, which is the right way to judge a thirty-year plan and
 * also averages over the one thing a visitor knows for certain: where rates
 * and inflation sit on the day they are reading the page. This module supplies
 * that, so the interpretation can locate today inside the record instead of
 * describing the record alone.
 *
 * What is deliberately *not* here matters as much as what is:
 *
 *  - **No equity prices, index levels or recent performance.** The page's whole
 *    argument is that a thirty-year plan is judged against hundreds of
 *    sequences rather than against this year. Setting "the S&P is up nine
 *    percent" beside a survival rate invites exactly the update the model says
 *    not to make, and it would be the most attention-grabbing number on the
 *    page.
 *  - **No web retrieval.** The interpretation endpoint is unauthenticated and
 *    currently carries no third-party text at all — every value reaching the
 *    prompt is a number from a named series or from our own engine. Brave
 *    results would end that property for the least reliable and slowest of the
 *    available sources.
 *  - **No unemployment, mortgage or card rates.** They are in the same FRED
 *    response and say nothing about whether this plan lasts.
 *
 * Every figure is optional. A provider that is unconfigured, slow or failing
 * costs the interpretation these sentences and nothing else, which is why each
 * fetch is settled independently and the whole thing is behind one short
 * timeout.
 */

import { FREDProvider } from '../data/providers/fred';
import { MassiveProvider } from '../data/providers/massive';

/** A rate, as of the day the series reports it. */
export interface MarketRate {
  /** Percent, as published — 4.21 means 4.21%. */
  percent: number;
  /** The series' own observation date, never the time we fetched it. */
  asOf: string;
  label: string;
  source: string;
}

export interface CalculatorMarketConditions {
  /** When this set was assembled, for the cache key that shadows it. */
  fetchedAt: string;
  /*
   * Labels are written without digits on purpose. An interpretation licenses
   * every number it shows the model, the label included, so "30-year" here
   * would license a bare 30 — and a draft writing "over the next 30 years"
   * would then pass the check that exists to catch exactly that.
   */

  /** The starting yield on a long bond, which is what a bond sleeve buys today. */
  treasury30Y?: MarketRate;
  /** The ten-year point, present when the thirty-year one is not published. */
  treasury10Y?: MarketRate;
  /** Realized inflation over the last year. */
  inflationYoY?: MarketRate;
  /** What the market prices inflation to average over the next decade. */
  inflationExpectation10Y?: MarketRate;
}

/**
 * The page is waiting on this, behind a model call that is itself seconds
 * long. A provider that has not answered by now is one the interpretation is
 * better off without.
 */
const FETCH_TIMEOUT_MS = 2_500;

/**
 * These are daily series. Re-fetching them per visitor would spend a provider
 * quota on a landing page to learn the same number, and the interpretation
 * cache below keys on the vintage so a refresh does reach the page.
 */
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * A fully empty set usually means a cold-start timeout or missing keys, not a
 * day with no published rates. Caching that miss for a full hour leaves every
 * visitor without market context until the process restarts or the hour ends.
 */
const EMPTY_CACHE_TTL_MS = 60 * 1000;

let cached: { at: number; value: CalculatorMarketConditions; ttlMs: number } | null = null;

export function clearMarketConditionsCache(): void {
  cached = null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasAnyRate(conditions: CalculatorMarketConditions): boolean {
  return Boolean(
    conditions.treasury30Y
    || conditions.treasury10Y
    || conditions.inflationYoY
    || conditions.inflationExpectation10Y
  );
}

/** Resolve, or give up quietly at the deadline. */
async function withTimeout<T>(work: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), FETCH_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.warn('Calculator market conditions: provider call failed:', error);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getCalculatorMarketConditions(): Promise<CalculatorMarketConditions> {
  const now = Date.now();
  if (cached && now - cached.at < cached.ttlMs) return cached.value;

  const fredKey = (process.env.FRED_API_KEY || '').trim();
  const massiveKey = (process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || '').trim();

  const [fred, treasury, expectations] = await Promise.all([
    fredKey
      ? withTimeout(new FREDProvider(fredKey).getEconomicIndicators())
      : Promise.resolve(null),
    massiveKey
      ? withTimeout(new MassiveProvider(massiveKey).getLatestTreasuryYields())
      : Promise.resolve(null),
    massiveKey
      ? withTimeout(new MassiveProvider(massiveKey).getLatestInflationExpectations())
      : Promise.resolve(null),
  ]);

  const conditions: CalculatorMarketConditions = { fetchedAt: new Date(now).toISOString() };

  if (fred?.cpi && isFiniteNumber(fred.cpi.value)) {
    conditions.inflationYoY = {
      percent: fred.cpi.value,
      asOf: fred.cpi.date,
      label: 'US inflation over the last year (CPI)',
      source: 'FRED',
    };
  }
  if (fred?.treasury10Y && isFiniteNumber(fred.treasury10Y.value)) {
    conditions.treasury10Y = {
      percent: fred.treasury10Y.value,
      asOf: fred.treasury10Y.date,
      label: 'ten-year Treasury yield',
      source: 'FRED',
    };
  }

  const curve = treasury?.results?.[0];
  if (curve && isFiniteNumber(curve.yield_30_year)) {
    conditions.treasury30Y = {
      percent: curve.yield_30_year,
      asOf: curve.date ?? conditions.fetchedAt.slice(0, 10),
      label: 'thirty-year Treasury yield',
      source: 'Massive',
    };
  }
  // Preferred over the FRED reading when both are present: one curve, one
  // observation date, rather than two series disagreeing by a day.
  if (curve && isFiniteNumber(curve.yield_10_year)) {
    conditions.treasury10Y = {
      percent: curve.yield_10_year,
      asOf: curve.date ?? conditions.fetchedAt.slice(0, 10),
      label: 'ten-year Treasury yield',
      source: 'Massive',
    };
  }

  const expectation = expectations?.results?.[0];
  if (expectation && isFiniteNumber(expectation.market_10_year)) {
    conditions.inflationExpectation10Y = {
      percent: expectation.market_10_year,
      asOf: expectation.date ?? conditions.fetchedAt.slice(0, 10),
      label: 'inflation the market prices in over the next ten years',
      source: 'Massive',
    };
  }

  cached = {
    at: now,
    value: conditions,
    ttlMs: hasAnyRate(conditions) ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS,
  };
  return conditions;
}
