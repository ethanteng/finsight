/**
 * GET /api/finances/accounts/:id/history: one account's value over time, from
 * the current snapshot and the daily history rows that recorded it.
 */

import express from 'express';
import request from 'supertest';

const prisma: Record<string, any> = {
  financialSummarySnapshot: { findUnique: jest.fn(), updateMany: jest.fn() },
  financialSummaryHistory: { findMany: jest.fn() },
  user: { findUnique: jest.fn() },
};

jest.mock('../../prisma-client', () => ({ getPrismaClient: () => prisma }));
jest.mock('../../auth/middleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'user@example.com', tier: 'premium' };
    next();
  },
}));
jest.mock('../../profile/manager', () => ({ ProfileManager: jest.fn() }));
jest.mock('../../services/financial-revision-service', () => ({ FinancialRevisionService: {} }));

import financesRoutes from '../../auth/finances-routes';

const app = express();
app.use('/api/finances', financesRoutes);

const computedAt = new Date('2026-11-20T18:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ timeZone: 'America/New_York' });
  prisma.financialSummaryHistory.findMany.mockResolvedValue([
    {
      computedAt: new Date('2026-11-19T12:00:00.000Z'),
      accountValues: { 'snaptrade-brk-1': { value: 20000, observedAt: '2026-11-19T11:00:00.000Z' } },
    },
  ]);
  prisma.financialSummarySnapshot.findUnique.mockResolvedValue({
    computedAt,
    reportingCurrency: 'USD',
    accounts: [
      {
        account_id: 'snaptrade-brk-1', type: 'investment', subtype: 'brokerage', source: 'snaptrade',
        balance: { current: 21000 }, lastSyncedAt: '2026-11-20T14:00:00.000Z',
      },
      {
        account_id: 'chk-1', type: 'depository', subtype: 'checking', source: 'plaid',
        balance: { current: 1000, iso_currency_code: 'USD' }, lastSyncedAt: '2026-11-20T15:00:00.000Z',
      },
    ],
    holdings: [],
    transactions: [
      { transaction_id: 't1', account_id: 'chk-1', date: '2026-11-19', amount: 40 },
      { transaction_id: 't2', account_id: 'chk-1', date: '2026-11-20', amount: 60 },
    ],
    meta: { accountDisplayBalances: { 'snaptrade-brk-1': 21500, 'chk-1': 1000 } },
  });
});

describe('GET /api/finances/accounts/:id/history', () => {
  it('charts an investment account from what was recorded, ending on the page figure', async () => {
    const response = await request(app).get('/api/finances/accounts/snaptrade-brk-1/history');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      revisionId: computedAt.toISOString(),
      accountId: 'snaptrade-brk-1',
      measure: 'value',
      method: 'recorded',
      currency: 'USD',
      points: [
        { date: '2026-11-19', value: 20000 },
        { date: '2026-11-20', value: 21500 },
      ],
      unconverted: false,
      rebuildRefused: false,
    });
    expect(prisma.financialSummaryHistory.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', observationKind: 'daily' },
      select: { computedAt: true, accountValues: true },
      orderBy: { computedAt: 'asc' },
    });
  });

  it('rebuilds a cash account from its transactions', async () => {
    const response = await request(app).get('/api/finances/accounts/chk-1/history');

    expect(response.status).toBe(200);
    expect(response.body.method).toBe('transactions');
    expect(response.body.points).toEqual([
      { date: '2026-11-19', value: 1060 },
      { date: '2026-11-20', value: 1000 },
    ]);
  });

  it('is a 404 for an account the snapshot does not have', async () => {
    const response = await request(app).get('/api/finances/accounts/missing/history');
    expect(response.status).toBe(404);
  });

  it('is a 404 before any snapshot exists', async () => {
    prisma.financialSummarySnapshot.findUnique.mockResolvedValue(null);
    const response = await request(app).get('/api/finances/accounts/chk-1/history');
    expect(response.status).toBe(404);
  });
});
