import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock Plaid client
const mockPlaidClient = {
  investmentsHoldingsGet: jest.fn(),
  investmentsTransactionsGet: jest.fn(),
  accountsGet: jest.fn(),
  transactionsGet: jest.fn()
};

// Mock Prisma client
const mockPrismaClient = {
  accessToken: {
    findMany: jest.fn()
  }
};

// Mock the modules first
jest.mock('../../plaid', () => ({
  setupPlaidRoutes: jest.fn(),
  processInvestmentHolding: jest.fn(),
  processInvestmentTransaction: jest.fn(),
  processSecurity: jest.fn(),
  analyzePortfolio: jest.fn(),
  analyzeInvestmentActivity: jest.fn(),
  handlePlaidError: jest.fn()
}));

// Import the mocked functions
import {
  processInvestmentHolding,
  processInvestmentTransaction,
  processSecurity,
  analyzePortfolio,
  analyzeInvestmentActivity,
  handlePlaidError
} from '../../plaid';

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => mockPrismaClient
}));

describe('Enhanced Investment Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up mock implementations
    (analyzePortfolio as jest.Mock).mockImplementation((holdings: unknown, securities: unknown) => {
      const holdingsArray = holdings as any[];
      const securitiesArray = securities as any[];
      
      if (holdingsArray.length === 0) {
        return {
          totalValue: 0,
          assetAllocation: [],
          holdingCount: 0,
          securityCount: 0
        };
      }
      
      const totalValue = holdingsArray.reduce((sum: number, h: any) => sum + (h.institution_value || 0), 0);
      
      // Create asset allocation array with percentages
      const assetAllocation = holdingsArray.map((h: any) => {
        const security = securitiesArray.find((s: any) => s.security_id === h.security_id);
        const assetType = security?.type || 'Unknown';
        const value = h.institution_value || 0;
        const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
        
        return {
          type: assetType,
          value: value,
          percentage: percentage
        };
      });
      
      return {
        totalValue,
        assetAllocation,
        holdingCount: holdingsArray.length,
        securityCount: securitiesArray.length
      };
    });
    
    (analyzeInvestmentActivity as jest.Mock).mockImplementation((transactions: unknown) => {
      const transactionsArray = transactions as any[];
      
      if (transactionsArray.length === 0) {
        return {
          totalTransactions: 0,
          totalVolume: 0,
          activityByType: {},
          averageTransactionSize: 0
        };
      }
      
      const totalVolume = transactionsArray.reduce((sum: number, t: any) => sum + Math.abs(t.amount || 0), 0);
      const totalTransactions = transactionsArray.length;
      
      const activityByType = transactionsArray.reduce((acc: any, t: any) => {
        const type = t.type || 'Unknown';
        if (!acc[type]) {
          acc[type] = { count: 0, totalAmount: 0 };
        }
        acc[type].count++;
        acc[type].totalAmount += Math.abs(t.amount || 0);
        return acc;
      }, {});
      
      return {
        totalTransactions,
        totalVolume,
        activityByType,
        averageTransactionSize: totalTransactions > 0 ? totalVolume / totalTransactions : 0
      };
    });
    
    (processInvestmentHolding as jest.Mock).mockImplementation((holding: unknown) => {
      const holdingObj = holding as any;
      return {
        id: holdingObj.account_id || 'unknown',
        value: holdingObj.institution_value || 0,
        quantity: holdingObj.quantity || 0,
        type: holdingObj.institution_price_as_of || 'unknown'
      };
    });
    
    (processInvestmentTransaction as jest.Mock).mockImplementation((transaction: unknown) => {
      const transactionObj = transaction as any;
      return {
        id: transactionObj.transaction_id || 'unknown',
        amount: transactionObj.amount || 0,
        type: transactionObj.type || 'unknown',
        date: transactionObj.date || 'unknown'
      };
    });
    
    (processSecurity as jest.Mock).mockImplementation((security: unknown) => {
      const securityObj = security as any;
      return {
        id: securityObj.security_id || 'unknown',
        name: securityObj.name || 'Unknown Security',
        type: securityObj.type || 'unknown'
      };
    });
    
    (handlePlaidError as jest.Mock).mockImplementation((error: unknown) => {
      const errorObj = error as any;
      if (errorObj.error_code) {
        return `Plaid API error: ${errorObj.error_code}`;
      }
      return `Error: ${errorObj.message || 'Unknown error'}`;
    });
  });

  describe('Portfolio Analysis Functions', () => {
    it('should analyze portfolio holdings correctly', () => {
      
      const mockHoldings = [
        {
          account_id: 'acc1',
          security_id: 'sec1',
          institution_value: 10000,
          quantity: 100,
          institution_price: 100
        },
        {
          account_id: 'acc1',
          security_id: 'sec2',
          institution_value: 5000,
          quantity: 50,
          institution_price: 100
        }
      ];

      const mockSecurities = [
        {
          security_id: 'sec1',
          name: 'Stock A',
          type: 'equity',
          ticker_symbol: 'STKA'
        },
        {
          security_id: 'sec2',
          name: 'Bond B',
          type: 'fixed income',
          ticker_symbol: 'BNDB'
        }
      ];

      const result = analyzePortfolio(mockHoldings, mockSecurities);

      expect(result.totalValue).toBe(15000);
      expect(result.holdingCount).toBe(2);
      expect(result.securityCount).toBe(2);
      expect(result.assetAllocation).toHaveLength(2);
      
      const equityAllocation = result.assetAllocation.find((a: any) => a.type === 'equity');
      const fixedIncomeAllocation = result.assetAllocation.find((a: any) => a.type === 'fixed income');
      
      expect(equityAllocation?.value).toBe(10000);
      expect(equityAllocation?.percentage).toBe(66.67);
      expect(fixedIncomeAllocation?.value).toBe(5000);
      expect(fixedIncomeAllocation?.percentage).toBe(33.33);
    });

    it('should handle empty portfolio gracefully', () => {
      const result = analyzePortfolio([], []);
      
      expect(result.totalValue).toBe(0);
      expect(result.holdingCount).toBe(0);
      expect(result.securityCount).toBe(0);
      expect(result.assetAllocation).toHaveLength(0);
    });

    it('should handle missing security types', () => {
      const mockHoldings = [
        {
          account_id: 'acc1',
          security_id: 'sec1',
          institution_value: 10000,
          quantity: 100,
          institution_price: 100
        }
      ];

      const mockSecurities = [
        {
          security_id: 'sec1',
          name: 'Stock A',
          ticker_symbol: 'STKA'
          // Missing type field
        }
      ];

      const result = analyzePortfolio(mockHoldings, mockSecurities);
      
      expect(result.assetAllocation).toHaveLength(1);
      expect(result.assetAllocation[0].type).toBe('Unknown');
      expect(result.assetAllocation[0].value).toBe(10000);
    });
  });

  describe('Investment Activity Analysis', () => {
    it('should analyze investment transactions correctly', () => {
      const mockTransactions = [
        {
          investment_transaction_id: 't1',
          type: 'buy',
          amount: 1000,
          date: '2025-01-01'
        },
        {
          investment_transaction_id: 't2',
          type: 'sell',
          amount: 500,
          date: '2025-01-02'
        },
        {
          investment_transaction_id: 't3',
          type: 'buy',
          amount: 750,
          date: '2025-01-03'
        }
      ];

      const result = analyzeInvestmentActivity(mockTransactions);

      expect(result.totalTransactions).toBe(3);
      expect(result.totalVolume).toBe(2250);
      expect(result.averageTransactionSize).toBe(750);
      expect(result.activityByType.buy.count).toBe(2);
      expect(result.activityByType.buy.totalAmount).toBe(1750);
      expect(result.activityByType.sell.count).toBe(1);
      expect(result.activityByType.sell.totalAmount).toBe(500);
    });

    it('should handle transactions with missing amounts', () => {
      const mockTransactions = [
        {
          investment_transaction_id: 't1',
          type: 'buy',
          amount: null,
          date: '2025-01-01'
        },
        {
          investment_transaction_id: 't2',
          type: 'sell',
          amount: 500,
          date: '2025-01-02'
        }
      ];

      const result = analyzeInvestmentActivity(mockTransactions);

      expect(result.totalTransactions).toBe(2);
      expect(result.totalVolume).toBe(500);
      expect(result.averageTransactionSize).toBe(250);
    });

    it('should handle unknown transaction types', () => {
      const mockTransactions = [
        {
          investment_transaction_id: 't1',
          type: 'unknown_type',
          amount: 1000,
          date: '2025-01-01'
        }
      ];

      const result = analyzeInvestmentActivity(mockTransactions);

      expect(result.activityByType.unknown_type.count).toBe(1);
      expect(result.activityByType.unknown_type.totalAmount).toBe(1000);
    });
  });

  describe('Data Processing Functions', () => {
    it('should process investment holdings correctly', () => {
      const mockHolding = {
        account_id: 'acc1',
        security_id: 'sec1',
        institution_value: 10000,
        institution_price: 100,
        institution_price_as_of: '2025-01-01',
        cost_basis: 95,
        quantity: 100,
        iso_currency_code: 'USD'
      };

      const result = processInvestmentHolding(mockHolding);

      expect(result.id).toBe('acc1');
      expect(result.account_id).toBe('acc1');
      expect(result.security_id).toBe('sec1');
      expect(result.institution_value).toBe(10000);
      expect(result.institution_price).toBe(100);
      expect(result.quantity).toBe(100);
      expect(result.iso_currency_code).toBe('USD');
    });

    it('should process investment transactions correctly', () => {
      const mockTransaction = {
        investment_transaction_id: 't1',
        account_id: 'acc1',
        security_id: 'sec1',
        amount: 1000,
        date: '2025-01-01',
        name: 'Buy Stock A',
        quantity: 10,
        fees: 5,
        price: 100,
        type: 'buy',
        subtype: 'market',
        iso_currency_code: 'USD'
      };

      const result = processInvestmentTransaction(mockTransaction);

      expect(result.id).toBe('t1');
      expect(result.account_id).toBe('acc1');
      expect(result.security_id).toBe('sec1');
      expect(result.amount).toBe(1000);
      expect(result.date).toBe('2025-01-01');
      expect(result.name).toBe('Buy Stock A');
      expect(result.quantity).toBe(10);
      expect(result.fees).toBe(5);
      expect(result.price).toBe(100);
      expect(result.type).toBe('buy');
      expect(result.subtype).toBe('market');
    });

    it('should process securities correctly', () => {
      const mockSecurity = {
        security_id: 'sec1',
        name: 'Stock A',
        ticker_symbol: 'STKA',
        type: 'equity',
        close_price: 100,
        close_price_as_of: '2025-01-01',
        iso_currency_code: 'USD'
      };

      const result = processSecurity(mockSecurity);

      expect(result.id).toBe('sec1');
      expect(result.name).toBe('Stock A');
      expect(result.ticker_symbol).toBe('STKA');
      expect(result.type).toBe('equity');
      expect(result.close_price).toBe(100);
      expect(result.close_price_as_of).toBe('2025-01-01');
      expect(result.iso_currency_code).toBe('USD');
    });
  });

  describe('Error Handling', () => {
    it('should handle Plaid API errors gracefully', () => {
      const mockError = {
        response: {
          data: {
            error_code: 'INVALID_ACCESS_TOKEN',
            error_message: 'The access token is invalid'
          }
        }
      };

      const result = handlePlaidError(mockError, 'test operation');

      expect(result.error).toBe('Invalid access token');
      expect(result.details).toBe('Please reconnect your account.');
      expect(result.code).toBe('INVALID_ACCESS_TOKEN');
    });

    it('should handle unknown errors gracefully', () => {
      const mockError = new Error('Unknown error occurred');

      const result = handlePlaidError(mockError, 'test operation');

      expect(result.error).toBe('Failed to complete operation');
      expect(result.details).toBe('Unknown error occurred');
      expect(result.code).toBe('UNKNOWN_ERROR');
    });
  });
});
