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

  it('computes the staleness boundary from the engine threshold, not a local copy', async () => {
    // Asserting on a hand-built fixture would prove nothing: it would just
    // restate the flag the fixture already carried. Drive the real code with a
    // chosen asOfDate instead, so the `>` bound and the shared constant are
    // both pinned by the production path.
    //
    // The admin panel and the retirement engine must agree on when an
    // allocation is stale. #164 is about revisiting this number, and a private
    // duplicate here would silently disagree the moment that lands.
    global.fetch = jest.fn(async () =>
      new Response('no holdings table here', { status: 200 })
    ) as typeof fetch;

    const dayAfter = (isoDate: string, days: number) =>
      new Date(Date.parse(`${isoDate}T00:00:00.000Z`) + days * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

    const [sample] = await checkRegistrySources();
    const allocationAsOf = sample.allocationAsOf;

    const atThreshold = await checkRegistrySources(dayAfter(allocationAsOf, STALE_ALLOCATION_DAYS));
    const pastThreshold = await checkRegistrySources(dayAfter(allocationAsOf, STALE_ALLOCATION_DAYS + 1));

    const entry = (results: Awaited<ReturnType<typeof checkRegistrySources>>) =>
      results.find(candidate => candidate.allocationAsOf === allocationAsOf)!;

    expect(entry(atThreshold).allocationAgeDays).toBe(STALE_ALLOCATION_DAYS);
    expect(entry(atThreshold).staleByAge).toBe(false);
    expect(entry(pastThreshold).allocationAgeDays).toBe(STALE_ALLOCATION_DAYS + 1);
    expect(entry(pastThreshold).staleByAge).toBe(true);
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
