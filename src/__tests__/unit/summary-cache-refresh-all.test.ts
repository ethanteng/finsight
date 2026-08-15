import { beforeEach, describe, expect, it, jest } from '@jest/globals';

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
          { snapTradeUser: { isNot: null } },
          { manualAccounts: { some: {} } },
          {
            financialSummarySnapshot: {
              is: { financialOverview: { path: ['homeValue'], gt: 0 } },
            },
          },
        ],
      },
      select: { id: true },
    });
  });

  it('rebuilds snapshots for users without a Plaid connection', async () => {
    findMany.mockResolvedValue([
      { id: 'snaptrade-only-user' },
      { id: 'manual-only-user' },
      { id: 'home-only-user' },
    ]);

    await expect(SummaryCacheService.refreshAllUsers()).resolves.toEqual({
      success: true,
      usersProcessed: 3,
    });
    expect(computeForUser).toHaveBeenCalledWith('snaptrade-only-user', { categorize: true });
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
