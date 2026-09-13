import { describe, expect, it } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildTipsReturns,
  loadTipsRealYields,
  parBondMonthlyReturn,
} from '../../../scripts/build-market-dataset';
import { loadHistoricalReturns } from '../../retirement-analytics/engine/historical-data-loader';
import { simulateWithdrawals } from '../../retirement-analytics/engine/withdrawal-simulator';
import type { HistoricalSequence, PortfolioMapping } from '../../retirement-analytics/types';

describe('synthetic TIPS return series', () => {
  it('earns a month of coupon when the yield does not move', () => {
    // A par bond held one month with nothing repricing it returns its accrual
    // and no more: a twelfth of the annual rate, a hair under because a third
    // of a semiannual period is discounted rather than accrued straight.
    const flat = parBondMonthlyReturn(0.02, 0.02);
    expect(flat).toBeCloseTo(0.02 / 12, 4);
    expect(flat).toBeLessThan(0.02 / 12);
  });

  it('loses roughly duration times the yield move when real yields rise', () => {
    // A ten-year par bond at 2% has a modified duration near nine years, so 50
    // basis points should cost about 4.5% before the month's accrual.
    const loss = parBondMonthlyReturn(0.02, 0.025);
    expect(loss).toBeLessThan(-0.04);
    expect(loss).toBeGreaterThan(-0.05);
  });

  it('prices a negative real yield rather than refusing it', () => {
    // Real yields were below zero for 48 months between 2011 and 2022. A par
    // bond with a negative coupon is the instrument that carries the right
    // duration there, and refusing it would blank out those years.
    expect(parBondMonthlyReturn(-0.01, -0.01)).toBeLessThan(0);
    expect(parBondMonthlyReturn(-0.01, -0.012)).toBeGreaterThan(0);
    expect(Number.isFinite(parBondMonthlyReturn(-0.01, 0.005))).toBe(true);
  });

  it('skips a market holiday instead of reading it as a 0% yield', () => {
    // FRED leaves the cell empty on a holiday, and `Number('')` is a finite 0.
    // Taken as a yield, a blank month-end invents a collapse to zero and a
    // reversal the month after -- the 2004-05 and 2024-03 month-ends are both
    // holidays, and reading them as zero produced +21.8% and +20.0% months.
    // Those two fabrications nearly cancel within their own calendar year,
    // so only a check on the monthly extreme catches them.
    const directory = mkdtempSync(join(tmpdir(), 'ask-linc-dfii-'));
    const csvPath = join(directory, 'DFII10.csv');
    writeFileSync(
      csvPath,
      ['observation_date,DFII10', '2024-03-27,1.90', '2024-03-28,1.88', '2024-03-29,']
        .concat(Array.from({ length: 220 }, (_, index) => {
          const month = String((index % 12) + 1).padStart(2, '0');
          return `${2005 + Math.floor(index / 12)}-${month}-15,2.00`;
        }))
        .join('\n') + '\n'
    );

    try {
      const yields = loadTipsRealYields(csvPath);
      // The last quoted day of the month, not the blank one after it.
      expect(yields.get('2024-03')).toBeCloseTo(0.0188, 12);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('indexes the real return by the same month of inflation', () => {
    const yields = new Map([['2020-01', 0.01], ['2020-02', 0.01]]);
    const inflation = new Map([['2020-02', 0.005]]);

    const [[month, value]] = [...buildTipsReturns(yields, inflation)];
    const real = parBondMonthlyReturn(0.01, 0.01);

    expect(month).toBe('2020-02');
    // Nominal return is the real return compounded with realized inflation,
    // because the principal tracks the index.
    expect(value).toBeCloseTo((1 + real) * 1.005 - 1, 12);
  });

  it('skips a month the real-yield series does not reach', () => {
    // A hole must not become a two-month move attributed to one month.
    const yields = new Map([['2020-01', 0.01], ['2020-03', 0.02]]);
    const inflation = new Map([['2020-02', 0.001], ['2020-03', 0.001]]);

    expect(buildTipsReturns(yields, inflation).size).toBe(0);
  });

  it('skips a month with no inflation reading to index by', () => {
    const yields = new Map([['2020-01', 0.01], ['2020-02', 0.01]]);
    expect(buildTipsReturns(yields, new Map()).size).toBe(0);
  });
});

describe('the TIPS column in the built dataset', () => {
  it('starts where real yields do and reaches the end of the file', () => {
    const data = loadHistoricalReturns();
    const first = data.tipsReturns.findIndex(value => value !== null);

    expect(data.dates[first].toISOString().slice(0, 7)).toBe('2003-02');
    expect(data.tipsReturns[data.tipsReturns.length - 1]).not.toBeNull();
    // Nothing before it, so the engine proxies an edge rather than a hole.
    expect(data.tipsReturns.slice(0, first).every(value => value === null)).toBe(true);
    expect(data.tipsReturns.slice(first).every(value => value !== null)).toBe(true);
  });

  it('holds every month inside what a ten-year real bond can do', () => {
    // The guard against an unreadable yield cell reaching the series. A real
    // bond needs a move of well over a point in one month to lose a tenth of
    // its value, and no such month is in the record; a double-digit month here
    // means a fabricated yield, not a market event.
    const data = loadHistoricalReturns();
    const observed = data.tipsReturns.filter((value): value is number => value !== null);

    expect(Math.max(...observed.map(Math.abs))).toBeLessThan(0.1);
  });

  it('is not a copy of the nominal bond series', () => {
    // The point of the sleeve. If these ever match, the column is being
    // sourced from the wrong place and every TIPS analysis is a nominal one.
    const data = loadHistoricalReturns();
    const overlap = data.tipsReturns
      .map((value, index) => ({ tips: value, bonds: data.bondReturns[index] }))
      .filter((row): row is { tips: number; bonds: number } => row.tips !== null);

    expect(overlap.length).toBeGreaterThan(200);
    expect(overlap.every(row => row.tips === row.bonds)).toBe(false);
  });

  it('rejects a row whose TIPS cell is blank rather than reading it as zero', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ask-linc-tips-'));
    const csvPath = join(directory, 'returns.csv');
    writeFileSync(
      csvPath,
      'date,us_equity,intl_equity,bonds,tips,cash,inflation\n2000-01,0.01,NA,0.003,,0.001,0.002\n'
    );

    try {
      expect(() => loadHistoricalReturns(csvPath)).toThrow('Invalid historical return row 2');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('the TIPS sleeve in the simulator', () => {
  function mappingWith(tipsWeight: number): PortfolioMapping {
    return {
      usEquityWeight: 0,
      internationalEquityWeight: 0,
      nominalBondsWeight: 1 - tipsWeight,
      tipsWeight,
      cashWeight: 0,
      totalValue: 100_000,
      usEquityValue: 0,
      internationalEquityValue: 0,
      nominalBondsValue: 100_000 * (1 - tipsWeight),
      tipsValue: 100_000 * tipsWeight,
      unsupportedFixedIncomeValue: 0,
      cashValue: 0,
      mappedValue: 100_000,
      unmappedValue: 0,
      unsupportedValue: 0,
      unrecognizedValue: 0,
      valueCoverage: 1,
      proxiedValue: 0,
      proxiedValuePercentage: 0,
      holdingExposures: [],
      mappingConfidence: 'high',
      unmappedHoldings: [],
      unrecognizedHoldings: [],
      equityGeographyUnresolvedHoldings: [],
      targetDateUnregisteredHoldings: [],
      unsupportedHoldings: [],
      partiallyMappedHoldings: [],
      mappingMethod: 'direct',
      targetDateFunds: [],
    };
  }

  /** Twelve months where TIPS gain and nominal bonds lose, as in an inflation. */
  function divergentYear(): HistoricalSequence {
    const months = 12;
    const flat = Array.from({ length: months }, () => 0);
    return {
      startDate: new Date('2010-01-01T00:00:00.000Z'),
      endDate: new Date('2010-12-01T00:00:00.000Z'),
      sequenceId: 'divergent',
      assetBasketReturns: {
        usEquity: [...flat],
        internationalEquity: [...flat],
        nominalBonds: Array.from({ length: months }, () => -0.01),
        tips: Array.from({ length: months }, () => 0.01),
        cash: [...flat],
      },
      inflationRates: [...flat],
    };
  }

  it('credits the TIPS weight with the TIPS series, not the bond series', () => {
    const sequence = divergentYear();
    const tipsOnly = simulateWithdrawals(mappingWith(1), 100_000, sequence, 0);
    const bondsOnly = simulateWithdrawals(mappingWith(0), 100_000, sequence, 0);

    expect(tipsOnly.finalValue).toBeGreaterThan(100_000);
    expect(bondsOnly.finalValue).toBeLessThan(100_000);
  });

  it('splits a mixed book between the two series', () => {
    const sequence = divergentYear();
    const tipsOnly = simulateWithdrawals(mappingWith(1), 100_000, sequence, 0);
    const bondsOnly = simulateWithdrawals(mappingWith(0), 100_000, sequence, 0);
    const half = simulateWithdrawals(mappingWith(0.5), 100_000, sequence, 0);

    // Half of each sleeve, compounded separately for the year and rebalanced at
    // the end of it. That lands slightly above the starting value rather than
    // on it -- the gaining sleeve compounds faster than the losing one shrinks
    // -- so the test pins the split rather than a round number.
    expect(half.finalValue).toBeCloseTo((tipsOnly.finalValue + bondsOnly.finalValue) / 2, 6);
    expect(half.finalValue).toBeGreaterThan(bondsOnly.finalValue);
    expect(half.finalValue).toBeLessThan(tipsOnly.finalValue);
  });
});
