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
  { transaction_id: 'txn-1', name: 'VENMO PAYMENT 1234', merchant_name: 'Venmo', amount: -1200, category: ['TRANSFER_OUT'] },
  { transaction_id: 'txn-2', name: 'VENMO PAYMENT 5678', merchant_name: 'Venmo', amount: -1200, category: ['TRANSFER_OUT'] },
  // Already set by the user: keeps the provider category it had then.
  { transaction_id: 'txn-3', name: 'VENMO PAYMENT 9012', merchant_name: 'Venmo', amount: -1200, category: ['RENT_AND_UTILITIES'], category_source: 'user' },
  // Money a friend sent: not the same as paying someone.
  { transaction_id: 'txn-4', name: 'VENMO CASHOUT', merchant_name: 'Venmo', amount: 60, category: ['TRANSFER_IN'] },
  { transaction_id: 'txn-5', name: 'Safeway', merchant_name: 'Safeway', amount: -82.1, category: ['FOOD_AND_DRINK'] },
];

beforeEach(() => {
  jest.clearAllMocks();
  prisma.financialSummarySnapshot.findUnique.mockResolvedValue({ computedAt, transactions: snapshotTransactions() });
  prisma.financialSummarySnapshot.updateMany.mockResolvedValue({ count: 1 });
  prisma.transactionCategoryOverride.findUnique.mockResolvedValue(null);
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
    expect(response.body.data).toEqual({ count: 2 });
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

  it('without it, still sets only the one transaction', async () => {
    const response = await request(app)
      .put('/api/transaction-categories/txn-1')
      .send({ primary: 'RENT_AND_UTILITIES' });

    expect(response.status).toBe(200);
    expect(response.body.data.appliedTo).toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
