import { describe, expect, it } from '@jest/globals';
import { resolveStoredAsOfDate } from '../../openai/retirement-inputs';

/**
 * Registry eligibility changes on an allocation publication date, not merely
 * on January 1. The full snapshot date is therefore part of cache identity.
 */
describe('retirement cache: which evidence date a stored analysis used', () => {
  it('uses the full date the analysis recorded for itself', () => {
    expect(resolveStoredAsOfDate(
      { asOfDate: '2025-12-20' },
      new Date('2026-01-02T00:00:00Z'),
    )).toBe('2025-12-20');
  });

  it('prefers the snapshot date over the later row timestamp', () => {
    expect(resolveStoredAsOfDate(
      { asOfDate: '2026-01-15' },
      new Date('2026-07-05T00:00:00Z'),
    )).toBe('2026-01-15');
  });

  it('falls back to the row UTC date for legacy rows', () => {
    expect(resolveStoredAsOfDate(
      { asOfYear: 2025 },
      new Date('2025-11-30T23:59:59Z'),
    )).toBe('2025-11-30');
  });

  it('does not infer a date from an old year-only key', () => {
    // Treating 2026 as year-end would let a January snapshot see June data.
    expect(resolveStoredAsOfDate(
      { asOfYear: 2026 },
      new Date('2026-01-15T12:00:00Z'),
    )).toBe('2026-01-15');
  });

  it('rejects impossible or timestamp-shaped stored dates', () => {
    const fallback = new Date('2026-02-01T00:00:00Z');
    expect(resolveStoredAsOfDate({ asOfDate: '2026-02-30' }, fallback)).toBe('2026-02-01');
    expect(resolveStoredAsOfDate({ asOfDate: '2026-02-01T00:00:00Z' }, fallback)).toBe('2026-02-01');
    expect(resolveStoredAsOfDate({ asOfDate: 20260201 }, fallback)).toBe('2026-02-01');
  });

  it('returns null when no trustworthy date exists', () => {
    expect(resolveStoredAsOfDate(null, null)).toBeNull();
    expect(resolveStoredAsOfDate({}, new Date('not a date'))).toBeNull();
    expect(resolveStoredAsOfDate(undefined, undefined)).toBeNull();
  });

  it('makes publication-boundary cache misses explicit', () => {
    const stored = { asOfDate: '2026-06-29' };
    expect(resolveStoredAsOfDate(stored, new Date()) === '2026-06-29').toBe(true);
    expect(resolveStoredAsOfDate(stored, new Date()) === '2026-06-30').toBe(false);
  });
});
