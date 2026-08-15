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
import { resolveCategorySelection } from '../../services/transaction-category-taxonomy';

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
    expect(call.data.transactions[0]).toEqual({
      transaction_id: 'txn-1',
      category: ['FOOD_AND_DRINK'],
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
