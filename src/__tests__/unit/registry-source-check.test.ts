import { describe, expect, it } from '@jest/globals';
import { hasDiverged, type RegistrySourceResult } from '../../services/registry-source-check';

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
