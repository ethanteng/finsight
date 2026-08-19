import { describe, expect, beforeEach, it, jest } from '@jest/globals';
import { FinancialDataService } from '../../services/financial-data-service';
import { loadPersistedPlaidData } from '../../services/financial-source-persistence';

const mockGetOriginalProfile = jest.fn<() => Promise<string>>();

jest.mock('../../profile/manager', () => ({
  ProfileManager: jest.fn().mockImplementation(() => ({
    getOriginalProfile: mockGetOriginalProfile,
  })),
}));

jest.mock('@prisma/client', () => {
  const mockPrisma = {
    account: {
      findMany: jest.fn(),
    },
    accessToken: {
      findMany: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
    },
    manualAccount: {
      findMany: jest.fn(),
    },
    snapTradeUser: {
      findUnique: jest.fn(),
    },
    financialSummarySnapshot: {
      findUnique: jest.fn(),
    },
  };

  const PrismaClient = jest.fn(() => mockPrisma);
  return {
    PrismaClient,
    Prisma: {
      SortOrder: {
        desc: 'desc',
      },
    },
    __mockPrisma: mockPrisma,
  };
});

const { __mockPrisma: mockPrisma } = jest.requireMock('@prisma/client') as {
  __mockPrisma: {
    account: { findMany: jest.Mock };
    accessToken: { findMany: jest.Mock };
    transaction: { findMany: jest.Mock };
    manualAccount: { findMany: jest.Mock };
    snapTradeUser: { findUnique: jest.Mock };
    financialSummarySnapshot: { findUnique: jest.Mock };
  };
};

type CacheMock = {
  get: jest.Mock;
  set: jest.Mock;
  invalidate: jest.Mock;
};

jest.mock('../../data/cache', () => {
  const cacheMock: CacheMock = {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  };
  return {
    cacheService: cacheMock,
    __mockCache: cacheMock,
  };
});

const { __mockCache: mockCache } = jest.requireMock('../../data/cache') as {
  __mockCache: CacheMock;
};

jest.mock('../../data/persistence', () => ({
  persistTransactionsToDb: jest.fn(),
  persistSnapTradeActivitiesToDb: jest.fn(),
}));

const mockTokenHealth: any = {
  plaid: [],
  snaptrade: { userId: 'user-id', status: 'valid', error: null, lastChecked: new Date() },
};

const tokenHealthMock = jest.fn() as jest.Mock;
tokenHealthMock.mockResolvedValue(mockTokenHealth as never);
const tokenHealthFromObservationsMock = jest.fn(() => mockTokenHealth);

jest.mock('../../services/token-validation-service', () => ({
  TokenValidationService: jest.fn().mockImplementation(() => ({
    getTokenHealth: tokenHealthMock,
    getTokenHealthFromObservations: tokenHealthFromObservationsMock,
  })),
  TokenStatus: { VALID: 'valid', LOGIN_REQUIRED: 'login_required', ERROR: 'error' },
  plaidTokenHealthFromError: jest.fn((tokenId: string) => ({
    tokenId,
    status: 'error',
    lastChecked: new Date(),
  })),
}));

jest.mock('../../services/balance-service', () => ({
  BalanceService: jest.fn().mockImplementation(() => ({
    mergeBalances: jest.fn(),
  })),
}));

jest.mock('../../services/transaction-normalization-service', () => ({
  TransactionNormalizationService: jest.fn().mockImplementation(() => ({
    normalizeTransactionBatch: jest.fn((transactions: unknown[]) => transactions),
  })),
}));

jest.mock('../../services/transaction-categorization-service', () => ({
  TransactionCategorizationService: jest.fn().mockImplementation(() => ({
    categorizeTransactionsBatch: jest.fn(),
  })),
  TransactionType: {},
}));

const mockSnapTradeService = {
  getUserAccounts: jest.fn(),
  getUserHoldings: jest.fn(),
  getUserActivities: jest.fn(),
} as any;

jest.mock('../../snaptrade', () => ({
  SnapTradeService: jest.fn().mockImplementation(() => mockSnapTradeService),
}));

jest.mock('plaid', () => {
  class PlaidApi {}
  return {
    Configuration: jest.fn(),
    PlaidApi,
    PlaidEnvironments: { sandbox: 'sandbox' },
    CountryCode: { Us: 'US' },
  };
});

describe('FinancialDataService investment persistence safeguards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCache.get.mockReset();
    mockCache.set.mockReset();
    mockCache.invalidate.mockReset();
    mockCache.get.mockResolvedValue(null as never);
    // Set up default return values for Prisma mocks
    (mockPrisma.account.findMany as any).mockResolvedValue([]);
    (mockPrisma.accessToken.findMany as any).mockResolvedValue([]);
    (mockPrisma.transaction.findMany as any).mockResolvedValue([]);
    (mockPrisma.manualAccount.findMany as any).mockResolvedValue([]);
    (mockPrisma.snapTradeUser.findUnique as any).mockResolvedValue(null);
    (mockPrisma.financialSummarySnapshot.findUnique as any).mockResolvedValue(null);
    mockGetOriginalProfile.mockReset();
    tokenHealthFromObservationsMock.mockClear();
  });

  it('falls back to live Plaid when no fresh persisted investment snapshot exists', async () => {
    const result = await loadPersistedPlaidData('user-123', {
      includeTransactions: false,
      includeInvestments: true,
    });

    expect(result).toBeNull();
    expect(mockPrisma.account.findMany).toHaveBeenCalled();
  });

  it('reuses one fresh canonical Plaid observation for holdings, liabilities, and health', async () => {
    const observedAt = new Date();
    (mockPrisma.account.findMany as any).mockResolvedValue([{
      id: 'db-account-1',
      plaidAccountId: 'plaid-account-1',
      accessTokenId: 'token-1',
      name: 'Brokerage',
      type: 'investment',
      subtype: 'brokerage',
      currentBalance: 1000,
      availableBalance: null,
      limit: null,
      currency: 'USD',
      institution: 'Example Bank',
      persistentAccountId: null,
      balanceLastFetched: observedAt,
      lastSynced: observedAt,
      updatedAt: observedAt,
      transactions: [],
    }]);
    (mockPrisma.accessToken.findMany as any).mockResolvedValue([{
      id: 'token-1',
      isActive: true,
      lastError: null,
      lastChecked: observedAt,
      updatedAt: observedAt,
      supersededAt: null,
    }]);
    (mockPrisma.financialSummarySnapshot.findUnique as any).mockResolvedValue({
      computedAt: observedAt,
      asOf: observedAt,
      accounts: [{
        id: 'plaid-account-1',
        account_id: 'plaid-account-1',
        source: 'plaid',
        liabilityDetails: [{ provider: 'plaid', kind: 'credit', retrievedAt: observedAt.toISOString() }],
      }],
      holdings: [{ account_id: 'plaid-account-1', security_id: 'security-1', institution_value: 1000 }],
      securities: [{ security_id: 'security-1', name: 'Example Fund' }],
      activities: [{
        id: 'investment-1',
        account_id: 'plaid-account-1',
        security_id: 'security-1',
        amount: -100,
      }],
    });

    const result = await loadPersistedPlaidData('user-123', {
      includeTransactions: true,
      includeInvestments: true,
      includeLiabilities: true,
    });

    expect(result?.isFresh).toBe(true);
    expect(result?.data.accounts[0].liabilityDetails).toHaveLength(1);
    expect(result?.data.holdings).toHaveLength(1);
    expect(result?.data.securities).toHaveLength(1);
    expect(result?.data.transactions).toEqual([
      expect.objectContaining({ id: 'investment-1', isInvestmentTransaction: true, persisted: true }),
    ]);
    expect(result?.data.tokenHealth).toEqual([
      expect.objectContaining({ tokenId: 'token-1', status: 'valid' }),
    ]);
  });

  it('forces live Plaid holdings when includeInvestments is true', async () => {
    const service = new FinancialDataService();
    const mockHolding = {
      id: 'holding-1',
      account_id: 'acc-1',
      security_id: 'sec-1',
      institution_value: 500,
      institution_price: 100,
      institution_price_as_of: new Date().toISOString(),
      cost_basis: 400,
      quantity: 5,
      iso_currency_code: 'USD',
      security_name: 'Sample Holding',
      security_type: 'Equity',
    };

    const fetchPlaidSpy = jest
      .spyOn(service as any, 'fetchPlaidData')
      .mockResolvedValue({
        accounts: [],
        balances: {},
        holdings: [mockHolding],
        securities: [],
        transactions: [],
        tokenHealth: [{ tokenId: 'token-1', status: 'valid', lastChecked: new Date() }],
        performance: { duration: 0 },
      });

    jest.spyOn(service as any, 'fetchSnapTradeData').mockResolvedValue({
      accounts: [],
      holdings: [],
      securities: [],
      transactions: [],
      tokenHealth: {
        userId: 'user-123',
        status: 'error',
        error: 'SnapTrade user not found',
        lastChecked: new Date(),
      },
      performance: { duration: 0 },
      errors: [],
    });

    jest.spyOn(service as any, 'fetchHomeValue').mockResolvedValue(null);

    const result = await service.getUserFinancialData('user-123', {
      includeTransactions: false,
      includeInvestments: true,
      includeHomeValue: false,
      skipCategorization: true,
    });

    expect(fetchPlaidSpy).toHaveBeenCalledTimes(1);
    expect(fetchPlaidSpy.mock.calls[0][1]).toEqual(expect.objectContaining({
      includeInvestments: true,
      includeLiabilities: false,
    }));
    expect(result.investments.holdings).toEqual([mockHolding]);
    expect(result.investments.portfolio.totalValue).toBe(mockHolding.institution_value);
    expect(tokenHealthMock).not.toHaveBeenCalled();
    expect(tokenHealthFromObservationsMock).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ holdings: [mockHolding] }),
      expect.objectContaining({ accounts: [] }),
    );
  });

  it('forces live Plaid when snapshot ingestion opts out of the fresh persisted short-circuit', async () => {
    const observedAt = new Date();
    (mockPrisma.account.findMany as any).mockResolvedValue([{
      id: 'db-account-1',
      plaidAccountId: 'plaid-account-1',
      accessTokenId: 'token-1',
      name: 'Brokerage',
      type: 'investment',
      subtype: 'brokerage',
      currentBalance: 1000,
      availableBalance: null,
      limit: null,
      currency: 'USD',
      institution: 'Example Bank',
      persistentAccountId: null,
      balanceLastFetched: observedAt,
      lastSynced: observedAt,
      updatedAt: observedAt,
      transactions: [],
    }]);
    (mockPrisma.accessToken.findMany as any).mockResolvedValue([{
      id: 'token-1',
      isActive: true,
      lastError: null,
      lastChecked: observedAt,
      updatedAt: observedAt,
      supersededAt: null,
    }]);
    (mockPrisma.financialSummarySnapshot.findUnique as any).mockResolvedValue({
      computedAt: observedAt,
      asOf: observedAt,
      accounts: [{ id: 'plaid-account-1', account_id: 'plaid-account-1', source: 'plaid' }],
      holdings: [{ account_id: 'plaid-account-1', security_id: 'security-1', institution_value: 1000 }],
      securities: [{ security_id: 'security-1', name: 'Example Fund' }],
      activities: [],
    });

    const service = new FinancialDataService();
    const fetchPlaidSpy = jest
      .spyOn(service as any, 'fetchPlaidData')
      .mockResolvedValue({
        accounts: [{
          account_id: 'plaid-account-1',
          id: 'plaid-account-1',
          name: 'Brokerage',
          type: 'investment',
          subtype: 'brokerage',
          balance: { current: 42, iso_currency_code: 'USD' },
          source: 'plaid',
        }],
        balances: {},
        holdings: [{ account_id: 'plaid-account-1', institution_value: 42 }],
        securities: [],
        transactions: [],
        tokenHealth: [{ tokenId: 'token-1', status: 'valid', lastChecked: observedAt }],
        errors: [],
        performance: { duration: 0 },
      });
    jest.spyOn(service as any, 'fetchSnapTradeData').mockResolvedValue({
      accounts: [],
      holdings: [],
      securities: [],
      transactions: [],
      tokenHealth: {
        userId: 'user-123',
        status: 'error',
        error: 'SnapTrade user not found',
        lastChecked: observedAt,
      },
      performance: { duration: 0 },
      errors: [],
    });
    jest.spyOn(service as any, 'fetchHomeValue').mockResolvedValue(null);

    const result = await service.getUserFinancialData('user-123', {
      includeTransactions: false,
      includeInvestments: true,
      includeHomeValue: false,
      skipCategorization: true,
      forceLiveProviders: true,
    });

    expect(fetchPlaidSpy).toHaveBeenCalledTimes(1);
    expect(result.investments.holdings).toEqual([
      expect.objectContaining({ institution_value: 42 }),
    ]);
  });

  it('keeps an address-only home value unavailable', async () => {
    mockGetOriginalProfile.mockResolvedValue('HOME_ADDRESS: 123 Main St');
    const service = new FinancialDataService();

    const result = await (service as any).fetchHomeValue('user-123');

    expect(result).toEqual({
      address: '123 Main St',
      propertyId: null,
      valueLow: null,
      valueMid: null,
      valueHigh: null,
      lastUpdated: null,
      isManualOverride: false,
    });
  });

  it('does not synthesize a fresh timestamp for a legacy home estimate', async () => {
    mockGetOriginalProfile.mockResolvedValue([
      'HOME_ADDRESS: 123 Main St',
      'HOME_VALUE: 500000',
      'HOME_VALUE_LOW: 475000',
      'HOME_VALUE_HIGH: 525000',
    ].join('\n'));
    const service = new FinancialDataService();

    const result = await (service as any).fetchHomeValue('user-123');

    expect(result.valueMid).toBe(500000);
    expect(result.lastUpdated).toBeNull();
  });

  it('retains the RentCast property ID from the encrypted profile data', async () => {
    mockGetOriginalProfile.mockResolvedValue([
      'HOME_ADDRESS: 123 Main St',
      'HOME_RENTCAST_PROPERTY_ID: property-123',
      'HOME_VALUE: 500000',
      'HOME_VALUE_LOW: 475000',
      'HOME_VALUE_HIGH: 525000',
    ].join('\n'));
    const service = new FinancialDataService();

    const result = await (service as any).fetchHomeValue('user-123');

    expect(result.propertyId).toBe('property-123');
  });

  it('preserves SnapTrade provider timestamps and stable activity IDs', async () => {
    (mockPrisma.snapTradeUser.findUnique as any).mockResolvedValue({ userSecret: 'secret' });
    mockSnapTradeService.getUserAccounts.mockResolvedValue({
      success: true,
      data: {
        accounts: [{
          id: 'brokerage-1',
          name: 'Brokerage',
          type: 'investment',
          subtype: 'brokerage',
          institution: 'Broker',
          balance: 2500,
          balanceCurrency: 'USD',
          lastSuccessfulHoldingsSync: '2026-08-17T20:00:00Z',
          lastSuccessfulTransactionsSync: '2026-08-17T21:00:00Z',
          connectionDisabled: true,
          connectionDisabledAt: '2026-08-18T00:00:00Z',
          dataFreshnessMode: 'delayed',
        }],
      },
    });
    mockSnapTradeService.getUserHoldings.mockResolvedValue({
      success: true,
      data: [{
        account: {
          id: 'brokerage-1',
          name: 'Brokerage',
          lastSuccessfulHoldingsSync: '2026-08-17T20:00:00Z',
        },
        balances: [],
        positions: [],
      }],
    });
    mockSnapTradeService.getUserActivities.mockResolvedValue({
      success: true,
      data: {
        activities: [{
          id: 'activity-uuid',
          account_id: 'brokerage-1',
          type: 'STOCK_DIVIDEND',
          amount: 25,
          trade_date: '2026-08-16',
          symbol: { id: 'security-1', symbol: 'ABC', description: 'ABC Fund' },
        }, {
          id: 'buy-uuid',
          account_id: 'brokerage-1',
          type: 'BUY',
          amount: -250,
          units: 2,
          price: 125,
          trade_date: '2026-08-15',
          symbol: { id: 'security-2', symbol: 'XYZ', description: 'XYZ Fund' },
        }, {
          id: 'split-uuid',
          account_id: 'brokerage-1',
          type: 'SPLIT',
          units: 10,
          price: 50,
          trade_date: '2026-08-14',
          symbol: { id: 'security-3', symbol: 'SPLT', description: 'Split Fund' },
        }, {
          id: 'rei-uuid',
          account_id: 'brokerage-1',
          type: 'REI',
          units: 3,
          price: 20,
          trade_date: '2026-08-13',
          symbol: { id: 'security-4', symbol: 'REIF', description: 'Reinvest Fund' },
        }],
      },
    });

    const service = new FinancialDataService();
    const result = await (service as any).fetchSnapTradeData('user-123', {
      includeInvestments: true,
      includeTransactions: true,
    });

    expect(mockSnapTradeService.getUserHoldings).toHaveBeenCalledWith(
      'user-123',
      'secret',
      expect.objectContaining({ success: true }),
    );
    expect(result.accounts[0]).toMatchObject({
      snapshotTimestamp: '2026-08-17T20:00:00Z',
      lastSyncedAt: '2026-08-17T20:00:00Z',
      connectionDisabled: true,
      dataFreshnessMode: 'delayed',
    });
    expect(result.transactions[0]).toMatchObject({
      id: 'snaptrade-activity-uuid',
      transaction_id: 'snaptrade-activity-uuid',
      activityId: 'activity-uuid',
      source: 'snaptrade',
      amount: 25,
      ticker_symbol: 'ABC',
      security_name: 'ABC Fund',
    });
    expect(result.transactions[1]).toMatchObject({
      id: 'snaptrade-buy-uuid',
      type: 'buy',
      amount: -250,
    });
    expect(result.transactions[2]).toMatchObject({
      id: 'snaptrade-split-uuid',
      type: 'split',
      amount: 0,
    });
    // Reinvestment buys units with the distribution, so the inferred cash
    // effect is an outflow — never a positive amount.
    expect(result.transactions[3]).toMatchObject({
      id: 'snaptrade-rei-uuid',
      type: 'rei',
      amount: -60,
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ error: expect.stringContaining('connection is disabled') }),
    ]));
  });

  it('scopes a synthesized activity ID to its account and keeps the legacy key', async () => {
    (mockPrisma.snapTradeUser.findUnique as any).mockResolvedValue({ userSecret: 'secret' });
    mockSnapTradeService.getUserAccounts.mockResolvedValue({
      success: true,
      data: { accounts: [{ id: 'brokerage-1', name: 'Brokerage', balance: 100 }] },
    });
    mockSnapTradeService.getUserHoldings.mockResolvedValue({ success: true, data: [] });
    mockSnapTradeService.getUserActivities.mockResolvedValue({
      success: true,
      data: {
        // No provider id: the synthesized key must not be shareable between users.
        activities: [{
          account_id: 'brokerage-1',
          type: 'BUY',
          amount: -250,
          units: 2,
          price: 125,
          trade_date: '2026-08-15',
          symbol: { id: 'security-2', symbol: 'XYZ', description: 'XYZ Fund' },
        }],
      },
    });

    const service = new FinancialDataService();
    const result = await (service as any).fetchSnapTradeData('user-123', {
      includeInvestments: true,
      includeTransactions: true,
    });

    expect(result.transactions[0]).toMatchObject({
      activityId: 'brokerage-1-2026-08-15-security-2-BUY-2',
      id: 'snaptrade-brokerage-1-2026-08-15-security-2-BUY-2',
      // Byte-for-byte the key this row was persisted under before the ID was
      // account-scoped: `${date}-${securityId}-${type}-${units}`, with no
      // `snaptrade-` prefix. Anything else migrates nothing and the next sync
      // inserts a duplicate beside the legacy row.
      legacyActivityId: '2026-08-15-security-2-BUY-2',
    });
  });

  it('omits the legacy key when SnapTrade supplied a provider ID', async () => {
    (mockPrisma.snapTradeUser.findUnique as any).mockResolvedValue({ userSecret: 'secret' });
    mockSnapTradeService.getUserAccounts.mockResolvedValue({
      success: true,
      data: { accounts: [{ id: 'brokerage-1', name: 'Brokerage', balance: 100 }] },
    });
    mockSnapTradeService.getUserHoldings.mockResolvedValue({ success: true, data: [] });
    mockSnapTradeService.getUserActivities.mockResolvedValue({
      success: true,
      data: {
        activities: [{
          id: 'provider-uuid',
          account_id: 'brokerage-1',
          type: 'BUY',
          amount: -250,
          units: 2,
          price: 125,
          trade_date: '2026-08-15',
          symbol: { id: 'security-2', symbol: 'XYZ', description: 'XYZ Fund' },
        }],
      },
    });

    const service = new FinancialDataService();
    const result = await (service as any).fetchSnapTradeData('user-123', {
      includeInvestments: true,
      includeTransactions: true,
    });

    expect(result.transactions[0].activityId).toBe('provider-uuid');
    expect(result.transactions[0]).not.toHaveProperty('legacyActivityId');
  });

  it('reports an empty brokerage account as zero rather than an unknown balance', async () => {
    (mockPrisma.snapTradeUser.findUnique as any).mockResolvedValue({ userSecret: 'secret' });
    mockSnapTradeService.getUserAccounts.mockResolvedValue({
      success: true,
      data: {
        // SnapTrade omitted the rollup for this account.
        accounts: [{ id: 'brokerage-1', name: 'Brokerage', balance: null }],
        connectionStatusError: 'connections endpoint timed out',
      },
    });
    mockSnapTradeService.getUserHoldings.mockResolvedValue({
      success: true,
      data: [{
        account: { id: 'brokerage-1', name: 'Brokerage' },
        balances: [{ cash: 0 }],
        positions: [],
      }],
    });
    mockSnapTradeService.getUserActivities.mockResolvedValue({
      success: true,
      data: { activities: [] },
    });

    const service = new FinancialDataService();
    const result = await (service as any).fetchSnapTradeData('user-123', {
      includeInvestments: true,
      includeTransactions: true,
    });

    // A null balance marks the whole canonical snapshot partial; zero is the truth here.
    expect(result.accounts[0].balance.current).toBe(0);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ error: expect.stringContaining('connection status unavailable') }),
    ]));
  });

  it('flags a brokerage balance whose connection health could not be verified', async () => {
    (mockPrisma.snapTradeUser.findUnique as any).mockResolvedValue({ userSecret: 'secret' });
    mockSnapTradeService.getUserAccounts.mockResolvedValue({
      success: true,
      data: {
        accounts: [{
          id: 'brokerage-1',
          name: 'Brokerage',
          balance: 2500,
          connectionDisabled: undefined,
          connectionStatusUnavailable: true,
        }],
      },
    });
    mockSnapTradeService.getUserHoldings.mockResolvedValue({ success: true, data: [] });
    mockSnapTradeService.getUserActivities.mockResolvedValue({
      success: true,
      data: { activities: [] },
    });

    const service = new FinancialDataService();
    const result = await (service as any).fetchSnapTradeData('user-123', {
      includeInvestments: true,
      includeTransactions: true,
    });

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ error: expect.stringContaining('could not be verified') }),
    ]));
  });
});
