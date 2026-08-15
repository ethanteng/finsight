import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const prisma = {
  account: { findFirst: jest.fn<() => Promise<any>>() },
  accessToken: { findMany: jest.fn<() => Promise<any[]>>() },
};
const getAccountBalances = jest.fn<(..._args: any[]) => Promise<any[]>>();
const getUserFinancialData = jest.fn<(..._args: any[]) => Promise<any>>();

jest.mock('../../prisma-client', () => ({ getPrismaClient: () => prisma }));
jest.mock('../../plaid', () => ({ plaidClient: { marker: 'plaid-client' } }));
jest.mock('../../services/balance-service', () => ({
  BalanceService: { getAccountBalances },
}));
jest.mock('../../services/financial-data-service', () => ({
  FinancialDataService: jest.fn(() => ({ getUserFinancialData })),
}));

import { ingestFinancialData } from '../../services/financial-ingestion';

describe('financial ingestion balance refresh semantics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.account.findFirst.mockResolvedValue(null);
    prisma.accessToken.findMany.mockResolvedValue([
      { id: 'connection-1', token: 'token-1' },
      { id: 'connection-2', token: 'token-2' },
    ]);
    getAccountBalances.mockResolvedValue([]);
    getUserFinancialData.mockResolvedValue({ accounts: [] });
  });

  it('bypasses freshness and refreshes every active Plaid connection when forced', async () => {
    await ingestFinancialData('user-1', {
      balanceMaxAgeHours: 24,
      categorize: false,
      forceBalanceRefresh: true,
    });

    expect(getAccountBalances).toHaveBeenCalledTimes(2);
    expect(getAccountBalances).toHaveBeenNthCalledWith(
      1,
      'token-1',
      expect.anything(),
      true
    );
    expect(getAccountBalances).toHaveBeenNthCalledWith(
      2,
      'token-2',
      expect.anything(),
      true
    );
  });

  it('fails the user refresh instead of silently presenting cached values as live', async () => {
    getAccountBalances.mockRejectedValueOnce(new Error('Plaid unavailable'));

    await expect(ingestFinancialData('user-1', {
      balanceMaxAgeHours: 24,
      categorize: false,
      forceBalanceRefresh: true,
    })).rejects.toThrow('Live balance refresh failed for 1 Plaid connection');

    expect(getUserFinancialData).not.toHaveBeenCalled();
  });

  it('keeps scheduled recomputes on the normal freshness window', async () => {
    await ingestFinancialData('user-1', {
      balanceMaxAgeHours: 24,
      categorize: false,
    });

    expect(getAccountBalances).not.toHaveBeenCalled();
    expect(getUserFinancialData).toHaveBeenCalled();
  });
});
