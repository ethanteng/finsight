import { describe, expect, it } from '@jest/globals';
import {
  isTargetDateFund,
  resolveTargetDateFund,
  targetDateFundYear,
  targetDateGlidepath,
  TARGET_DATE_ASSET_TYPE,
} from '../../services/target-date-fund';
import { buildCanonicalInvestmentPortfolio } from '../../services/canonical-financial-snapshot';
import { mapPortfolioToAssetBasket, populateAssumptions } from '../../retirement-analytics/engine/portfolio-mapper';

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

  it('prefers the target year over a trailing series or inception year', () => {
    expect(targetDateFundYear('Target Date 2035 Fund Series 2020')).toBe(2035);
  });

  it('still resolves a label that puts the year before the signal', () => {
    expect(targetDateFundYear('2040 Target Retirement Fund')).toBe(2040);
    // Largest US TDF family puts the year before "Target Date". A trailing
    // inception / share-class year after the signal must not steal it -- the
    // previous "first year after signal" rule returned 2015 / 2020 here.
    expect(targetDateFundYear('American Funds 2040 Target Date Retirement Fund')).toBe(2040);
    expect(
      targetDateFundYear('American Funds 2040 Target Date Retirement Fund Inception 2015')
    ).toBe(2040);
    expect(targetDateFundYear('2040 Target Retirement Fund Series 2020')).toBe(2040);
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

  it('keeps the target year when a later series or inception year also appears', () => {
    // Last-in-string would pick 2020 / 2015 and model the wrong glidepath.
    expect(targetDateFundYear('Target Date 2035 Fund Series 2020')).toBe(2035);
    expect(targetDateFundYear('State St Target Ret 2040 Trust (est. 2015)')).toBe(2040);
    expect(targetDateFundYear('2010 Vanguard Target Retirement 2050 Trust')).toBe(2050);
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

describe('institutional and employer-plan funds', () => {
  const map = (name: string, ticker: string | null, type: string | null, value = 100_000) =>
    mapPortfolioToAssetBasket(
      [{ security_id: 's', ticker_symbol: ticker, security_name: name, institution_value: value }] as any[],
      [{ security_id: 's', name, ticker_symbol: ticker, type }] as any[],
      value,
      undefined,
      new Map(),
      2026
    );

  it('places plan funds that state their mandate only in the name', async () => {
    // These fell out of the basket entirely: typed "Mutual Fund", tickers too
    // long to look like a stock symbol, names never checked.
    for (const [name, ticker] of [
      ['Large Cap Growth Fund', 'WLLCGR'],
      ['Large Cap Value Fund', 'WLLCVL'],
      ['Small Cap Fund', 'SPUSA061004C00000000'],
      ['State St S&P Midcap Indx SL Cl XIV', 'SSPMCI'],
      ['State Street S&P 500 Indx SL Sr Fd Cl X', 'SSISLX'],
    ] as const) {
      const mapping = await map(name, ticker, 'mutual fund');
      expect(mapping.unmappedHoldings).toEqual([]);
      expect(mapping.usEquityWeight + mapping.internationalEquityWeight).toBeCloseTo(1, 6);
    }
  });

  it('reads geography from the name instead of defaulting a US index fund abroad', async () => {
    const sp500 = await map('State Street S&P 500 Indx SL Sr Fd Cl X', 'SSISLX', 'mutual fund');
    expect(sp500.usEquityWeight).toBeCloseTo(1, 6);
    expect(sp500.internationalEquityWeight).toBeCloseTo(0, 6);
  });

  it('reads geography from the name instead of putting an international fund 70% in the US', async () => {
    const intl = await map('International Equity Fund', 'WLINEQ', 'mutual fund');
    expect(intl.internationalEquityWeight).toBeCloseTo(1, 6);
    expect(intl.usEquityWeight).toBeCloseTo(0, 6);
  });

  it('keeps the historical-average split when the name carries no geography', async () => {
    const mapping = await map('Small Cap Fund', 'SPUSA061004C00000000', 'mutual fund');
    expect(mapping.usEquityWeight).toBeCloseTo(0.7, 6);
    expect(mapping.internationalEquityWeight).toBeCloseTo(0.3, 6);
    expect(mapping.unclassifiedEquityCount).toBe(1);
    expect(populateAssumptions(mapping, [], [])).toContain(
      'Unclassified equity holdings split 70% US / 30% international based on historical averages'
    );
  });

  it('describes target-date funds by year and split, not by holding name', async () => {
    // The split is a function of the year alone, so naming the funds adds
    // nothing a reader needs -- and would put holding labels into the analysis
    // context for questions that never asked for investment detail.
    const mapping = await mapPortfolioToAssetBasket(
      [
        { security_id: 'a', security_name: 'State St Target Ret 2040 SL SF CL III', institution_value: 1000 },
        { security_id: 'b', security_name: 'BTC LPATH IDX 2040 N', ticker_symbol: 'O7PE', institution_value: 1000 },
        { security_id: 'c', security_name: 'State St Target Ret 2035 SL SF CL III', institution_value: 1000 },
      ] as any[],
      [] as any[],
      3000,
      undefined,
      new Map(),
      2026
    );
    const assumption = populateAssumptions(mapping, [], [])
      .find(text => text.startsWith('Target-date funds modeled'))!;

    expect(assumption).toContain('2 targeting 2040 at 78% equity');
    expect(assumption).toContain('1 targeting 2035 at 68% equity');
    expect(assumption).not.toContain('State St');
    expect(assumption).not.toContain('LPATH');
  });

  it('does not claim the 70/30 assumption when nothing took that split', async () => {
    // Codex review: a portfolio whose only inference was a recognized
    // target-date fund has no unclassified equity to describe.
    const mapping = await map('State St Target Ret 2040 SL SF CL III', null, 'mutual fund');
    expect(mapping.unclassifiedEquityCount).toBe(0);
    expect(populateAssumptions(mapping, [], []).join(' ')).not.toContain('Unclassified equity holdings split');
  });

  it('leaves a bond index fund in bonds despite its index-family name', async () => {
    const mapping = await map('Fidelity U.S. Bond Index Fund', 'FXNAX', 'Mutual Fund');
    expect(mapping.nominalBondsWeight).toBeCloseTo(1, 6);
  });

  it('places a government cash reserve in cash, not equity', async () => {
    // FDRXX is five letters, so the stock-ticker fallback had been modeling a
    // money-market fund as stocks.
    const mapping = await map('Fidelity Phillips Street Trust - Fidelity Government Cash Reserves', 'FDRXX', 'Mutual Fund');
    expect(mapping.cashWeight).toBeCloseTo(1, 6);
    expect(mapping.usEquityWeight).toBeCloseTo(0, 6);
  });

  it('keeps a Treasury money market in cash rather than bonds', async () => {
    const mapping = await map('Vanguard Treasury Money Market Fund', 'VUSXX', 'Mutual Fund');
    expect(mapping.cashWeight).toBeCloseTo(1, 6);
    expect(mapping.nominalBondsWeight).toBeCloseTo(0, 6);
  });
});

describe('container provider types', () => {
  const map = (name: string, ticker: string | null, type: string | null) =>
    mapPortfolioToAssetBasket(
      [{ security_id: 's', ticker_symbol: ticker, security_name: name, institution_value: 1000 }] as any[],
      [{ security_id: 's', name, ticker_symbol: ticker, type }] as any[],
      1000,
      undefined,
      new Map(),
      2026
    );

  it('does not treat a wrapper type as an asset class', async () => {
    // "ETF" and "Mutual Fund" describe packaging. Treating them as a class sent
    // every such holding past the metadata branch into crude inference, so the
    // provider's own country split and geographic focus were never consulted.
    for (const type of ['etf', 'ETF', 'mutual fund', 'Collective Trust', 'separate account']) {
      const mapping = await map('Vanguard Total Stock Market Index', 'VTI', type);
      expect(mapping.usEquityWeight).toBeCloseTo(1, 6);
      expect(mapping.unmappedHoldings).toEqual([]);
      // Placed from provider metadata plus the name, not guessed.
      expect(mapping.mappingMethod).toBe('direct');
    }
  });

  it('still reads a type that does name its exposure', async () => {
    // "fixed income fund" ends in "fund" but is not a container type.
    const mapping = await map('Some Plan Bond Option', 'XBONDX', 'fixed income fund');
    expect(mapping.nominalBondsWeight).toBeCloseTo(1, 6);
  });

  it('keeps a directly held stock domestic rather than splitting it 70/30', async () => {
    // The provider named a real asset class, so this is a security and not a
    // fund inferred from its name. Widening it would put "Wells Fargo & Co."
    // across two continents.
    const mapping = await map('Wells Fargo & Co.', 'WFC', 'equity');
    expect(mapping.usEquityWeight).toBeCloseTo(1, 6);
    expect(mapping.unclassifiedEquityCount).toBe(0);
  });

  it('gives a wrapper-typed fund with no geography the documented split', async () => {
    const mapping = await map('Small Cap Fund', 'SPUSA061004C00000000', 'mutual fund');
    expect(mapping.usEquityWeight).toBeCloseTo(0.7, 6);
    expect(mapping.internationalEquityWeight).toBeCloseTo(0.3, 6);
    expect(mapping.unclassifiedEquityCount).toBe(1);
  });

  it('routes a bond ETF to bonds through the metadata branch', async () => {
    const mapping = await map('iShares Core U.S. Aggregate Bond ETF', 'AGG', 'etf');
    expect(mapping.nominalBondsWeight).toBeCloseTo(1, 6);
    expect(mapping.mappingMethod).toBe('direct');
  });

  it('leaves a bond ETF whose name hides it to the ticker list', async () => {
    // "JPMorgan Ultra-Short Income ETF" names no bond signal, so the metadata
    // branch declines it and inference catches it by known bond ticker.
    const mapping = await map('JPMorgan Ultra-Short Income ETF', 'JPST', 'etf');
    expect(mapping.nominalBondsWeight).toBeCloseTo(1, 6);
  });
});
