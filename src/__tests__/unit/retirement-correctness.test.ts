import { describe, expect, it } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mapPortfolioToAssetBasket } from '../../retirement-analytics/engine/portfolio-mapper';
import { analyzePortfolio } from '../../retirement-analytics/engine/portfolio-analyzer';
import { simulateWithdrawals } from '../../retirement-analytics/engine/withdrawal-simulator';
import { calculateHistoricalPriceCoverage } from '../../retirement-analytics/engine/stress-tester';
import { loadHistoricalReturns } from '../../retirement-analytics/engine/historical-data-loader';
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
  mappingConfidence: 'high',
  unmappedHoldings: [],
  mappingMethod: 'direct',
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
  it('splits global equity between US and international exposure', async () => {
    const holdings = [holding('world', 'VT')];
    const securities = [security('world', 'VT', 'Vanguard Total World Stock', 'equity')];

    const mapping = await mapPortfolioToAssetBasket(holdings, securities, 100);
    const metrics = await analyzePortfolio(holdings, securities);

    expect(mapping.usEquityWeight).toBeCloseTo(0.7);
    expect(mapping.internationalEquityWeight).toBeCloseTo(0.3);
    expect(metrics.equityAllocation).toBeCloseTo(100);
    expect(metrics.internationalAllocation).toBeCloseTo(30);
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

  it('describes the actual international historical proxy instead of claiming VXUS coverage', () => {
    const quality = calculateDataQuality([], [], balancedMapping, 1, []);

    expect(quality.proxyUsage.internationalEquityProxy).toContain('US equity history');
    expect(quality.missingData).toContain(
      'Independent international equity return history is unavailable; US equity returns are used as its proxy'
    );
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
