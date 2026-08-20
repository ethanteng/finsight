import { describe, expect, it } from '@jest/globals';
import {
  isTargetDateFund,
  resolveTargetDateFund,
  targetDateFundYear,
  targetDateGlidepath,
  TARGET_DATE_ASSET_TYPE,
} from '../../services/target-date-fund';
import { buildCanonicalInvestmentPortfolio } from '../../services/canonical-financial-snapshot';
import { mapPortfolioToAssetBasket } from '../../retirement-analytics/engine/portfolio-mapper';

describe('target-date fund recognition', () => {
  it('reads the target year through provider share-class noise', () => {
    // Real labels from a live portfolio: none carry a usable provider type.
    expect(targetDateFundYear('State St Target Ret 2040 SL SF CL III')).toBe(2040);
    expect(targetDateFundYear('BTC LPATH IDX 2040 N')).toBe(2040);
    expect(targetDateFundYear('UC PATHWAY 2040')).toBe(2040);
    expect(targetDateFundYear(
      'State Street Institutional Investment Trust - State Street Target Retir Cl 2030 Fd USD Cls I'
    )).toBe(2030);
    expect(targetDateFundYear('Fidelity Freedom 2045 Fund')).toBe(2045);
  });

  it('never reads a maturity date as a glidepath', () => {
    // A dated bond is the sharp case: treating "UST 3.875% 04/30/2030" as a
    // 2030 target-date fund would model a Treasury as 58% equity.
    expect(targetDateFundYear('UST 3.875% 04/30/2030')).toBeNull();
    expect(targetDateFundYear('UST 0.0% 05/14/2026')).toBeNull();
    expect(targetDateFundYear('iShs iBd Dec 25 Shs')).toBeNull();
    expect(targetDateFundYear('iShares iBonds Dec 2030 Term Treasury ETF')).toBeNull();
    expect(isTargetDateFund('Vanguard Total Stock Market ETF')).toBe(false);
  });

  it('requires a plausible year alongside the signal', () => {
    expect(targetDateFundYear('Target Retirement Income Fund')).toBeNull();
    expect(targetDateFundYear('LifePath Index Retirement Fund')).toBeNull();
  });

  it('reads identity from any supplied label, name or ticker', () => {
    expect(targetDateFundYear(null, undefined, 'LPATH 2050')).toBe(2050);
    expect(targetDateFundYear()).toBeNull();
    expect(targetDateFundYear('')).toBeNull();
  });

  it('de-risks as the target year approaches and levels at both ends', () => {
    expect(targetDateGlidepath(2050, 2026).equityShare).toBeCloseTo(0.9, 6); // clamped
    expect(targetDateGlidepath(2040, 2026).equityShare).toBeCloseTo(0.78, 6);
    expect(targetDateGlidepath(2035, 2026).equityShare).toBeCloseTo(0.68, 6);
    expect(targetDateGlidepath(2030, 2026).equityShare).toBeCloseTo(0.58, 6);
    expect(targetDateGlidepath(2026, 2026).equityShare).toBeCloseTo(0.5, 6);
    expect(targetDateGlidepath(2000, 2026).equityShare).toBeCloseTo(0.3, 6); // clamped
  });

  it('always splits the whole fund between equity and bonds', () => {
    for (const year of [2020, 2030, 2040, 2060]) {
      const fund = targetDateGlidepath(year, 2026);
      expect(fund.equityShare + fund.bondShare).toBeCloseTo(1, 10);
    }
  });

  it('resolves the same split for the same data regardless of when it runs', () => {
    // asOfYear is a parameter, not a clock read, so replays agree.
    expect(resolveTargetDateFund(['State St Target Ret 2040'], 2026)?.equityShare)
      .toBe(resolveTargetDateFund(['State St Target Ret 2040'], 2026)?.equityShare);
    expect(resolveTargetDateFund(['UST 4.0% 03/31/2030'], 2026)).toBeNull();
  });
});

describe('target-date funds in the allocation view', () => {
  it('gives a target-date fund its own bucket instead of the provider type', () => {
    const portfolio = buildCanonicalInvestmentPortfolio(
      [
        { id: 'td', account_id: 'a', security_id: 'td', institution_value: 64_183.47, iso_currency_code: 'USD' },
        { id: 'stock', account_id: 'a', security_id: 'stock', institution_value: 10_000, iso_currency_code: 'USD' },
      ],
      [
        // Typed "mutual fund" by the provider, which says nothing about the mix.
        { security_id: 'td', type: 'mutual fund', name: 'State St Target Ret 2040 SL SF CL III' },
        { security_id: 'stock', type: 'equity', name: 'Wells Fargo & Co.' },
      ],
      [],
      'USD'
    );

    const buckets = Object.fromEntries(portfolio.assetAllocation.map(a => [a.type, a.value]));
    expect(buckets[TARGET_DATE_ASSET_TYPE]).toBeCloseTo(64_183.47, 2);
    expect(buckets['Mutual Fund']).toBeUndefined();
    expect(buckets['Equity']).toBeCloseTo(10_000, 2);
  });

  it('recognizes one the provider gave no type at all', () => {
    const portfolio = buildCanonicalInvestmentPortfolio(
      [{ id: 'h', account_id: 'a', security_id: 'lp', institution_value: 188_369.7, iso_currency_code: 'USD' }],
      [{ security_id: 'lp', type: 'Unknown', name: 'BTC LPATH IDX 2040 N', ticker_symbol: 'O7PE' }],
      [],
      'USD'
    );

    expect(portfolio.assetAllocation).toEqual([
      { type: TARGET_DATE_ASSET_TYPE, value: 188_369.7, percentage: 100 },
    ]);
  });
});

describe('target-date funds in retirement mapping', () => {
  const securities = [
    { security_id: 'lp', type: 'Unknown', name: 'BTC LPATH IDX 2040 N', ticker_symbol: 'O7PE' },
  ] as any[];
  const holdings = [
    { security_id: 'lp', ticker_symbol: 'O7PE', security_name: 'BTC LPATH IDX 2040 N', institution_value: 100_000 },
  ] as any[];

  it('maps by glidepath rather than by a ticker that merely looks like a stock', () => {
    // O7PE is four letters, so the generic heuristic previously inferred it as
    // 100% equity -- a de-risking 2040 fund modeled as all stocks.
    return mapPortfolioToAssetBasket(holdings, securities, 100_000, undefined, new Map(), 2026)
      .then(mapping => {
        expect(mapping.nominalBondsWeight).toBeCloseTo(0.22, 6);
        expect(mapping.usEquityWeight).toBeCloseTo(0.78 * 0.7, 6);
        expect(mapping.internationalEquityWeight).toBeCloseTo(0.78 * 0.3, 6);
        expect(mapping.unmappedHoldings).toEqual([]);
        expect(mapping.targetDateFunds).toEqual([
          { label: 'BTC LPATH IDX 2040 N', targetYear: 2040, equityShare: 0.78 },
        ]);
      });
  });

  it('maps one with no ticker, which was dropped from the basket entirely', async () => {
    const mapping = await mapPortfolioToAssetBasket(
      [{ security_id: 'ss', ticker_symbol: null, security_name: 'State St Target Ret 2030 SL SF CL III', institution_value: 24_079.23 }] as any[],
      [{ security_id: 'ss', type: 'mutual fund', name: 'State St Target Ret 2030 SL SF CL III', ticker_symbol: null }] as any[],
      24_079.23,
      undefined,
      new Map(),
      2026
    );

    expect(mapping.unmappedHoldings).toEqual([]);
    expect(mapping.nominalBondsWeight).toBeCloseTo(0.42, 6);
  });

  it('leaves a dated Treasury in bonds rather than on a glidepath', async () => {
    const mapping = await mapPortfolioToAssetBasket(
      [{ security_id: 'ust', ticker_symbol: '91282CMZ1-BOND', security_name: 'UST 3.875% 04/30/2030', institution_value: 12_902.4, security_type: 'Fixed Income' }] as any[],
      [{ security_id: 'ust', type: 'Fixed Income', name: 'UST 3.875% 04/30/2030', ticker_symbol: '91282CMZ1-BOND' }] as any[],
      12_902.4,
      undefined,
      new Map(),
      2026
    );

    expect(mapping.nominalBondsWeight).toBeCloseTo(1, 6);
    expect(mapping.targetDateFunds).toEqual([]);
  });
});
