import { describe, expect, it } from '@jest/globals';
import { toCanonicalTransaction } from '../../services/canonical-transaction-adapter';

function expense(overrides: Record<string, unknown>) {
  return toCanonicalTransaction({
    account_id: 'checking',
    date: '2026-08-01',
    name: 'Cafe',
    amount: 20,
    iso_currency_code: 'USD',
    transaction_type: 'expense',
    ...overrides,
  });
}

describe('canonical transaction category labels', () => {
  it('gives one label to a category however the provider spells it', () => {
    // Plaid's legacy taxonomy and personal_finance_category can both appear in a
    // single account's history — the array is only backfilled from PFC when it is
    // empty — so both spellings must land on the same label.
    const legacy = expense({
      transaction_id: 'legacy',
      category: ['Food and Drink'],
      personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' },
    });
    const pfcDerived = expense({
      transaction_id: 'pfc',
      category: ['FOOD_AND_DRINK'],
      personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' },
    });

    expect(legacy?.category).toBe('Food And Drink');
    expect(pfcDerived?.category).toBe(legacy?.category);
  });

  it('normalizes casing for string categories too', () => {
    expect(expense({ transaction_id: 's1', category: 'GROCERIES' })?.category).toBe('Groceries');
    expect(expense({ transaction_id: 's2', category: 'groceries' })?.category).toBe('Groceries');
    expect(expense({ transaction_id: 's3', category: ['Mortgage Payment'] })?.category).toBe('Mortgage Payment');
  });

  it('still falls back to Uncategorized when nothing usable is present', () => {
    expect(expense({ transaction_id: 'none', category: [] })?.category).toBe('Uncategorized');
  });
});
