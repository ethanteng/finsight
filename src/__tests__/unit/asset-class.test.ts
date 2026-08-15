import { describe, expect, it } from '@jest/globals';
import { normalizeAssetType } from '../../services/asset-class';

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

  it('treats missing and undefined types as a single Unknown bucket', () => {
    expect(normalizeAssetType(undefined)).toBe('Unknown');
    expect(normalizeAssetType(null)).toBe('Unknown');
    expect(normalizeAssetType('   ')).toBe('Unknown');
    expect(normalizeAssetType('Unknown')).toBe('Unknown');
    expect(normalizeAssetType('Security type is not defined')).toBe('Unknown');
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
