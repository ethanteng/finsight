import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const findMany = jest.fn<(..._args: any[]) => Promise<Array<{ id: string }>>>();

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({ user: { findMany } }),
}));

import { SummaryCacheService } from '../../services/summary-cache-service';

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
      success: true,
      usersProcessed: 1,
    });
    expect(computeForUser).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });
});
