import { describe, expect, it } from '@jest/globals';
import { labelKey, normalizeLabel } from '../../services/label-normalization';

describe('normalizeLabel', () => {
  it('gives one label to values differing only by case or separator', () => {
    // Plaid investment transaction types are lowercase, SnapTrade activity types
    // uppercase, and provider taxonomies mix snake_case with spaced words.
    expect(normalizeLabel('buy')).toBe('Buy');
    expect(normalizeLabel('BUY')).toBe('Buy');
    expect(normalizeLabel('Buy')).toBe('Buy');
    expect(normalizeLabel('cash_dividend')).toBe('Cash Dividend');
    expect(normalizeLabel('CASH DIVIDEND')).toBe('Cash Dividend');
    expect(normalizeLabel('cash-dividend')).toBe('Cash Dividend');
    expect(normalizeLabel('  cash   dividend  ')).toBe('Cash Dividend');
  });

  it('falls back for missing values, with an overridable label', () => {
    expect(normalizeLabel(undefined)).toBe('Unknown');
    expect(normalizeLabel(null)).toBe('Unknown');
    expect(normalizeLabel('   ')).toBe('Unknown');
    expect(normalizeLabel('', 'Uncategorized')).toBe('Uncategorized');
  });

  it('exposes the folded grouping key', () => {
    expect(labelKey('FOOD_AND_DRINK')).toBe('food and drink');
    expect(labelKey('Food and Drink')).toBe(labelKey('FOOD_AND_DRINK'));
    expect(labelKey(undefined)).toBe('');
  });
});
