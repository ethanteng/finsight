import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const findMany = jest.fn<(..._args: any[]) => Promise<Array<{ id: string }>>>();

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({ user: { findMany } }),
}));

import { SummaryCacheService, refreshEligibleUserWhere } from '../../services/summary-cache-service';
import { REFRESH_ELIGIBLE_SUBSCRIPTION_STATUSES } from '../../services/subscription-refresh-eligibility';

describe('SummaryCacheService.refreshAllUsers', () => {
  let computeForUser: jest.SpiedFunction<typeof SummaryCacheService.computeForUser>;

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([]);
    computeForUser = jest
      .spyOn(SummaryCacheService, 'computeForUser')
      .mockResolvedValue({} as any);
  });

  afterEach(() => {
    computeForUser.mockRestore();
  });

  it('selects users with any financial data source, not just Plaid', async () => {
    await SummaryCacheService.refreshAllUsers();

    expect(findMany).toHaveBeenCalledWith({
      where: {
        subscriptionStatus: { in: [...REFRESH_ELIGIBLE_SUBSCRIPTION_STATUSES] },
        OR: [
          { accessTokens: { some: { isActive: true } } },
          { snapTradeUser: { is: { activities: { some: {} } } } },
          { manualAccounts: { some: {} } },
          {
            financialSummarySnapshot: {
              is: {
                OR: [
                  { investmentPortfolio: { path: ['holdingCount'], gt: 0 } },
                  { financialOverview: { path: ['homeValue'], gt: 0 } },
                ],
              },
            },
          },
        ],
      },
      select: { id: true },
    });
  });

  // /health/cron counts frozen snapshots using this same predicate. If the two
  // diverge, that count starts including users no scheduled run rebuilds -- a
  // login-only user's snapshot is never refreshed -- and can no longer fall
  // back to zero.
  it('selects using the shared refresh-eligibility predicate', async () => {
    await SummaryCacheService.refreshAllUsers();

    expect(findMany).toHaveBeenCalledWith({
      where: refreshEligibleUserWhere(),
      select: { id: true },
    });
  });

  it('returns a fresh predicate object per call so callers cannot mutate a shared one', () => {
    const first = refreshEligibleUserWhere();
    const second = refreshEligibleUserWhere();

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  // Cancellation rewrites subscription status and nothing else: the user keeps
  // every AccessToken, manual account and snapshot they had. So a source clause
  // alone never stops matching them, and this cron would keep spending provider
  // calls on someone authenticateUser refuses to log in.
  it('excludes a canceled subscriber', () => {
    const statuses = refreshEligibleUserWhere().subscriptionStatus.in;

    expect(statuses).not.toContain('canceled');
  });

  // 'inactive' is the status every user is created with, so it is what an
  // admin-created account that never goes through Stripe checkout keeps
  // permanently. Excluding it would silently freeze those users' data.
  it('keeps admin-created and grace-period users eligible', () => {
    const statuses = refreshEligibleUserWhere().subscriptionStatus.in;

    expect(statuses).toEqual(expect.arrayContaining(['active', 'trialing', 'past_due', 'inactive']));
  });

  // The status and source conditions are separate top-level keys, which Prisma
  // ANDs. Folding the status into the OR would make any one source enough to
  // qualify a canceled user and quietly undo the gate.
  it('requires both an eligible subscription and a refreshable source', () => {
    const where = refreshEligibleUserWhere();

    expect(where.subscriptionStatus).toBeDefined();
    expect(where.OR.length).toBeGreaterThan(0);
    expect(JSON.stringify(where.OR)).not.toContain('subscriptionStatus');
  });

  // Snapshot existence alone must never make a user eligible: recomputeIfStale
  // writes one on every login, so gating on it would pull in users with nothing
  // connected. Only a snapshot carrying holdings or a home value counts.
  it('does not treat a bare snapshot as evidence of a refreshable source', () => {
    const snapshotClause = refreshEligibleUserWhere().OR.find(
      (clause: any) => clause.financialSummarySnapshot
    ) as any;

    expect(snapshotClause.financialSummarySnapshot.is.OR).toEqual([
      { investmentPortfolio: { path: ['holdingCount'], gt: 0 } },
      { financialOverview: { path: ['homeValue'], gt: 0 } },
    ]);
  });

  it('proves a SnapTrade connection with data this cron does not itself write', async () => {
    await SummaryCacheService.refreshAllUsers();

    const clauses = findMany.mock.calls[0][0].where.OR;
    // `snaptrade-` Account rows require Plaid banking transactions, and SnapTradeActivity
    // rows require categorize: true, which only refreshAllUsers passes. Selecting on
    // either would be circular: a SnapTrade-only user is skipped, so the evidence proving
    // they should not be skipped never gets written.
    expect(JSON.stringify(clauses)).not.toContain('startsWith');
    expect(clauses).toContainEqual({
      financialSummarySnapshot: {
        is: {
          OR: [
            { investmentPortfolio: { path: ['holdingCount'], gt: 0 } },
            { financialOverview: { path: ['homeValue'], gt: 0 } },
          ],
        },
      },
    });
  });

  it('rebuilds snapshots for users without a Plaid connection', async () => {
    findMany.mockResolvedValue([
      { id: 'snaptrade-holdings-user' },
      { id: 'manual-only-user' },
      { id: 'home-only-user' },
    ]);

    await expect(SummaryCacheService.refreshAllUsers()).resolves.toEqual({
      success: true,
      usersProcessed: 3,
      usersFailed: 0,
      usersRetained: 0,
      processedUserIds: ['snaptrade-holdings-user', 'manual-only-user', 'home-only-user'],
      retainedUserIds: [],
      errors: [],
    });
    expect(computeForUser).toHaveBeenCalledWith('snaptrade-holdings-user', { categorize: true });
    expect(computeForUser).toHaveBeenCalledWith('manual-only-user', { categorize: true });
    expect(computeForUser).toHaveBeenCalledWith('home-only-user', { categorize: true });
  });

  it('keeps refreshing remaining users when one fails', async () => {
    findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    computeForUser.mockRejectedValueOnce(new Error('provider down'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(SummaryCacheService.refreshAllUsers()).resolves.toEqual({
      success: false,
      usersProcessed: 1,
      usersFailed: 1,
      usersRetained: 0,
      processedUserIds: ['b'],
      retainedUserIds: [],
      errors: [{ userId: 'a', error: 'provider down' }],
    });
    expect(computeForUser).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  // A retained user is processed successfully and leaves the run green, so
  // usersProcessed alone reports a refresh that never touched the stored
  // revision. Reporting retention separately is the only way a reader of the
  // cron output can tell a frozen snapshot from a refreshed one.
  it('reports users whose snapshot was retained rather than rewritten', async () => {
    findMany.mockResolvedValue([{ id: 'refreshed' }, { id: 'frozen' }]);
    computeForUser.mockResolvedValueOnce({} as any);
    computeForUser.mockResolvedValueOnce({ retainedPriorRevision: true } as any);

    await expect(SummaryCacheService.refreshAllUsers()).resolves.toEqual({
      success: true,
      usersProcessed: 2,
      usersFailed: 0,
      usersRetained: 1,
      processedUserIds: ['refreshed', 'frozen'],
      retainedUserIds: ['frozen'],
      errors: [],
    });
  });

  it('counts a retained user as processed, not failed', async () => {
    findMany.mockResolvedValue([{ id: 'frozen' }]);
    computeForUser.mockResolvedValue({ retainedPriorRevision: true } as any);

    const result = await SummaryCacheService.refreshAllUsers();

    // Retention is a protective success: it must not turn the cron red, or a
    // provider that stays partial for days leaves the job permanently failing.
    expect(result.success).toBe(true);
    expect(result.usersFailed).toBe(0);
    expect(result.usersRetained).toBe(1);
  });
});
