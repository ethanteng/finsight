/**
 * The category edit API: one transaction, or it and every transaction that
 * matches it. A bulk edit gives each transaction its own override, so each keeps
 * its own restore point.
 */

import express from 'express';
import request from 'supertest';

const prisma: Record<string, any> = {
  $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  financialSummarySnapshot: { findUnique: jest.fn(), updateMany: jest.fn() },
  transactionCategoryOverride: { findUnique: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
  transactionCategoryRule: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
};

jest.mock('../../prisma-client', () => ({ getPrismaClient: () => prisma }));
jest.mock('../../auth/middleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'user@example.com', tier: 'premium' };
    next();
  },
}));
const schedule = jest.fn();
jest.mock('../../services/financial-revision-service', () => ({
  FinancialRevisionService: { schedule: (...args: unknown[]) => schedule(...args) },
}));

import transactionCategoryRoutes from '../../auth/transaction-categories-routes';

const app = express();
app.use(express.json());
app.use('/api/transaction-categories', transactionCategoryRoutes);

const computedAt = new Date('2026-10-01T00:00:00.000Z');
const snapshotTransactions = () => [
  { transaction_id: 'txn-1', name: 'VENMO PAYMENT 1234', merchant_name: 'Venmo', amount: -1200, category: ['TRANSFER_OUT'], transaction_type: 'transfer_out' },
  { transaction_id: 'txn-2', name: 'VENMO PAYMENT 5678', merchant_name: 'Venmo', amount: -1200, category: ['TRANSFER_OUT'], transaction_type: 'transfer_out' },
  // Already set by the user: keeps the provider category it had then.
  { transaction_id: 'txn-3', name: 'VENMO PAYMENT 9012', merchant_name: 'Venmo', amount: -1200, category: ['RENT_AND_UTILITIES'], category_source: 'user', transaction_type: 'expense' },
  // Money a friend sent: not the same as paying someone.
  { transaction_id: 'txn-4', name: 'VENMO CASHOUT', merchant_name: 'Venmo', amount: 60, category: ['TRANSFER_IN'], transaction_type: 'transfer_in' },
  { transaction_id: 'txn-5', name: 'Safeway', merchant_name: 'Safeway', amount: -82.1, category: ['FOOD_AND_DRINK'], transaction_type: 'expense' },
];

beforeEach(() => {
  jest.clearAllMocks();
  prisma.financialSummarySnapshot.findUnique.mockResolvedValue({ computedAt, transactions: snapshotTransactions() });
  prisma.financialSummarySnapshot.updateMany.mockResolvedValue({ count: 1 });
  prisma.transactionCategoryOverride.findUnique.mockResolvedValue(null);
  prisma.transactionCategoryRule.findMany.mockResolvedValue([]);
  prisma.transactionCategoryRule.upsert.mockImplementation(async (args: any) => ({ id: 'rule-1', ...args.create }));
  prisma.transactionCategoryRule.deleteMany.mockResolvedValue({ count: 1 });
  prisma.transactionCategoryOverride.upsert.mockImplementation(async (args: any) => ({
    transactionId: args.where.userId_transactionId.transactionId,
    category: args.create.category,
    originalCategory: args.create.originalCategory,
    updatedAt: new Date(),
  }));
});

describe('GET /api/transaction-categories/:transactionId/matches', () => {
  it('counts the other transactions with the same payee, money moving the same way', async () => {
    const response = await request(app).get('/api/transaction-categories/txn-1/matches');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ count: 2, direction: 'out', canApplyToMatching: true, rule: null });
  });

  it('offers a rule for a payee with no other transactions yet, and names the rule it already has', async () => {
    prisma.transactionCategoryRule.findMany.mockResolvedValue([
      { id: 'rule-1', counterpartyKey: 'safeway', direction: 'out', investment: false, label: 'Safeway', category: ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES'] },
    ]);
    const response = await request(app).get('/api/transaction-categories/txn-5/matches');
    expect(response.body.data).toEqual({
      count: 0, direction: 'out', canApplyToMatching: true, rule: { id: 'rule-1', category: ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES'] },
    });
  });

  it('is a 404 for a transaction the snapshot does not have', async () => {
    const response = await request(app).get('/api/transaction-categories/missing/matches');
    expect(response.status).toBe(404);
  });
});

describe('PUT /api/transaction-categories/:transactionId', () => {
  it('with applyToMatching, sets the category on the transaction and every match', async () => {
    const response = await request(app)
      .put('/api/transaction-categories/txn-1')
      .send({ primary: 'RENT_AND_UTILITIES', detailed: 'RENT_AND_UTILITIES_RENT', applyToMatching: true });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      transactionId: 'txn-1',
      category: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'],
      appliedTo: ['txn-1', 'txn-2', 'txn-3'],
      appliesToNew: true,
    });

    // Saved as the payee's rule in the same write, so new Venmo payments get it too.
    expect(prisma.transactionCategoryRule.upsert).toHaveBeenCalledWith({
      where: { userId_counterpartyKey_direction_investment: { userId: 'user-1', counterpartyKey: 'venmo', direction: 'out', investment: false } },
      create: {
        userId: 'user-1', counterpartyKey: 'venmo', direction: 'out', investment: false, label: 'Venmo',
        category: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'],
      },
      update: { category: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'], label: 'Venmo' },
    });

    // One override each, written together, each with its own restore point.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const upserts = prisma.transactionCategoryOverride.upsert.mock.calls.map((call: any[]) => call[0]);
    expect(upserts.map((args: any) => args.where.userId_transactionId)).toEqual([
      { userId: 'user-1', transactionId: 'txn-1' },
      { userId: 'user-1', transactionId: 'txn-2' },
      { userId: 'user-1', transactionId: 'txn-3' },
    ]);
    expect(upserts[0].create.originalCategory).toEqual(['TRANSFER_OUT']);
    // The user's earlier choice is not a provider category to restore to.
    expect(upserts[2].create.originalCategory).toEqual([]);
    expect(upserts.every((args: any) => !('originalCategory' in args.update))).toBe(true);

    // One guarded snapshot write covers all three; the payment in and the other payee are untouched.
    expect(prisma.financialSummarySnapshot.updateMany).toHaveBeenCalledTimes(1);
    const written = prisma.financialSummarySnapshot.updateMany.mock.calls[0][0].data.transactions;
    expect(written.map((transaction: any) => transaction.category)).toEqual([
      ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'],
      ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'],
      ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'],
      ['TRANSFER_IN'],
      ['FOOD_AND_DRINK'],
    ]);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('keeps a recategorized payee’s rule keyed the way the provider moves its money', async () => {
    // txn-1 is a payment out the user already called income, which reads as money in on the row.
    prisma.financialSummarySnapshot.findUnique.mockResolvedValue({
      computedAt,
      transactions: snapshotTransactions().map(transaction => transaction.transaction_id === 'txn-1'
        ? { ...transaction, category: ['INCOME', 'INCOME_OTHER_INCOME'], category_source: 'user', transaction_type: 'income' }
        : transaction),
    });
    prisma.transactionCategoryOverride.findUnique.mockResolvedValue({ originalCategory: ['TRANSFER_OUT'] });
    await request(app).put('/api/transaction-categories/txn-1').send({ primary: 'RENT_AND_UTILITIES', applyToMatching: true });
    expect(prisma.transactionCategoryRule.upsert.mock.calls[0][0].where.userId_counterpartyKey_direction_investment)
      .toMatchObject({ counterpartyKey: 'venmo', direction: 'out' });
  });

  it('without it, still sets only the one transaction', async () => {
    const response = await request(app)
      .put('/api/transaction-categories/txn-1')
      .send({ primary: 'RENT_AND_UTILITIES' });

    expect(response.status).toBe(200);
    expect(response.body.data.appliedTo).toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.transactionCategoryRule.upsert).not.toHaveBeenCalled();
    expect(prisma.transactionCategoryOverride.upsert).toHaveBeenCalledTimes(1);
    const written = prisma.financialSummarySnapshot.updateMany.mock.calls[0][0].data.transactions;
    expect(written.map((transaction: any) => transaction.category[0])).toEqual([
      'RENT_AND_UTILITIES', 'TRANSFER_OUT', 'RENT_AND_UTILITIES', 'TRANSFER_IN', 'FOOD_AND_DRINK',
    ]);
  });

  it('rejects an unknown category before writing anything', async () => {
    const response = await request(app)
      .put('/api/transaction-categories/txn-1')
      .send({ primary: 'NOT_A_CATEGORY', applyToMatching: true });
    expect(response.status).toBe(400);
    expect(prisma.transactionCategoryOverride.upsert).not.toHaveBeenCalled();
  });

  it('is a 404 when the transaction to match from is not in the snapshot', async () => {
    const response = await request(app)
      .put('/api/transaction-categories/missing')
      .send({ primary: 'RENT_AND_UTILITIES', applyToMatching: true });
    expect(response.status).toBe(404);
    expect(prisma.transactionCategoryOverride.upsert).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/transaction-categories/:transactionId', () => {
  const stamped = () => snapshotTransactions().map(transaction => transaction.transaction_id === 'txn-1'
    ? { ...transaction, category: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'], category_source: 'user', transaction_type: 'expense' }
    : transaction);

  it('stops the rule that gave the payee the category, and leaves the others it reached alone', async () => {
    prisma.financialSummarySnapshot.findUnique.mockResolvedValue({ computedAt, transactions: stamped() });
    prisma.transactionCategoryOverride.findUnique.mockResolvedValue({
      originalCategory: ['TRANSFER_OUT'], category: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'],
    });
    prisma.transactionCategoryRule.findMany.mockResolvedValue([
      { id: 'rule-venmo', counterpartyKey: 'venmo', direction: 'out', investment: false, label: 'Venmo', category: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'] },
      { id: 'rule-safeway', counterpartyKey: 'safeway', direction: 'out', investment: false, label: 'Safeway', category: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'] },
    ]);

    const response = await request(app).delete('/api/transaction-categories/txn-1');
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ category: ['TRANSFER_OUT'], ruleRemoved: true });
    expect(prisma.transactionCategoryRule.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', id: { in: ['rule-venmo'] } } });
    // Only the restored transaction changes.
    const written = prisma.financialSummarySnapshot.updateMany.mock.calls[0][0].data.transactions;
    expect(written.map((transaction: any) => transaction.category[0])).toEqual([
      'TRANSFER_OUT', 'TRANSFER_OUT', 'RENT_AND_UTILITIES', 'TRANSFER_IN', 'FOOD_AND_DRINK',
    ]);
  });

  it('keeps the payee’s rule for money the other way, though it gives the same category', async () => {
    prisma.financialSummarySnapshot.findUnique.mockResolvedValue({ computedAt, transactions: stamped() });
    prisma.transactionCategoryOverride.findUnique.mockResolvedValue({
      originalCategory: ['TRANSFER_OUT'], category: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'],
    });
    prisma.transactionCategoryRule.findMany.mockResolvedValue([
      { id: 'rule-out', counterpartyKey: 'venmo', direction: 'out', investment: false, label: 'Venmo', category: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'] },
      { id: 'rule-in', counterpartyKey: 'venmo', direction: 'in', investment: false, label: 'Venmo', category: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'] },
    ]);
    await request(app).delete('/api/transaction-categories/txn-1');
    expect(prisma.transactionCategoryRule.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', id: { in: ['rule-out'] } } });
  });

  it('keeps a rule for another category: this transaction was set apart from it', async () => {
    prisma.financialSummarySnapshot.findUnique.mockResolvedValue({ computedAt, transactions: stamped() });
    prisma.transactionCategoryOverride.findUnique.mockResolvedValue({
      originalCategory: ['TRANSFER_OUT'], category: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'],
    });
    prisma.transactionCategoryRule.findMany.mockResolvedValue([
      { id: 'rule-venmo', counterpartyKey: 'venmo', direction: 'out', investment: false, label: 'Venmo', category: ['GENERAL_SERVICES'] },
    ]);
    const response = await request(app).delete('/api/transaction-categories/txn-1');
    expect(response.body.data.ruleRemoved).toBe(false);
    expect(prisma.transactionCategoryRule.deleteMany).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/transaction-categories/rules/:ruleId', () => {
  it('removes only the user’s own rule', async () => {
    expect((await request(app).delete('/api/transaction-categories/rules/rule-1')).status).toBe(200);
    expect(prisma.transactionCategoryRule.deleteMany).toHaveBeenCalledWith({ where: { id: 'rule-1', userId: 'user-1' } });
    prisma.transactionCategoryRule.deleteMany.mockResolvedValue({ count: 0 });
    expect((await request(app).delete('/api/transaction-categories/rules/someone-elses')).status).toBe(404);
  });
});
