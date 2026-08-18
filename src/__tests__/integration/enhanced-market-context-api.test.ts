import request from 'supertest';
import { dataOrchestrator } from '../../data/orchestrator';

// Lazy import testApp to avoid EPERM errors on macOS when tests are skipped
let testApp: any;
const getTestApp = async () => {
  if (!testApp) {
    const testAppModule = await import('./test-app-setup');
    testApp = testAppModule.testApp;
  }
  return testApp;
};

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
  // Check if we're actually in GitHub Actions (not just CI=true set locally)
  // Even if CI=true is set locally, we're still on macOS which has permission issues
  const isActuallyInGitHubActions = process.env.GITHUB_ACTIONS === 'true' &&
                                     process.env.GITHUB_RUN_ID !== undefined;

  /**
   * Skip network tests locally - these require special permissions on macOS
   */
  const shouldSkipNetworkTests = !isActuallyInGitHubActions;

  // Network-gated tests are registered through this alias so they report as
  // SKIPPED rather than PASSED when they cannot run. The previous pattern was an
  // `if (skipIfLocal()) return;` guard inside the body, which exited before any
  // assertion — so a test that never ran still counted as a passing test.
  const itNetwork = shouldSkipNetworkTests ? it.skip : it;


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
    itNetwork('should return enhanced market context for starter tier', async () => {
      const mockContext = 'CURRENT MARKET CONTEXT (Updated: 7/31/2025, 10:57:33 PM):\n\nUse this current market context to provide informed financial advice. Always reference specific data points when making recommendations.';

      MockDataOrchestrator.getMarketContextSummary.mockResolvedValue(mockContext);
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 0,
        keys: [],
        marketContextCache: {
          size: 1,
          keys: ['market_context_starter'],
          lastRefresh: new Date('1970-01-01T00:00:00.000Z')
        }
      });

      const app = await getTestApp();
      const response = await request(app)
        .get('/test/enhanced-market-context')
        .query({ tier: 'starter' })
        .expect(200);

      expect(response.body).toEqual({
        tier: 'starter',
        marketContextSummary: mockContext,
        contextLength: mockContext.length,
        cacheStats: {
          size: 0,
          keys: [],
          marketContextCache: {
            size: 1,
            keys: ['market_context_starter'],
            lastRefresh: '1970-01-01T00:00:00.000Z'
          }
        },
        timestamp: expect.any(String)
      });

      expect(MockDataOrchestrator.getMarketContextSummary).toHaveBeenCalledWith('starter');
    });

    itNetwork('should return enhanced market context for standard tier', async () => {
      const mockContext = 'CURRENT MARKET CONTEXT (Updated: 7/31/2025, 10:57:37 PM):\n\nECONOMIC INDICATORS:\n• Fed Funds Rate: 4.33%\n• CPI (YoY): 321.5%\n• Mortgage Rate: 6.72%\n• Credit Card APR: 24.59%\n\nKEY INSIGHTS:\n• Elevated inflation suggests TIPS and inflation-protected investments may be beneficial\n• High mortgage rates suggest waiting for refinancing opportunities\n\nUse this current market context to provide informed financial advice. Always reference specific data points when making recommendations.';

      MockDataOrchestrator.getMarketContextSummary.mockResolvedValue(mockContext);
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 4,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators'],
        marketContextCache: {
          size: 2,
          keys: ['market_context_starter', 'market_context_standard'],
          lastRefresh: new Date('1970-01-01T00:00:00.000Z')
        }
      });

      const app = await getTestApp();
      const response = await request(app)
        .get('/test/enhanced-market-context')
        .query({ tier: 'standard' })
        .expect(200);

      expect(response.body.tier).toBe('standard');
      expect(response.body.marketContextSummary).toContain('ECONOMIC INDICATORS');
      expect(response.body.marketContextSummary).toContain('Fed Funds Rate: 4.33%');
      expect(response.body.contextLength).toBeGreaterThan(400);
    });

    itNetwork('should return enhanced market context for premium tier', async () => {
      // Orchestrator fallback is FRED-only; Premium Massive context lives in market-news.
      const mockContext = 'CURRENT MARKET CONTEXT (Updated: 7/31/2025, 10:57:41 PM):\n\nECONOMIC INDICATORS:\n• Fed Funds Rate: 4.33%\n• CPI (YoY): 321.5%\n• Mortgage Rate: 6.72%\n• Credit Card APR: 24.59%\n\nKEY INSIGHTS:\n• Elevated inflation suggests TIPS and inflation-protected investments may be beneficial\n• High mortgage rates suggest waiting for refinancing opportunities\n\nUse this current market context to provide informed financial advice. Always reference specific data points when making recommendations.';

      MockDataOrchestrator.getMarketContextSummary.mockResolvedValue(mockContext);
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 4,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators'],
        marketContextCache: {
          size: 3,
          keys: ['market_context_starter', 'market_context_standard', 'market_context_premium'],
          lastRefresh: new Date('1970-01-01T00:00:00.000Z')
        }
      });

      const app = await getTestApp();
      const response = await request(app)
        .get('/test/enhanced-market-context')
        .query({ tier: 'premium' })
        .expect(200);

      expect(response.body.tier).toBe('premium');
      expect(response.body.marketContextSummary).toContain('ECONOMIC INDICATORS');
      expect(response.body.marketContextSummary).not.toContain('LIVE MARKET DATA');
      expect(response.body.marketContextSummary).toContain('Fed Funds Rate: 4.33%');
      expect(response.body.contextLength).toBeGreaterThan(400);
    });

    itNetwork('should handle missing query parameters', async () => {
      const mockContext = 'CURRENT MARKET CONTEXT (Updated: 7/31/2025, 10:57:33 PM):\n\nUse this current market context to provide informed financial advice. Always reference specific data points when making recommendations.';

      MockDataOrchestrator.getMarketContextSummary.mockResolvedValue(mockContext);
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 0,
        keys: [],
        marketContextCache: {
          size: 1,
          keys: ['market_context_starter'],
          lastRefresh: new Date('1970-01-01T00:00:00.000Z')
        }
      });

      const app = await getTestApp();
      const response = await request(app)
        .get('/test/enhanced-market-context')
        .expect(200);

      expect(response.body.tier).toBe('starter');
      expect(MockDataOrchestrator.getMarketContextSummary).toHaveBeenCalledWith('starter');
    });

    it.skip('should handle orchestrator errors gracefully', async () => {
      MockDataOrchestrator.getMarketContextSummary.mockRejectedValue(new Error('Test error'));

      const app = await getTestApp();
      const response = await request(app)
        .get('/test/enhanced-market-context')
        .query({ tier: 'standard' })
        .expect(500);

      expect(response.body.error).toBe('Test error');
    });
  });

  describe('POST /test/refresh-market-context', () => {
    itNetwork('should force refresh market context for specific tier', async () => {
      MockDataOrchestrator.refreshMarketContext.mockResolvedValue();
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 4,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators'],
        marketContextCache: {
          size: 1,
          keys: ['market_context_premium'],
          lastRefresh: new Date('2025-08-01T05:57:41.405Z')
        }
      });

      const app = await getTestApp();
      const response = await request(app)
        .post('/test/refresh-market-context')
        .send({ tier: 'premium' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        tier: 'premium',
        cacheStats: {
          size: 4,
          keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators'],
          marketContextCache: {
            size: 1,
            keys: ['market_context_premium'],
            lastRefresh: '2025-08-01T05:57:41.405Z'
          }
        },
        timestamp: expect.any(String)
      });

      expect(MockDataOrchestrator.refreshMarketContext).toHaveBeenCalledWith('premium');
    });

    itNetwork('should handle missing request body parameters', async () => {
      const app = await getTestApp();
      const response = await request(app)
        .post('/test/refresh-market-context')
        .send({})
        .expect(200);

      expect(response.body.tier).toBe('starter');
      expect(MockDataOrchestrator.refreshMarketContext).toHaveBeenCalledWith('starter');
    });

    itNetwork('should handle orchestrator errors gracefully', async () => {
      MockDataOrchestrator.refreshMarketContext.mockRejectedValue(new Error('Refresh failed'));

      const app = await getTestApp();
      const response = await request(app)
        .post('/test/refresh-market-context')
        .send({ tier: 'standard' })
        .expect(500);

      expect(response.body.error).toBe('Refresh failed');
    });
  });

  describe('GET /test/current-tier', () => {
    itNetwork('should return current tier configuration', async () => {
      const app = await getTestApp();
      const response = await request(app)
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
    itNetwork('should return cache statistics', async () => {
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 5,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators', 'live_market_data'],
        marketContextCache: {
          size: 3,
          keys: ['market_context_starter', 'market_context_standard', 'market_context_premium'],
          lastRefresh: new Date('2025-08-01T05:57:41.405Z')
        }
      });

      const app = await getTestApp();
      const response = await request(app)
        .get('/test/cache-stats')
        .expect(200);

      expect(response.body).toEqual({
        size: 5,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators', 'live_market_data'],
        marketContextCache: {
          size: 3,
          keys: ['market_context_starter', 'market_context_standard', 'market_context_premium'],
          lastRefresh: '2025-08-01T05:57:41.405Z'
        }
      });
    });

    itNetwork('should invalidate cache with pattern', async () => {
      MockDataOrchestrator.invalidateCache.mockResolvedValue();

      const app = await getTestApp();
      const response = await request(app)
        .post('/test/invalidate-cache')
        .send({ pattern: 'market' })
        .expect(200);

      expect(response.body.message).toBe('Cache invalidated for pattern: market');
      expect(MockDataOrchestrator.invalidateCache).toHaveBeenCalledWith('market');
    });

    itNetwork('should use default pattern when none provided', async () => {
      MockDataOrchestrator.invalidateCache.mockResolvedValue();

      const app = await getTestApp();
      const response = await request(app)
        .post('/test/invalidate-cache')
        .send({})
        .expect(200);

      expect(response.body.message).toBe('Cache invalidated for pattern: economic_indicators');
      expect(MockDataOrchestrator.invalidateCache).toHaveBeenCalledWith('economic_indicators');
    });
  });

  describe('Performance and Monitoring', () => {
    itNetwork('should return response within reasonable time', async () => {
      const mockContext = 'CURRENT MARKET CONTEXT (Updated: 7/31/2025, 10:57:33 PM):\n\nUse this current market context to provide informed financial advice. Always reference specific data points when making recommendations.';

      MockDataOrchestrator.getMarketContextSummary.mockResolvedValue(mockContext);
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 0,
        keys: [],
        marketContextCache: {
          size: 1,
          keys: ['market_context_starter'],
          lastRefresh: new Date('1970-01-01T00:00:00.000Z')
        }
      });

      const startTime = Date.now();

      const app = await getTestApp();
      const response = await request(app)
        .get('/test/enhanced-market-context')
        .query({ tier: 'starter' })
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Should respond within 1 second
      expect(responseTime).toBeLessThan(1000);
      expect(response.body).toBeDefined();
    });

    itNetwork('should handle concurrent requests', async () => {
      const mockContext = 'CURRENT MARKET CONTEXT (Updated: 7/31/2025, 10:57:33 PM):\n\nUse this current market context to provide informed financial advice. Always reference specific data points when making recommendations.';

      MockDataOrchestrator.getMarketContextSummary.mockResolvedValue(mockContext);
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 0,
        keys: [],
        marketContextCache: {
          size: 1,
          keys: ['market_context_starter'],
          lastRefresh: new Date('1970-01-01T00:00:00.000Z')
        }
      });

      // Make concurrent requests
      const app = await getTestApp();
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .get('/test/enhanced-market-context')
          .query({ tier: 'starter' })
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
