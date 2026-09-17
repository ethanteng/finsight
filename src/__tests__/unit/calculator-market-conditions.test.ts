import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';

/**
 * The two providers are the only thing this module talks to, and both are held
 * here so a case can decide what they do — including taking longer than the
 * deadline, which is the behaviour the cache TTL below exists for.
 */
const fred = { indicators: jest.fn<Promise<unknown>, unknown[]>(async () => ({})) };
const massive = {
  yields: jest.fn<Promise<unknown>, unknown[]>(async () => ({ results: [] })),
  expectations: jest.fn<Promise<unknown>, unknown[]>(async () => ({ results: [] })),
};

jest.mock('../../data/providers/fred', () => ({
  FREDProvider: class {
    getEconomicIndicators() { return fred.indicators(); }
  },
}));
jest.mock('../../data/providers/massive', () => ({
  MassiveProvider: class {
    getLatestTreasuryYields() { return massive.yields(); }
    getLatestInflationExpectations() { return massive.expectations(); }
  },
}));

import {
  clearMarketConditionsCache,
  getCalculatorMarketConditions,
} from '../../services/calculator-market-conditions';

const KEYS = ['FRED_API_KEY', 'MASSIVE_API_KEY', 'POLYGON_API_KEY'] as const;
const previous = new Map<string, string | undefined>();

beforeEach(() => {
  clearMarketConditionsCache();
  for (const key of KEYS) previous.set(key, process.env[key]);
  process.env.FRED_API_KEY = 'test-fred';
  process.env.MASSIVE_API_KEY = 'test-massive';
  fred.indicators.mockReset().mockResolvedValue({});
  massive.yields.mockReset().mockResolvedValue({ results: [] });
  massive.expectations.mockReset().mockResolvedValue({ results: [] });
});

afterEach(() => {
  jest.useRealTimers();
  for (const key of KEYS) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('getCalculatorMarketConditions', () => {
  it('reads the curve and inflation into labelled rates', async () => {
    fred.indicators.mockResolvedValue({
      cpi: { value: 2.71, date: '2026-08-01', source: 'FRED', lastUpdated: '' },
    });
    massive.yields.mockResolvedValue({
      results: [{ date: '2026-09-15', yield_30_year: 4.62, yield_10_year: 4.21 }],
    });
    massive.expectations.mockResolvedValue({
      results: [{ date: '2026-09-15', market_10_year: 2.35 }],
    });

    const conditions = await getCalculatorMarketConditions();

    expect(conditions.treasury30Y).toMatchObject({ percent: 4.62, asOf: '2026-09-15', source: 'Massive' });
    expect(conditions.inflationYoY).toMatchObject({ percent: 2.71, asOf: '2026-08-01', source: 'FRED' });
    expect(conditions.inflationExpectation10Y).toMatchObject({
      percent: 2.35,
      // Hyphenated: a whitespace "ten years" in the label is a spelled quantity
      // the interpretation grounding check would then refuse in any draft that
      // named the series.
      label: 'ten-year breakeven inflation',
    });
  });

  /*
   * The curve and the FRED series both carry a ten-year point. One curve read
   * at one observation date beats two series disagreeing by a day, so the
   * curve wins — and the source has to say so, because the interpretation
   * cache keys on it.
   */
  it('prefers the curve over the FRED series for the ten-year point', async () => {
    fred.indicators.mockResolvedValue({
      treasury10Y: { value: 4.18, date: '2026-09-14', source: 'FRED', lastUpdated: '' },
    });
    massive.yields.mockResolvedValue({ results: [{ date: '2026-09-15', yield_10_year: 4.21 }] });

    const conditions = await getCalculatorMarketConditions();
    expect(conditions.treasury10Y).toMatchObject({ percent: 4.21, source: 'Massive' });
  });

  it('falls back to the FRED ten-year when the curve has none', async () => {
    fred.indicators.mockResolvedValue({
      treasury10Y: { value: 4.18, date: '2026-09-14', source: 'FRED', lastUpdated: '' },
    });
    massive.yields.mockResolvedValue({ results: [] });

    const conditions = await getCalculatorMarketConditions();
    expect(conditions.treasury10Y).toMatchObject({ percent: 4.18, source: 'FRED' });
  });

  it('returns an empty set rather than throwing when a provider fails', async () => {
    fred.indicators.mockRejectedValue(new Error('FRED down'));
    massive.yields.mockRejectedValue(new Error('Massive down'));
    massive.expectations.mockRejectedValue(new Error('Massive down'));

    const conditions = await getCalculatorMarketConditions();
    expect(conditions.treasury30Y).toBeUndefined();
    expect(conditions.inflationYoY).toBeUndefined();
    expect(conditions.fetchedAt).toEqual(expect.any(String));
  });

  it('serves a resolved set from cache rather than re-fetching per visitor', async () => {
    massive.yields.mockResolvedValue({ results: [{ date: '2026-09-15', yield_30_year: 4.62 }] });

    await getCalculatorMarketConditions();
    await getCalculatorMarketConditions();

    expect(massive.yields).toHaveBeenCalledTimes(1);
  });

  /*
   * An empty set is usually a moment, not a fact — a cold start where the
   * providers ran past the deadline. Holding it for the full hour would cost
   * every interpretation in that hour its rate context over one slow second.
   */
  it('retries an empty set far sooner than a resolved one', async () => {
    fred.indicators.mockRejectedValue(new Error('cold start'));
    massive.yields.mockRejectedValue(new Error('cold start'));
    massive.expectations.mockRejectedValue(new Error('cold start'));

    const started = Date.now();
    await getCalculatorMarketConditions();
    expect(massive.yields).toHaveBeenCalledTimes(1);

    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(started + 6 * 60 * 1000);

    massive.yields.mockResolvedValue({ results: [{ date: '2026-09-15', yield_30_year: 4.62 }] });
    const recovered = await getCalculatorMarketConditions();

    expect(massive.yields).toHaveBeenCalledTimes(2);
    expect(recovered.treasury30Y?.percent).toBe(4.62);
  });

  it('holds a resolved set past the point an empty one would be retried', async () => {
    massive.yields.mockResolvedValue({ results: [{ date: '2026-09-15', yield_30_year: 4.62 }] });

    const started = Date.now();
    await getCalculatorMarketConditions();

    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(started + 6 * 60 * 1000);
    await getCalculatorMarketConditions();

    expect(massive.yields).toHaveBeenCalledTimes(1);
  });

  /* No key is not a failure to retry — there is nothing to call. */
  it('does not call a provider it has no key for', async () => {
    delete process.env.MASSIVE_API_KEY;
    delete process.env.POLYGON_API_KEY;

    await getCalculatorMarketConditions();

    expect(massive.yields).not.toHaveBeenCalled();
    expect(fred.indicators).toHaveBeenCalledTimes(1);
  });
});
