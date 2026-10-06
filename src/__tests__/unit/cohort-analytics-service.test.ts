import { firstChargesFromEvents } from '../../cohort-analytics/charges';
import { getActivationReport, getEngagementReport } from '../../cohort-analytics/service';
import { getPrismaClient } from '../../prisma-client';

jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn(),
}));

const at = (iso: string) => new Date(iso);
const seconds = (iso: string) => Math.floor(at(iso).getTime() / 1000);
const now = at('2026-10-07T00:00:00Z');

function invoiceEvent(invoice: Record<string, unknown>, subscriptionUserId: string | null = null) {
  return { eventData: { object: invoice }, processedAt: at('2026-10-06T12:00:00Z'), subscriptionUserId };
}

function user(id: string, createdAt: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    email: `${id}@example.com`,
    createdAt: at(createdAt),
    subscriptionStatus: 'inactive',
    tier: 'premium',
    lastLoginAt: null,
    ...overrides,
  };
}

function fakePrisma(overrides: Record<string, unknown> = {}) {
  const base = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    subscription: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    conversation: { findMany: jest.fn().mockResolvedValue([]) },
    accessToken: { groupBy: jest.fn().mockResolvedValue([]) },
    financialSummaryHistory: { groupBy: jest.fn().mockResolvedValue([]) },
    snapTradeUser: { findMany: jest.fn().mockResolvedValue([]) },
    account: { findMany: jest.fn().mockResolvedValue([]) },
    publicApiCredential: { findMany: jest.fn().mockResolvedValue([]) },
    financialSummarySnapshot: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = { ...base, ...overrides };
  (getPrismaClient as jest.Mock).mockReturnValue(prisma);
  return prisma;
}

const weekly = { cohortGrain: 'week', periodGrain: 'week', cohortCount: 3, periodCount: 2 } as const;

describe('firstChargesFromEvents', () => {
  it('starts the clock at the first charge above zero, resolving the user every way Stripe names it', () => {
    const firsts = firstChargesFromEvents(
      [
        // The $0 invoice that opens a trial is not a charge.
        { eventData: { object: { amount_paid: 0, customer: 'cus_a', created: seconds('2026-09-01T00:00:00Z') } }, processedAt: now, subscriptionUserId: null },
        { eventData: { object: { amount_paid: 900, customer: 'cus_a', status_transitions: { paid_at: seconds('2026-10-01T00:00:00Z') } } }, processedAt: now, subscriptionUserId: null },
        { eventData: { object: { amount_paid: 900, customer: 'cus_a', status_transitions: { paid_at: seconds('2026-11-01T00:00:00Z') } } }, processedAt: now, subscriptionUserId: null },
        // Basil invoices name the subscription under parent.subscription_details.
        { eventData: { object: { amount_paid: 900, customer: 'cus_unknown', parent: { subscription_details: { subscription: 'sub_b' } }, created: seconds('2026-10-02T00:00:00Z') } }, processedAt: now, subscriptionUserId: null },
        // Pre-basil invoices name it at the top level, and the logged row may already know the user.
        { eventData: { object: { amount_paid: 900, subscription: 'sub_x' } }, processedAt: at('2026-10-03T00:00:00Z'), subscriptionUserId: 'c' },
        { eventData: { object: { amount_paid: 900, customer: 'cus_nobody' } }, processedAt: now, subscriptionUserId: null },
      ],
      new Map([['cus_a', 'a']]),
      new Map([['sub_b', 'b']]),
    );
    expect(Object.fromEntries([...firsts].map(([id, date]) => [id, date.toISOString()]))).toEqual({
      a: '2026-10-01T00:00:00.000Z',
      b: '2026-10-02T00:00:00.000Z',
      c: '2026-10-03T00:00:00.000Z',
    });
  });
});

describe('getEngagementReport', () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS;
  afterEach(() => { process.env.ADMIN_EMAILS = originalAdminEmails; });

  it('builds trial cohorts from signups, without operators, from typed questions only', async () => {
    process.env.ADMIN_EMAILS = 'ops@example.com';
    const prisma = fakePrisma({
      user: {
        findMany: jest.fn()
          .mockResolvedValueOnce([]) // Stripe customers
          .mockResolvedValueOnce([user('a', '2026-09-21T09:00:00Z'), user('ops', '2026-09-22T09:00:00Z', { email: 'ops@example.com' })]),
      },
      conversation: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'a', createdAt: at('2026-09-22T09:00:00Z') }]),
      },
    });

    const report = await getEngagementReport({ ...weekly, segment: 'trial' }, { questions: 1, per: 'week' }, now);

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: { in: ['a'] }, origin: 'user' }),
    }));
    expect(report.excluded).toEqual({ operatorAccounts: 1 });
    const [first] = report.cohorts;
    expect(first.size).toBe(1);
    expect(first.members[0].email).toBe('a@example.com');
    expect(first.cells[0]).toEqual({ rate: 1, count: 1, eligible: 1 });
  });

  it('builds paid cohorts from first charges and counts paying accounts it cannot place', async () => {
    fakePrisma({
      $queryRaw: jest.fn().mockResolvedValue([
        invoiceEvent({ amount_paid: 900, status_transitions: { paid_at: seconds('2026-09-29T00:00:00Z') } }, 'p'),
        // Charged before the window opened.
        invoiceEvent({ amount_paid: 900, status_transitions: { paid_at: seconds('2026-08-01T00:00:00Z') } }, 'old'),
      ]),
      user: {
        findMany: jest.fn()
          .mockResolvedValueOnce([]) // Stripe customers
          .mockResolvedValueOnce([user('p', '2026-08-15T00:00:00Z', { subscriptionStatus: 'active' })])
          .mockResolvedValueOnce([{ id: 'p', email: 'p@example.com' }, { id: 'old', email: 'old@example.com' }, { id: 'gap', email: 'gap@example.com' }]),
      },
    });

    const report = await getEngagementReport({ ...weekly, segment: 'paid' }, { questions: 1, per: 'week' }, now);

    const members = report.cohorts.flatMap(row => row.members);
    expect(members.map(m => m.userId)).toEqual(['p']);
    expect(members[0].startedAt).toBe('2026-09-29T00:00:00.000Z');
    expect(members[0].signedUpAt).toBe('2026-08-15T00:00:00.000Z');
    expect(report.excluded).toEqual({ operatorAccounts: 0, payingWithoutRecordedCharge: 1 });
  });
});

describe('getActivationReport', () => {
  it('dates links from every surviving trace and ignores a SnapTrade attempt that never connected', async () => {
    fakePrisma({
      user: {
        findMany: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            user('plaid', '2026-09-21T00:00:00Z'),
            user('removed', '2026-09-21T00:00:00Z'),
            user('attempt', '2026-09-21T00:00:00Z'),
            user('broker', '2026-09-21T00:00:00Z'),
          ]),
      },
      accessToken: { groupBy: jest.fn().mockResolvedValue([{ userId: 'plaid', _min: { createdAt: at('2026-09-22T00:00:00Z') } }]) },
      financialSummaryHistory: {
        groupBy: jest.fn().mockResolvedValue([
          { userId: 'removed', observationReason: 'plaid-connection-disconnected', _min: { computedAt: at('2026-09-30T00:00:00Z') } },
        ]),
      },
      snapTradeUser: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'attempt', createdAt: at('2026-09-23T00:00:00Z'), _count: { activities: 0 } },
          { userId: 'broker', createdAt: at('2026-09-24T00:00:00Z'), _count: { activities: 0 } },
        ]),
      },
      financialSummarySnapshot: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'attempt', accounts: [{ source: 'plaid' }] },
          { userId: 'broker', accounts: [{ source: 'SnapTrade' }] },
        ]),
      },
    });

    const report = await getActivationReport({ ...weekly, segment: 'trial' }, now);

    const byId = Object.fromEntries(report.cohorts.flatMap(row => row.members).map(m => [m.userId, m]));
    expect(byId.plaid).toMatchObject({ firstLinkedAt: '2026-09-22T00:00:00.000Z', linkSources: ['plaid'], activatedInPeriod: 0 });
    expect(byId.removed).toMatchObject({ firstLinkedAt: '2026-09-30T00:00:00.000Z', linkSources: ['plaid'], activatedInPeriod: 1 });
    expect(byId.attempt).toMatchObject({ firstLinkedAt: null, linkSources: [] });
    expect(byId.broker).toMatchObject({ firstLinkedAt: '2026-09-24T00:00:00.000Z', linkSources: ['snaptrade'] });
    const [first] = report.cohorts;
    expect(first.cells[0]).toEqual({ rate: 0.5, count: 2, eligible: 4 });
    expect(first.cells[1]).toEqual({ rate: 0.75, count: 3, eligible: 4 });
  });
});
