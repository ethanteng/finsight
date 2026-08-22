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

const row = (
  userId: string,
  computedAt: string,
  result: unknown,
  securityNames?: Record<string, string>
): AnalysisRow => ({
  userId,
  computedAt,
  historicalImplications: result,
  securityNames,
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


  it('shows the provider name instead of the opaque id it was labelled with', () => {
    // The mapper labels a holding by name, then ticker, then the provider's
    // security id. Only the last case reaches an operator as unreadable, and it
    // is disproportionately the unclassifiable securities that hit it.
    const report = aggregateDataGaps([
      row('a', '2026-08-20', analysis({ unmapped: ['7dD8KV8owvUX4bDwnDNPcLPy8Kyr9dFzwg9RN'] }),
        { '7dD8KV8owvUX4bDwnDNPcLPy8Kyr9dFzwg9RN': 'UC Pathway Fund 2040' }),
    ]);

    expect(report.securities[0]).toMatchObject({
      label: 'UC Pathway Fund 2040',
      identifier: '7dD8KV8owvUX4bDwnDNPcLPy8Kyr9dFzwg9RN',
    });
    expect(report.securities[0].unnamed).toBeUndefined();
  });

  it('groups a security held under a name by one user and an id by another', () => {
    // Resolving after grouping would split these into two rows that each look
    // like a single holder, which is the opposite of what this report is for.
    const report = aggregateDataGaps([
      row('a', '2026-08-19', analysis({ unmapped: ['UC PATHWAY 2040'] })),
      row('b', '2026-08-20', analysis({ unmapped: ['7dD8KV8owv'] }),
        { '7dD8KV8owv': 'UC Pathway 2040' }),
    ]);

    expect(report.securities).toHaveLength(1);
    expect(report.securities[0].userCount).toBe(2);
  });

  it('marks a security no source could name, rather than printing bare hex', () => {
    // An unnamed security is itself the finding: the provider sent no name
    // either, so sourcing its data starts from the identifier.
    const report = aggregateDataGaps([
      row('a', '2026-08-20', analysis({ unmapped: ['M654JE4yQdCRMKroO17KuZJ3Lo34kKHkV08Je'] })),
    ]);

    expect(report.securities[0]).toMatchObject({
      label: 'M654JE4yQdCRMKroO17KuZJ3Lo34kKHkV08Je',
      unnamed: true,
    });
    expect(report.securities[0].identifier).toBeUndefined();
  });

  it('does not mistake a real fund name for an identifier', () => {
    const report = aggregateDataGaps([
      row('a', '2026-08-20', analysis({ unmapped: ['State Street Target Retirement 2040'] })),
      row('b', '2026-08-20', analysis({ unsupported: ['SPDR Gold Shares'] })),
    ]);
    expect(report.securities.every(entry => entry.unnamed === undefined)).toBe(true);
  });

  it('leaves the label alone when the name index does not cover it', () => {
    const report = aggregateDataGaps([
      row('a', '2026-08-20', analysis({ unmapped: ['abc123'] }), { 'something-else': 'Other Fund' }),
    ]);
    expect(report.securities[0].label).toBe('abc123');
  });

  it('ignores a name index entry that is blank or merely echoes the id', () => {
    // A snapshot can carry name: "" or name equal to the id; neither is a name,
    // and substituting one would claim a resolution that did not happen.
    const report = aggregateDataGaps([
      row('a', '2026-08-20', analysis({ unmapped: ['abc123'] }), { abc123: '   ' }),
      row('b', '2026-08-20', analysis({ unmapped: ['xyz789'] }), { xyz789: 'xyz789' }),
    ]);
    expect(report.securities.map(entry => entry.label).sort()).toEqual(['abc123', 'xyz789']);
    expect(report.securities.every(entry => entry.identifier === undefined)).toBe(true);
  });

  it('keeps an identifier discovered on any user, not only the first', () => {
    const report = aggregateDataGaps([
      row('a', '2026-08-19', analysis({ unmapped: ['UC Pathway 2040'] })),
      row('b', '2026-08-20', analysis({ unmapped: ['7dD8KV8owv'] }),
        { '7dD8KV8owv': 'UC Pathway 2040' }),
    ]);
    expect(report.securities[0].identifier).toBe('7dD8KV8owv');
  });

  it('still counts a user once when two of their labels resolve to one name', () => {
    const report = aggregateDataGaps([
      row('a', '2026-08-20', analysis({ unmapped: ['id-one', 'id-two'] }),
        { 'id-one': 'Same Fund', 'id-two': 'Same Fund' }),
    ]);
    expect(report.securities).toHaveLength(1);
    expect(report.securities[0].userCount).toBe(1);
  });

  it('names a security using any row that can, not only the row it appears on', () => {
    // One user's feed carries the name and another's does not. Resolving per
    // row would key the second user by the raw id, producing two rows that each
    // report one holder for what is one fund held by two.
    const report = aggregateDataGaps([
      row('a', '2026-08-19', analysis({ unmapped: ['7dD8KV8owvUX4bDwn'] })),
      row('b', '2026-08-20', analysis({ unmapped: ['7dD8KV8owvUX4bDwn'] }),
        { '7dD8KV8owvUX4bDwn': 'State St Target Ret 2025 SL SF CL III' }),
    ]);

    expect(report.securities).toHaveLength(1);
    expect(report.securities[0]).toMatchObject({
      label: 'State St Target Ret 2025 SL SF CL III',
      identifier: '7dD8KV8owvUX4bDwn',
      userCount: 2,
    });
  });

  it('does not mark a security unnamed when a later row supplies its name', () => {
    const report = aggregateDataGaps([
      row('a', '2026-08-19', analysis({ unmapped: ['M654JE4yQdCRMKroO17Ku'] })),
      row('b', '2026-08-20', analysis({ unmapped: ['M654JE4yQdCRMKroO17Ku'] }),
        { 'M654JE4yQdCRMKroO17Ku': 'EQ/Com Stck Index' }),
    ]);

    expect(report.securities).toHaveLength(1);
    expect(report.securities[0].unnamed).toBeUndefined();
    expect(report.securities[0].label).toBe('EQ/Com Stck Index');
  });

  it('prefers a fuller name from any user over a ticker locked in first', () => {
    // Map insertion follows row order; without quality-aware merge, user a's
    // ticker would win and the report would show "VTI" instead of the fund name.
    const report = aggregateDataGaps([
      row('a', '2026-08-19', analysis({ unmapped: ['sec-id-abcdef12'] }),
        { 'sec-id-abcdef12': 'VTI' }),
      row('b', '2026-08-20', analysis({ unmapped: ['sec-id-abcdef12'] }),
        { 'sec-id-abcdef12': 'Vanguard Total Stock Market Index Fund' }),
    ]);

    expect(report.securities).toHaveLength(1);
    expect(report.securities[0].label).toBe('Vanguard Total Stock Market Index Fund');
  });

  it('does not let a later ticker overwrite an earlier full name', () => {
    const report = aggregateDataGaps([
      row('a', '2026-08-19', analysis({ unmapped: ['sec-id-abcdef12'] }),
        { 'sec-id-abcdef12': 'Vanguard Total Stock Market Index Fund' }),
      row('b', '2026-08-20', analysis({ unmapped: ['sec-id-abcdef12'] }),
        { 'sec-id-abcdef12': 'VTI' }),
    ]);

    expect(report.securities[0].label).toBe('Vanguard Total Stock Market Index Fund');
  });

  it('counts analyses written before the current data-quality contract', () => {
    // Analyses are cached, so the report reads whatever each user last computed
    // -- which can predate the target-date registry entirely. Those gaps may
    // already be fixed, and treating them as live sends an operator hunting for
    // data the engine can already place.
    const report = aggregateDataGaps([
      row('a', '2026-08-20', {
        dataQuality: { proxyUsage: { unmappedHoldings: ['State St Target Ret 2040'] } },
      }),
      row('b', '2026-08-20', analysis({ unmapped: ['Genuine Gap'], valueCoverage: 0.9 })),
    ]);

    expect(report.staleAnalyses).toBe(1);
    expect(report.usersConsidered).toBe(2);
  });

  it('does not call an analysis stale merely because coverage is zero', () => {
    const report = aggregateDataGaps([
      row('a', '2026-08-20', analysis({ unmapped: ['X'], valueCoverage: 0 })),
    ]);
    expect(report.staleAnalyses).toBe(0);
  });

  it('returns an empty report rather than throwing when there is nothing to read', () => {
    const report = aggregateDataGaps([]);
    expect(report).toEqual({
      usersConsidered: 0,
      usersWithAnyGap: 0,
      staleAnalyses: 0,
      securities: [],
      coverage: { totalUnmodeledValue: 0, worstValueCoverage: null, medianValueCoverage: null },
    });
  });
});
