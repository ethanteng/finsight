import { describe, expect, it } from '@jest/globals';
import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as XLSX from 'xlsx';
import { mapPortfolioToAssetBasket } from '../../retirement-analytics/engine/portfolio-mapper';
import { analyzePortfolio } from '../../retirement-analytics/engine/portfolio-analyzer';
import { simulateWithdrawals } from '../../retirement-analytics/engine/withdrawal-simulator';
import {
  calculateHistoricalPriceCoverage,
  generateRollingSequences,
  InsufficientHistoricalDataError,
} from '../../retirement-analytics/engine/stress-tester';
import {
  getHistoricalDatasetVersion,
  loadHistoricalReturns,
} from '../../retirement-analytics/engine/historical-data-loader';
import { computeHistoricalWithdrawalRates } from '../../retirement-analytics/engine/withdrawal-rate-solver';
import { buildRetirementTimeline } from '../../retirement-analytics';
import { calculateDataQuality } from '../../retirement-analytics/interpretation/uncertainty-quantifier';
import type { HistoricalSequence, PortfolioMapping } from '../../retirement-analytics/types';
import type { Holding, Security } from '../../services/financial-data-service';

function holding(securityId: string, ticker: string, value = 100): Holding {
  return {
    id: `holding-${securityId}`,
    account_id: 'account-1',
    security_id: securityId,
    institution_value: value,
    institution_price: value,
    institution_price_as_of: '2026-01-01',
    cost_basis: value,
    quantity: 1,
    iso_currency_code: 'USD',
    ticker_symbol: ticker,
    security_name: ticker,
    security_type: 'etf',
  };
}

function security(id: string, ticker: string, name: string, type = 'etf'): Security {
  return { security_id: id, ticker_symbol: ticker, name, type, iso_currency_code: 'USD' };
}

const balancedMapping: PortfolioMapping = {
  usEquityWeight: 0.6,
  internationalEquityWeight: 0.2,
  nominalBondsWeight: 0.2,
  cashWeight: 0,
  totalValue: 1,
  mappedValue: 1,
  unmappedValue: 0,
  valueCoverage: 1,
  proxiedValue: 0,
  proxiedValuePercentage: 0,
  holdingExposures: [],
  mappingConfidence: 'high',
  unmappedHoldings: [],
  mappingMethod: 'direct',
  targetDateFunds: [],
};

function flatSequence(months: number): HistoricalSequence {
  const zeroes = Array.from({ length: months }, () => 0);
  return {
    startDate: new Date('2000-01-01T00:00:00.000Z'),
    endDate: new Date('2001-12-01T00:00:00.000Z'),
    sequenceId: 'flat',
    assetBasketReturns: {
      usEquity: [...zeroes],
      internationalEquity: [...zeroes],
      nominalBonds: [...zeroes],
      cash: [...zeroes],
    },
    inflationRates: [...zeroes],
  };
}

describe('retirement correctness contracts', () => {
  it('leaves global equity unmodeled without sourced country weights', async () => {
    const holdings = [holding('world', 'VT')];
    const securities = [security('world', 'VT', 'Vanguard Total World Stock', 'equity')];

    const mapping = await mapPortfolioToAssetBasket(holdings, securities, 100);
    const metrics = await analyzePortfolio(holdings, securities);

    expect(mapping.mappedValue).toBe(0);
    expect(mapping.unmappedValue).toBe(100);
    expect(mapping.holdingExposures[0].method).toBe('unmapped');
    expect(metrics.equityAllocation).toBe(0);
    expect(metrics.internationalAllocation).toBe(0);
  });

  it('honors explicit international geography over a generic global name', async () => {
    const holdings = [holding('global-ex-us', 'GXUS')];
    const securities = [security('global-ex-us', 'GXUS', 'Global ex-US Equity Fund', 'equity')];
    const metadata = new Map([['GXUS', { assetClass: 'equity', geographicFocus: 'international' }]]);

    const mapping = await mapPortfolioToAssetBasket(holdings, securities, 100, undefined, metadata);
    const metrics = await analyzePortfolio(holdings, securities, undefined, metadata);

    expect(mapping.usEquityWeight).toBeCloseTo(0);
    expect(mapping.internationalEquityWeight).toBeCloseTo(1);
    expect(metrics.internationalAllocation).toBeCloseTo(100);
  });

  it.each(['BND', 'AGG', 'SHY'])('classifies %s as bonds when metadata is generic', async ticker => {
    const holdings = [holding(ticker, ticker)];
    const securities = [security(ticker, ticker, ticker)];

    const mapping = await mapPortfolioToAssetBasket(holdings, securities, 100);
    const metrics = await analyzePortfolio(holdings, securities);

    expect(mapping.nominalBondsWeight).toBeCloseTo(1);
    expect(mapping.usEquityWeight).toBeCloseTo(0);
    expect(metrics.fixedIncomeAllocation).toBeCloseTo(100);
  });

  it('excludes unmapped dollars instead of reallocating them across mapped assets', async () => {
    const holdings = [
      holding('stock', 'WFC', 90_000),
      holding('mystery', 'X123', 10_000),
    ];
    holdings[1].security_name = 'Unidentified Plan Holding';
    holdings[1].security_type = 'Unknown';
    const securities = [
      security('stock', 'WFC', 'Wells Fargo & Co.', 'equity'),
      security('mystery', 'X123', 'Unidentified Plan Holding', 'Unknown'),
    ];

    const mapping = await mapPortfolioToAssetBasket(holdings, securities, 100_000, undefined, new Map(), 2026);

    expect(mapping.usEquityWeight).toBe(1);
    expect(mapping.mappedValue).toBe(90_000);
    expect(mapping.unmappedValue).toBe(10_000);
    expect(mapping.valueCoverage).toBe(0.9);
    expect(mapping.holdingExposures.map(exposure => exposure.mappedValue)).toEqual([90_000, 0]);
  });

  it('publishes the same target-date allocation that the simulator consumes', async () => {
    const holdings = [holding('lifepath', 'O7PE', 100_000)];
    holdings[0].security_name = 'BTC LPATH IDX 2040 N';
    holdings[0].security_type = 'Unknown';
    const securities = [security('lifepath', 'O7PE', 'BTC LPATH IDX 2040 N', 'Unknown')];
    const mapping = await mapPortfolioToAssetBasket(holdings, securities, 100_000, undefined, new Map(), 2026);
    const metrics = await analyzePortfolio(holdings, securities, undefined, new Map(), mapping, 2026);

    expect(metrics.equityAllocation).toBeCloseTo(
      (mapping.usEquityWeight + mapping.internationalEquityWeight) * 100,
      8,
    );
    expect(metrics.fixedIncomeAllocation).toBeCloseTo(mapping.nominalBondsWeight * 100, 8);
    expect(metrics.equityAllocation).toBeLessThan(100);
  });

  it('calculates proxied value from per-holding provenance', async () => {
    const holdings = [
      holding('stock', 'WFC', 90_000),
      holding('plan-fund', 'LONGTICKER', 10_000),
    ];
    holdings[1].security_name = 'S&P 500 Index Fund';
    holdings[1].security_type = 'mutual fund';
    const securities = [
      security('stock', 'WFC', 'Wells Fargo & Co.', 'equity'),
      security('plan-fund', 'LONGTICKER', 'S&P 500 Index Fund', 'mutual fund'),
    ];

    const mapping = await mapPortfolioToAssetBasket(holdings, securities, 100_000, undefined, new Map(), 2026);

    expect(mapping.proxiedValue).toBe(10_000);
    expect(mapping.proxiedValuePercentage).toBe(0.1);
    expect(mapping.holdingExposures.map(exposure => exposure.method)).toEqual(['provider', 'name-inference']);
  });

  it('delays withdrawals until the modeled withdrawal start', () => {
    const outcome = simulateWithdrawals(
      balancedMapping,
      1_200,
      flatSequence(24),
      600,
      { withdrawalDelayMonths: 12 }
    );

    expect(outcome.withdrawalSustainability).toBe(true);
    expect(outcome.portfolioValueAtWithdrawalStart).toBeCloseTo(1_200);
    expect(outcome.realPortfolioValueAtWithdrawalStart).toBeCloseTo(1_200);
    expect(outcome.finalValue).toBeCloseTo(600);
  });

  it('accumulates investment returns before measuring the withdrawal-start portfolio', () => {
    const sequence = flatSequence(24);
    sequence.assetBasketReturns.usEquity = Array.from({ length: 24 }, () => 0.01);
    const outcome = simulateWithdrawals(
      { ...balancedMapping, usEquityWeight: 1, internationalEquityWeight: 0, nominalBondsWeight: 0 },
      1_000,
      sequence,
      0,
      { withdrawalDelayMonths: 12 }
    );

    expect(outcome.portfolioValueAtWithdrawalStart).toBeCloseTo(1_000 * Math.pow(1.01, 12));
    expect(outcome.portfolioValueAtWithdrawalStart).toBeGreaterThan(1_000);
  });

  it('adds inflation-linked contributions only before withdrawals begin', () => {
    const outcome = simulateWithdrawals(
      balancedMapping,
      1_200,
      flatSequence(24),
      600,
      { withdrawalDelayMonths: 12, annualContributionAmount: 120 }
    );

    expect(outcome.portfolioValueAtWithdrawalStart).toBeCloseTo(1_320);
    expect(outcome.finalValue).toBeCloseTo(720);
  });

  it('rejects invalid contribution inputs', () => {
    expect(() => simulateWithdrawals(
      balancedMapping,
      1_200,
      flatSequence(12),
      0,
      { withdrawalDelayMonths: 12, annualContributionAmount: -1 }
    )).toThrow(/contributions/i);
  });

  it('compares flat, fixed-growth, and historical-CPI withdrawals from the same starting spending power', () => {
    const sequence = flatSequence(36);
    sequence.inflationRates = Array.from({ length: 36 }, () => 0.01);
    const shared = {
      withdrawalDelayMonths: 12,
    };

    const flat = simulateWithdrawals(
      balancedMapping,
      10_000,
      sequence,
      120,
      { ...shared, withdrawalPolicy: { type: 'flat_nominal' } }
    );
    const fixed = simulateWithdrawals(
      balancedMapping,
      10_000,
      sequence,
      120,
      { ...shared, withdrawalPolicy: { type: 'fixed_growth', annualRate: 0.12 } }
    );
    const cpi = simulateWithdrawals(
      balancedMapping,
      10_000,
      sequence,
      120,
      { ...shared, withdrawalPolicy: { type: 'historical_cpi' } }
    );

    expect(flat.realPortfolioValueAtWithdrawalStart).toBeCloseTo(fixed.realPortfolioValueAtWithdrawalStart);
    expect(fixed.realPortfolioValueAtWithdrawalStart).toBeCloseTo(cpi.realPortfolioValueAtWithdrawalStart);
    expect(flat.finalValue).toBeGreaterThan(fixed.finalValue);
    expect(fixed.finalValue).toBeGreaterThan(cpi.finalValue);
  });

  it('uses the same first withdrawal for every growth policy', () => {
    const sequence = flatSequence(1);
    sequence.inflationRates = [0.01];
    const policies = [
      { type: 'flat_nominal' as const },
      { type: 'fixed_growth' as const, annualRate: 0.03 },
      { type: 'historical_cpi' as const },
    ];
    const finalValues = policies.map((withdrawalPolicy) => simulateWithdrawals(
      balancedMapping,
      10_000,
      sequence,
      120,
      { withdrawalPolicy }
    ).finalValue);

    expect(finalValues[0]).toBeCloseTo(finalValues[1]);
    expect(finalValues[1]).toBeCloseTo(finalValues[2]);
  });

  it('rejects an invalid fixed withdrawal growth rate', () => {
    expect(() => simulateWithdrawals(
      balancedMapping,
      10_000,
      flatSequence(12),
      120,
      { withdrawalPolicy: { type: 'fixed_growth', annualRate: -1 } }
    )).toThrow(/Fixed withdrawal growth/);
  });

  it('builds a full accumulation and withdrawal timeline', () => {
    expect(buildRetirementTimeline({
      currentAge: 45,
      retirementAge: 65,
      withdrawalStartAge: 65,
      lifeExpectancy: 95,
    })).toEqual({
      yearsToRetirement: 20,
      yearsToWithdrawalStart: 20,
      withdrawalYears: 30,
      totalAnalysisYears: 50,
      withdrawalDelayMonths: 240,
    });
  });

  it('computes coverage from the checked historical proxy dataset', () => {
    expect(calculateHistoricalPriceCoverage(balancedMapping)).toBe(1);
  });

  it('keeps historical withdrawal-rate percentiles invariant to normalized start value', () => {
    const sequences = [flatSequence(24)];

    expect(computeHistoricalWithdrawalRates(sequences, balancedMapping, 1_000)).toEqual(
      computeHistoricalWithdrawalRates(sequences, balancedMapping, 25_000)
    );
  });

  it('describes the independent French international history and its scope', () => {
    const quality = calculateDataQuality([], [], balancedMapping, 1, []);

    expect(quality.proxyUsage.internationalEquityProxy).toContain('EAFE-plus-Canada');
    expect(quality.missingData).not.toContain(
      'Independent international equity return history is unavailable; US equity returns are used as its proxy'
    );
  });

  it('loads the extended source-backed history and explicit international availability', () => {
    const history = loadHistoricalReturns();
    const month = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

    expect(history.dates).toHaveLength(1200);
    expect(month(history.dates[0])).toBe('1926-07');
    expect(month(history.dates[history.dates.length - 1])).toBe('2026-06');
    expect(history.intlEquityReturns[0]).toBeNull();
    expect(history.intlEquityReturns[history.dates.findIndex(date => month(date) === '1975-01')]).toBeCloseTo(0.1779);
    expect(history.intlEquityReturns[history.dates.findIndex(date => month(date) === '2026-01')]).toBeNull();
    expect(history.metadata?.series.intl_equity.firstMonth).toBe('1975-01');
  });

  it('aligns Shiller bond returns to the month in which they were earned', () => {
    const history = loadHistoricalReturns();
    const workbook = XLSX.readFile(join(process.cwd(), 'src/datasets/ie_data.xls'));
    const sheet = workbook.Sheets.Data;
    let february1970Row = -1;
    for (let row = 8; row < 2_000; row++) {
      if (sheet[XLSX.utils.encode_cell({ r: row, c: 0 })]?.v === 1970.02) {
        february1970Row = row;
        break;
      }
    }
    expect(february1970Row).toBeGreaterThan(8);
    const januaryForwardBondGross = Number(
      sheet[XLSX.utils.encode_cell({ r: february1970Row - 1, c: 17 })]?.v
    );
    const historyIndex = history.dates.findIndex(
      date => date.getUTCFullYear() === 1970 && date.getUTCMonth() === 1
    );

    expect(history.bondReturns[historyIndex]).toBeCloseTo(januaryForwardBondGross - 1, 6);
  });

  it('selects source history based on active sleeves', async () => {
    const usOnly = { ...balancedMapping, usEquityWeight: 1, internationalEquityWeight: 0, nominalBondsWeight: 0 };
    const usResult = await generateRollingSequences(30, usOnly);
    const internationalResult = await generateRollingSequences(30, balancedMapping);

    expect(usResult.sequences).toHaveLength(841);
    expect(usResult.historicalData?.firstMonth).toBe('1926-07');
    expect(internationalResult.sequences).toHaveLength(253);
    expect(internationalResult.historicalData?.firstMonth).toBe('1975-01');
    expect(internationalResult.historicalData?.lastMonth).toBe('2025-12');
  });

  it('rejects a horizon longer than the active-sleeve history', async () => {
    await expect(generateRollingSequences(60, balancedMapping)).rejects.toBeInstanceOf(
      InsufficientHistoricalDataError
    );
  });

  const rejectionOf = async (
    run: Promise<unknown>
  ): Promise<InsufficientHistoricalDataError> => {
    try {
      await run;
    } catch (error) {
      if (error instanceof InsufficientHistoricalDataError) return error;
      throw error;
    }
    throw new Error('Expected InsufficientHistoricalDataError, but the call resolved');
  };

  it('reports the longest horizon it could model, and what shortened it', async () => {
    const error = await rejectionOf(generateRollingSequences(60, balancedMapping));

    expect(error.maxTimelineYears).toBe(51);
    expect(error.limitedByInternationalHistory).toBe(true);
    expect(error.firstMonth).toBe('1975-01');
    expect(error.lastMonth).toBe('2025-12');
  });

  it('offers no horizon at all when the record is below the engine minimum', async () => {
    // A 60-year floor is longer than the international record, so nothing works.
    const error = await rejectionOf(generateRollingSequences(30, balancedMapping, 60));

    expect(error.maxTimelineYears).toBe(0);
  });

  it('does not blame the international sleeve when the whole record is too short', async () => {
    const usOnly = { ...balancedMapping, usEquityWeight: 1, internationalEquityWeight: 0, nominalBondsWeight: 0 };
    const error = await rejectionOf(generateRollingSequences(120, usOnly));

    expect(error.limitedByInternationalHistory).toBe(false);
    expect(error.maxTimelineYears).toBe(100);
  });

  it('fingerprints the generated dataset, not only the upstream source snapshots', () => {
    const digest = (relativePath: string) =>
      createHash('sha256').update(readFileSync(join(process.cwd(), relativePath))).digest('hex');
    const version = getHistoricalDatasetVersion();

    // A builder correction changes the generated returns without moving any
    // source hash, so a version built from sources alone would leave stale
    // analyses cached. Both generated files must be in the fingerprint.
    expect(version).toContain(digest('data/historical_market_returns.csv'));
    expect(version).toContain(digest('data/historical_market_returns.metadata.json'));
  });

  it('keeps the checked-in source snapshots in sync with their recorded provenance', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'src/datasets/source-manifest.json'), 'utf8')
    ) as {
      sources: Record<string, { file: string; sha256: string }>;
    };
    const metadataSources = loadHistoricalReturns().metadata?.sources ?? {};

    expect(Object.keys(manifest.sources).sort()).toEqual(Object.keys(metadataSources).sort());
    for (const [key, source] of Object.entries(manifest.sources)) {
      const actual = createHash('sha256')
        .update(readFileSync(join(process.cwd(), source.file)))
        .digest('hex');
      expect(actual).toBe(source.sha256);
      expect(metadataSources[key].sha256).toBe(source.sha256);
    }
  });

  it('rejects blank historical return cells instead of coercing them to zero', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ask-linc-history-'));
    const csvPath = join(directory, 'returns.csv');
    writeFileSync(
      csvPath,
      'date,us_equity,intl_equity,bonds,cash,inflation\n2000-01,0.01,,0.003,0.001,0.002\n'
    );

    try {
      expect(() => loadHistoricalReturns(csvPath)).toThrow('Invalid historical return row 2');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
