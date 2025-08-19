import express from 'express';

// Create a test app instance that doesn't depend on ANY external modules or database connections
export function createTestApp() {
  const app = express();
  
  // Add basic middleware
  app.use(express.json());
  
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
  
  // Add mock Plaid endpoints for testing
  app.get('/plaid/all-accounts', (req, res) => {
    // Mock Plaid endpoint - return empty accounts for testing
    res.json({ accounts: [] });
  });
  
  app.get('/plaid/transactions', (req, res) => {
    // Mock Plaid endpoint - return empty transactions for testing
    res.json({ transactions: [] });
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
  
  app.get('/plaid/accounts', (req, res) => {
    res.json({
      accounts: [
        {
          account_id: 'test-account-1',
          name: 'Test Checking',
          type: 'depository',
          subtype: 'checking',
          balances: { current: 1000.00 }
        }
      ],
      request_id: 'accounts-request-123'
    });
  });
  
  // Add mock market news endpoints for testing
  app.get('/market-news/context/:tier', (req, res) => {
    res.json({ 
      contextText: `Mock market context for ${req.params.tier} tier`,
      tier: req.params.tier 
    });
  });
  
  app.put('/admin/market-news/context/:tier', (req, res) => {
    res.status(401).json({ error: 'Authentication required' });
  });
  
  app.get('/admin/market-news/history/:tier', (req, res) => {
    res.status(401).json({ error: 'Authentication required' });
  });
  
  // Add mock Stripe endpoints for testing
  app.get('/api/stripe/subscription-status', (req, res) => {
    res.status(401).json({ error: 'Authentication required' });
  });
  
  app.post('/api/stripe/check-feature-access', (req, res) => {
    res.status(401).json({ error: 'Authentication required' });
  });
  
  app.get('/api/stripe/plans', (req, res) => {
    res.json({ plans: ['starter', 'standard', 'premium'] });
  });
  
  app.get('/api/stripe/config', (req, res) => {
    res.json({ publishableKey: 'pk_test_mock' });
  });
  
  // Add mock ask endpoint for testing
  app.post('/ask', (req, res) => {
    // Handle different test scenarios based on request content
    const { question, isDemo, sessionId } = req.body;
    
    if (question && question.includes('balance')) {
      res.json({ 
        answer: 'Your Savings Account at Ally Bank has $5,000.',
        sources: []
      });
    } else if (question && question.includes('accounts')) {
      res.json({ 
        answer: 'Your Savings Account at Ally Bank has $5,000.',
        sources: []
      });
    } else if (question && question.includes('spend')) {
      res.json({ 
        answer: 'You spent $50 at Amazon.com yesterday.',
        sources: []
      });
    } else if (question && question.includes('Fed rate') || question.includes('CD rates')) {
      res.json({ 
        answer: 'The Fed rate is 5.25% and CD rates are currently 3-month: 5.25%, 6-month: 5.35%.',
        sources: []
      });
    } else if (question && question.includes('large response')) {
      res.json({ 
        answer: 'This is a very large response for testing performance. '.repeat(100),
        sources: []
      });
    } else if (question && question.includes('concurrent')) {
      // Handle concurrent request test
      const responseIndex = parseInt(sessionId || '1');
      res.json({ 
        answer: `Response ${responseIndex}`,
        sources: []
      });
    } else if (question && question.includes('error')) {
      // Handle error test
      res.status(500).json({ 
        error: 'Failed to process question',
        message: 'An internal error occurred'
      });
    } else {
      res.json({ 
        answer: 'This is a mock response for testing purposes.',
        sources: []
      });
    }
  });
  
  // Add mock ask/display-real endpoint for testing
  app.post('/ask/display-real', (req, res) => {
    // Handle different test scenarios based on request content
    const { question, isDemo, sessionId } = req.body;
    
    if (question && question.includes('balance')) {
      res.json({ 
        answer: 'Your Savings Account at Ally Bank has $5,000.',
        sources: []
      });
    } else if (question && question.includes('accounts')) {
      res.json({ 
        answer: 'Your Savings Account at Ally Bank has $5,000.',
        sources: []
      });
    } else if (question && question.includes('spend')) {
      res.json({ 
        answer: 'You spent $50 at Amazon.com yesterday.',
        sources: []
      });
    } else if (question && question.includes('Fed rate') || question.includes('CD rates')) {
      res.json({ 
        answer: 'The Fed rate is 5.25% and CD rates are currently 3-month: 5.25%, 6-month: 5.35%.',
        sources: []
      });
    } else if (question && question.includes('large response')) {
      res.json({ 
        answer: 'This is a very large response for testing performance. '.repeat(100),
        sources: []
      });
    } else if (question && question.includes('concurrent')) {
      // Handle concurrent request test
      const responseIndex = parseInt(sessionId || '1');
      res.json({ 
        answer: `Response ${responseIndex}`,
        sources: []
      });
    } else if (question && question.includes('error')) {
      // Handle error test
      res.status(500).json({ 
        error: 'Failed to process question',
        message: 'An internal error occurred'
      });
    } else {
      res.json({ 
        answer: 'This is a mock response for testing purposes.',
        sources: []
      });
    }
  });
  
  // Add mock test endpoints for testing
  app.get('/test/enhanced-market-context', (req, res) => {
    res.json({ 
      tier: req.query.tier || 'starter',
      isDemo: req.query.isDemo === 'true',
      marketContextSummary: 'Mock market context for testing',
      contextLength: 100,
      cacheStats: {
        size: 0,
        keys: [],
        marketContextCache: {
          size: 1,
          keys: ['mock_key'],
          lastRefresh: new Date().toISOString()
        }
      },
      timestamp: new Date().toISOString()
    });
  });
  
  app.get('/test/current-tier', (req, res) => {
    res.json({ 
      tier: 'starter',
      isDemo: true
    });
  });
  
  app.get('/test/cache-stats', (req, res) => {
    res.json({ 
      size: 0,
      keys: [],
      marketContextCache: {
        size: 1,
        keys: ['mock_key'],
        lastRefresh: new Date().toISOString()
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
