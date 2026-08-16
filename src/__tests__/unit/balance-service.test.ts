jest.mock('@prisma/client', () => {
  const prisma = {
    accessToken: { findUnique: jest.fn(), findMany: jest.fn() },
    account: { findMany: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma };
});

jest.mock('../../data/cache', () => ({
  cacheService: {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
    getStats: jest.fn(),
  },
}));

import { BalanceService } from '../../services/balance-service';

const mockPrisma = (jest.requireMock('@prisma/client') as any).__mockPrisma;
const mockCache = (jest.requireMock('../../data/cache') as any).cacheService;

describe('BalanceService connection scoping', () => {
  const plaidClient = {
    accountsBalanceGet: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.accessToken.findUnique.mockResolvedValue({ id: 'token-record-a', userId: 'user-1' });
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue(undefined);
    mockPrisma.account.findMany.mockResolvedValue([]);
    mockPrisma.account.updateMany.mockResolvedValue({ count: 1 });
    plaidClient.accountsBalanceGet.mockResolvedValue({
      data: {
        accounts: [
          {
            account_id: 'account-a',
            balances: {
              available: 900,
              current: 1000,
              limit: null,
              iso_currency_code: 'USD',
              unofficial_currency_code: null,
            },
          },
        ],
      },
    });
  });

  it('reads cached database balances only from the requested connection', async () => {
    mockPrisma.account.findMany.mockResolvedValue([
      {
        plaidAccountId: 'account-a',
        availableBalance: 900,
        currentBalance: 1000,
        limit: null,
        currency: 'USD',
        balanceLastFetched: new Date(),
      },
    ]);

    const result = await BalanceService.getAccountBalances('access-token-a', plaidClient, false);

    expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
      where: { accessTokenId: 'token-record-a' },
    });
    expect(plaidClient.accountsBalanceGet).not.toHaveBeenCalled();
    expect(result.map((balance) => balance.account_id)).toEqual(['account-a']);
  });

  it('refreshes from Plaid when any account on the connection has gone stale', async () => {
    mockPrisma.account.findMany.mockResolvedValue([
      {
        plaidAccountId: 'account-a',
        availableBalance: 900,
        currentBalance: 1000,
        limit: null,
        currency: 'USD',
        balanceLastFetched: new Date(),
      },
      {
        plaidAccountId: 'account-b',
        availableBalance: 10,
        currentBalance: 20,
        limit: null,
        currency: 'USD',
        // Two months stale: serving the fresh sibling alone would hide this
        // account and cache the partial set for the rest of the day.
        balanceLastFetched: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      },
    ]);

    const result = await BalanceService.getAccountBalances('access-token-a', plaidClient, false);

    expect(plaidClient.accountsBalanceGet).toHaveBeenCalledTimes(1);
    expect(result.map((balance) => balance.account_id)).toEqual(['account-a']);
  });

  it('refreshes from Plaid when an account has never had a balance fetched', async () => {
    mockPrisma.account.findMany.mockResolvedValue([
      {
        plaidAccountId: 'account-a',
        availableBalance: null,
        currentBalance: null,
        limit: null,
        currency: 'USD',
        balanceLastFetched: null,
      },
    ]);

    await BalanceService.getAccountBalances('access-token-a', plaidClient, false);

    expect(plaidClient.accountsBalanceGet).toHaveBeenCalledTimes(1);
  });

  it('updates only accounts owned by the refreshed connection and repairs safe legacy rows', async () => {
    await BalanceService.getAccountBalances('access-token-a', plaidClient, true);

    expect(mockPrisma.account.updateMany).toHaveBeenCalledWith({
      where: {
        plaidAccountId: 'account-a',
        OR: [
          { accessTokenId: 'token-record-a' },
          { accessTokenId: null, userId: 'user-1' },
        ],
      },
      data: expect.objectContaining({
        currentBalance: 1000,
        accessTokenId: 'token-record-a',
      }),
    });
  });

  it('does not call Plaid for an unrecognized connection', async () => {
    mockPrisma.accessToken.findUnique.mockResolvedValue(null);

    await expect(
      BalanceService.getAccountBalances('unknown-token', plaidClient, true)
    ).rejects.toThrow('unknown Plaid connection');
    expect(plaidClient.accountsBalanceGet).not.toHaveBeenCalled();
  });
});
