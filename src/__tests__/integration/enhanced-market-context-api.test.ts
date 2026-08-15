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

  // Helper to skip network tests locally
  const skipIfLocal = () => {
    if (shouldSkipNetworkTests) {
      console.log('⏭️ Skipping network test locally - will run in CI/CD');
      return true;
    }
    return false;
  };

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
      if (skipIfLocal()) return;

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

    it('should return enhanced market context for standard tier', async () => {
      if (skipIfLocal()) return;

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

    it('should return enhanced market context for premium tier', async () => {
      if (skipIfLocal()) return;

      const mockContext = 'CURRENT MARKET CONTEXT (Updated: 7/31/2025, 10:57:41 PM):\n\nECONOMIC INDICATORS:\n• Fed Funds Rate: 4.33%\n• CPI (YoY): 321.5%\n• Mortgage Rate: 6.72%\n• Credit Card APR: 24.59%\n\nLIVE MARKET DATA:\n• CD Rates: 3-month: 5.25%, 6-month: 5.35%, 1-year: 5.45%\n• Treasury Yields: 1-month: 5.12%, 3-month: 5.18%, 6-month: 5.25%\n• Mortgage Rates: 30-year-fixed: 6.85%, 15-year-fixed: 6.25%\n\nKEY INSIGHTS:\n• Elevated inflation suggests TIPS and inflation-protected investments may be beneficial\n• High mortgage rates suggest waiting for refinancing opportunities\n• High-yield CD rates available - consider laddering CDs for steady income\n• Attractive Treasury yields available for conservative investors\n\nUse this current market context to provide informed financial advice. Always reference specific data points when making recommendations.';

      MockDataOrchestrator.getMarketContextSummary.mockResolvedValue(mockContext);
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 5,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators', 'live_market_data'],
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
      expect(response.body.marketContextSummary).toContain('LIVE MARKET DATA');
      expect(response.body.marketContextSummary).toContain('CD Rates: 3-month: 5.25%');
      expect(response.body.marketContextSummary).toContain('Treasury Yields: 1-month: 5.12%');
      expect(response.body.contextLength).toBeGreaterThan(800);
    });

    it('should handle missing query parameters', async () => {
      if (skipIfLocal()) return;

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
    it('should force refresh market context for specific tier', async () => {
      if (skipIfLocal()) return;

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

    it('should handle missing request body parameters', async () => {
      if (skipIfLocal()) return;

      const app = await getTestApp();
      const response = await request(app)
        .post('/test/refresh-market-context')
        .send({})
        .expect(200);

      expect(response.body.tier).toBe('starter');
      expect(MockDataOrchestrator.refreshMarketContext).toHaveBeenCalledWith('starter');
    });

    it('should handle orchestrator errors gracefully', async () => {
      if (skipIfLocal()) return;

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
    it('should return current tier configuration', async () => {
      if (skipIfLocal()) return;

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
    it('should return cache statistics', async () => {
      if (skipIfLocal()) return;

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

    it('should invalidate cache with pattern', async () => {
      if (skipIfLocal()) return;

      MockDataOrchestrator.invalidateCache.mockResolvedValue();

      const app = await getTestApp();
      const response = await request(app)
        .post('/test/invalidate-cache')
        .send({ pattern: 'market' })
        .expect(200);

      expect(response.body.message).toBe('Cache invalidated for pattern: market');
      expect(MockDataOrchestrator.invalidateCache).toHaveBeenCalledWith('market');
    });

    it('should use default pattern when none provided', async () => {
      if (skipIfLocal()) return;

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
    it('should return response within reasonable time', async () => {
      if (skipIfLocal()) return;

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

    it('should handle concurrent requests', async () => {
      if (skipIfLocal()) return;

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
