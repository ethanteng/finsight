import { describe, expect, it } from '@jest/globals';
import {
  identifyTargetDateFund,
  isTargetDateFund,
  targetDateFundYear,
  TARGET_DATE_ASSET_TYPE,
} from '../../services/target-date-fund';
import { lookupTargetDateAllocation } from '../../services/target-date-fund-registry';
import { buildCanonicalInvestmentPortfolio } from '../../services/canonical-financial-snapshot';
import { mapPortfolioToAssetBasket, populateAssumptions } from '../../retirement-analytics/engine/portfolio-mapper';
import {
  calculateConfidenceCeiling,
  calculateDataQuality,
} from '../../retirement-analytics/interpretation/uncertainty-quantifier';

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

  it('recognizes provider, series, and vintage without implying an allocation', () => {
    expect(identifyTargetDateFund('State St Target Ret 2040 SL SF CL III')).toEqual({
      provider: 'state-street',
      series: 'target-retirement',
      vintage: 2040,
    });
    expect(identifyTargetDateFund(['BTC LPATH IDX 2040 N', 'O7PE'])).toEqual({
      provider: 'blackrock',
      series: 'lifepath-index',
      vintage: 2040,
    });
    expect(identifyTargetDateFund('UC PATHWAY 2040')).toEqual({
      provider: 'uc',
      series: 'pathway',
      vintage: 2040,
    });
    expect(identifyTargetDateFund('Target Date 2035 Fund')).toEqual({
      series: 'target-date',
      vintage: 2035,
    });
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

  it('requires an exact registered identity before returning an allocation', () => {
    const stateStreet = identifyTargetDateFund('State St Target Ret 2040 SL SF CL III')!;
    expect(lookupTargetDateAllocation(stateStreet, '2026-06-29')).toBeNull();
    expect(lookupTargetDateAllocation(stateStreet, '2026-06-30')).toMatchObject({
      identity: stateStreet,
      allocationAsOf: '2026-06-30',
      exactAllocation: false,
    });
    expect(lookupTargetDateAllocation(
      { provider: 'state-street', series: 'another-series', vintage: 2040 },
      '2026-12-31',
    )).toBeNull();
  });

  it('keeps recognized but unsourced series allocation-unavailable', () => {
    for (const label of [
      'UC PATHWAY 2040',
      'Fidelity Freedom 2040 Fund',
      'Target Date 2040 Fund',
    ]) {
      const identity = identifyTargetDateFund(label)!;
      expect(identity.vintage).toBe(2040);
      expect(lookupTargetDateAllocation(identity, '2026-12-31')).toBeNull();
    }
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

  it('keeps an unsourced UC Pathway holding in the target-date display bucket', () => {
    const portfolio = buildCanonicalInvestmentPortfolio(
      [{ id: 'h', account_id: 'a', security_id: 'uc', institution_value: 25_000, iso_currency_code: 'USD' }],
      [{ security_id: 'uc', type: 'mutual fund', name: 'UC PATHWAY 2040' }],
      [],
      'USD',
    );

    expect(portfolio.assetAllocation).toEqual([
      { type: TARGET_DATE_ASSET_TYPE, value: 25_000, percentage: 100 },
    ]);
  });

  it('lets a declared fixed-income type veto a target-like label in the allocation view', () => {
    const portfolio = buildCanonicalInvestmentPortfolio(
      [{
        id: 'h',
        account_id: 'a',
        security_id: 'note',
        institution_value: 10_000,
        iso_currency_code: 'USD',
        security_type: 'Fixed Income',
      }],
      [{ security_id: 'note', type: 'mutual fund', name: 'Pathway Capital 2030 Senior Notes' }],
      [],
      'USD'
    );

    expect(portfolio.assetAllocation).toEqual([
      { type: 'Fixed Income', value: 10_000, percentage: 100 },
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

  it('maps the same BlackRock share class with its plan-sponsor source context', () => {
    // O7PE contains a digit and did not match the old letters-only stock regex;
    // the sourced registry is what makes this previously unmapped holding usable.
    return mapPortfolioToAssetBasket(holdings, securities, 100_000, undefined, new Map(), 2026)
      .then(mapping => {
        expect(mapping.nominalBondsWeight).toBeCloseTo(0.2276 / 0.9747, 6);
        expect(mapping.usEquityWeight).toBeCloseTo(0.4773 / 0.9747, 6);
        expect(mapping.internationalEquityWeight).toBeCloseTo(0.2698 / 0.9747, 6);
        expect(mapping.mappedValue).toBeCloseTo(97_470, 2);
        expect(mapping.unmappedValue).toBeCloseTo(2_530, 2);
        expect(mapping.unmappedHoldings).toEqual([]);
        expect(mapping.partiallyMappedHoldings).toEqual(['BTC LPATH IDX 2040 N']);
        expect(mapping.targetDateFunds).toHaveLength(1);
        expect(mapping.targetDateFunds[0]).toMatchObject({
          label: 'BTC LPATH IDX 2040 N',
          provider: 'blackrock',
          series: 'lifepath-index',
          vintage: 2040,
          equityShare: 0.7471,
          allocationAsOf: '2026-03-31',
          allocationAgeDays: 275,
          staleAllocation: false,
          sourceUrl: 'https://assets.mersofmich.com/forms/MERS_LifePath_2040.pdf',
          sourceContext: 'MERS plan-sponsor fact sheet for the BlackRock LifePath Fund N share class; no separate TIPS weight is published in its holdings',
          exactAllocation: true,
        });
        expect(mapping.holdingExposures[0].weights?.tips).toBe(0);
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
    expect(mapping.partiallyMappedHoldings).toEqual(['State St Target Ret 2030 SL SF CL III']);
    expect(mapping.holdingExposures[0].weights?.tips).toBeCloseTo(0.1207, 6);
    expect(mapping.nominalBondsWeight).toBeCloseTo((0.311 + 0.1207) / 0.9577, 6);
    expect(mapping.valueCoverage).toBeCloseTo(0.9577, 6);
  });

  it.each([
    [2025, 0.1793],
    [2030, 0.1207],
    [2035, 0.0293],
    [2040, 0],
    [2050, 0],
  ])('preserves the published State Street %i TIPS sleeve', async (targetYear, tipsWeight) => {
    const name = `State St Target Ret ${targetYear} SL SF CL III`;
    const mapping = await mapPortfolioToAssetBasket(
      [{ security_id: 'ss', security_name: name, institution_value: 100_000 }] as any[],
      [{ security_id: 'ss', type: 'mutual fund', name }] as any[],
      100_000,
      undefined,
      new Map(),
      2026,
    );

    expect(mapping.holdingExposures[0].weights?.tips).toBeCloseTo(tipsWeight, 6);
    expect(mapping.targetDateFunds[0].provider).toBe('state-street');
  });

  it('keeps supported cash while excluding unsupported target-date sleeves', async () => {
    const mapping = await mapPortfolioToAssetBasket(
      [{ security_id: 'ss', security_name: 'State St Target Ret 2035 SL SF CL III', institution_value: 100_000 }] as any[],
      [{ security_id: 'ss', type: 'mutual fund', name: 'State St Target Ret 2035 SL SF CL III' }] as any[],
      100_000,
      undefined,
      new Map(),
      2026,
    );

    expect(mapping.holdingExposures[0].weights?.tips).toBeCloseTo(0.0293, 6);
    expect(mapping.mappedValue).toBeCloseTo(99_270, 2);
    expect(mapping.unmappedValue).toBeCloseTo(730, 2);
    expect(mapping.cashWeight).toBeCloseTo(0.0019 / 0.9927, 8);
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

  it('recognizes an unmatched target-date fund without inventing an allocation', async () => {
    const mapping = await mapPortfolioToAssetBasket(
      [{ security_id: 'uc', security_name: 'UC PATHWAY 2040', institution_value: 25_000 }] as any[],
      [{ security_id: 'uc', name: 'UC PATHWAY 2040', type: 'mutual fund' }] as any[],
      25_000,
      undefined,
      new Map(),
      2026,
    );

    expect(mapping.targetDateFunds).toEqual([]);
    expect(mapping.holdingExposures[0].targetDateIdentity).toEqual({
      provider: 'uc',
      series: 'pathway',
      vintage: 2040,
    });
    expect(mapping.holdingExposures[0]).toMatchObject({
      status: 'unmapped',
      method: 'name-inference',
    });
    expect(mapping.mappedValue).toBe(0);
    expect(mapping.unmappedValue).toBe(25_000);
    expect(mapping.valueCoverage).toBe(0);
  });

  it('does not borrow a reviewed provider allocation for another fund family', async () => {
    const mapping = await mapPortfolioToAssetBasket(
      [{ security_id: 'fidelity', security_name: 'Fidelity Freedom 2040 Fund', institution_value: 25_000 }] as any[],
      [{ security_id: 'fidelity', name: 'Fidelity Freedom 2040 Fund', type: 'mutual fund' }] as any[],
      25_000,
      undefined,
      new Map(),
      '2026-12-31',
    );

    expect(mapping.holdingExposures[0]).toMatchObject({
      targetDateIdentity: {
        provider: 'fidelity',
        series: 'freedom',
        vintage: 2040,
      },
      status: 'unmapped',
      method: 'name-inference',
    });
    expect(mapping.holdingExposures[0].weights).toBeUndefined();
    expect(mapping.targetDateFunds).toEqual([]);
    expect(mapping.unmappedHoldings).toEqual(['Fidelity Freedom 2040 Fund']);
  });

  it('does not reuse a registry allocation for a different analysis year', async () => {
    const mapping = await mapPortfolioToAssetBasket(
      holdings,
      securities,
      100_000,
      undefined,
      new Map(),
      2025,
    );

    expect(mapping.mappedValue).toBe(0);
    expect(mapping.unmappedValue).toBe(100_000);
    expect(mapping.holdingExposures[0]).toMatchObject({
      status: 'unmapped',
      method: 'name-inference',
      targetDateIdentity: {
        provider: 'blackrock',
        series: 'lifepath-index',
        vintage: 2040,
      },
    });
  });

  it('enforces the BlackRock publication-date boundary', async () => {
    const beforePublication = await mapPortfolioToAssetBasket(
      holdings,
      securities,
      100_000,
      undefined,
      new Map(),
      '2026-03-30',
    );
    const onPublication = await mapPortfolioToAssetBasket(
      holdings,
      securities,
      100_000,
      undefined,
      new Map(),
      '2026-03-31',
    );

    expect(beforePublication.mappedValue).toBe(0);
    expect(beforePublication.targetDateFunds).toEqual([]);
    expect(onPublication.mappedValue).toBeCloseTo(97_470, 2);
    expect(onPublication.targetDateFunds[0]).toMatchObject({
      allocationAsOf: '2026-03-31',
      allocationAgeDays: 0,
    });
  });

  it('carries the newest eligible allocation into the following year', async () => {
    const mapping = await mapPortfolioToAssetBasket(
      holdings,
      securities,
      100_000,
      undefined,
      new Map(),
      '2027-01-15',
    );

    expect(mapping.mappedValue).toBeCloseTo(97_470, 2);
    expect(mapping.targetDateFunds[0]).toMatchObject({
      allocationAsOf: '2026-03-31',
      allocationAgeDays: 290,
      staleAllocation: false,
    });
  });

  it('discloses and lowers confidence for an allocation older than one year', async () => {
    const mapping = await mapPortfolioToAssetBasket(
      holdings,
      securities,
      100_000,
      undefined,
      new Map(),
      '2027-04-02',
    );

    expect(mapping.targetDateFunds[0].staleAllocation).toBe(true);
    expect(mapping.targetDateFunds[0].allocationAgeDays).toBe(367);
    expect(mapping.mappingConfidence).toBe('low');
    expect(calculateConfidenceCeiling(
      calculateDataQuality(holdings, securities, mapping, 1, []),
    )).toBe('low');
    expect(populateAssumptions(mapping, [], []).join(' ')).toContain('stale by 12 months');
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

  it('places plan funds whose names state an asset class and US geography', async () => {
    for (const [name, ticker] of [
      ['State St S&P Midcap Indx SL Cl XIV', 'SSPMCI'],
      ['State Street S&P 500 Indx SL Sr Fd Cl X', 'SSISLX'],
    ] as const) {
      const mapping = await map(name, ticker, 'mutual fund');
      expect(mapping.unmappedHoldings).toEqual([]);
      expect(mapping.usEquityWeight + mapping.internationalEquityWeight).toBeCloseTo(1, 6);
    }
  });

  it('does not infer US geography from a US employer-plan context', async () => {
    for (const [name, ticker] of [
      ['Large Cap Growth Fund', 'WLLCGR'],
      ['Large Cap Value Fund', 'WLLCVL'],
      ['Small Cap Fund', 'SPUSA061004C00000000'],
    ] as const) {
      const mapping = await map(name, ticker, 'mutual fund');
      expect(mapping.mappedValue).toBe(0);
      expect(mapping.unmappedValue).toBe(100_000);
      expect(mapping.holdingExposures[0]).toMatchObject({
        status: 'unmapped',
        method: 'name-inference',
      });
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

  it('leaves an equity fund unmodeled when its name carries no geography', async () => {
    const mapping = await map('Small Cap Fund', 'SPUSA061004C00000000', 'mutual fund');
    expect(mapping.mappedValue).toBe(0);
    expect(mapping.unmappedValue).toBe(100_000);
    expect(mapping.holdingExposures[0]).toMatchObject({
      status: 'unmapped',
      method: 'name-inference',
    });
    expect(populateAssumptions(mapping, [], []).join(' ')).not.toContain('70%');
  });

  it('describes target-date funds by year, split, and source—not by holding name', async () => {
    // The source metadata is enough to audit the split without putting holding
    // labels into analysis context for questions that never asked for detail.
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
      .find(text => text.startsWith('Target-date funds use'))!;

    expect(assumption).toContain('targeting 2040 at 75% equity');
    expect(assumption).toContain('1 targeting 2035 at 67% equity');
    expect(assumption).toContain('as of 2026-06-30');
    expect(assumption).toContain('as of 2026-03-31');
    expect(assumption).toContain('State Street Target Retirement');
    expect(assumption).toContain('BlackRock LifePath Index');
    expect(assumption).toContain('State Street public mutual-fund share class');
    expect(assumption).toContain('BlackRock LifePath Fund N share class');
    expect(assumption).not.toContain('Lifepath Index');
    expect(assumption.match(/Plan CIT has no public holdings/g)).toHaveLength(1);
    expect(assumption).not.toContain('State St Target Ret');
    expect(assumption).not.toContain('BTC LPATH IDX');
  });

  it('does not claim a fabricated geography assumption for target-date funds', async () => {
    const mapping = await map('State St Target Ret 2040 SL SF CL III', null, 'mutual fund');
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
      expect(mapping.mappingMethod).toBe('inferred');
    }
  });

  it('still reads a type that does name its exposure', async () => {
    // "fixed income fund" ends in "fund" but is not a container type.
    const mapping = await map('Some Plan Bond Option', 'XBONDX', 'fixed income fund');
    expect(mapping.nominalBondsWeight).toBeCloseTo(1, 6);
  });

  it('lets a declared fixed-income type outrank a target-date name signal', async () => {
    // A bond's name carries a year for its maturity, so a signal word next to
    // one would model it as mostly equity -- the same failure the Treasury case
    // prevents, reached through the name instead of the year. The provider said
    // fixed income; that outranks a word in the name.
    for (const [name, type] of [
      ['Pathway Capital 2030 Senior Notes', 'Fixed Income'],
      ['Freedom 2032 Municipal Bond Series', 'fixed income'],
      ['Retirement 2035 Income Note', 'bond'],
    ] as const) {
      const mapping = await map(name, 'XBND1', type);
      expect(mapping.nominalBondsWeight).toBeCloseTo(1, 6);
      expect(mapping.usEquityWeight).toBeCloseTo(0, 6);
      expect(mapping.targetDateFunds).toEqual([]);
    }
  });

  it('applies a holding-level fixed-income veto when the security type is only a wrapper', async () => {
    const mapping = await mapPortfolioToAssetBasket(
      [{
        security_id: 'note',
        security_name: 'Pathway Capital 2030 Senior Notes',
        security_type: 'Fixed Income',
        institution_value: 10_000,
      }] as any[],
      [{
        security_id: 'note',
        name: 'Pathway Capital 2030 Senior Notes',
        type: 'mutual fund',
      }] as any[],
      10_000,
      undefined,
      new Map(),
      '2026-08-21',
    );

    expect(mapping.holdingExposures[0]).toMatchObject({
      status: 'mapped',
      method: 'provider',
      weights: { nominalBonds: 1 },
    });
    expect(mapping.targetDateFunds).toEqual([]);
  });

  it('still recognizes target-date funds under the types they actually arrive with', async () => {
    // The guard must cost real funds nothing. Every target-date fund in the
    // verified portfolio arrives typed as a container or with no type at all --
    // none is typed fixed income -- so none of these may be suppressed.
    for (const type of ['mutual fund', 'Mutual Fund', 'Unknown', null, '']) {
      const mapping = await map('State St Target Ret 2040 SL SF CL III', 'O7PE', type);
      expect(mapping.targetDateFunds).toHaveLength(1);
      expect(mapping.targetDateFunds[0].vintage).toBe(2040);
      expect(mapping.nominalBondsWeight).toBeCloseTo(0.2467, 6);
      expect(mapping.targetDateFunds[0].allocationAsOf).toBe('2026-06-30');
    }
  });

  it('keeps a directly held stock domestic rather than splitting it 70/30', async () => {
    // The provider named a real asset class, so this is a security and not a
    // fund inferred from its name. Widening it would put "Wells Fargo & Co."
    // across two continents.
    const mapping = await map('Wells Fargo & Co.', 'WFC', 'equity');
    expect(mapping.usEquityWeight).toBeCloseTo(1, 6);
  });

  it('leaves a wrapper-typed fund with no geography unmodeled', async () => {
    const mapping = await map('Small Cap Fund', 'SPUSA061004C00000000', 'mutual fund');
    expect(mapping.mappedValue).toBe(0);
    expect(mapping.unmappedValue).toBe(1000);
  });

  it('routes a bond ETF to bonds through the metadata branch', async () => {
    const mapping = await map('iShares Core U.S. Aggregate Bond ETF', 'AGG', 'etf');
    expect(mapping.nominalBondsWeight).toBeCloseTo(1, 6);
    expect(mapping.mappingMethod).toBe('inferred');
  });

  it('leaves a bond ETF whose name hides it to the ticker list', async () => {
    // "JPMorgan Ultra-Short Income ETF" names no bond signal, so the metadata
    // branch declines it and inference catches it by known bond ticker.
    const mapping = await map('JPMorgan Ultra-Short Income ETF', 'JPST', 'etf');
    expect(mapping.nominalBondsWeight).toBeCloseTo(1, 6);
  });
});
