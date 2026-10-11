import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const prisma = {
  financialSummarySnapshot: {
    findUnique: jest.fn<(_args: any) => Promise<any>>(),
    updateMany: jest.fn<(_args: any) => Promise<any>>(),
  },
  transactionCategoryOverride: {
    findMany: jest.fn<() => Promise<any[]>>(),
    createMany: jest.fn<(_args: any) => Promise<any>>(),
  },
  transactionCategoryRule: { findMany: jest.fn<() => Promise<any[]>>() },
};

jest.mock('../../prisma-client', () => ({ getPrismaClient: () => prisma }));

import {
  applyCategoryOverrides,
  applyOverridesToTransactions,
  categoryRuleSubject,
  inferCategoryRules,
  findSnapshotTransactionCategory,
  overridesFromRules,
  providerMoneyDirection,
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
  // A debit-card purchase, stored negative like all money out of a bank account.
  const target = { transaction_id: 'txn-1', name: 'SAFEWAY #1234 SAN FRANCISCO', merchant_name: 'Safeway', amount: -82.1, transaction_type: 'expense' };

  it('matches the same payee with money moving the same way, whatever sign the account stores', () => {
    const others = [
      { transaction_id: 'txn-2', name: 'SAFEWAY #567', merchant_name: 'Safeway', amount: -45, transaction_type: 'expense' },
      // A credit-card purchase is stored positive, but it is money out all the same.
      { transaction_id: 'txn-3', name: 'SAFEWAY 0042', amount: 12.5, transaction_type: 'expense' },
      // A card refund is positive too, and it is money in: it keeps its own category.
      { transaction_id: 'txn-4', name: 'SAFEWAY', merchant_name: 'Safeway', amount: 20, transaction_type: 'refund' },
      { transaction_id: 'txn-5', name: 'TRADER JOES', merchant_name: 'Trader Joe’s', amount: -40, transaction_type: 'expense' },
      // No provider id, so it cannot carry an override.
      { name: 'SAFEWAY', merchant_name: 'Safeway', amount: -9, transaction_type: 'expense' },
      // Investment activity is never matched against banking, from either provider.
      { investment_transaction_id: 'inv-1', name: 'Safeway', amount: -100, transaction_type: 'buy' },
      { transaction_id: 'snap-1', name: 'Safeway', amount: -100, transaction_type: 'expense', source: 'snaptrade', isInvestmentTransaction: true },
    ];
    const matches = matchingTransactions([target, ...others], target);
    expect(matches.map(transaction => transaction.transaction_id)).toEqual(['txn-2', 'txn-3']);
  });

  it('matches nothing when the payee has no name or the direction can’t be told', () => {
    const unnamed = { transaction_id: 'txn-1', name: '', amount: -5, transaction_type: 'expense' };
    expect(matchingTransactions([unnamed, { ...unnamed, transaction_id: 'txn-2' }], unnamed)).toEqual([]);

    // A transfer with no in or out detail has no direction to match on.
    const transfer = { transaction_id: 'txn-1', name: 'ZELLE', amount: -50, personal_finance_category: { primary: 'TRANSFER', detailed: 'TRANSFER' } };
    expect(matchingTransactions([transfer, { ...transfer, transaction_id: 'txn-2' }], transfer)).toEqual([]);
  });

  it('matches by the provider direction when a user category turned the row around', () => {
    const stamped = {
      transaction_id: 'txn-1', name: 'VENMO PAYMENT', merchant_name: 'Venmo', amount: -50,
      category: ['INCOME'], category_source: 'user', transaction_type: 'income',
    };
    const payment = { transaction_id: 'txn-2', name: 'VENMO PAYMENT', merchant_name: 'Venmo', amount: -40, transaction_type: 'transfer_out' };
    const cashout = { transaction_id: 'txn-3', name: 'VENMO CASHOUT', merchant_name: 'Venmo', amount: 60, transaction_type: 'transfer_in' };
    // As the row stands it is money in, so it would match the cashout.
    expect(matchingTransactions([stamped, payment, cashout], stamped).map(t => t.transaction_id)).toEqual(['txn-3']);
    // With the provider direction a rule uses, it matches the other payments out.
    expect(matchingTransactions([stamped, payment, cashout], stamped, {
      direction: 'out',
      originalCategories: new Map([['txn-1', ['TRANSFER_OUT']]]),
    }).map(t => t.transaction_id)).toEqual(['txn-2']);
  });
});

describe('a payee’s category rule', () => {
  const groceries = ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES'];
  const rule = { id: 'rule-1', counterpartyKey: 'safeway', direction: 'out' as const, investment: false, label: 'Safeway', category: groceries };
  const purchase = (id: string, extra: Record<string, unknown> = {}) =>
    ({ transaction_id: id, name: 'SAFEWAY #1234', merchant_name: 'Safeway', amount: 40, category: ['GENERAL_MERCHANDISE'], transaction_type: 'expense', ...extra });

  it('gives each new transaction it covers an override, and leaves alone one that has its own', () => {
    const transactions = [
      purchase('new-1'),
      purchase('decided', { category: ['SHOPS'] }),
      // A refund moves money the other way, and keeps its own category.
      purchase('refund', { amount: -12, transaction_type: 'refund' }),
      { transaction_id: 'other', name: 'TRADER JOES', merchant_name: 'Trader Joes', amount: 30, transaction_type: 'expense' },
    ];
    const created = overridesFromRules(transactions, new Map([['decided', ['SHOPS']]]), [rule]);
    expect(created).toEqual([{ transactionId: 'new-1', category: groceries, originalCategory: ['GENERAL_MERCHANDISE'] }]);
  });

  it('saves the overrides it gives at ingestion, then stamps them like any other', async () => {
    prisma.transactionCategoryOverride.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ transactionId: 'new-1', category: groceries }]);
    prisma.transactionCategoryRule.findMany.mockResolvedValue([rule]);
    prisma.transactionCategoryOverride.createMany.mockResolvedValue({ count: 1 });
    const data = { bankingTransactions: [purchase('new-1')] };
    await applyCategoryOverrides('user-1', data);
    expect(prisma.transactionCategoryOverride.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', transactionId: 'new-1', category: groceries, originalCategory: ['GENERAL_MERCHANDISE'] }],
      skipDuplicates: true,
    });
    expect(data.bankingTransactions[0]).toMatchObject({ category: groceries, category_source: 'user' });
  });

  it('stamps what is stored when a save beat the rule to a transaction', async () => {
    // Read before the user saved one; the insert then skips it, and the user's stands.
    prisma.transactionCategoryOverride.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ transactionId: 'new-1', category: ['SHOPS'] }]);
    prisma.transactionCategoryRule.findMany.mockResolvedValue([rule]);
    prisma.transactionCategoryOverride.createMany.mockResolvedValue({ count: 0 });
    const data = { bankingTransactions: [purchase('new-1')] };
    await applyCategoryOverrides('user-1', data);
    expect(data.bankingTransactions[0]).toMatchObject({ category: ['SHOPS'], category_source: 'user' });
  });

  it('still applies the saved overrides when the rules cannot be read', async () => {
    prisma.transactionCategoryOverride.findMany.mockResolvedValue([{ transactionId: 'new-1', category: ['SHOPS'] }]);
    prisma.transactionCategoryRule.findMany.mockRejectedValue(new Error('relation does not exist'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const data = { bankingTransactions: [purchase('new-1')] };
    await applyCategoryOverrides('user-1', data);
    expect(data.bankingTransactions[0]).toMatchObject({ category: ['SHOPS'], category_source: 'user' });
    warn.mockRestore();
  });

  it('reads a recategorized transaction’s direction from the provider category it had', () => {
    // A payment out the user called income reads as money in on the row.
    const stamped = { transaction_id: 'txn-1', name: 'VENMO', merchant_name: 'Venmo', amount: -1200, category: ['INCOME'], category_source: 'user', transaction_type: 'income' };
    expect(providerMoneyDirection(stamped, ['TRANSFER_OUT'])).toBe('out');
    expect(categoryRuleSubject(stamped)!.direction).toBe('in');
    expect(providerMoneyDirection(stamped, [])).toBeNull();
    // A row the user never categorized is the provider's already.
    expect(providerMoneyDirection({ ...stamped, category_source: undefined }, null)).toBe('in');
  });

  it('writes nothing when no rule covers a new transaction', async () => {
    prisma.transactionCategoryOverride.findMany.mockResolvedValue([]);
    prisma.transactionCategoryRule.findMany.mockResolvedValue([{ ...rule, direction: 'in' }]);
    prisma.transactionCategoryOverride.createMany.mockClear();
    await applyCategoryOverrides('user-1', { bankingTransactions: [purchase('new-1')] });
    expect(prisma.transactionCategoryOverride.createMany).not.toHaveBeenCalled();
  });
});

describe('inferring rules from categories chosen before rules existed', () => {
  const rent = ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'];
  // Venmo payments out, each recategorized as rent; the row now reads as an expense.
  const venmo = (id: string, date: string) => ({
    transaction_id: id, date, name: 'VENMO PAYMENT', merchant_name: 'Venmo', amount: -1200,
    category: rent, category_source: 'user', transaction_type: 'expense',
  });
  const override = (transactionId: string, category = rent, originalCategory = ['TRANSFER_OUT']) => ({ transactionId, category, originalCategory });

  it('makes a rule where a payee’s transactions carry one category the user chose', () => {
    const { rules, setAside } = inferCategoryRules(
      [venmo('v1', '2026-08-01'), venmo('v2', '2026-09-01')],
      [override('v1'), override('v2')],
      [],
    );
    expect(setAside).toBe(0);
    expect(rules).toEqual([{
      counterpartyKey: 'venmo', direction: 'out', investment: false, label: 'Venmo', category: rent, transactionCount: 2, directionFrom: 'provider',
    }]);
  });

  it('keys it by the provider’s direction, however the user’s category reads', () => {
    const asIncome = (id: string) => ({ ...venmo(id, '2026-09-01'), category: ['INCOME'], transaction_type: 'income' });
    const { rules } = inferCategoryRules([asIncome('v1'), asIncome('v2')], [override('v1', ['INCOME']), override('v2', ['INCOME'])], []);
    expect(rules.map(rule => rule.direction)).toEqual(['out']);
  });

  it('makes none from one transaction, from two categories, or where a rule already is', () => {
    const transactions = [venmo('v1', '2026-08-01'), venmo('v2', '2026-09-01'), venmo('v3', '2026-10-01')];
    expect(inferCategoryRules(transactions, [override('v1')], []).rules).toEqual([]);
    expect(inferCategoryRules(transactions, [override('v1'), override('v2'), override('v3', ['GENERAL_SERVICES'])], []).rules).toEqual([]);
    expect(inferCategoryRules(transactions, [override('v1'), override('v2')], [{ counterpartyKey: 'venmo', direction: 'out', investment: false }]).rules)
      .toEqual([]);
  });

  it('reads the direction from the chosen category where the provider’s says nothing, and says so', () => {
    // An old text category names no type, so it can't say which way the money went.
    const { rules } = inferCategoryRules(
      [venmo('v1', '2026-09-01'), venmo('v2', '2026-09-02')],
      [override('v1', rent, ['Transfer']), override('v2', rent, [])],
      [],
    );
    expect(rules).toEqual([expect.objectContaining({ counterpartyKey: 'venmo', direction: 'out', directionFrom: 'user_category' })]);
  });

  it('sets aside what it cannot key: gone from the snapshot, unnamed, or no direction either way', () => {
    const unnamed = { ...venmo('u1', '2026-09-01'), name: '', merchant_name: '' };
    // A category with no cash-flow meaning, on a row with no type left to read.
    const untyped = { ...venmo('x1', '2026-09-01'), category: ['OTHER'], transaction_type: undefined };
    const { rules, setAside } = inferCategoryRules(
      [venmo('v1', '2026-09-01'), unnamed, untyped],
      [override('gone'), override('u1'), override('x1', ['OTHER'], [])],
      [],
    );
    expect(rules).toEqual([]);
    expect(setAside).toBe(3);
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
