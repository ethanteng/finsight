import { describe, expect, it } from '@jest/globals';
import { resolveStoredAsOfYear } from '../../openai/retirement-inputs';

/**
 * The retirement analysis cache holds a row for 7 days and reuses it when the
 * holdings and the user's parameters match. A target-date fund's equity share
 * is a function of the year, so an otherwise-identical analysis computed for a
 * different year is a different answer -- the year has to be part of the match,
 * or a request on Jan 1 can be served December's asset mix.
 */
describe('retirement cache: which year a stored analysis was built for', () => {
  it('uses the year the analysis recorded for itself', () => {
    expect(resolveStoredAsOfYear({ asOfYear: 2025 }, new Date('2026-01-02T00:00:00Z'))).toBe(2025);
  });

  it('prefers the recorded year over the row timestamp when they disagree', () => {
    // An analysis built from a stale December snapshot but written in January
    // was computed for 2025; the write time does not change that.
    expect(resolveStoredAsOfYear({ asOfYear: 2025 }, new Date('2026-01-05T00:00:00Z'))).toBe(2025);
  });

  it('falls back to the row timestamp for rows written before the year was stored', () => {
    expect(resolveStoredAsOfYear({ currentAge: 50 }, new Date('2025-11-30T00:00:00Z'))).toBe(2025);
  });

  it('reads the fallback in UTC, matching how the snapshot year is derived', () => {
    // 2026-01-01T00:30Z is still Dec 31 in US local time. snapshotYear() and the
    // scenario baseline both use UTC, so this must too or the two disagree for
    // several hours a year -- exactly the window this cache key exists to cover.
    expect(resolveStoredAsOfYear({}, new Date('2026-01-01T00:30:00Z'))).toBe(2026);
  });

  it('resolves to NaN when the year cannot be established at all', () => {
    // NaN never equals a candidate year, so the analysis is recomputed. A miss
    // costs one recomputation; a false hit serves last year's asset mix.
    expect(resolveStoredAsOfYear(null, null)).toBeNaN();
    expect(resolveStoredAsOfYear({}, new Date('not a date'))).toBeNaN();
    expect(resolveStoredAsOfYear(undefined, undefined)).toBeNaN();
  });

  it('falls back for an unusable stored year rather than propagating it', () => {
    // A non-finite year cannot survive the trip to the database -- JSON encodes
    // NaN and Infinity as null -- so this is what such a row actually looks
    // like when read back. computedAt remains a usable account of its year.
    const computedAt = new Date('2026-03-01T00:00:00Z');
    expect(resolveStoredAsOfYear({ asOfYear: null }, computedAt)).toBe(2026);
    expect(resolveStoredAsOfYear({ asOfYear: NaN }, computedAt)).toBe(2026);
    expect(resolveStoredAsOfYear({ asOfYear: Infinity }, computedAt)).toBe(2026);
  });

  it('never lets an unusable stored year become a hit on the wrong year', () => {
    // The fallback is only safe because it still has to equal the candidate
    // year. A row from 2025 with no usable stored year must miss in 2026.
    expect(resolveStoredAsOfYear({ asOfYear: null }, new Date('2025-12-31T12:00:00Z')) === 2026)
      .toBe(false);
  });

  it('treats a stored year string as absent rather than parsing it', () => {
    // JSON round-trips can turn a number into a string; that row's year is not
    // trustworthy as a key, but computedAt still is.
    expect(resolveStoredAsOfYear({ asOfYear: '2025' }, new Date('2026-02-01T00:00:00Z'))).toBe(2026);
  });

  it('makes a cache hit and a year-boundary miss distinguishable', () => {
    const computedAt = new Date('2025-12-20T00:00:00Z');
    const stored = { asOfYear: 2025 };
    expect(resolveStoredAsOfYear(stored, computedAt) === 2025).toBe(true);
    expect(resolveStoredAsOfYear(stored, computedAt) === 2026).toBe(false);
  });
});
