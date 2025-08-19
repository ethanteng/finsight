import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { testApp } from './test-app-setup';

// Use testApp which already has all necessary endpoints and middleware
const app = testApp;

describe('Enhanced Investment Workflow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Investment Holdings Endpoint', () => {
    it('should return enhanced portfolio analysis for investment holdings', async () => {
      const response = await request(app)
        .get('/plaid/investments/holdings')
        .expect(200);

      expect(response.body).toHaveProperty('holdings');
      expect(response.body).toHaveProperty('summary');
      
      const holdings = response.body.holdings[0];
      expect(holdings).toHaveProperty('analysis');
      expect(holdings.analysis).toHaveProperty('totalValue');
      expect(holdings.analysis).toHaveProperty('assetAllocation');
      
      expect(holdings.analysis.totalValue).toBe(15000);
      expect(holdings.analysis.assetAllocation).toHaveLength(2);
      
      const summary = response.body.summary;
      expect(summary.totalAccounts).toBe(1);
      expect(summary.totalHoldings).toBe(2);
      expect(summary.totalSecurities).toBe(2);
      expect(summary.totalPortfolioValue).toBe(15000);
    });
  });

  describe('Investment Transactions Endpoint', () => {
    it('should return enhanced activity analysis for investment transactions', async () => {
      const response = await request(app)
        .get('/plaid/investments/transactions')
        .expect(200);

      expect(response.body).toHaveProperty('transactions');
      expect(response.body).toHaveProperty('sortedTransactions');
      expect(response.body).toHaveProperty('summary');
      
      const transactions = response.body.transactions[0];
      expect(transactions).toHaveProperty('analysis');
      expect(transactions.analysis).toHaveProperty('totalTransactions');
      expect(transactions.analysis).toHaveProperty('activityByType');
      
      expect(transactions.analysis.totalTransactions).toBe(2);
      expect(transactions.analysis.totalVolume).toBe(1500);
      expect(transactions.analysis.activityByType.buy.count).toBe(1);
      expect(transactions.analysis.activityByType.sell.count).toBe(1);
      
      const summary = response.body.summary;
      expect(summary.totalAccounts).toBe(1);
      expect(summary.totalTransactions).toBe(2);
      expect(summary.totalSecurities).toBe(1);
    });

    it('should handle date range queries correctly', async () => {
      const startDate = '2025-01-01';
      const endDate = '2025-01-31';

      const response = await request(app)
        .get(`/plaid/investments/transactions?start_date=${startDate}&end_date=${endDate}`)
        .expect(200);

      const summary = response.body.summary;
      expect(summary.dateRange.start_date).toBe(startDate);
      expect(summary.dateRange.end_date).toBe(endDate);
    });
  });

  describe('Comprehensive Investment Endpoint', () => {
    it('should return complete investment overview with analysis', async () => {
      const response = await request(app)
        .get('/plaid/investments')
        .expect(200);

      expect(response.body).toHaveProperty('investments');
      expect(response.body).toHaveProperty('summary');
      
      const investments = response.body.investments;
      expect(Array.isArray(investments)).toBe(true);
      expect(investments).toHaveLength(1);
      
      const investment = investments[0];
      expect(investment).toHaveProperty('holdings');
      expect(investment).toHaveProperty('investment_transactions');
      expect(investment).toHaveProperty('analysis');
      
      const analysis = investment.analysis;
      expect(analysis).toHaveProperty('totalPortfolioValue');
      expect(analysis).toHaveProperty('assetAllocation');
      expect(analysis).toHaveProperty('performanceMetrics');
      
      expect(analysis.totalPortfolioValue).toBe(15000);
      expect(analysis.assetAllocation).toHaveLength(1);
      
      const summary = response.body.summary;
      expect(summary.totalAccounts).toBe(1);
      expect(summary.totalHoldings).toBe(2);
      expect(summary.totalTransactions).toBe(2);
    });
  });
});
