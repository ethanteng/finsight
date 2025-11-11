import { describe, expect, beforeEach, it, jest } from '@jest/globals';
import { FinancialDataService } from '../../services/financial-data-service';

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
};

jest.mock('@prisma/client', () => {
  const PrismaClient = jest.fn(() => mockPrisma);
  return {
    PrismaClient,
    Prisma: {
      SortOrder: {
        desc: 'desc',
      },
    },
  };
});

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
};

jest.mock('../../data/cache', () => ({
  cacheService: mockCache,
}));

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
    mockCache.get.mockResolvedValue(null);
  });

  it('skips persisted Plaid snapshot when investments are requested', async () => {
    const service = new FinancialDataService();

    const result = await (service as any).tryLoadPersistedPlaidData('user-123', {
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
});

