/**
 * The cash flow (beta) API: the report and the planned events behind it.
 * Events are the user's own, so ownership on update and delete is part of the
 * contract, and the forecast must reflect a saved event on the next read.
 */

import express from 'express';
import request from 'supertest';
import { ACCOUNTS, householdTransactions } from './factories/cash-flow.factory';

const prisma: Record<string, any> = {
  $transaction: jest.fn(async (work: (tx: unknown) => unknown) => work(prisma)),
  $executeRaw: jest.fn().mockResolvedValue(1),
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
  cashFlowForecastAdjustment: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
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
  accountId: null,
  toAccountId: null,
  paymentMode: null,
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
    prisma.cashFlowForecastAdjustment.findMany.mockResolvedValue([]);
    prisma.cashFlowForecastAdjustment.findFirst.mockResolvedValue(null);
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

  describe('GET /api/cash-flow for chosen accounts', () => {
    it('covers only the cash accounts asked for', async () => {
      const response = await request(app).get('/api/cash-flow?granularity=month&horizonMonths=3&accounts=checking');
      expect(response.status).toBe(200);
      expect(response.body.position).toMatchObject({ available: true, accountIds: ['checking'], startingCash: 5200 });
      expect(response.body.position.accounts).toEqual([expect.objectContaining({ id: 'checking', primary: true })]);
    });

    it('refuses an unreasonable number of accounts', async () => {
      const accounts = Array.from({ length: 21 }, (_, index) => `account-${index}`).join(',');
      const response = await request(app).get(`/api/cash-flow?accounts=${accounts}`);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Choose at most 20 accounts' });
    });
  });

  describe('GET /api/cash-flow/expected-monthly', () => {
    it('returns the month the forecast expects, which the Finances page shows', async () => {
      const response = await request(app).get('/api/cash-flow/expected-monthly');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        incomeSource: 'transactions',
        spendingSource: 'transactions',
        forecast: { available: true },
        learned: null,
        snapshot: { computedAt: '2026-09-30T20:00:00.000Z' },
      });
      // Biweekly $2,500 pay is 26 paychecks a year.
      expect(response.body.income).toBeCloseTo(2500 * 26 / 12, 0);
      expect(response.body.spending).toBeGreaterThan(2000);
    });

    it('returns an override as the figure, beside what the transactions alone would give', async () => {
      prisma.user.findUnique.mockResolvedValue({
        timeZone: 'America/Los_Angeles',
        monthlyIncomeOverride: null,
        monthlyExpenseOverride: 9035,
      });
      const learned = (await request(app).get('/api/cash-flow/expected-monthly')).body;
      expect(learned).toMatchObject({ spending: 9035, spendingSource: 'override', incomeSource: 'transactions' });
      expect(learned.learned.spending).toBeGreaterThan(2000);
      expect(learned.learned.spending).not.toBe(9035);
      expect(learned.learned.income).toBe(learned.income);
    });

    it('is empty until there is a snapshot', async () => {
      prisma.financialSummarySnapshot.findUnique.mockResolvedValue(null);
      const response = await request(app).get('/api/cash-flow/expected-monthly');
      expect(response.status).toBe(204);
    });

    it('fails without leaking the error', async () => {
      prisma.financialSummarySnapshot.findUnique.mockRejectedValue(new Error('database down'));
      const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
      const response = await request(app).get('/api/cash-flow/expected-monthly');
      quiet.mockRestore();
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to load your expected month' });
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
          accountId: null,
          toAccountId: null,
          paymentMode: null,
        },
      });
      expect(response.body.event).toEqual({
        id: 'event-1', label: 'Year-end bonus', kind: 'income', amount: 10000, startDate: '2026-12-15', recurrence: 'once', endDate: null,
        accountId: null, toAccountId: null, paymentMode: null,
      });
    });

    it('counts and creates under a per-user lock, so concurrent creates cannot pass the cap together', async () => {
      prisma.plannedCashFlowEvent.count.mockResolvedValue(0);
      prisma.plannedCashFlowEvent.create.mockResolvedValue(eventRow());

      await request(app).post('/api/cash-flow/events').send(body);

      const [sql, lockedUserId] = prisma.$executeRaw.mock.calls[0];
      expect(sql.join('?')).toContain('pg_advisory_xact_lock');
      expect(lockedUserId).toBe('user-1');
      const lockOrder = prisma.$executeRaw.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(prisma.plannedCashFlowEvent.count.mock.invocationCallOrder[0]);
      expect(prisma.plannedCashFlowEvent.count).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });

    const cardPayment = { label: 'Pay off Rewards Card', kind: 'card_payment', paymentMode: 'full', accountId: 'card', startDate: '2026-11-01', recurrence: 'once' };

    it('creates a card payment for one of the user’s own cards', async () => {
      prisma.plannedCashFlowEvent.count.mockResolvedValue(0);
      prisma.plannedCashFlowEvent.create.mockResolvedValue(eventRow({ kind: 'card_payment', amount: 0, accountId: 'card', paymentMode: 'full' }));

      const response = await request(app).post('/api/cash-flow/events').send(cardPayment);

      expect(response.status).toBe(201);
      expect(prisma.plannedCashFlowEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'card_payment', amount: 0, accountId: 'card', paymentMode: 'full' }),
      });
      expect(response.body.event).toMatchObject({ kind: 'card_payment', accountId: 'card', paymentMode: 'full' });
    });

    it.each([
      ['an account that is not a card', 'checking'],
      ['an account the user does not have', 'someone-elses-card'],
    ])('refuses a card payment to %s', async (_label, accountId) => {
      const response = await request(app).post('/api/cash-flow/events').send({ ...cardPayment, accountId });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Choose one of your connected credit cards' });
      expect(prisma.plannedCashFlowEvent.create).not.toHaveBeenCalled();
    });

    it('saves income in the cash account the user chose', async () => {
      prisma.plannedCashFlowEvent.count.mockResolvedValue(0);
      prisma.plannedCashFlowEvent.create.mockResolvedValue(eventRow({ accountId: 'checking' }));

      const response = await request(app).post('/api/cash-flow/events').send({ ...body, accountId: 'checking' });

      expect(response.status).toBe(201);
      expect(prisma.plannedCashFlowEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'income', accountId: 'checking', paymentMode: null }),
      });
    });

    it.each([
      ['a credit card', 'card'],
      ['an account the user does not have', 'someone-elses-checking'],
    ])('refuses to land income in %s', async (_label, accountId) => {
      const response = await request(app).post('/api/cash-flow/events').send({ ...body, accountId });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Choose one of your connected checking or savings accounts' });
      expect(prisma.plannedCashFlowEvent.create).not.toHaveBeenCalled();
    });

    describe('transfers', () => {
      const transfer = {
        label: 'Move to savings', kind: 'transfer', amount: 500, accountId: 'checking', toAccountId: 'savings',
        startDate: '2026-11-01', recurrence: 'monthly',
      };
      const SAVINGS = { account_id: 'savings', name: 'Savings', type: 'depository', subtype: 'savings', balance: { current: 100 } };

      beforeEach(() => {
        prisma.financialSummarySnapshot.findUnique.mockResolvedValue({ accounts: [...ACCOUNTS, SAVINGS] });
      });

      it('saves a transfer between two of the user’s own cash accounts', async () => {
        prisma.plannedCashFlowEvent.count.mockResolvedValue(0);
        prisma.plannedCashFlowEvent.create.mockResolvedValue(eventRow({ kind: 'transfer', accountId: 'checking', toAccountId: 'savings' }));

        const response = await request(app).post('/api/cash-flow/events').send(transfer);

        expect(response.status).toBe(201);
        expect(prisma.plannedCashFlowEvent.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ kind: 'transfer', amount: 500, accountId: 'checking', toAccountId: 'savings', paymentMode: null }),
        });
        expect(response.body.event).toMatchObject({ kind: 'transfer', accountId: 'checking', toAccountId: 'savings' });
      });

      it.each([
        ['from a credit card', { accountId: 'card' }],
        ['to a credit card', { toAccountId: 'card' }],
        ['to an account the user does not have', { toAccountId: 'someone-elses-savings' }],
        ['to an investment account', { toAccountId: 'brokerage' }],
      ])('refuses a transfer %s', async (_label, accounts) => {
        const response = await request(app).post('/api/cash-flow/events').send({ ...transfer, ...accounts });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Choose two of your connected checking or savings accounts' });
        expect(prisma.plannedCashFlowEvent.create).not.toHaveBeenCalled();
      });

      it('checks both accounts on update too', async () => {
        const response = await request(app).put('/api/cash-flow/events/event-1').send({ ...transfer, toAccountId: 'card' });
        expect(response.status).toBe(400);
        expect(prisma.plannedCashFlowEvent.updateMany).not.toHaveBeenCalled();
      });
    });

    it('checks the card on update too', async () => {
      const response = await request(app).put('/api/cash-flow/events/event-1').send({ ...cardPayment, accountId: 'checking' });
      expect(response.status).toBe(400);
      expect(prisma.plannedCashFlowEvent.updateMany).not.toHaveBeenCalled();
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

  describe('forecast adjustments', () => {
    const adjustmentRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'adjustment-1',
      userId: 'user-1',
      kind: 'exclude_payee',
      flow: 'spending',
      key: 'oak street apartments',
      label: 'Oak Street Apartments',
      createdAt: new Date(),
      ...overrides,
    });
    const leaveOutRent = { kind: 'exclude_payee', flow: 'spending', key: 'oak street apartments' };

    it('leaves a payee out, labelled from the user’s own data under a per-user lock', async () => {
      prisma.cashFlowForecastAdjustment.count.mockResolvedValue(0);
      prisma.cashFlowForecastAdjustment.create.mockResolvedValue(adjustmentRow());

      const response = await request(app).post('/api/cash-flow/adjustments').send({ ...leaveOutRent, label: 'Anything the client says' });

      expect(response.status).toBe(201);
      expect(response.body.adjustment).toEqual({
        id: 'adjustment-1', kind: 'exclude_payee', flow: 'spending', key: 'oak street apartments', label: 'Oak Street Apartments',
      });
      expect(prisma.cashFlowForecastAdjustment.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', kind: 'exclude_payee', flow: 'spending', key: 'oak street apartments', label: 'Oak Street Apartments' },
      });
      const lock = prisma.$executeRaw.mock.calls[0];
      expect(lock[0].join('?')).toContain('pg_advisory_xact_lock(872014273, hashtext(?))');
      expect(lock[1]).toBe('user-1');
    });

    it('refuses an item that is not in the user’s data', async () => {
      const response = await request(app).post('/api/cash-flow/adjustments').send({ ...leaveOutRent, key: 'someone else' });
      expect(response.status).toBe(404);
      expect(prisma.cashFlowForecastAdjustment.create).not.toHaveBeenCalled();
    });

    it('counts a one-off it found, and returns a saved choice instead of saving it twice', async () => {
      const report = await request(app).get('/api/cash-flow?granularity=month&horizonMonths=3');
      const flight = report.body.oneOffs.find((item: any) => item.label === 'United Airlines');
      expect(flight).toBeDefined();
      prisma.cashFlowForecastAdjustment.count.mockResolvedValue(0);
      prisma.cashFlowForecastAdjustment.create.mockImplementation(async ({ data }: any) => adjustmentRow({ ...data, id: 'counted' }));

      const counted = await request(app).post('/api/cash-flow/adjustments').send({ kind: 'include_one_off', flow: 'spending', key: flight.id });
      expect(counted.status).toBe(201);
      expect(counted.body.adjustment).toMatchObject({ kind: 'include_one_off', key: flight.id, label: 'United Airlines' });

      prisma.cashFlowForecastAdjustment.findMany.mockResolvedValue([adjustmentRow({ id: 'counted', kind: 'include_one_off', key: flight.id, label: 'United Airlines' })]);
      prisma.cashFlowForecastAdjustment.create.mockClear();
      const again = await request(app).post('/api/cash-flow/adjustments').send({ kind: 'include_one_off', flow: 'spending', key: flight.id });
      expect(again.status).toBe(200);
      expect(again.body.adjustment.id).toBe('counted');
      expect(prisma.cashFlowForecastAdjustment.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid choice before loading anything', async () => {
      const response = await request(app).post('/api/cash-flow/adjustments').send({ kind: 'delete_everything', flow: 'spending', key: 'x' });
      expect(response.status).toBe(400);
      expect(prisma.financialSummarySnapshot.findUnique).not.toHaveBeenCalled();
    });

    it('caps how many changes one user can make', async () => {
      prisma.cashFlowForecastAdjustment.count.mockResolvedValue(200);
      const response = await request(app).post('/api/cash-flow/adjustments').send(leaveOutRent);
      expect(response.status).toBe(409);
      expect(prisma.cashFlowForecastAdjustment.create).not.toHaveBeenCalled();
    });

    it('applies saved choices to the forecast, and lists them', async () => {
      prisma.cashFlowForecastAdjustment.findMany.mockResolvedValue([adjustmentRow()]);
      const response = await request(app).get('/api/cash-flow?granularity=month&horizonMonths=3');
      expect(response.body.recurring.map((item: any) => item.label)).not.toContain('Oak Street Apartments');
      expect(response.body.adjustments).toEqual([
        expect.objectContaining({ id: 'adjustment-1', kind: 'exclude_payee', label: 'Oak Street Apartments', date: null, amount: null }),
      ]);
      // History still has the rent that was paid.
      const september = response.body.periods.find((period: any) => period.key === '2026-09');
      expect(september.actual.spending).toBeGreaterThan(2000);
    });

    it('only undoes a change the user made', async () => {
      prisma.cashFlowForecastAdjustment.deleteMany.mockResolvedValue({ count: 0 });
      expect((await request(app).delete('/api/cash-flow/adjustments/someone-elses')).status).toBe(404);
      expect(prisma.cashFlowForecastAdjustment.deleteMany).toHaveBeenCalledWith({ where: { id: 'someone-elses', userId: 'user-1' } });

      prisma.cashFlowForecastAdjustment.deleteMany.mockResolvedValue({ count: 1 });
      expect((await request(app).delete('/api/cash-flow/adjustments/adjustment-1')).status).toBe(204);
    });
  });
});
