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
