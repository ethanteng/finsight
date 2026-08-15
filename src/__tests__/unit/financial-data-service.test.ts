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

jest.mock('../../services/token-validation-service', () => ({
  TokenValidationService: jest.fn().mockImplementation(() => ({
    getTokenHealth: tokenHealthMock,
  })),
  TokenStatus: { ERROR: 'ERROR' },
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
    mockGetOriginalProfile.mockReset();
  });

  it('skips persisted Plaid snapshot when investments are requested', async () => {
    const result = await loadPersistedPlaidData('user-123', {
      includeTransactions: false,
      includeInvestments: true,
    });

    expect(result).toBeNull();
    expect(mockPrisma.account.findMany).not.toHaveBeenCalled();
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
        performance: { duration: 0 },
      });

    jest.spyOn(service as any, 'fetchSnapTradeData').mockResolvedValue({
      accounts: [],
      holdings: [],
      securities: [],
      transactions: [],
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
    expect(result.investments.holdings).toEqual([mockHolding]);
    expect(result.investments.portfolio.totalValue).toBe(mockHolding.institution_value);
  });

  it('keeps an address-only home value unavailable', async () => {
    mockGetOriginalProfile.mockResolvedValue('HOME_ADDRESS: 123 Main St');
    const service = new FinancialDataService();

    const result = await (service as any).fetchHomeValue('user-123');

    expect(result).toEqual({
      address: '123 Main St',
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
});
