/**
 * The cash flow (beta) API: the report and the planned events behind it.
 * Events are the user's own, so ownership on update and delete is part of the
 * contract, and the forecast must reflect a saved event on the next read.
 */

import express from 'express';
import request from 'supertest';
import { ACCOUNTS, householdTransactions } from './factories/cash-flow.factory';

const prisma = {
  financialSummarySnapshot: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  plannedCashFlowEvent: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
  },
};

jest.mock('../../prisma-client', () => ({ getPrismaClient: () => prisma }));
jest.mock('../../auth/middleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'user@example.com', tier: 'premium' };
    next();
  },
}));

import cashFlowRoutes from '../../auth/cash-flow-routes';

const app = express();
app.use(express.json());
app.use('/api/cash-flow', cashFlowRoutes);

const eventRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'event-1',
  userId: 'user-1',
  label: 'Year-end bonus',
  kind: 'income',
  amount: 10000,
  startDate: new Date('2026-12-15T00:00:00.000Z'),
  recurrence: 'once',
  endDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('cash flow routes', () => {
  beforeAll(() => {
    jest.useFakeTimers({
      now: new Date('2026-10-01T18:00:00.000Z'),
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'],
    });
  });
  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.financialSummarySnapshot.findUnique.mockResolvedValue({
      computedAt: new Date('2026-09-30T20:00:00.000Z'),
      asOf: new Date('2026-09-30T19:00:00.000Z'),
      status: 'current',
      accounts: ACCOUNTS,
      transactions: householdTransactions('2026-06-03', '2026-09-30'),
    });
    prisma.user.findUnique.mockResolvedValue({
      timeZone: 'America/Los_Angeles',
      monthlyIncomeOverride: null,
      monthlyExpenseOverride: null,
    });
    prisma.plannedCashFlowEvent.findMany.mockResolvedValue([]);
  });

  describe('GET /api/cash-flow', () => {
    it('returns history and a forecast in the user’s own calendar', async () => {
      const response = await request(app).get('/api/cash-flow?granularity=month&horizonMonths=3');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        today: '2026-10-01',
        dataThrough: '2026-09-30',
        forecastStart: '2026-10-01',
        granularity: 'month',
        forecast: { available: true },
        snapshot: { computedAt: '2026-09-30T20:00:00.000Z', status: 'current' },
      });
      expect(response.body.periods.map((period: any) => period.key)).toContain('2026-12');
      expect(response.body.highlights.map((item: any) => item.key)).toContain('this_month');
      expect(response.body.accounts.map((account: any) => account.id)).toEqual(['checking', 'card']);
    });

    it('feeds saved planned events into the forecast', async () => {
      prisma.plannedCashFlowEvent.findMany.mockResolvedValue([eventRow()]);
      const response = await request(app).get('/api/cash-flow?granularity=quarter&horizonMonths=3');

      const quarter = response.body.highlights.find((item: any) => item.key === 'this_quarter');
      expect(quarter.planned).toEqual({ income: 10000, spending: 0, net: 10000 });
      expect(response.body.plannedEvents).toEqual([
        expect.objectContaining({ id: 'event-1', startDate: '2026-12-15', nextDate: '2026-12-15' }),
      ]);
    });

    it('treats a user without a snapshot as an empty state', async () => {
      prisma.financialSummarySnapshot.findUnique.mockResolvedValue(null);
      const response = await request(app).get('/api/cash-flow');
      expect(response.status).toBe(204);
    });

    it.each([
      ['granularity=day', 'granularity must be week, month, quarter or year'],
      ['horizonMonths=13', 'horizonMonths must be a whole number from 1 to 12'],
      ['horizonMonths=1.5', 'horizonMonths must be a whole number from 1 to 12'],
      ['from=2026-01-01', 'A custom range needs both from and to'],
      ['from=2026-05-01&to=2026-04-01', 'to must be on or after from'],
      ['from=2026-02-30&to=2026-04-01', 'from and to must be dates (YYYY-MM-DD)'],
      ['from=2020-01-01&to=2026-04-01', 'A custom range can span at most three years'],
    ])('rejects %s', async (query, error) => {
      const response = await request(app).get(`/api/cash-flow?${query}`);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error });
    });
  });

  describe('planned events', () => {
    const body = { label: 'Year-end bonus', kind: 'income', amount: 10000, startDate: '2026-12-15', recurrence: 'once' };

    it('creates a validated event for the signed-in user', async () => {
      prisma.plannedCashFlowEvent.count.mockResolvedValue(0);
      prisma.plannedCashFlowEvent.create.mockResolvedValue(eventRow());

      const response = await request(app).post('/api/cash-flow/events').send(body);

      expect(response.status).toBe(201);
      expect(prisma.plannedCashFlowEvent.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          label: 'Year-end bonus',
          kind: 'income',
          amount: 10000,
          startDate: new Date('2026-12-15T00:00:00.000Z'),
          recurrence: 'once',
          endDate: null,
        },
      });
      expect(response.body.event).toEqual({
        id: 'event-1', label: 'Year-end bonus', kind: 'income', amount: 10000, startDate: '2026-12-15', recurrence: 'once', endDate: null,
      });
    });

    it('rejects an invalid event before touching the database', async () => {
      const response = await request(app).post('/api/cash-flow/events').send({ ...body, amount: -5 });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Enter an amount greater than zero' });
      expect(prisma.plannedCashFlowEvent.create).not.toHaveBeenCalled();
    });

    it('caps how many events one user can plan', async () => {
      prisma.plannedCashFlowEvent.count.mockResolvedValue(100);
      const response = await request(app).post('/api/cash-flow/events').send(body);
      expect(response.status).toBe(409);
      expect(prisma.plannedCashFlowEvent.create).not.toHaveBeenCalled();
    });

    it('only updates an event the user owns', async () => {
      prisma.plannedCashFlowEvent.updateMany.mockResolvedValue({ count: 0 });
      const response = await request(app).put('/api/cash-flow/events/someone-elses').send(body);

      expect(response.status).toBe(404);
      expect(prisma.plannedCashFlowEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'someone-elses', userId: 'user-1' } })
      );
    });

    it('returns the updated event', async () => {
      prisma.plannedCashFlowEvent.updateMany.mockResolvedValue({ count: 1 });
      prisma.plannedCashFlowEvent.findFirst.mockResolvedValue(eventRow({ amount: 12000 }));
      const response = await request(app).put('/api/cash-flow/events/event-1').send({ ...body, amount: 12000 });

      expect(response.status).toBe(200);
      expect(response.body.event.amount).toBe(12000);
    });

    it('only deletes an event the user owns', async () => {
      prisma.plannedCashFlowEvent.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      expect((await request(app).delete('/api/cash-flow/events/event-1')).status).toBe(204);
      expect((await request(app).delete('/api/cash-flow/events/someone-elses')).status).toBe(404);
      expect(prisma.plannedCashFlowEvent.deleteMany).toHaveBeenLastCalledWith({ where: { id: 'someone-elses', userId: 'user-1' } });
    });

    it('lists the user’s events as calendar dates', async () => {
      prisma.plannedCashFlowEvent.findMany.mockResolvedValue([eventRow({ recurrence: 'monthly', endDate: new Date('2027-06-15T00:00:00.000Z') })]);
      const response = await request(app).get('/api/cash-flow/events');
      expect(response.body.events).toEqual([
        expect.objectContaining({ startDate: '2026-12-15', endDate: '2027-06-15', recurrence: 'monthly' }),
      ]);
    });
  });
});
