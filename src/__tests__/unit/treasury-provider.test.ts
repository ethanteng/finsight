import { describe, expect, it, beforeEach } from '@jest/globals';
import {
  TreasuryProvider,
  parseTreasuryLabel,
  treasuryLabelKey,
} from '../../retirement-analytics/data/providers/treasury-provider';
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
    await cacheService.invalidate('treasury_terms_');
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

    const { securities } = await provider.getTreasurySecurityBatch([
      '91282CRE3', ' 91282cre3 ', '91282CRE3',
    ]);

    expect(securities.size).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('asks about nothing when the book holds no government debt', async () => {
    // Every security a custodian sends carries a CUSIP, funds and stocks
    // included. Without an issuer filter an ordinary equity portfolio would be
    // sent to the Treasury in full.
    const { fetchImplementation, calls } = respondWith([auctionRow()]);
    const provider = new TreasuryProvider({ fetchImplementation });

    const { securities, degraded } = await provider.getTreasurySecurityBatch([
      '922908363', // VTI
      '464287200', // an iShares fund
      '037833100', // AAPL
    ]);

    expect(calls).toHaveLength(0);
    expect(securities.size).toBe(0);
    expect(degraded).toBe(false);
  });

  it('stops asking once the service has failed repeatedly', async () => {
    // Sequential lookups at two attempts and a ten-second timeout each would
    // otherwise let an unreachable service hold an analysis for minutes, which
    // gates it as surely as an error would.
    let calls = 0;
    const provider = new TreasuryProvider({
      fetchImplementation: (async () => {
        calls += 1;
        throw new Error('network down');
      }) as any,
      maxAttempts: 1,
    });

    const cusips = Array.from({ length: 20 }, (_, index) =>
      `912828${String(index).padStart(2, '0')}0`);
    const { degraded } = await provider.getTreasurySecurityBatch(cusips);

    expect(degraded).toBe(true);
    expect(calls).toBe(3);
  });

  it('still uses cached hits after the breaker opens', async () => {
    // Opening the breaker must stop the network, not discard evidence already
    // on hand. A bond ladder with prior cache hits would otherwise fall back
    // to name inference for lines that never needed a request on this pass.
    const cachedCusip = '912828990';
    const warm = new TreasuryProvider({
      fetchImplementation: (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [auctionRow({
            cusip: cachedCusip,
            inflation_index_security: 'Yes',
            maturity_date: '2035-01-15',
          })],
        }),
      }) as any),
      maxAttempts: 1,
    });
    expect((await warm.getTreasurySecurity(cachedCusip))?.kind).toBe('tips');

    let calls = 0;
    const provider = new TreasuryProvider({
      fetchImplementation: (async () => {
        calls += 1;
        throw new Error('network down');
      }) as any,
      maxAttempts: 1,
    });
    const failing = Array.from({ length: 3 }, (_, index) =>
      `912828${String(index).padStart(2, '0')}0`);
    const { securities, degraded } = await provider.getTreasurySecurityBatch([
      ...failing,
      cachedCusip,
    ]);

    expect(degraded).toBe(true);
    expect(calls).toBe(3);
    expect(securities.get(cachedCusip)?.kind).toBe('tips');
  });

  it('reports a CUSIP the Treasury has no record of as available, not degraded', async () => {
    // A genuine miss and an outage must not look alike: only one of them means
    // the resulting analysis is unsafe to keep.
    const { fetchImplementation } = respondWith([]);
    const provider = new TreasuryProvider({ fetchImplementation });

    const { securities, degraded } = await provider.getTreasurySecurityBatch(['912828XX0']);

    expect(securities.size).toBe(0);
    expect(degraded).toBe(false);
  });

  it('does not let one failure in a healthy run trip the breaker', async () => {
    let calls = 0;
    const provider = new TreasuryProvider({
      fetchImplementation: (async () => {
        calls += 1;
        if (calls === 2) throw new Error('blip');
        return { ok: true, status: 200, json: async () => ({ data: [auctionRow()] }) } as any;
      }) as any,
      maxAttempts: 1,
    });

    const { securities, degraded } = await provider.getTreasurySecurityBatch([
      '912828010', '912828020', '912828030', '912828040',
    ]);

    expect(calls).toBe(4);
    expect(securities.size).toBe(3);
    // Still degraded: evidence this analysis wanted was not obtained.
    expect(degraded).toBe(true);
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

describe('reading a Treasury line that arrived without a CUSIP', () => {
  beforeEach(async () => {
    await cacheService.invalidate('treasury_cusip_');
    await cacheService.invalidate('treasury_terms_');
  });

  /** The five records the Treasury really returns for 15 February 2029. */
  function feb2029Rows() {
    return [
      { cusip: '912810FG8', security_type: 'Bond', inflation_index_security: 'No', floating_rate: 'No', int_rate: '5.250000', maturity_date: '2029-02-15', auction_date: '1999-02-11' },
      { cusip: '9128286B1', security_type: 'Note', inflation_index_security: 'No', floating_rate: 'No', int_rate: '2.625000', maturity_date: '2029-02-15', auction_date: '2019-02-06' },
      { cusip: '9128286B1', security_type: 'Note', inflation_index_security: 'No', floating_rate: 'No', int_rate: '2.625000', maturity_date: '2029-02-15', auction_date: '2019-04-10' },
      { cusip: '9128286B1', security_type: 'Note', inflation_index_security: 'No', floating_rate: 'No', int_rate: '2.625000', maturity_date: '2029-02-15', auction_date: '2019-03-12' },
      { cusip: '91282CQA2', security_type: 'Note', inflation_index_security: 'No', floating_rate: 'No', int_rate: '3.500000', maturity_date: '2029-02-15', auction_date: '2026-02-10' },
    ];
  }

  function respondWithPage(
    rows: unknown[],
    totalCount: number | string | null = rows.length,
  ) {
    const calls: string[] = [];
    const fetchImplementation = (async (input: any) => {
      calls.push(String(input));
      const body: Record<string, unknown> = { data: rows };
      // `null` omits meta entirely -- the fail-closed path when the service
      // does not say how many rows matched.
      if (totalCount !== null) {
        body.meta = { 'total-count': totalCount };
      }
      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as any;
    }) as any;
    return { fetchImplementation, calls };
  }

  it('reads coupon and maturity out of the spellings custodians use', () => {
    expect(parseTreasuryLabel('UST 3.5% 02/15/2029'))
      .toEqual({ couponPercent: 3.5, maturityDate: '2029-02-15' });
    // The street fraction, which must not be read as a "2%" coupon.
    expect(parseTreasuryLabel('UNITED STATES TREAS NTS 3 1/2% DUE 02/15/2029'))
      .toEqual({ couponPercent: 3.5, maturityDate: '2029-02-15' });
    // No percent sign, two-digit year, and the other common abbreviation.
    expect(parseTreasuryLabel('US TREASURY N/B 2.375 07/15/36'))
      .toEqual({ couponPercent: 2.375, maturityDate: '2036-07-15' });
    expect(parseTreasuryLabel('T-Note 4.25% 2034-11-15'))
      .toEqual({ couponPercent: 4.25, maturityDate: '2034-11-15' });
  });

  it('refuses a label that does not say whose debt it is', () => {
    // The danger this parser exists to avoid: a corporate issue has exactly
    // the same shape, and a coupon and maturity that can collide with a real
    // Treasury. Naming the issuer is what separates them.
    expect(parseTreasuryLabel('APPLE INC 3.35% 02/09/2027')).toBeNull();
    expect(parseTreasuryLabel('CALIFORNIA ST GO 4% 08/01/2035')).toBeNull();
    // `treasure` is not `treas`.
    expect(parseTreasuryLabel('TREASURE ISLAND HLDG 5% 01/15/2030')).toBeNull();
  });

  it('refuses a pooled vehicle even when it names the Treasury', () => {
    expect(parseTreasuryLabel('VANGUARD TREASURY MONEY MARKET FUND 3.5% 02/15/2029')).toBeNull();
    expect(parseTreasuryLabel('ISHARES 7-10 TREASURY BOND ETF 2.5% 02/15/2029')).toBeNull();
  });

  it('refuses what it cannot read unambiguously', () => {
    // A zero coupon is a bill or a STRIP. Neither can be matched by rate -- a
    // bill has none and a STRIP never went to auction -- so the only record it
    // could hit is a floating-rate note quoted at a zero base.
    expect(parseTreasuryLabel('UST 0% 10/29/2026')).toBeNull();
    // A bare whole number is as likely a quantity or a tenor as a coupon.
    expect(parseTreasuryLabel('UST NOTE 10 02/15/2029')).toBeNull();
    // Two dates: nothing says which one is the maturity.
    expect(parseTreasuryLabel('UST 3.5% DTD 02/15/2026 02/15/2029')).toBeNull();
    // Not a street fraction, so not a coupon.
    expect(parseTreasuryLabel('UST 3 1/7% 02/15/2029')).toBeNull();
    expect(parseTreasuryLabel('UST 3.5%')).toBeNull();
  });

  it('picks the one issue maturing that day at that rate', async () => {
    const { fetchImplementation, calls } = respondWithPage(feb2029Rows());
    const provider = new TreasuryProvider({ fetchImplementation });

    const { byLabel, securities } = await provider.getTreasurySecurityBatch(
      [], ['UST 3.5% 02/15/2029'],
    );

    // Three CUSIPs mature on that date; the coupon is what selects among them.
    expect(byLabel.get('ust 3.5% 02/15/2029')).toEqual({
      cusip: '91282CQA2',
      kind: 'nominal',
      couponRate: 0.035,
      maturityDate: '2029-02-15',
    });
    // Also filed under its CUSIP, for a book that holds the same security on
    // an identified line too.
    expect(securities.get('91282CQA2')?.kind).toBe('nominal');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('maturity_date%3Aeq%3A2029-02-15');
  });

  it('reads a TIPS issue whose name reads exactly like a nominal note', async () => {
    // The case the CUSIP path was built for, now reachable for the custodian
    // that sends no CUSIP at all.
    const { fetchImplementation } = respondWithPage([
      auctionRow({ inflation_index_security: 'Yes' }),
    ]);
    const provider = new TreasuryProvider({ fetchImplementation });

    const { byLabel } = await provider.getTreasurySecurityBatch(
      [], ['UST 2.375% 07/15/2036'],
    );

    expect(byLabel.get('ust 2.375% 07/15/2036')?.kind).toBe('tips');
  });

  it('abstains when the coupon does not single out one security', async () => {
    // Two issues, same maturity, same rate: the label does not identify either
    // of them, and guessing would put a position in a sleeve on a coin toss.
    const { fetchImplementation } = respondWithPage([
      auctionRow({ cusip: '912828AA1', int_rate: '2.375000', inflation_index_security: 'No' }),
      auctionRow({ cusip: '912828BB2', int_rate: '2.375000', inflation_index_security: 'Yes' }),
    ]);
    const provider = new TreasuryProvider({ fetchImplementation });

    const { byLabel, degraded } = await provider.getTreasurySecurityBatch(
      [], ['UST 2.375% 07/15/2036'],
    );

    expect(byLabel.size).toBe(0);
    // A refusal is an answer, not a failure: nothing about it makes the
    // analysis unsafe to cache.
    expect(degraded).toBe(false);
  });

  it('abstains when the page cannot prove the match was unique', async () => {
    // One match on the page, but the service says it matched more than it
    // sent. Uniqueness is the entire safeguard, so an unprovable match is
    // refused rather than assumed.
    const { fetchImplementation } = respondWithPage([auctionRow()], 240);
    const provider = new TreasuryProvider({ fetchImplementation });

    const { byLabel } = await provider.getTreasurySecurityBatch(
      [], ['UST 2.375% 07/15/2036'],
    );

    expect(byLabel.size).toBe(0);
  });

  it('abstains when total-count is missing from a full page', async () => {
    // A full page without a total cannot prove there was not another match
    // past the page boundary. The previous fail-open treated a missing total
    // as complete and would have accepted a truncated unique hit.
    const fullPage = Array.from({ length: 100 }, (_, index) =>
      auctionRow({ cusip: `912828A${String(index).padStart(2, '0')}`, int_rate: '1.000000' }),
    );
    fullPage[0] = auctionRow();
    const { fetchImplementation } = respondWithPage(fullPage, null);
    const provider = new TreasuryProvider({ fetchImplementation });

    const { byLabel } = await provider.getTreasurySecurityBatch(
      [], ['UST 2.375% 07/15/2036'],
    );

    expect(byLabel.size).toBe(0);
  });

  it('still resolves when total-count is missing from a short page', async () => {
    // Fewer rows than the page size means the API had nothing further to
    // send, so uniqueness among those rows is still provable.
    const { fetchImplementation } = respondWithPage(feb2029Rows(), null);
    const provider = new TreasuryProvider({ fetchImplementation });

    const { byLabel } = await provider.getTreasurySecurityBatch(
      [], ['UST 3.5% 02/15/2029'],
    );

    expect(byLabel.get('ust 3.5% 02/15/2029')?.cusip).toBe('91282CQA2');
  });

  it('accepts a numeric-string total-count', async () => {
    const { fetchImplementation } = respondWithPage(feb2029Rows(), '5');
    const provider = new TreasuryProvider({ fetchImplementation });

    const { byLabel } = await provider.getTreasurySecurityBatch(
      [], ['UST 3.5% 02/15/2029'],
    );

    expect(byLabel.get('ust 3.5% 02/15/2029')?.cusip).toBe('91282CQA2');
  });

  it('asks once for a security a book lists twice, and not at all for the rest', async () => {
    const { fetchImplementation, calls } = respondWithPage(feb2029Rows());
    const provider = new TreasuryProvider({ fetchImplementation });

    const { byLabel } = await provider.getTreasurySecurityBatch([], [
      'UST 3.5% 02/15/2029',
      '  ust  3.5%  02/15/2029 ',
      'VANGUARD TOTAL STOCK MARKET INDEX FUND',
      'APPLE INC',
    ]);

    expect(calls).toHaveLength(1);
    expect(byLabel.size).toBe(1);
  });

  it('spends one failure budget across both ways of asking', async () => {
    // Labels reach the same service with the same question. Letting them start
    // a fresh count would double the wall-clock an outage can cost, which is
    // what the breaker exists to bound.
    let calls = 0;
    const provider = new TreasuryProvider({
      fetchImplementation: (async () => {
        calls += 1;
        throw new Error('network down');
      }) as any,
      maxAttempts: 1,
    });

    const { degraded, byLabel } = await provider.getTreasurySecurityBatch(
      ['912828010', '912828020', '912828030'],
      ['UST 3.5% 02/15/2029', 'UST 2.375% 07/15/2036'],
    );

    expect(degraded).toBe(true);
    expect(calls).toBe(3);
    expect(byLabel.size).toBe(0);
  });

  it('classifies the holding from the record its label resolved to', async () => {
    // End to end: a line with no CUSIP, named like a nominal note, landing in
    // the TIPS sleeve because the issuer says that is what it is.
    const name = 'UST 2.375% 07/15/2036';
    const security = { security_id: 's1', name, type: '' } as any;
    const holding = { security_id: 's1', security_name: name, institution_value: 10_000 } as any;
    const byLabel = new Map([
      [treasuryLabelKey(name) as string,
        { cusip: '91282CRE3', kind: 'tips', couponRate: 0.02375, maturityDate: '2036-07-15' }],
    ]);

    const mapping = await mapPortfolioToAssetBasket(
      [holding], [security], 10_000, undefined, new Map(), '2026-09-01', new Map(), byLabel as any,
    );

    expect(mapping.tipsValue).toBe(10_000);
    expect(mapping.nominalBondsValue).toBe(0);
    expect(mapping.holdingExposures[0].method).toBe('provider');
  });
});
