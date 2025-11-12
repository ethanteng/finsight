import { describe, expect, beforeEach, it, jest } from '@jest/globals';
import { FinancialSummaryService } from '../../services/financial-summary-service';
import { getPrismaClient } from '../../prisma-client';

const mockPrismaObj = {
  financialSummary: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

jest.mock('../../prisma-client', () => {
  const mockPrisma = {
    financialSummary: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
  return {
    getPrismaClient: jest.fn(() => mockPrisma),
    __mockPrisma: mockPrisma,
  };
});

const mockFinancialDataServiceObj = {
  getUserFinancialData: jest.fn(),
};

jest.mock('../../services/financial-data-service', () => {
  const mockService = {
    getUserFinancialData: jest.fn(),
  };
  return {
    FinancialDataService: jest.fn(() => mockService),
    __mockFinancialDataService: mockService,
  };
});

describe('FinancialSummaryService', () => {
  let mockPrisma: typeof mockPrismaObj;
  let mockFinancialDataService: typeof mockFinancialDataServiceObj;
  let service: FinancialSummaryService;

  beforeEach(() => {
    jest.clearAllMocks();
    const prismaMock = jest.requireMock('../../prisma-client') as { __mockPrisma: typeof mockPrismaObj };
    const financialDataMock = jest.requireMock('../../services/financial-data-service') as { __mockFinancialDataService: typeof mockFinancialDataServiceObj };
    mockPrisma = prismaMock.__mockPrisma;
    mockFinancialDataService = financialDataMock.__mockFinancialDataService;
    service = new FinancialSummaryService();
  });

  describe('isSummaryStale', () => {
    it('should return true if lastUpdated is null', () => {
      expect(service.isSummaryStale(null)).toBe(true);
    });

    it('should return false if summary is less than 24 hours old', () => {
      const recentDate = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
      expect(service.isSummaryStale(recentDate)).toBe(false);
    });

    it('should return true if summary is more than 24 hours old', () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      expect(service.isSummaryStale(oldDate)).toBe(true);
    });
  });

  describe('getUserSummary', () => {
    it('should return cached summary if fresh', async () => {
      const cachedSummary = {
        id: 'summary-1',
        userId: 'user-123',
        netWorth: 100000,
        totalCash: 50000,
        totalInvestments: 40000,
        totalDebt: 10000,
        homeValue: 200000,
        investmentPortfolio: {
          totalValue: 40000,
          holdingsCount: 10,
          assetAllocation: [],
          securityCount: 5
        },
        lastUpdated: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // @ts-expect-error - Mock type inference issue
      mockPrisma.financialSummary.findUnique.mockResolvedValue(cachedSummary);

      const result = await service.getUserSummary('user-123');

      expect(result.financialOverview.netWorth).toBe(100000);
      expect(result.financialOverview.totalCash).toBe(50000);
      expect(result.investmentPortfolio.totalValue).toBe(40000);
      expect(mockFinancialDataService.getUserFinancialData).not.toHaveBeenCalled();
    });

    it('should trigger async refresh if stale but return stale data', async () => {
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const cachedSummary = {
        id: 'summary-1',
        userId: 'user-123',
        netWorth: 100000,
        totalCash: 50000,
        totalInvestments: 40000,
        totalDebt: 10000,
        homeValue: 200000,
        investmentPortfolio: {
          totalValue: 40000,
          holdingsCount: 10,
          assetAllocation: [],
          securityCount: 5
        },
        lastUpdated: staleDate,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // @ts-expect-error - Mock type inference issue
      mockPrisma.financialSummary.findUnique.mockResolvedValue(cachedSummary);
      // @ts-expect-error - Mock type inference issue
      mockFinancialDataService.getUserFinancialData.mockResolvedValue({
        accounts: [],
        balances: {},
        investments: {
          holdings: [],
          securities: [],
          portfolio: {
            totalValue: 50000,
            holdingsCount: 12,
            assetAllocation: [],
            securityCount: 6
          },
          transactions: []
        },
        bankingTransactions: [],
        homeValue: null,
        metadata: {
          lastUpdated: new Date(),
          tokenHealth: { plaid: [], snaptrade: { userId: '', status: 'ERROR' as any, error: undefined, lastChecked: new Date() } },
          errors: { plaid: [], snaptrade: [], homeValue: null },
          partialData: false,
          performance: { totalDuration: 0, plaidDuration: 0, snaptradeDuration: 0 },
          dataSources: { plaid: 'unknown', snaptrade: 'unknown' },
          persistedAsOf: null
        }
      });
      // @ts-expect-error - Mock type inference issue
      mockPrisma.financialSummary.upsert.mockResolvedValue({
        ...cachedSummary,
        netWorth: 110000
      });

      const result = await service.getUserSummary('user-123');

      // Should return stale data immediately
      expect(result.financialOverview.netWorth).toBe(100000);
      
      // Wait for async refresh
      await new Promise(resolve => setImmediate(resolve));
      
      // Verify refresh was called
      expect(mockFinancialDataService.getUserFinancialData).toHaveBeenCalled();
    });

    it('should refresh synchronously if no cached summary exists', async () => {
      // @ts-expect-error - Mock type inference issue
      mockPrisma.financialSummary.findUnique.mockResolvedValue(null);
      // @ts-expect-error - Mock type inference issue
      mockFinancialDataService.getUserFinancialData.mockResolvedValue({
        accounts: [
          {
            account_id: 'acc-1',
            id: 'acc-1',
            name: 'Checking',
            type: 'depository',
            subtype: 'checking',
            balance: { current: 50000, available: 50000, iso_currency_code: 'USD' },
            source: 'plaid'
          }
        ],
        balances: {},
        investments: {
          holdings: [],
          securities: [],
          portfolio: {
            totalValue: 40000,
            holdingsCount: 10,
            assetAllocation: [],
            securityCount: 5
          },
          transactions: []
        },
        bankingTransactions: [],
        homeValue: null,
        metadata: {
          lastUpdated: new Date(),
          tokenHealth: { plaid: [], snaptrade: { userId: '', status: 'ERROR' as any, error: undefined, lastChecked: new Date() } },
          errors: { plaid: [], snaptrade: [], homeValue: null },
          partialData: false,
          performance: { totalDuration: 0, plaidDuration: 0, snaptradeDuration: 0 },
          dataSources: { plaid: 'unknown', snaptrade: 'unknown' },
          persistedAsOf: null
        }
      });

      const newSummary = {
        id: 'summary-1',
        userId: 'user-123',
        netWorth: 90000,
        totalCash: 50000,
        totalInvestments: 40000,
        totalDebt: 0,
        homeValue: null,
        investmentPortfolio: {
          totalValue: 40000,
          holdingsCount: 10,
          assetAllocation: [],
          securityCount: 5
        },
        lastUpdated: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // @ts-expect-error - Mock type inference issue
      mockPrisma.financialSummary.upsert.mockResolvedValue(newSummary);

      const result = await service.getUserSummary('user-123');

      expect(result.financialOverview.netWorth).toBe(90000);
      expect(result.financialOverview.totalCash).toBe(50000);
      expect(mockFinancialDataService.getUserFinancialData).toHaveBeenCalled();
      expect(mockPrisma.financialSummary.upsert).toHaveBeenCalled();
    });
  });

  describe('refreshUserSummary', () => {
    it('should fetch fresh data and save to database', async () => {
      const financialData = {
        accounts: [
          {
            account_id: 'acc-1',
            id: 'acc-1',
            name: 'Checking',
            type: 'depository',
            subtype: 'checking',
            balance: { current: 50000, available: 50000, iso_currency_code: 'USD' },
            source: 'plaid'
          },
          {
            account_id: 'acc-2',
            id: 'acc-2',
            name: 'Credit Card',
            type: 'credit',
            subtype: 'credit card',
            balance: { current: -5000, iso_currency_code: 'USD' }, // Negative balance = debt owed
            source: 'plaid'
          }
        ],
        balances: {},
        investments: {
          holdings: [],
          securities: [],
          portfolio: {
            totalValue: 40000,
            holdingsCount: 10,
            assetAllocation: [{ type: 'Equity', value: 40000, percentage: 100 }],
            securityCount: 5
          },
          transactions: []
        },
        bankingTransactions: [],
        homeValue: {
          address: '123 Main St',
          valueLow: 200000,
          valueMid: 250000,
          valueHigh: 300000,
          lastUpdated: new Date().toISOString()
        },
        metadata: {
          lastUpdated: new Date(),
          tokenHealth: { plaid: [], snaptrade: { userId: '', status: 'ERROR' as any, error: undefined, lastChecked: new Date() } },
          errors: { plaid: [], snaptrade: [], homeValue: null },
          partialData: false,
          performance: { totalDuration: 0, plaidDuration: 0, snaptradeDuration: 0 },
          dataSources: { plaid: 'unknown', snaptrade: 'unknown' },
          persistedAsOf: null
        }
      };

      // @ts-expect-error - Mock type inference issue
      mockFinancialDataService.getUserFinancialData.mockResolvedValue(financialData);
      
      const savedSummary = {
        id: 'summary-1',
        userId: 'user-123',
        netWorth: 285000, // 50000 cash + 40000 investments + 250000 home - 5000 debt
        totalCash: 50000,
        totalInvestments: 40000,
        totalDebt: 5000,
        homeValue: 250000,
        investmentPortfolio: {
          totalValue: 40000,
          holdingsCount: 10,
          assetAllocation: [{ type: 'Equity', value: 40000, percentage: 100 }],
          securityCount: 5
        },
        lastUpdated: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // @ts-expect-error - Mock type inference issue
      mockPrisma.financialSummary.upsert.mockResolvedValue(savedSummary);

      const result = await service.refreshUserSummary('user-123');

      // Expected: 50000 cash + 40000 investments + 250000 home - 5000 debt = 335000
      expect(result.financialOverview.netWorth).toBe(335000);
      expect(result.financialOverview.totalCash).toBe(50000);
      expect(result.financialOverview.totalDebt).toBe(5000);
      expect(result.financialOverview.homeValue).toBe(250000);
      expect(result.investmentPortfolio.totalValue).toBe(40000);
      expect(mockPrisma.financialSummary.upsert).toHaveBeenCalled();
    });

    it('should return stale data if refresh fails', async () => {
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const cachedSummary = {
        id: 'summary-1',
        userId: 'user-123',
        netWorth: 100000,
        totalCash: 50000,
        totalInvestments: 40000,
        totalDebt: 10000,
        homeValue: null,
        investmentPortfolio: {
          totalValue: 40000,
          holdingsCount: 10,
          assetAllocation: [],
          securityCount: 5
        },
        lastUpdated: staleDate,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // @ts-expect-error - Mock type inference issue
      mockPrisma.financialSummary.findUnique.mockResolvedValue(cachedSummary);
      // @ts-expect-error - Mock type inference issue
      mockFinancialDataService.getUserFinancialData.mockRejectedValue(new Error('API error'));

      const result = await service.refreshUserSummary('user-123');

      expect(result.financialOverview.netWorth).toBe(100000);
    });
  });
});

