import { describe, expect, it } from '@jest/globals';
import {
  mergeAssetAllocation,
  normalizeAssetType,
  resolveAssetTypeWithHeuristics,
} from '../../services/asset-class';

describe('normalizeAssetType', () => {
  it('collapses provider casing differences onto one label', () => {
    expect(normalizeAssetType('etf')).toBe('ETF');
    expect(normalizeAssetType('ETF')).toBe('ETF');
    expect(normalizeAssetType('Etf')).toBe('ETF');
    expect(normalizeAssetType('mutual fund')).toBe('Mutual Fund');
    expect(normalizeAssetType('Mutual Fund')).toBe('Mutual Fund');
    expect(normalizeAssetType('cash')).toBe('Cash');
    expect(normalizeAssetType('Cash')).toBe('Cash');
    expect(normalizeAssetType('fixed income')).toBe('Fixed Income');
    expect(normalizeAssetType('Fixed Income')).toBe('Fixed Income');
  });

  it('folds provider synonyms into the shared asset classes', () => {
    expect(normalizeAssetType('Common Stock')).toBe('Equity');
    expect(normalizeAssetType('equity')).toBe('Equity');
    expect(normalizeAssetType('Exchange Traded Fund')).toBe('ETF');
    expect(normalizeAssetType('Bond')).toBe('Fixed Income');
    expect(normalizeAssetType('Crypto')).toBe('Cryptocurrency');
  });

  it('treats missing and undefined types as a single unrecognized bucket', () => {
    expect(normalizeAssetType(undefined)).toBe('Unrecognized holdings');
    expect(normalizeAssetType(null)).toBe('Unrecognized holdings');
    expect(normalizeAssetType('   ')).toBe('Unrecognized holdings');
    expect(normalizeAssetType('Unrecognized holdings')).toBe('Unrecognized holdings');
    expect(normalizeAssetType('Security type is not defined')).toBe('Unrecognized holdings');
    // A separator-only placeholder must not become its own blank bucket.
    expect(normalizeAssetType('-')).toBe('Unrecognized holdings');
    expect(normalizeAssetType('__')).toBe('Unrecognized holdings');
  });

  it('matches the alias table through snake_case and hyphenated spellings', () => {
    expect(normalizeAssetType('FIXED_INCOME')).toBe('Fixed Income');
    expect(normalizeAssetType('mutual-fund')).toBe('Mutual Fund');
    expect(normalizeAssetType('COMMON_STOCK')).toBe('Equity');
  });

  it('ignores extra whitespace and keeps unmapped types stable across spellings', () => {
    expect(normalizeAssetType('  mutual   fund ')).toBe('Mutual Fund');
    expect(normalizeAssetType('warrant')).toBe('Warrant');
    expect(normalizeAssetType('WARRANT')).toBe(normalizeAssetType('warrant'));
  });

  it('leaves the manual investments bucket untouched', () => {
    expect(normalizeAssetType('Manual Investments')).toBe('Manual Investments');
  });
});

describe('resolveAssetTypeWithHeuristics', () => {
  it('uses alias mappings before substring heuristics', () => {
    expect(resolveAssetTypeWithHeuristics('Money Market Fund')).toBe('Cash');
    expect(resolveAssetTypeWithHeuristics('Common Stock')).toBe('Equity');
  });

  it('falls back to substring heuristics for unmapped descriptions', () => {
    expect(resolveAssetTypeWithHeuristics('Growth ETF')).toBe('ETF');
    expect(resolveAssetTypeWithHeuristics('US Treasury Bond')).toBe('Fixed Income');
  });
});

describe('mergeAssetAllocation', () => {
  it('sums rows that describe the same asset class', () => {
    expect(
      mergeAssetAllocation([
        { type: 'ETF', value: 400, percentage: 40 },
        { type: 'etf', value: 100, percentage: 10 },
        { type: 'Cash', value: 500, percentage: 50 },
      ])
    ).toEqual([
      { type: 'ETF', value: 500, percentage: 50 },
      { type: 'Cash', value: 500, percentage: 50 },
    ]);
  });

  it('keeps distinct asset classes apart and tolerates missing numbers', () => {
    expect(
      mergeAssetAllocation([
        { type: 'Equity', value: 100, percentage: 50 },
        { type: 'Fixed Income', value: 100, percentage: 50 },
        { type: 'Cash' },
      ])
    ).toEqual([
      { type: 'Equity', value: 100, percentage: 50 },
      { type: 'Fixed Income', value: 100, percentage: 50 },
      { type: 'Cash', value: 0, percentage: 0 },
    ]);
  });

  it('returns an empty list for missing input', () => {
    expect(mergeAssetAllocation(undefined)).toEqual([]);
    expect(mergeAssetAllocation(null)).toEqual([]);
    expect(mergeAssetAllocation([])).toEqual([]);
  });
});
