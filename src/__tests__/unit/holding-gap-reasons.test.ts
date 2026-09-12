import { describe, expect, it } from '@jest/globals';
import { mapPortfolioToAssetBasket } from '../../retirement-analytics/engine/portfolio-mapper';
import {
  hasBondNameSignal,
  hasTreasuryAbbreviationSignal,
} from '../../retirement-analytics/engine/asset-classification';

const AS_OF = '2026-09-01';

/**
 * Build a one-holding portfolio from a custodian label alone.
 *
 * Deliberately no ticker and no security type: that is how the holdings in
 * this file actually arrive -- employer-plan share classes and individual
 * Treasury lines are identified by CUSIP, which we do not carry, so the name
 * is the only evidence the mapper has.
 */
function mapOne(name: string, overrides: Record<string, unknown> = {}) {
  const security = { security_id: 's1', name, type: '', ...overrides } as any;
  const holding = {
    security_id: 's1',
    security_name: name,
    institution_value: 10_000,
    ...overrides,
  } as any;
  return mapPortfolioToAssetBasket([holding], [security], 10_000, undefined, new Map(), AS_OF);
}

describe('individual Treasury lines', () => {
  it('reads the UST abbreviation custodians actually send', () => {
    // These are the real labels from the data-gaps report. Every one of them
    // is a nominal Treasury, and the engine has had a return series for that
    // sleeve since 1926 -- they were excluded only because the signal list
    // knew the word "treasury" and not the abbreviation.
    expect(hasTreasuryAbbreviationSignal('UST 3.5% 02/15/2029')).toBe(true);
    expect(hasTreasuryAbbreviationSignal('UST 0.0% 02/18/2027')).toBe(true);
    expect(hasTreasuryAbbreviationSignal('UST 0% 10/29/2026')).toBe(true);
    expect(hasTreasuryAbbreviationSignal('UST 3.375% 11/30/2027')).toBe(true);
    expect(hasBondNameSignal('UST 3.625% 09/30/2030')).toBe(true);
  });

  it('requires the instrument shape, so the letters alone are never enough', () => {
    // `UST` has been a listed equity ticker and can sit inside a company name.
    // Without a coupon or a maturity there is no evidence this is a bond.
    expect(hasTreasuryAbbreviationSignal('UST Inc')).toBe(false);
    expect(hasTreasuryAbbreviationSignal('UST Global Holdings')).toBe(false);
    // `ust` inside another word is not the abbreviation.
    expect(hasTreasuryAbbreviationSignal('Phillips Street Trust 0.5%')).toBe(false);
  });

  it('puts a UST line in the nominal bond sleeve instead of excluding it', async () => {
    const mapping = await mapOne('UST 3.5% 02/15/2029');

    expect(mapping.nominalBondsValue).toBe(10_000);
    expect(mapping.valueCoverage).toBe(1);
    expect(mapping.unmappedHoldings).toEqual([]);
  });
});

describe('why a holding produced no modeled exposure', () => {
  it('separates an equity fund missing only its geography from an unreadable one', async () => {
    // "Large Cap Growth Fund" resolves as equity; only the US/international
    // split is missing, so the remedy is country data -- not, as the single
    // `unmapped` bucket implied, an asset class we failed to read.
    const equity = await mapOne('Large Cap Growth Fund');
    expect(equity.equityGeographyUnresolvedHoldings).toEqual(['Large Cap Growth Fund']);
    expect(equity.unrecognizedHoldings).toEqual([]);
    expect(equity.holdingExposures[0].unresolvedReason).toBe('equity-geography-unresolved');

    const opaque = await mapOne('Guaranteed Interest Account');
    expect(opaque.unrecognizedHoldings).toEqual(['Guaranteed Interest Account']);
    expect(opaque.equityGeographyUnresolvedHoldings).toEqual([]);
    expect(opaque.holdingExposures[0].unresolvedReason).toBe('unrecognized');
  });

  it('does not treat a ticker-only mutual fund as equity missing geography', async () => {
    // Five-character tickers ending in X are conventionally mutual funds.
    // With no name or type, the ticker shape alone does not establish an
    // equity mandate — VBTLX is a bond fund — so the remedy is still "we
    // could not read this," not country data for an equity we never saw.
    const mapping = await mapOne('', { ticker_symbol: 'VBTLX' });

    expect(mapping.unrecognizedHoldings).toEqual(['VBTLX']);
    expect(mapping.equityGeographyUnresolvedHoldings).toEqual([]);
    expect(mapping.holdingExposures[0].unresolvedReason).toBe('unrecognized');
  });

  it('names a recognized target-date fund that has no registry row', async () => {
    // The remedy here is a registry entry we write from UC's published fact
    // sheet, not a vendor feed. Reporting it as "no asset class resolved" sent
    // an operator looking for the wrong thing entirely.
    const mapping = await mapOne('UC PATHWAY 2040');

    expect(mapping.targetDateUnregisteredHoldings).toEqual(['UC PATHWAY 2040']);
    expect(mapping.unrecognizedHoldings).toEqual([]);
    expect(mapping.holdingExposures[0].targetDateIdentity).toMatchObject({
      provider: 'uc',
      series: 'pathway',
      vintage: 2040,
    });
  });

  it('partitions the unmapped bucket rather than extending it', async () => {
    const mapping = await mapPortfolioToAssetBasket(
      [
        { security_id: 'a', security_name: 'Large Cap Growth Fund', institution_value: 1_000 },
        { security_id: 'b', security_name: 'UC PATHWAY 2040', institution_value: 1_000 },
        { security_id: 'c', security_name: 'Guaranteed Interest Account', institution_value: 1_000 },
        { security_id: 'd', security_name: 'UST 3.5% 02/15/2029', institution_value: 1_000 },
      ] as any[],
      [
        { security_id: 'a', name: 'Large Cap Growth Fund', type: '' },
        { security_id: 'b', name: 'UC PATHWAY 2040', type: '' },
        { security_id: 'c', name: 'Guaranteed Interest Account', type: '' },
        { security_id: 'd', name: 'UST 3.5% 02/15/2029', type: '' },
      ] as any[],
      4_000,
      undefined,
      new Map(),
      AS_OF,
    );

    const split = [
      ...mapping.unrecognizedHoldings,
      ...mapping.equityGeographyUnresolvedHoldings,
      ...mapping.targetDateUnregisteredHoldings,
    ];
    // Every split label is in `unmappedHoldings` and the counts match, so a
    // consumer reading both would double-count rather than see more.
    expect(split.sort()).toEqual([...mapping.unmappedHoldings].sort());
  });
});

describe('a mostly modeled holding is not a classification gap', () => {
  it('reports a registry target-date fund as partially mapped, not unsupported', async () => {
    // State Street 2030 is in the registry and simulates; only its TIPS and
    // commodity sleeves are withheld. Listing it beside genuinely unreadable
    // securities told an operator to go and source an allocation we hold.
    const mapping = await mapOne('State St Target Ret 2030 SL SF CL III');

    expect(mapping.mappedValue).toBeGreaterThan(0);
    expect(mapping.partiallyMappedHoldings).toEqual(['State St Target Ret 2030 SL SF CL III']);
    expect(mapping.unsupportedHoldings).toEqual([]);
    expect(mapping.unmappedHoldings).toEqual([]);
  });

  it('still reports a holding with no modeled value at all as unsupported', async () => {
    // A pure credit ETF is classified correctly and has no supported series:
    // nothing about it is modeled, so it stays a real gap.
    const mapping = await mapOne('iShares iBoxx $ Investment Grade Corporate Bond ETF', {
      ticker_symbol: 'LQD',
      type: 'etf',
    });

    expect(mapping.mappedValue).toBe(0);
    expect(mapping.unsupportedHoldings).toEqual([
      'iShares iBoxx $ Investment Grade Corporate Bond ETF',
    ]);
    expect(mapping.partiallyMappedHoldings).toEqual([]);
  });
});

describe("the custodian's cash-equivalent flag", () => {
  it('places a sweep vehicle the provider type alone cannot describe', async () => {
    // "Mutual Fund" is a wrapper, not an exposure, and this fund's name carries
    // no cash signal. Plaid's own boolean is the only evidence there is.
    const mapping = await mapOne('Fidelity Phillips Street Trust', {
      type: 'mutual fund',
      is_cash_equivalent: true,
    });

    expect(mapping.cashValue).toBe(10_000);
    expect(mapping.holdingExposures[0].method).toBe('provider');
    expect(mapping.holdingExposures[0].confidence).toBe('high');
  });

  it('does not let the flag override a declared fixed-income type', async () => {
    // A bond fund a custodian also treats as liquid is still a bond fund.
    // Simulating it as cash would understate its return and its risk alike.
    const mapping = await mapOne('Ultra Short Bond Fund', {
      type: 'fixed income',
      is_cash_equivalent: true,
    });

    expect(mapping.nominalBondsValue).toBe(10_000);
    expect(mapping.cashValue).toBe(0);
  });

  it('leaves a security without the flag on its existing path', async () => {
    // Absent and false both mean "not asserted" -- neither may place a holding.
    const absent = await mapOne('Large Cap Growth Fund');
    expect(absent.cashValue).toBe(0);
    expect(absent.equityGeographyUnresolvedHoldings).toEqual(['Large Cap Growth Fund']);

    const explicitlyFalse = await mapOne('Large Cap Growth Fund', {
      is_cash_equivalent: false,
    });
    expect(explicitlyFalse.cashValue).toBe(0);
  });
});
