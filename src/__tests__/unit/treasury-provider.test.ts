import { describe, expect, it, beforeEach } from '@jest/globals';
import { TreasuryProvider } from '../../retirement-analytics/data/providers/treasury-provider';
import { cacheService } from '../../data/cache';
import { mapPortfolioToAssetBasket } from '../../retirement-analytics/engine/portfolio-mapper';

/** One auction row, shaped as the Treasury API actually returns it. */
function auctionRow(overrides: Record<string, unknown> = {}) {
  return {
    cusip: '91282CRE3',
    security_type: 'Note',
    inflation_index_security: 'No',
    floating_rate: 'No',
    int_rate: '2.375000',
    maturity_date: '2036-07-15',
    auction_date: '2026-07-16',
    ...overrides,
  };
}

function respondWith(rows: unknown[], status = 200) {
  const calls: string[] = [];
  const fetchImplementation = (async (input: any) => {
    calls.push(String(input));
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ data: rows }),
      body: null,
      text: async () => '',
    } as any;
  }) as any;
  return { fetchImplementation, calls };
}

describe('Treasury auction lookup', () => {
  beforeEach(async () => {
    // The provider caches on a process-wide service; without this a CUSIP
    // resolved in one test would silently satisfy the next.
    await cacheService.invalidate('treasury_cusip_');
  });

  it('reads a TIPS issue the security type calls a Note', async () => {
    // The whole reason this provider exists. `security_type` names the tenor,
    // not the mandate, so an inflation-indexed note is reported as "Note" --
    // and its name, `UST 2.375% 07/15/2036`, is indistinguishable from a
    // nominal one.
    const { fetchImplementation } = respondWith([
      auctionRow({ inflation_index_security: 'Yes' }),
    ]);
    const provider = new TreasuryProvider({ fetchImplementation });

    expect(await provider.getTreasurySecurity('91282CRE3')).toEqual({
      cusip: '91282CRE3',
      kind: 'tips',
      couponRate: 0.02375,
      maturityDate: '2036-07-15',
    });
  });

  it('separates bills and floating-rate notes from nominal coupon debt', async () => {
    const bill = new TreasuryProvider(respondWith([
      auctionRow({ security_type: 'Bill', int_rate: 'null', maturity_date: '2026-10-29' }),
    ]));
    const resolvedBill = await bill.getTreasurySecurity('912797SK4');
    expect(resolvedBill?.kind).toBe('bill');
    // The API sends an absent number as the string "null", not JSON null.
    expect(resolvedBill?.couponRate).toBeNull();

    await cacheService.invalidate('treasury_cusip_');
    const frn = new TreasuryProvider(respondWith([auctionRow({ floating_rate: 'Yes' })]));
    expect((await frn.getTreasurySecurity('91282CRE3'))?.kind).toBe('frn');
  });

  it('reads the inflation flag ahead of the security type', async () => {
    // An inflation-indexed bond is reported as `security_type: "Bond"`. Reading
    // the type first would file every TIPS issue as nominal.
    const provider = new TreasuryProvider(respondWith([
      auctionRow({ security_type: 'Bond', inflation_index_security: 'Yes' }),
    ]));

    expect((await provider.getTreasurySecurity('912810US5'))?.kind).toBe('tips');
  });

  it('picks the original issue when a reopening auctions the same CUSIP again', async () => {
    // Reopened issues return several rows that disagree on term. Any row
    // carries the same facts, so the choice only has to be deterministic.
    const { fetchImplementation } = respondWith([
      auctionRow({ auction_date: '2026-09-17' }),
      auctionRow({ auction_date: '2026-07-16' }),
      auctionRow({ auction_date: '2026-08-20' }),
    ]);
    const provider = new TreasuryProvider({ fetchImplementation });

    expect((await provider.getTreasurySecurity('91282CRE3'))?.maturityDate).toBe('2036-07-15');
  });

  it('returns null rather than failing when the service is unreachable', async () => {
    // This provider adds evidence. Losing it must leave the classifier where
    // it stood, never fail an analysis.
    const provider = new TreasuryProvider({
      fetchImplementation: (async () => { throw new Error('network down'); }) as any,
      maxAttempts: 1,
    });

    expect(await provider.getTreasurySecurity('91282CRE3')).toBeNull();
  });

  it('does not cache an outage as an unresolvable security', async () => {
    let attempts = 0;
    const provider = new TreasuryProvider({
      fetchImplementation: (async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('network down');
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [auctionRow()] }),
        } as any;
      }) as any,
      maxAttempts: 1,
    });

    expect(await provider.getTreasurySecurity('91282CRE3')).toBeNull();
    expect((await provider.getTreasurySecurity('91282CRE3'))?.kind).toBe('nominal');
  });

  it('spends no request on a malformed CUSIP', async () => {
    const { fetchImplementation, calls } = respondWith([auctionRow()]);
    const provider = new TreasuryProvider({ fetchImplementation });

    expect(await provider.getTreasurySecurity('not-a-cusip')).toBeNull();
    expect(await provider.getTreasurySecurity('')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('resolves a repeated CUSIP once, whatever case it arrives in', async () => {
    const { fetchImplementation, calls } = respondWith([auctionRow()]);
    const provider = new TreasuryProvider({ fetchImplementation });

    const resolved = await provider.getTreasurySecurityBatch([
      '91282CRE3', ' 91282cre3 ', '91282CRE3',
    ]);

    expect(resolved.size).toBe(1);
    expect(calls).toHaveLength(1);
  });
});

describe('classifying a Treasury line from the issuer record', () => {
  const AS_OF = '2026-09-01';

  function mapOne(name: string, cusip: string, treasuries: Map<string, any>) {
    const security = { security_id: 's1', name, type: '', cusip } as any;
    const holding = {
      security_id: 's1',
      security_name: name,
      institution_value: 10_000,
    } as any;
    return mapPortfolioToAssetBasket(
      [holding], [security], 10_000, undefined, new Map(), AS_OF, treasuries,
    );
  }

  it('overrides the name when the auction record says TIPS', async () => {
    // Name inference reads `UST 2.375% 07/15/2036` as a nominal bond and would
    // simulate it on the ten-year nominal series, understating its inflation
    // protection. The issuer record is what corrects that.
    const mapping = await mapOne('UST 2.375% 07/15/2036', '91282CRE3', new Map([
      ['91282CRE3', { cusip: '91282CRE3', kind: 'tips', couponRate: 0.02375, maturityDate: '2036-07-15' }],
    ]));

    expect(mapping.tipsValue).toBe(10_000);
    expect(mapping.nominalBondsValue).toBe(0);
    expect(mapping.holdingExposures[0].confidence).toBe('high');
    expect(mapping.holdingExposures[0].method).toBe('provider');
  });

  it('puts a bill in cash rather than imputing ten-year duration to it', async () => {
    const mapping = await mapOne('UST 0% 10/29/2026', '912797SK4', new Map([
      ['912797SK4', { cusip: '912797SK4', kind: 'bill', couponRate: null, maturityDate: '2026-10-29' }],
    ]));

    expect(mapping.cashValue).toBe(10_000);
    expect(mapping.nominalBondsValue).toBe(0);
  });

  it('still places a nominal note in the bond sleeve, now at high confidence', async () => {
    const mapping = await mapOne('UST 3.5% 02/15/2029', '91282CJW3', new Map([
      ['91282CJW3', { cusip: '91282CJW3', kind: 'nominal', couponRate: 0.035, maturityDate: '2029-02-15' }],
    ]));

    expect(mapping.nominalBondsValue).toBe(10_000);
    expect(mapping.holdingExposures[0].confidence).toBe('high');
  });

  it('falls back to the name when no record resolves', async () => {
    // An unresolved CUSIP must leave classification exactly where the name
    // rule had it, not withdraw the holding from the simulation.
    const mapping = await mapOne('UST 3.5% 02/15/2029', '91282CJW3', new Map());

    expect(mapping.nominalBondsValue).toBe(10_000);
    expect(mapping.holdingExposures[0].method).toBe('name-inference');
  });
});
