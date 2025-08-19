import express from 'express';
import { dataOrchestrator } from '../../data/orchestrator';
import { UserTier } from '../../data/types';
import { askOpenAIWithEnhancedContext } from '../../openai';
import { convertResponseToUserFriendly } from '../../privacy';
import { verifyToken, extractTokenFromHeader } from '../../auth/utils';

// Create a test app instance that doesn't depend on ANY external modules or database connections
export function createTestApp() {
  const app = express();
  
  // Add basic middleware
  app.use(express.json());
  
  // Simple authentication middleware for testing
  const testAuthMiddleware = (req: any, res: any, next: any) => {
    try {
      const token = extractTokenFromHeader(req.headers.authorization);
      
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const payload = verifyToken(token);
      if (!payload) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // For testing, we'll just attach the user info from the JWT
      req.user = {
        id: payload.userId,
        email: payload.email,
        tier: payload.tier
      };

      next();
    } catch (error) {
      res.status(401).json({ error: 'Authentication error' });
    }
  };
  
  // Add basic health endpoint for testing
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'test'
    });
  });
  
  // Add root endpoint
  app.get('/', (req, res) => {
    res.json({ 
      message: 'Finsight Test API is running',
      timestamp: new Date().toISOString(),
      environment: 'test'
    });
  });
  
  // Add mock Plaid endpoints for testing - these require authentication
  app.get('/plaid/all-accounts', testAuthMiddleware, (req: any, res) => {
    // Mock Plaid endpoint - return empty accounts for testing
    res.json({ accounts: [] });
  });
  

  
  app.post('/plaid/create_link_token', (req, res) => {
    // Mock Plaid link token creation
    const { isDemo } = req.body;
    const demoMode = isDemo || req.headers['x-demo-mode'] === 'true';
    
    if (demoMode) {
      res.json({ link_token: 'demo-sandbox-link-token-12345' });
    } else {
      res.json({ link_token: 'production-link-token-67890' });
    }
  });
  
  app.get('/plaid/accounts', testAuthMiddleware, (req: any, res) => {
    res.json({
      accounts: [
        {
          account_id: 'acc1',
          name: 'Checking Account',
          type: 'depository',
          subtype: 'checking',
          balances: { 
            available: 5000,
            current: 5000,
            limit: null
          },
          mask: '1234',
          institution_id: 'inst1'
        },
        {
          account_id: 'acc2',
          name: 'Savings Account',
          type: 'depository',
          subtype: 'savings',
          balances: { 
            available: 10000,
            current: 10000,
            limit: null
          },
          mask: '5678',
          institution_id: 'inst1'
        }
      ],
      item: { item_id: 'item1' },
      request_id: 'accounts-request-123'
    });
  });
  
  app.get('/plaid/transactions', testAuthMiddleware, (req: any, res) => {
    res.json({
      transactions: [
        {
          transaction_id: 't1',
          account_id: 'acc1',
          amount: 50.00,
          date: '2025-01-01',
          name: 'Coffee Shop',
          merchant_name: 'Starbucks',
          category: ['Food and Drink', 'Restaurants'],
          category_id: '10000000',
          payment_channel: 'in store',
          pending: false
        },
        {
          transaction_id: 't2',
          account_id: 'acc1',
          amount: 100.00,
          date: '2025-01-02',
          name: 'Grocery Store',
          merchant_name: 'Whole Foods',
          category: ['Food and Drink', 'Groceries'],
          category_id: '10000001',
          payment_channel: 'in store',
          pending: false
        }
      ],
      total_transactions: 2,
      accounts: [
        {
          account_id: 'acc1',
          name: 'Checking Account',
          type: 'depository'
        }
      ],
      item: { item_id: 'item1' },
      request_id: 'transactions-request-123'
    });
  });
  
  app.get('/plaid/liabilities', testAuthMiddleware, (req: any, res) => {
    res.json({
      liabilities: [{
        accounts: [
          {
            account_id: 'acc1',
            name: 'Credit Card',
            type: 'credit',
            subtype: 'credit card',
            balances: {
              current: 2500,
              available: 7500,
              limit: 10000
            },
            mask: '1234',
            institution_id: 'inst1'
          },
          {
            account_id: 'acc2',
            name: 'Student Loan',
            type: 'loan',
            subtype: 'student',
            balances: {
              current: 15000,
              available: null,
              limit: null
            },
            mask: '5678',
            institution_id: 'inst2'
          }
        ],
        item: { item_id: 'item1' },
        request_id: 'req1'
      }]
    });
  });
  
  app.post('/plaid/enrich/transactions', (req, res) => {
    const { transaction_ids, account_type } = req.body;
    
    if (!transaction_ids || !Array.isArray(transaction_ids)) {
      return res.status(400).json({ error: 'transaction_ids array required' });
    }

    res.json({
      enrichments: [{
        enriched_transactions: transaction_ids.map((id: string) => ({
          transaction_id: id,
          merchant_name: `Merchant ${id}`,
          website: `https://merchant${id}.com`,
          logo_url: `https://logo${id}.png`,
          check_number: null,
          payment_channel: 'online',
          payment_processor: 'stripe',
          category_id: '10000000',
          category: ['Food and Drink', 'Restaurants'],
          location: {
            address: `123 Main St ${id}`,
            city: 'New York',
            state: 'NY',
            zip: '10001',
            country: 'US',
            lat: 40.7128,
            lon: -74.0060
          },
          personal_finance_category: {
            primary: 'FOOD_AND_DRINK',
            detailed: 'RESTAURANTS',
            confidence_level: 'HIGH'
          },
          personal_finance_category_icon_url: `https://icon${id}.png`,
          counterparties: [
            {
              name: `Counterparty ${id}`,
              type: 'merchant',
              website: `https://counterparty${id}.com`,
              entity_id: `entity${id}`,
              logo_url: `https://logo${id}.png`
            }
          ]
        })),
        request_id: 'req1'
      }]
    });
  });
  
  app.get('/plaid/income', testAuthMiddleware, (req: any, res) => {
    res.json({
      income: [
        {
          account_id: 'acc1',
          name: 'Checking Account',
          type: 'depository',
          subtype: 'checking',
          income_streams: [
            {
              name: 'Salary',
              monthly_income: 5000,
              type: 'INCOME_TYPE_W2',
              confidence: 0.9
            },
            {
              name: 'Freelance',
              monthly_income: 1000,
              type: 'INCOME_TYPE_1099',
              confidence: 0.75
            }
          ],
          last_year_income: 58000,
          projected_yearly_income: 60000
        }
      ],
      summary: {
        totalIncomeStreams: 2,
        totalMonthlyIncome: 6000,
        totalYearlyIncome: 72000,
        projectedYearlyIncome: 75000
      }
    });
  });
  
  // Add mock market news endpoints for testing
  app.get('/market-news/context/:tier', (req, res) => {
    const { tier } = req.params;
    
    // Return 404 for invalid tiers
    if (!['starter', 'standard', 'premium'].includes(tier)) {
      return res.status(404).json({ error: 'Invalid tier' });
    }
    
    res.json({ 
      contextText: `Mock market context for ${tier} tier`,
      tier: tier,
      dataSources: ['FRED', 'Alpha Vantage', 'Search API'],
      keyEvents: [
        'Federal Reserve maintains current interest rates',
        'Inflation data shows moderate increase',
        'Market volatility remains within normal range'
      ],
      lastUpdate: new Date().toISOString()
    });
  });
  
  app.put('/admin/market-news/context/:tier', (req, res) => {
    res.status(401).json({ error: 'Authentication required' });
  });
  
  app.get('/admin/market-news/history/:tier', (req, res) => {
    res.status(401).json({ error: 'Authentication required' });
  });
  
  // Add mock Stripe endpoints for testing with proper authentication
  app.get('/api/stripe/subscription-status', testAuthMiddleware, (req: any, res) => {
    res.json({
      tier: 'starter',
      accessLevel: 'limited',
      status: 'active',
      message: 'Access granted',
      upgradeRequired: false
    });
  });
  
  app.post('/api/stripe/check-feature-access', testAuthMiddleware, (req: any, res) => {
    res.json({
      access: true,
      reason: 'Access granted',
      currentTier: 'starter',
      requiredTier: req.body.requiredTier || 'premium',
      upgradeRequired: false
    });
  });
  
  app.get('/api/stripe/plans', (req, res) => {
    res.json({ plans: ['starter', 'standard', 'premium'] });
  });
  
  app.get('/api/stripe/config', (req, res) => {
    res.json({ publishableKey: 'pk_test_mock' });
  });
  
  app.post('/api/stripe/webhook', (req: any, res) => {
    // Mock webhook endpoint - no authentication required
    // In production, this would validate Stripe signature
    res.json({ received: true, authenticated: false });
  });
  
  // Add mock ask endpoint for testing
  app.post('/ask', async (req, res) => {
    try {
      const { question, isDemo, sessionId } = req.body;
      
      if (!question) {
        return res.status(400).json({ error: 'Question is required' });
      }

      // Call the actual askOpenAIWithEnhancedContext function (which is mocked in tests)
      const answer = await askOpenAIWithEnhancedContext(question, [], 'starter' as UserTier, isDemo);
      
      // In production mode, convert the response to user-friendly format
      let finalAnswer = answer;
      if (!isDemo) {
        try {
          finalAnswer = convertResponseToUserFriendly(answer);
        } catch (conversionError) {
          // If conversion fails in production mode, return 500 error
          const errorMessage = conversionError instanceof Error ? conversionError.message : 'Unknown conversion error';
          return res.status(500).json({ 
            error: 'Failed to process question',
            message: errorMessage
          });
        }
      }
      
      res.json({
        answer: finalAnswer,
        sources: []
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: 'Failed to process question',
        message: errorMessage
      });
    }
  });
  
  // Add mock ask/display-real endpoint for testing
  app.post('/ask/display-real', async (req, res) => {
    try {
      const { question, isDemo, sessionId } = req.body;
      
      if (!question) {
        return res.status(400).json({ error: 'Question is required' });
      }

      // Call the actual askOpenAIWithEnhancedContext function (which is mocked in tests)
      const answer = await askOpenAIWithEnhancedContext(question, [], 'starter' as UserTier, isDemo);
      
      // In production mode, convert the response to user-friendly format
      let finalAnswer = answer;
      if (!isDemo) {
        try {
          finalAnswer = convertResponseToUserFriendly(answer);
        } catch (conversionError) {
          // If conversion fails in production mode, return 500 error
          const errorMessage = conversionError instanceof Error ? conversionError.message : 'Unknown conversion error';
          return res.status(500).json({ 
            error: 'Failed to process question',
            message: errorMessage
          });
        }
      }
      
      res.json({
        answer: finalAnswer,
        sources: []
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: 'Failed to process question',
        message: errorMessage
      });
    }
  });
  
  // Add mock test endpoints for testing
  app.get('/test/enhanced-market-context', async (req, res) => {
    try {
      const tier = (req.query.tier as string || 'starter') as UserTier;
      const isDemo = req.query.isDemo === 'true';
      
      // Call the actual orchestrator functions (which are mocked in tests)
      const marketContextSummary = await dataOrchestrator.getMarketContextSummary(tier, isDemo);
      const cacheStats = await dataOrchestrator.getCacheStats();
      
      res.json({ 
        tier,
        isDemo,
        marketContextSummary,
        contextLength: marketContextSummary.length,
        cacheStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });
  
  app.get('/test/current-tier', (req, res) => {
    const testTier = process.env.TEST_USER_TIER || 'starter';
    res.json({ 
      testTier,
      backendTier: testTier,
      message: `Testing with ${testTier} tier`,
      tier: testTier,
      isDemo: true
    });
  });
  
  app.get('/test/cache-stats', async (req, res) => {
    try {
      // Call the actual orchestrator function (which is mocked in tests)
      const cacheStats = await dataOrchestrator.getCacheStats();
      res.json(cacheStats);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });
  
  // Add missing test endpoints
  app.post('/test/refresh-market-context', async (req, res) => {
    try {
      const { tier, isDemo } = req.body;
      const actualTier = (tier || 'starter') as UserTier;
      const actualIsDemo = isDemo || false;
      
      // Call the actual orchestrator function (which is mocked in tests)
      await dataOrchestrator.refreshMarketContext(actualTier, actualIsDemo);
      const cacheStats = await dataOrchestrator.getCacheStats();
      
      res.json({ 
        success: true,
        tier: actualTier,
        isDemo: actualIsDemo,
        cacheStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });
  
  app.post('/test/invalidate-cache', async (req, res) => {
    try {
      const { pattern } = req.body;
      const defaultPattern = 'economic_indicators';
      const actualPattern = pattern || defaultPattern;
      
      // Call the actual orchestrator function (which is mocked in tests)
      await dataOrchestrator.invalidateCache(actualPattern);
      
      res.json({ 
        message: `Cache invalidated for pattern: ${actualPattern}`,
        pattern: actualPattern
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });
  
  // Add Plaid investment endpoints for testing
  app.get('/plaid/investments/holdings', testAuthMiddleware, (req: any, res) => {
    res.json({
      holdings: [{
        holdings: [
          {
            account_id: 'acc1',
            security_id: 'sec1',
            institution_value: 10000,
            institution_price: 100,
            quantity: 100,
            iso_currency_code: 'USD'
          },
          {
            account_id: 'acc1',
            security_id: 'sec2',
            institution_value: 5000,
            institution_price: 50,
            quantity: 100,
            iso_currency_code: 'USD'
          }
        ],
        securities: [
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
        ],
        accounts: [
          {
            account_id: 'acc1',
            name: 'Investment Account',
            type: 'investment',
            subtype: '401k'
          }
        ],
        item: { item_id: 'item1' },
        analysis: {
          totalValue: 15000,
          assetAllocation: [
            { type: 'equity', value: 10000, percentage: 66.67 },
            { type: 'fixed income', value: 5000, percentage: 33.33 }
          ]
        }
      }],
      summary: {
        totalAccounts: 1,
        totalHoldings: 2,
        totalSecurities: 2,
        totalPortfolioValue: 15000
      }
    });
  });
  
  app.get('/plaid/investments/transactions', testAuthMiddleware, (req, res) => {
    const { start_date, end_date } = req.query;
    res.json({
      transactions: [{
        investment_transactions: [
          {
            investment_transaction_id: 't1',
            account_id: 'acc1',
            security_id: 'sec1',
            amount: 1000,
            date: '2025-01-01',
            name: 'Buy Stock A',
            quantity: 10,
            type: 'buy',
            subtype: 'market'
          },
          {
            investment_transaction_id: 't2',
            account_id: 'acc1',
            security_id: 'sec1',
            amount: 500,
            date: '2025-01-02',
            name: 'Sell Stock A',
            quantity: 5,
            type: 'sell',
            subtype: 'market'
          }
        ],
        total_investment_transactions: 2,
        accounts: [
          {
            account_id: 'acc1',
            name: 'Investment Account',
            type: 'investment'
          }
        ],
        securities: [
          {
            security_id: 'sec1',
            name: 'Stock A',
            type: 'equity',
            ticker_symbol: 'STKA'
          }
        ],
        item: { item_id: 'item1' },
        analysis: {
          totalTransactions: 2,
          totalVolume: 1500,
          activityByType: {
            buy: { count: 1, volume: 1000 },
            sell: { count: 1, volume: 500 }
          }
        }
      }],
      sortedTransactions: [
        {
          investment_transaction_id: 't2',
          account_id: 'acc1',
          security_id: 'sec1',
          amount: 500,
          date: '2025-01-02',
          name: 'Sell Stock A',
          quantity: 5,
          type: 'sell',
          subtype: 'market'
        },
        {
          investment_transaction_id: 't1',
          account_id: 'acc1',
          security_id: 'sec1',
          amount: 1000,
          date: '2025-01-01',
          name: 'Buy Stock A',
          quantity: 10,
          type: 'buy',
          subtype: 'market'
        }
      ],
      summary: {
        totalAccounts: 1,
        totalTransactions: 2,
        totalSecurities: 1,
        dateRange: { 
          start_date: start_date || '2024-12-02',
          end_date: end_date || '2025-01-01'
        }
      }
    });
  });
  
  app.get('/plaid/investments', testAuthMiddleware, (req, res) => {
    res.json({
      investments: [{
        holdings: [
          {
            account_id: 'acc1',
            security_id: 'sec1',
            institution_value: 10000,
            quantity: 100,
            iso_currency_code: 'USD'
          }
        ],
        securities: [
          {
            security_id: 'sec1',
            name: 'Stock A',
            type: 'equity',
            ticker_symbol: 'STKA'
          }
        ],
        accounts: [
          {
            account_id: 'acc1',
            name: 'Investment Account',
            type: 'investment'
          }
        ],
        investment_transactions: [
          {
            investment_transaction_id: 't1',
            account_id: 'acc1',
            security_id: 'sec1',
            amount: 1000,
            date: '2025-01-01',
            name: 'Buy Stock A',
            quantity: 10,
            type: 'buy'
          }
        ],
        total_investment_transactions: 1,
        analysis: {
          totalPortfolioValue: 15000,
          assetAllocation: [
            { type: 'equity', value: 10000, percentage: 100 }
          ],
          performanceMetrics: {
            totalReturn: 0.05,
            annualizedReturn: 0.12
          }
        }
      }],
      summary: {
        totalAccounts: 1,
        totalHoldings: 2,
        totalSecurities: 1,
        totalTransactions: 2
      }
    });
  });
  
  // Add mock profile endpoint for testing
  app.get('/profile', (req, res) => {
    res.status(401).json({ error: 'Authentication required' });
  });
  
  return app;
}

// Export a default test app instance
export const testApp = createTestApp();
