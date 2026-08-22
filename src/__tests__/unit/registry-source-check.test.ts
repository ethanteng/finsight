import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { checkRegistrySources, hasDiverged, type RegistrySourceResult } from '../../services/registry-source-check';
import { STALE_ALLOCATION_DAYS } from '../../services/target-date-fund-registry';

const result = (over: Partial<RegistrySourceResult>): RegistrySourceResult => ({
  key: 'state-street/target-retirement/2040',
  status: 'unchanged',
  detail: '',
  sourceUrl: 'https://example.invalid/fund',
  allocationAsOf: '2026-06-30',
  allocationAgeDays: 53,
  staleByAge: false,
  ...over,
});

describe('registry source divergence', () => {
  it('treats a moved source as divergence', () => {
    expect(hasDiverged(result({ status: 'drifted' }))).toBe(true);
  });

  it('does not treat an unreadable source as divergence', () => {
    // A provider behind a WAF, or a transient network failure, says nothing
    // about whether the published allocation changed. Conflating the two would
    // make an outage look like a data problem and train operators to ignore it.
    expect(hasDiverged(result({ status: 'error', detail: 'HTTP 403' }))).toBe(false);
  });

  it('does not treat an unchanged or unbaselined source as divergence', () => {
    expect(hasDiverged(result({ status: 'unchanged' }))).toBe(false);
    expect(hasDiverged(result({ status: 'baseline' }))).toBe(false);
  });

  it('uses the engine\'s own staleness threshold, not a second copy of it', () => {
    // The admin panel and the retirement engine must agree on when an
    // allocation is stale. #164 is about revisiting this number, so a private
    // duplicate here would silently disagree the moment that lands.
    expect(STALE_ALLOCATION_DAYS).toBe(366);
    expect(result({ allocationAgeDays: STALE_ALLOCATION_DAYS, staleByAge: false }).staleByAge).toBe(false);
    expect(result({ allocationAgeDays: STALE_ALLOCATION_DAYS + 1, staleByAge: true }).staleByAge).toBe(true);
  });

  it('reports age separately from divergence, because they answer different questions', () => {
    // The engine's staleness flag measures how old our record is. Divergence
    // measures whether the provider has published something else. An entry can
    // be young and diverged (State Street republishes monthly), or old and
    // still accurate.
    const youngButMoved = result({ status: 'drifted', allocationAgeDays: 31, staleByAge: false });
    expect(hasDiverged(youngButMoved)).toBe(true);
    expect(youngButMoved.staleByAge).toBe(false);

    const oldButAccurate = result({ status: 'unchanged', allocationAgeDays: 400, staleByAge: true });
    expect(hasDiverged(oldButAccurate)).toBe(false);
    expect(oldButAccurate.staleByAge).toBe(true);
  });
});

describe('registry source fetch bounds', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects responses that declare more than the size cap before reading the body', async () => {
    // Admin-triggered fetches follow redirects; an unbounded body read would let
    // a malicious or misconfigured hop exhaust the process. Content-Length is
    // checked before the body is consumed.
    global.fetch = jest.fn(async () =>
      new Response('ignored', {
        status: 200,
        headers: { 'content-length': String(6 * 1024 * 1024) },
      })
    ) as typeof fetch;

    const results = await checkRegistrySources();
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(entry => entry.status === 'error')).toBe(true);
    expect(results[0].detail).toMatch(/too large/);
  });
});
