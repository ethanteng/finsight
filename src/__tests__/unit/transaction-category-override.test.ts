import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const prisma = {
  financialSummarySnapshot: {
    findUnique: jest.fn<(_args: any) => Promise<any>>(),
    updateMany: jest.fn<(_args: any) => Promise<any>>(),
  },
  transactionCategoryOverride: { findMany: jest.fn<() => Promise<any[]>>() },
};

jest.mock('../../prisma-client', () => ({ getPrismaClient: () => prisma }));

import {
  applyOverridesToTransactions,
  findSnapshotTransactionCategory,
  matchingTransactions,
  patchSnapshotTransactionCategories,
  patchSnapshotTransactionCategory,
  providerCategoryFromTransaction,
  resolveProviderTransactionId,
} from '../../services/transaction-category-override-service';
import {
  canonicalTypeForCategory,
  resolveCategorySelection,
} from '../../services/transaction-category-taxonomy';
import { resolveCanonicalTransactionType } from '../../services/canonical-transaction-adapter';

describe('transaction category selection validation', () => {
  it('accepts a primary category on its own', () => {
    expect(resolveCategorySelection({ primary: 'MEDICAL' })).toEqual(['MEDICAL']);
    expect(resolveCategorySelection({ primary: 'medical', detailed: '' })).toEqual(['MEDICAL']);
  });

  it('accepts a detailed category that belongs to the primary', () => {
    expect(resolveCategorySelection({ primary: 'MEDICAL', detailed: 'MEDICAL_DENTAL_CARE' }))
      .toEqual(['MEDICAL', 'MEDICAL_DENTAL_CARE']);
  });

  it('rejects unknown categories and mismatched pairs', () => {
    expect(resolveCategorySelection({ primary: 'NOT_A_CATEGORY' })).toBeNull();
    expect(resolveCategorySelection({ primary: 'MEDICAL', detailed: 'TRAVEL_FLIGHTS' })).toBeNull();
  });
});

describe('cash-flow type implied by a chosen category', () => {
  it('classifies each primary, with or without a subcategory', () => {
    expect(canonicalTypeForCategory(['FOOD_AND_DRINK'])).toBe('expense');
    expect(canonicalTypeForCategory(['FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE'])).toBe('expense');
    expect(canonicalTypeForCategory(['INCOME', 'INCOME_WAGES'])).toBe('income');
    expect(canonicalTypeForCategory(['TRANSFER_IN'])).toBe('transfer_in');
    expect(canonicalTypeForCategory(['TRANSFER_OUT', 'TRANSFER_OUT_SAVINGS'])).toBe('transfer_out');
    expect(canonicalTypeForCategory(['BANK_FEES', 'BANK_FEES_ATM_FEES'])).toBe('fee');
  });

  it('keeps a credit-card payment a transfer so spending is not double-counted', () => {
    expect(canonicalTypeForCategory(['LOAN_PAYMENTS', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT']))
      .toBe('transfer_out');
    expect(canonicalTypeForCategory(['LOAN_PAYMENTS', 'LOAN_PAYMENTS_CAR_PAYMENT'])).toBe('expense');
  });

  it('declines to classify a category with no cash-flow meaning', () => {
    expect(canonicalTypeForCategory(['OTHER', 'OTHER_OTHER'])).toBeNull();
    expect(canonicalTypeForCategory([])).toBeNull();
  });
});

describe('SnapTrade activity types newly ingested without a type filter', () => {
  // financial-data-service stamps every SnapTrade activity with source and
  // snapTradeData, and transfer direction is read from SnapTrade's sign
  // convention, so the fixtures have to carry that marker to mean anything.
  const snapTrade = (activity: Record<string, unknown>) => ({
    ...activity,
    source: 'snaptrade',
    snapTradeData: { type: activity.type },
  });

  it('maps transfers, taxes, splits, and stock dividends deterministically', () => {
    expect(resolveCanonicalTransactionType(snapTrade({ type: 'TRANSFER', amount: 500 })))
      .toBe('transfer_in');
    expect(resolveCanonicalTransactionType(snapTrade({ type: 'TRANSFER', amount: -500 })))
      .toBe('transfer_out');
    expect(resolveCanonicalTransactionType(snapTrade({ type: 'TAX', amount: -12 }))).toBe('fee');
    expect(resolveCanonicalTransactionType(snapTrade({ type: 'SPLIT' }))).toBe('adjustment');
    // Paid in shares rather than cash, so it is an adjustment and not income.
    expect(resolveCanonicalTransactionType(snapTrade({ type: 'STOCK_DIVIDEND', amount: 25 })))
      .toBe('adjustment');
  });
});

describe('provider transaction id resolution', () => {
  it('mirrors the order the snapshot builder uses', () => {
    expect(resolveProviderTransactionId({ transaction_id: 'a', id: 'b' })).toBe('a');
    expect(resolveProviderTransactionId({ investment_transaction_id: 'b', id: 'c' })).toBe('b');
    expect(resolveProviderTransactionId({ id: 'c' })).toBe('c');
    expect(resolveProviderTransactionId({})).toBeNull();
  });
});

describe('applying overrides to in-memory transactions', () => {
  it('replaces the provider category and marks the source', () => {
    const transactions = [
      { transaction_id: 'txn-1', category: ['FOOD_AND_DRINK'] },
      { transaction_id: 'txn-2', category: ['TRAVEL'] },
    ];

    const applied = applyOverridesToTransactions(
      transactions,
      new Map([['txn-1', ['MEDICAL', 'MEDICAL_DENTAL_CARE']]])
    );

    expect(applied).toBe(1);
    expect(transactions[0]).toMatchObject({
      category: ['MEDICAL', 'MEDICAL_DENTAL_CARE'],
      category_source: 'user',
    });
    expect(transactions[1].category).toEqual(['TRAVEL']);
  });

  it('restates the classification fields so cash-flow totals follow the edit', () => {
    // Provider called this a transfer; the user says it was groceries. Every field the
    // canonical resolver checks ahead of the category has to move with it.
    const transactions = [{
      transaction_id: 'txn-1',
      category: ['TRANSFER_OUT'],
      aiCategory: 'transfer_out',
      transaction_type: 'transfer_out',
      canonicalTransactionType: 'transfer_out',
      personal_finance_category: { primary: 'TRANSFER_OUT', detailed: 'TRANSFER_OUT_WITHDRAWAL' },
    }];

    applyOverridesToTransactions(
      transactions,
      new Map([['txn-1', ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES']]])
    );

    expect(transactions[0]).toMatchObject({
      category: ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES'],
      aiCategory: 'expense',
      transaction_type: 'expense',
      canonicalTransactionType: 'expense',
      personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_GROCERIES' },
    });
    expect(resolveCanonicalTransactionType(transactions[0])).toBe('expense');
  });

  it('leaves an existing classification alone when the category implies none', () => {
    const transactions = [{
      transaction_id: 'txn-1',
      category: ['FOOD_AND_DRINK'],
      aiCategory: 'expense',
      transaction_type: 'expense',
    }];

    applyOverridesToTransactions(transactions, new Map([['txn-1', ['OTHER', 'OTHER_OTHER']]]));

    expect(transactions[0]).toMatchObject({
      category: ['OTHER', 'OTHER_OTHER'],
      aiCategory: 'expense',
      transaction_type: 'expense',
    });
  });
});

describe('snapshot patching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rewrites only the targeted transaction and guards on the snapshot revision', async () => {
    const computedAt = new Date('2026-08-15T00:00:00.000Z');
    prisma.financialSummarySnapshot.findUnique.mockResolvedValue({
      computedAt,
      transactions: [
        { transaction_id: 'txn-1', category: ['FOOD_AND_DRINK'], name: 'Peet’s' },
        { transaction_id: 'txn-2', category: ['TRAVEL'] },
      ],
    });
    prisma.financialSummarySnapshot.updateMany.mockResolvedValue({ count: 1 });

    const patched = await patchSnapshotTransactionCategory('user-1', 'txn-1', ['MEDICAL'], 'user');

    expect(patched).toBe(true);
    const call = prisma.financialSummarySnapshot.updateMany.mock.calls[0][0] as any;
    expect(call.where).toEqual({ userId: 'user-1', computedAt });
    expect(call.data.transactions[0]).toMatchObject({
      transaction_id: 'txn-1',
      category: ['MEDICAL'],
      category_source: 'user',
      name: 'Peet’s',
      transaction_type: 'expense',
    });
    expect(call.data.transactions[1]).toEqual({ transaction_id: 'txn-2', category: ['TRAVEL'] });
  });

  it('drops the user marker when the provider category is restored', async () => {
    prisma.financialSummarySnapshot.findUnique.mockResolvedValue({
      computedAt: new Date('2026-08-15T00:00:00.000Z'),
      transactions: [
        { transaction_id: 'txn-1', category: ['MEDICAL'], category_source: 'user' },
      ],
    });
    prisma.financialSummarySnapshot.updateMany.mockResolvedValue({ count: 1 });

    await patchSnapshotTransactionCategory('user-1', 'txn-1', ['FOOD_AND_DRINK'], 'provider');

    const call = prisma.financialSummarySnapshot.updateMany.mock.calls[0][0] as any;
    expect(call.data.transactions[0]).toMatchObject({
      transaction_id: 'txn-1',
      category: ['FOOD_AND_DRINK'],
      transaction_type: 'expense',
    });
  });

  it('clears the classification a restore cannot re-derive', async () => {
    // The provider never categorized this one, so there is nothing to derive a type from;
    // leaving the user's would show a chip contradicting the now-empty category.
    prisma.financialSummarySnapshot.findUnique.mockResolvedValue({
      computedAt: new Date('2026-08-15T00:00:00.000Z'),
      transactions: [{
        transaction_id: 'txn-1',
        category: ['FOOD_AND_DRINK'],
        category_source: 'user',
        personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: '' },
        aiCategory: 'expense',
        canonicalTransactionType: 'expense',
        transaction_type: 'expense',
        name: 'Corey Head',
      }],
    });
    prisma.financialSummarySnapshot.updateMany.mockResolvedValue({ count: 1 });

    await patchSnapshotTransactionCategory('user-1', 'txn-1', [], 'provider');

    const call = prisma.financialSummarySnapshot.updateMany.mock.calls[0][0] as any;
    expect(call.data.transactions[0]).toEqual({
      transaction_id: 'txn-1',
      category: [],
      name: 'Corey Head',
    });
  });

  it('reports failure without writing when the id is not in the snapshot', async () => {
    prisma.financialSummarySnapshot.findUnique.mockResolvedValue({
      computedAt: new Date(),
      transactions: [{ transaction_id: 'txn-1', category: ['MEDICAL'] }],
    });

    const patched = await patchSnapshotTransactionCategory('user-1', 'other-user-txn', ['TRAVEL'], 'user');

    expect(patched).toBe(false);
    expect(prisma.financialSummarySnapshot.updateMany).not.toHaveBeenCalled();
  });

  it('reads the current provider category as the restore point', async () => {
    prisma.financialSummarySnapshot.findUnique.mockResolvedValue({
      transactions: [{ transaction_id: 'txn-1', category: ['FOOD_AND_DRINK', '', '0'] }],
    });

    await expect(findSnapshotTransactionCategory('user-1', 'txn-1')).resolves.toEqual(['FOOD_AND_DRINK']);
    await expect(findSnapshotTransactionCategory('user-1', 'txn-9')).resolves.toBeNull();
  });

  it('does not treat a user-stamped snapshot row as the provider restore point', () => {
    expect(
      providerCategoryFromTransaction({
        transaction_id: 'txn-1',
        category: ['MEDICAL'],
        category_source: 'user',
      })
    ).toEqual([]);
    expect(
      providerCategoryFromTransaction({
        transaction_id: 'txn-1',
        category: ['FOOD_AND_DRINK'],
      })
    ).toEqual(['FOOD_AND_DRINK']);
  });
});

describe('transactions a category edit can also apply to', () => {
  const target = { transaction_id: 'txn-1', name: 'SAFEWAY #1234 SAN FRANCISCO', merchant_name: 'Safeway', amount: -82.1 };

  it('matches the same payee with money moving the same way', () => {
    const others = [
      { transaction_id: 'txn-2', name: 'SAFEWAY #567', merchant_name: 'Safeway', amount: -45 },
      // Store numbers differ, but no merchant name: the description still names the payee.
      { transaction_id: 'txn-3', name: 'SAFEWAY 0042', amount: -12.5 },
      // A refund from the same store keeps its own category.
      { transaction_id: 'txn-4', name: 'SAFEWAY REFUND', merchant_name: 'Safeway', amount: 20 },
      { transaction_id: 'txn-5', name: 'TRADER JOES', merchant_name: 'Trader Joe’s', amount: -40 },
      // No provider id, so it cannot carry an override.
      { name: 'SAFEWAY', merchant_name: 'Safeway', amount: -9 },
      // Investment activity is never matched against banking.
      { investment_transaction_id: 'inv-1', name: 'Safeway', amount: -100 },
    ];
    const matches = matchingTransactions([target, ...others], target);
    expect(matches.map(transaction => transaction.transaction_id)).toEqual(['txn-2', 'txn-3']);
  });

  it('matches nothing for a payee with no name', () => {
    const unnamed = { transaction_id: 'txn-1', name: '', amount: -5 };
    expect(matchingTransactions([unnamed, { transaction_id: 'txn-2', name: '', amount: -5 }], unnamed)).toEqual([]);
  });
});

describe('patching several snapshot transactions at once', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rewrites every listed transaction in one guarded write', async () => {
    const computedAt = new Date('2026-08-15T00:00:00.000Z');
    prisma.financialSummarySnapshot.findUnique.mockResolvedValue({
      computedAt,
      transactions: [
        { transaction_id: 'txn-1', category: ['GENERAL_MERCHANDISE'] },
        { transaction_id: 'txn-2', category: ['TRAVEL'] },
        { transaction_id: 'txn-3', category: ['GENERAL_MERCHANDISE'] },
      ],
    });
    prisma.financialSummarySnapshot.updateMany.mockResolvedValue({ count: 1 });

    const patched = await patchSnapshotTransactionCategories('user-1', new Set(['txn-1', 'txn-3']), ['FOOD_AND_DRINK'], 'user');

    expect(patched).toBe(true);
    expect(prisma.financialSummarySnapshot.updateMany).toHaveBeenCalledTimes(1);
    const call = prisma.financialSummarySnapshot.updateMany.mock.calls[0][0] as any;
    expect(call.where).toEqual({ userId: 'user-1', computedAt });
    expect(call.data.transactions.map((transaction: any) => transaction.category)).toEqual([
      ['FOOD_AND_DRINK'], ['TRAVEL'], ['FOOD_AND_DRINK'],
    ]);
  });
});
