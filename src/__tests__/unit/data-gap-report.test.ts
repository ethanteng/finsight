import { describe, expect, it } from '@jest/globals';
import { aggregateDataGaps, type AnalysisRow } from '../../services/data-gap-report';

const analysis = (opts: {
  unmapped?: string[];
  unsupported?: string[];
  listingFallback?: string[];
  unmodeledValue?: number;
  valueCoverage?: number;
}) => ({
  dataQuality: {
    unmodeledValue: opts.unmodeledValue ?? 0,
    valueCoverage: opts.valueCoverage ?? 1,
    proxyUsage: {
      unmappedHoldings: opts.unmapped ?? [],
      unsupportedHoldings: opts.unsupported ?? [],
      usListingFallbackHoldings: opts.listingFallback ?? [],
    },
  },
});

const row = (userId: string, computedAt: string, result: unknown): AnalysisRow => ({
  userId,
  computedAt,
  historicalImplications: result,
});

describe('data gap report', () => {
  it('ranks a security by how many users hold it, not how often it appears', () => {
    const report = aggregateDataGaps([
      row('a', '2026-08-01', analysis({ unmapped: ['UC PATHWAY 2040', 'Small Cap Fund'] })),
      row('b', '2026-08-02', analysis({ unmapped: ['UC PATHWAY 2040'] })),
      row('c', '2026-08-03', analysis({ unmapped: ['UC PATHWAY 2040'] })),
    ]);

    expect(report.securities[0]).toMatchObject({
      label: 'UC PATHWAY 2040',
      category: 'unmapped',
      userCount: 3,
      lastSeenAt: '2026-08-03',
    });
    expect(report.securities[1]).toMatchObject({ label: 'Small Cap Fund', userCount: 1 });
  });

  it('counts a user once however many analyses they have run', () => {
    // Ranking by raw occurrence would put one enthusiastic user's holdings
    // above a fund that many people actually hold.
    const report = aggregateDataGaps([
      row('a', '2026-08-01', analysis({ unmapped: ['Vanguard Target Retirement 2040'] })),
      row('a', '2026-08-02', analysis({ unmapped: ['Vanguard Target Retirement 2040'] })),
      row('a', '2026-08-03', analysis({ unmapped: ['Vanguard Target Retirement 2040'] })),
    ]);

    expect(report.usersConsidered).toBe(1);
    expect(report.securities).toHaveLength(1);
    expect(report.securities[0].userCount).toBe(1);
  });

  it('reads only each user\'s most recent analysis', () => {
    // A gap the user no longer has should stop being reported.
    const report = aggregateDataGaps([
      row('a', '2026-07-01', analysis({ unmapped: ['Retired Holding'] })),
      row('a', '2026-08-01', analysis({ unmapped: ['Current Holding'] })),
    ]);

    expect(report.securities.map(entry => entry.label)).toEqual(['Current Holding']);
  });

  it('separates the three ways a security misses the simulation', () => {
    const report = aggregateDataGaps([
      row('a', '2026-08-01', analysis({
        unmapped: ['Mystery Sleeve'],
        unsupported: ['SPDR Gold Shares'],
        listingFallback: ['Wells Fargo & Co.'],
      })),
    ]);

    expect(report.securities.map(entry => [entry.label, entry.category])).toEqual(
      expect.arrayContaining([
        ['Mystery Sleeve', 'unmapped'],
        ['SPDR Gold Shares', 'unsupported'],
        ['Wells Fargo & Co.', 'us-listing-fallback'],
      ])
    );
  });

  it('collapses labels differing only in spacing or case, keeping the first spelling', () => {
    const report = aggregateDataGaps([
      row('a', '2026-08-01', analysis({ unmapped: ['BTC LPATH IDX 2040 N'] })),
      row('b', '2026-08-02', analysis({ unmapped: ['btc  lpath   idx 2040 n'] })),
    ]);

    expect(report.securities).toHaveLength(1);
    expect(report.securities[0]).toMatchObject({ label: 'BTC LPATH IDX 2040 N', userCount: 2 });
  });

  it('does not double-count a label repeated inside one analysis', () => {
    const report = aggregateDataGaps([
      row('a', '2026-08-01', analysis({ unmapped: ['Small Cap Fund', 'Small Cap Fund'] })),
    ]);
    expect(report.securities[0].userCount).toBe(1);
  });

  it('summarizes coverage across the analyses it read', () => {
    const report = aggregateDataGaps([
      row('a', '2026-08-01', analysis({ unmapped: ['X'], unmodeledValue: 100_000, valueCoverage: 0.8 })),
      row('b', '2026-08-01', analysis({ unmapped: ['Y'], unmodeledValue: 50_000, valueCoverage: 0.6 })),
      row('c', '2026-08-01', analysis({ unmodeledValue: 0, valueCoverage: 1 })),
    ]);

    expect(report.usersConsidered).toBe(3);
    expect(report.usersWithAnyGap).toBe(2);
    expect(report.coverage.totalUnmodeledValue).toBe(150_000);
    expect(report.coverage.worstValueCoverage).toBeCloseTo(0.6, 6);
    expect(report.coverage.medianValueCoverage).toBeCloseTo(0.8, 6);
  });

  it('emits no user identifiers at all', () => {
    // The report exists to decide which provider data to source. Which
    // individuals hold what is not needed for that, so it must not leak.
    const report = aggregateDataGaps([
      row('user-secret-id', '2026-08-01', analysis({ unmapped: ['X'], unmodeledValue: 1 })),
    ]);
    expect(JSON.stringify(report)).not.toContain('user-secret-id');
  });

  it('survives rows with missing or malformed analysis payloads', () => {
    const report = aggregateDataGaps([
      row('a', '2026-08-01', null),
      row('b', '2026-08-01', { dataQuality: {} }),
      row('c', 'not-a-date', analysis({ unmapped: ['X'] })),
      { userId: '', computedAt: '2026-08-01', historicalImplications: analysis({ unmapped: ['Y'] }) },
      row('d', '2026-08-01', analysis({ unmapped: ['Real Gap'] })),
    ]);

    expect(report.securities.map(entry => entry.label)).toEqual(['Real Gap']);
    expect(report.usersConsidered).toBe(3); // a, b, d — the undated and unnamed rows are dropped
  });

  it('returns an empty report rather than throwing when there is nothing to read', () => {
    const report = aggregateDataGaps([]);
    expect(report).toEqual({
      usersConsidered: 0,
      usersWithAnyGap: 0,
      securities: [],
      coverage: { totalUnmodeledValue: 0, worstValueCoverage: null, medianValueCoverage: null },
    });
  });
});
