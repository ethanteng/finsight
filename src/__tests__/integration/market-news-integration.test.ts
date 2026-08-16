import request from 'supertest';
import { testPrisma } from '../setup/test-database-ci';
import { UserTier } from '../../data/types';

// Lazy import testApp to avoid EPERM errors on macOS when tests are skipped
let testApp: any;
const getTestApp = async () => {
  if (!testApp) {
    const testAppModule = await import('./test-app-setup');
    testApp = testAppModule.testApp;
  }
  return testApp;
};

describe('Market News Context Integration Tests', () => {
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

  beforeAll(async () => {
    try {
      // Clean up any existing market news context data
      await testPrisma.marketNewsHistory.deleteMany();
      await testPrisma.marketNewsContext.deleteMany();

      // Create initial market context data for testing
      await testPrisma.marketNewsContext.create({
      data: {
        id: 'auto-starter',
        contextText: 'Starter tier market context - basic economic indicators available.',
        dataSources: ['fred'],
        keyEvents: ['Federal Reserve rate at 5.25%'],
        availableTiers: ['starter'],
        isActive: true
      }
    });

    await testPrisma.marketNewsContext.create({
      data: {
        id: 'auto-standard',
        contextText: 'Standard tier market context - comprehensive economic and market data available.',
        dataSources: ['fred', 'brave_search'],
        keyEvents: ['Federal Reserve rate at 5.25%', 'Mortgage rates at 6.85%'],
        availableTiers: ['standard'],
        isActive: true
      }
    });
    } catch (error: any) {
      // In CI/CD, the database might not be fully ready yet
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        console.log('ℹ️ Database tables not ready yet, skipping market news setup');
      } else {
        throw error; // Re-throw other errors
      }
    }
  });

  afterAll(async () => {
    try {
      await testPrisma.marketNewsHistory.deleteMany();
      await testPrisma.marketNewsContext.deleteMany();
    } catch (error: any) {
      // In CI/CD, the database might not be fully ready yet
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        console.log('ℹ️ Database tables not ready yet, skipping market news cleanup');
      } else {
        console.warn('⚠️ Warning during market news cleanup:', error.message);
      }
    }
    // testPrisma is managed by the test database setup
  });

  describe('Market News Context API', () => {
    itNetwork('should get market context for Standard tier', async () => {
      const app = await getTestApp();
      const response = await request(app)
        .get('/market-news/context/standard')
        .expect(200);

      expect(response.body).toHaveProperty('contextText');
      expect(response.body).toHaveProperty('dataSources');
      expect(response.body).toHaveProperty('keyEvents');
      expect(response.body).toHaveProperty('lastUpdate');
      expect(response.body.tier).toBe('standard');
      // Context might be empty initially, which is okay
      expect(typeof response.body.contextText).toBe('string');
    });

    itNetwork('should get market context for Starter tier', async () => {
      const app = await getTestApp();
      const response = await request(app)
        .get('/market-news/context/starter')
        .expect(200);

      expect(response.body).toHaveProperty('contextText');
      expect(response.body).toHaveProperty('dataSources');
      expect(response.body).toHaveProperty('keyEvents');
      expect(response.body).toHaveProperty('lastUpdate');
      expect(response.body.tier).toBe('starter');
      // Context might be empty initially, which is okay
      expect(typeof response.body.contextText).toBe('string');
    });

    itNetwork('should update market context manually', async () => {
      const updateData = {
        contextText: 'Test market context update'
      };

      const app = await getTestApp();
      const response = await request(app)
        .put('/admin/market-news/context/standard')
        .send(updateData)
        .expect(401); // Should require authentication

      expect(response.body).toHaveProperty('error');
    });

    itNetwork('should get market context history', async () => {
      const app = await getTestApp();
      const response = await request(app)
        .get('/admin/market-news/history/standard')
        .query({ limit: '5' })
        .expect(401); // Should require authentication

      expect(response.body).toHaveProperty('error');
    });

    itNetwork('should handle invalid tier gracefully', async () => {
      const app = await getTestApp();
      const response = await request(app)
        .get('/market-news/context/invalid_tier')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  // This was skipped in CI while the setup substituted an in-memory mock with no
  // persistence. CI now runs against the real database, so the round trip is
  // testable again and the skip is removed.
  describe('Market News Context Database Operations', () => {
    test('should store and retrieve market context from database', async () => {
      try {
        // Create a test market context
        const testContext = await testPrisma.marketNewsContext.create({
          data: {
            id: 'test-context-1',
            contextText: 'Test market context for database test',
            dataSources: ['fred', 'brave_search'],
            keyEvents: ['Test event'],
            availableTiers: ['standard'],
            isActive: true
          }
        });

        expect(testContext.id).toBe('test-context-1');
        expect(testContext.contextText).toBe('Test market context for database test');
        expect(testContext.dataSources).toEqual(['fred', 'brave_search']);

        // Retrieve the context
        const retrievedContext = await testPrisma.marketNewsContext.findUnique({
          where: { id: 'test-context-1' }
        });

        // CI runs against the real postgres service container, so the round trip
        // must be exact. The previous version had two branches that fell back to
        // `toBeDefined()` when the text did not match, which meant a broken
        // write/read round trip still passed.
        expect(retrievedContext).not.toBeNull();
        expect(retrievedContext?.contextText).toBe('Test market context for database test');
        expect(retrievedContext?.dataSources).toEqual(['fred', 'brave_search']);
      } finally {
        // Best-effort cleanup if an assertion above threw before the delete.
        await testPrisma.marketNewsContext
          .delete({ where: { id: 'test-context-1' } })
          .catch(() => undefined);
      }
    });
  });
});
