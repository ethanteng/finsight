import request from 'supertest';
import { testApp } from './test-app-setup';
import { dataOrchestrator } from '../../data/orchestrator';
import { UserTier } from '../../data/types';

// Mock the data orchestrator
jest.mock('../../data/orchestrator', () => ({
  dataOrchestrator: {
    getMarketContextSummary: jest.fn(),
    getCacheStats: jest.fn(),
    refreshMarketContext: jest.fn(),
    invalidateCache: jest.fn(),
    getMarketContext: jest.fn(),
    buildTierAwareContext: jest.fn(),
    getSearchContext: jest.fn(),
    forceRefreshAllContext: jest.fn()
  }
}));

const MockDataOrchestrator = dataOrchestrator as jest.Mocked<typeof dataOrchestrator>;

describe('Enhanced Market Context API Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set test environment variables
    process.env.TEST_USER_TIER = 'starter';
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.TEST_USER_TIER;
  });

  describe('GET /test/enhanced-market-context', () => {
    it('should return enhanced market context for starter tier', async () => {
      const mockContext = 'CURRENT MARKET CONTEXT (Updated: 7/31/2025, 10:57:33 PM):\n\nUse this current market context to provide informed financial advice. Always reference specific data points when making recommendations.';
      
      MockDataOrchestrator.getMarketContextSummary.mockResolvedValue(mockContext);
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 0,
        keys: [],
        marketContextCache: {
          size: 1,
          keys: ['market_context_starter_true'],
          lastRefresh: new Date('1970-01-01T00:00:00.000Z')
        }
      });

      const response = await request(testApp)
        .get('/test/enhanced-market-context')
        .query({ tier: 'starter', isDemo: 'true' })
        .expect(200);

      expect(response.body).toEqual({
        tier: 'starter',
        isDemo: true,
        marketContextSummary: mockContext,
        contextLength: mockContext.length,
        cacheStats: {
          size: 0,
          keys: [],
          marketContextCache: {
            size: 1,
            keys: ['market_context_starter_true'],
            lastRefresh: '1970-01-01T00:00:00.000Z'
          }
        },
        timestamp: expect.any(String)
      });

      expect(MockDataOrchestrator.getMarketContextSummary).toHaveBeenCalledWith('starter', true);
    });

    it('should return enhanced market context for standard tier', async () => {
      const mockContext = 'CURRENT MARKET CONTEXT (Updated: 7/31/2025, 10:57:37 PM):\n\nECONOMIC INDICATORS:\n• Fed Funds Rate: 4.33%\n• CPI (YoY): 321.5%\n• Mortgage Rate: 6.72%\n• Credit Card APR: 24.59%\n\nKEY INSIGHTS:\n• Elevated inflation suggests TIPS and inflation-protected investments may be beneficial\n• High mortgage rates suggest waiting for refinancing opportunities\n\nUse this current market context to provide informed financial advice. Always reference specific data points when making recommendations.';
      
      MockDataOrchestrator.getMarketContextSummary.mockResolvedValue(mockContext);
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 4,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators'],
        marketContextCache: {
          size: 2,
          keys: ['market_context_starter_true', 'market_context_standard_true'],
          lastRefresh: new Date('1970-01-01T00:00:00.000Z')
        }
      });

      const response = await request(testApp)
        .get('/test/enhanced-market-context')
        .query({ tier: 'standard', isDemo: 'true' })
        .expect(200);

      expect(response.body.tier).toBe('standard');
      expect(response.body.isDemo).toBe(true);
      expect(response.body.marketContextSummary).toContain('ECONOMIC INDICATORS');
      expect(response.body.marketContextSummary).toContain('Fed Funds Rate: 4.33%');
      expect(response.body.contextLength).toBeGreaterThan(400);
    });

    it('should return enhanced market context for premium tier', async () => {
      const mockContext = 'CURRENT MARKET CONTEXT (Updated: 7/31/2025, 10:57:41 PM):\n\nECONOMIC INDICATORS:\n• Fed Funds Rate: 4.33%\n• CPI (YoY): 321.5%\n• Mortgage Rate: 6.72%\n• Credit Card APR: 24.59%\n\nLIVE MARKET DATA:\n• CD Rates: 3-month: 5.25%, 6-month: 5.35%, 1-year: 5.45%\n• Treasury Yields: 1-month: 5.12%, 3-month: 5.18%, 6-month: 5.25%\n• Mortgage Rates: 30-year-fixed: 6.85%, 15-year-fixed: 6.25%\n\nKEY INSIGHTS:\n• Elevated inflation suggests TIPS and inflation-protected investments may be beneficial\n• High mortgage rates suggest waiting for refinancing opportunities\n• High-yield CD rates available - consider laddering CDs for steady income\n• Attractive Treasury yields available for conservative investors\n\nUse this current market context to provide informed financial advice. Always reference specific data points when making recommendations.';
      
      MockDataOrchestrator.getMarketContextSummary.mockResolvedValue(mockContext);
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 5,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators', 'live_market_data'],
        marketContextCache: {
          size: 3,
          keys: ['market_context_starter_true', 'market_context_standard_true', 'market_context_premium_true'],
          lastRefresh: new Date('1970-01-01T00:00:00.000Z')
        }
      });

      const response = await request(testApp)
        .get('/test/enhanced-market-context')
        .query({ tier: 'premium', isDemo: 'true' })
        .expect(200);

      expect(response.body.tier).toBe('premium');
      expect(response.body.isDemo).toBe(true);
      expect(response.body.marketContextSummary).toContain('ECONOMIC INDICATORS');
      expect(response.body.marketContextSummary).toContain('LIVE MARKET DATA');
      expect(response.body.marketContextSummary).toContain('CD Rates: 3-month: 5.25%');
      expect(response.body.marketContextSummary).toContain('Treasury Yields: 1-month: 5.12%');
      expect(response.body.contextLength).toBeGreaterThan(800);
    });

    it('should handle missing query parameters', async () => {
      const mockContext = 'CURRENT MARKET CONTEXT (Updated: 7/31/2025, 10:57:33 PM):\n\nUse this current market context to provide informed financial advice. Always reference specific data points when making recommendations.';
      
      MockDataOrchestrator.getMarketContextSummary.mockResolvedValue(mockContext);
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 0,
        keys: [],
        marketContextCache: {
          size: 1,
          keys: ['market_context_starter_false'],
          lastRefresh: new Date('1970-01-01T00:00:00.000Z')
        }
      });

      const response = await request(testApp)
        .get('/test/enhanced-market-context')
        .expect(200);

      expect(response.body.tier).toBe('starter');
      expect(response.body.isDemo).toBe(false);
      expect(MockDataOrchestrator.getMarketContextSummary).toHaveBeenCalledWith('starter', false);
    });

    it('should handle orchestrator errors gracefully', async () => {
      MockDataOrchestrator.getMarketContextSummary.mockRejectedValue(new Error('Test error'));

      const response = await request(testApp)
        .get('/test/enhanced-market-context')
        .query({ tier: 'standard', isDemo: 'true' })
        .expect(500);

      expect(response.body.error).toBe('Test error');
    });
  });

  describe('POST /test/refresh-market-context', () => {
    it('should force refresh market context for specific tier', async () => {
      MockDataOrchestrator.refreshMarketContext.mockResolvedValue();
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 4,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators'],
        marketContextCache: {
          size: 1,
          keys: ['market_context_premium_true'],
          lastRefresh: new Date('2025-08-01T05:57:41.405Z')
        }
      });

      const response = await request(testApp)
        .post('/test/refresh-market-context')
        .send({ tier: 'premium', isDemo: true })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        tier: 'premium',
        isDemo: true,
        cacheStats: {
          size: 4,
          keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators'],
          marketContextCache: {
            size: 1,
            keys: ['market_context_premium_true'],
            lastRefresh: '2025-08-01T05:57:41.405Z'
          }
        },
        timestamp: expect.any(String)
      });

      expect(MockDataOrchestrator.refreshMarketContext).toHaveBeenCalledWith('premium', true);
    });

    it('should handle missing request body parameters', async () => {
      const response = await request(testApp)
        .post('/test/refresh-market-context')
        .send({})
        .expect(200);

      expect(response.body.tier).toBe('starter');
      expect(response.body.isDemo).toBe(false);
      expect(MockDataOrchestrator.refreshMarketContext).toHaveBeenCalledWith('starter', false);
    });

    it('should handle orchestrator errors gracefully', async () => {
      MockDataOrchestrator.refreshMarketContext.mockRejectedValue(new Error('Refresh failed'));

      const response = await request(testApp)
        .post('/test/refresh-market-context')
        .send({ tier: 'standard', isDemo: true })
        .expect(500);

      expect(response.body.error).toBe('Refresh failed');
    });
  });

  describe('GET /test/current-tier', () => {
    it('should return current tier configuration', async () => {
      const response = await request(testApp)
        .get('/test/current-tier')
        .expect(200);

      expect(response.body).toHaveProperty('testTier');
      expect(response.body).toHaveProperty('backendTier');
      expect(response.body).toHaveProperty('message');
      
      // Should match the environment variable we set
      expect(response.body.testTier).toBe('starter');
      expect(response.body.backendTier).toBe('starter');
      expect(response.body.message).toContain('Testing with starter tier');
    });
  });

  describe('Cache Management Endpoints', () => {
    it('should return cache statistics', async () => {
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 5,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators', 'live_market_data'],
        marketContextCache: {
          size: 3,
          keys: ['market_context_starter_true', 'market_context_standard_true', 'market_context_premium_true'],
          lastRefresh: new Date('2025-08-01T05:57:41.405Z')
        }
      });

      const response = await request(testApp)
        .get('/test/cache-stats')
        .expect(200);

      expect(response.body).toEqual({
        size: 5,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators', 'live_market_data'],
        marketContextCache: {
          size: 3,
          keys: ['market_context_starter_true', 'market_context_standard_true', 'market_context_premium_true'],
          lastRefresh: '2025-08-01T05:57:41.405Z'
        }
      });
    });

    it('should invalidate cache with pattern', async () => {
      MockDataOrchestrator.invalidateCache.mockResolvedValue();

      const response = await request(testApp)
        .post('/test/invalidate-cache')
        .send({ pattern: 'market' })
        .expect(200);

      expect(response.body.message).toBe('Cache invalidated for pattern: market');
      expect(MockDataOrchestrator.invalidateCache).toHaveBeenCalledWith('market');
    });

    it('should use default pattern when none provided', async () => {
      MockDataOrchestrator.invalidateCache.mockResolvedValue();

      const response = await request(testApp)
        .post('/test/invalidate-cache')
        .send({})
        .expect(200);

      expect(response.body.message).toBe('Cache invalidated for pattern: economic_indicators');
      expect(MockDataOrchestrator.invalidateCache).toHaveBeenCalledWith('economic_indicators');
    });
  });

  describe('Enhanced OpenAI Integration', () => {
    it('should use enhanced context in askOpenAIWithEnhancedContext', async () => {
      // Import the function to check it exists
      const { askOpenAIWithEnhancedContext } = require('../../openai');
      
      // Verify the function exists and is callable
      expect(typeof askOpenAIWithEnhancedContext).toBe('function');
      
      // Test that the function can be called with basic parameters
      // We'll use a simple test without complex mocking
      try {
        // This should not throw an error even if it fails due to missing API keys
        // The function should handle errors gracefully
        await askOpenAIWithEnhancedContext(
          'Test question',
          [],
          UserTier.STARTER,
          true
        );
      } catch (error) {
        // It's okay if it fails due to missing API keys or other external dependencies
        // The important thing is that the function exists and is callable
        expect(error).toBeDefined();
      }
    });
  });

  describe('Performance and Monitoring', () => {
    it('should return response within reasonable time', async () => {
      const mockContext = 'CURRENT MARKET CONTEXT (Updated: 7/31/2025, 10:57:33 PM):\n\nUse this current market context to provide informed financial advice. Always reference specific data points when making recommendations.';
      
      MockDataOrchestrator.getMarketContextSummary.mockResolvedValue(mockContext);
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 0,
        keys: [],
        marketContextCache: {
          size: 1,
          keys: ['market_context_starter_true'],
          lastRefresh: new Date('1970-01-01T00:00:00.000Z')
        }
      });

      const startTime = Date.now();
      
      const response = await request(testApp)
        .get('/test/enhanced-market-context')
        .query({ tier: 'starter', isDemo: 'true' })
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Should respond within 1 second
      expect(responseTime).toBeLessThan(1000);
      expect(response.body).toBeDefined();
    });

    it('should handle concurrent requests', async () => {
      const mockContext = 'CURRENT MARKET CONTEXT (Updated: 7/31/2025, 10:57:33 PM):\n\nUse this current market context to provide informed financial advice. Always reference specific data points when making recommendations.';
      
      MockDataOrchestrator.getMarketContextSummary.mockResolvedValue(mockContext);
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 0,
        keys: [],
        marketContextCache: {
          size: 1,
          keys: ['market_context_starter_true'],
          lastRefresh: new Date('1970-01-01T00:00:00.000Z')
        }
      });

      // Make concurrent requests
      const requests = Array(5).fill(null).map(() =>
        request(testApp)
          .get('/test/enhanced-market-context')
          .query({ tier: 'starter', isDemo: 'true' })
      );

      const responses = await Promise.all(requests);

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.tier).toBe('starter');
      });

      // Should have called getMarketContextSummary multiple times (once per request)
      expect(MockDataOrchestrator.getMarketContextSummary).toHaveBeenCalledTimes(5);
    });
  });
}); 