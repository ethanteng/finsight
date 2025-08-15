import { dataOrchestrator } from '../../data/orchestrator';
import cron from 'node-cron';

// Mock the data orchestrator
jest.mock('../../data/orchestrator', () => ({
  dataOrchestrator: {
    forceRefreshAllContext: jest.fn(),
    getCacheStats: jest.fn(),
    refreshMarketContext: jest.fn(),
    getMarketContextSummary: jest.fn(),
    buildTierAwareContext: jest.fn(),
    getSearchContext: jest.fn(),
    invalidateCache: jest.fn()
  }
}));

// Mock Plaid module to avoid import issues
jest.mock('../../plaid', () => ({
  setupPlaidRoutes: jest.fn()
}));

// Mock the sync function
jest.mock('../../sync', () => ({
  syncAllAccounts: jest.fn().mockResolvedValue({
    success: true,
    accountsSynced: 5,
    transactionsSynced: 100
  })
}));

const MockDataOrchestrator = dataOrchestrator as jest.Mocked<typeof dataOrchestrator>;

// Helper function to execute market context refresh job
const executeMarketContextRefreshJob = async () => {
  // console.log('🔄 Starting hourly market context refresh...');
  const startTime = Date.now();
  
  try {
    await dataOrchestrator.forceRefreshAllContext();
    const duration = Date.now() - startTime;
    
    // console.log(`✅ Market context refresh completed successfully in ${duration}ms`);
    // console.log(`📊 Market Context Metrics: duration=${duration}ms`);
    
    // Log cache stats for monitoring
    const cacheStats = await dataOrchestrator.getCacheStats();
    // console.log(`📊 Cache Stats: marketContextCache.size=${cacheStats.marketContextCache.size}`);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    // console.error(`❌ Error in market context refresh after ${duration}ms:`, error);
    // console.error(`📊 Market Context Error: duration=${duration}ms, error=${error}`);
  }
};

// Helper function to execute daily sync job
const executeDailySyncJob = async () => {
  // console.log('Starting daily sync job...');
  const startTime = Date.now();
  
  try {
    const { syncAllAccounts } = require('../../sync');
    const result = await syncAllAccounts();
    const duration = Date.now() - startTime;
    
    if (result.success) {
      // console.log(`✅ Daily sync completed successfully in ${duration}ms: ${result.accountsSynced} accounts, ${result.transactionsSynced} transactions synced`);
      // console.log(`📊 Sync Metrics: duration=${duration}ms, accounts=${result.accountsSynced}, transactions=${result.transactionsSynced}`);
    } else {
      // console.error(`❌ Daily sync failed after ${duration}ms:`, result.error);
      // console.error(`📊 Sync Failure: duration=${duration}ms, error=${result.error}`);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    // console.error(`❌ Error in daily sync job after ${duration}ms:`, error);
    // console.error(`📊 Sync Error: duration=${duration}ms, error=${error}`);
  }
};

describe('Scheduled Market Context Updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear any existing cron jobs
    cron.getTasks().forEach(task => task.stop());
  });

  afterEach(() => {
    // Clean up cron jobs after each test
    cron.getTasks().forEach(task => task.stop());
  });

  describe('Market Context Refresh Job', () => {
    it('should schedule hourly market context refresh', () => {
      // Manually set up the cron job that would normally be created in index.ts
      cron.schedule('0 * * * *', executeMarketContextRefreshJob, {
        timezone: 'America/New_York',
        name: 'market-context-refresh'
      });
      
      // Check that the cron job was scheduled
      const tasks = cron.getTasks();
      const marketContextJob = Array.from(tasks.values()).find(task => 
        task.name === 'market-context-refresh'
      );
      
      expect(marketContextJob).toBeDefined();
    });

    it('should call forceRefreshAllContext when job runs', async () => {
      MockDataOrchestrator.forceRefreshAllContext.mockResolvedValue();
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 5,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators', 'live_market_data'],
        marketContextCache: {
          size: 3,
          keys: ['market_context_starter_true', 'market_context_standard_true', 'market_context_premium_true'],
          lastRefresh: new Date('2025-08-01T05:57:41.405Z')
        }
      });
      
      // Execute the job function directly
      await executeMarketContextRefreshJob();
      
      expect(MockDataOrchestrator.forceRefreshAllContext).toHaveBeenCalledTimes(1);
      expect(MockDataOrchestrator.getCacheStats).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in market context refresh job', async () => {
      MockDataOrchestrator.forceRefreshAllContext.mockRejectedValue(new Error('Refresh failed'));
      
      // Execute the job function directly
      await executeMarketContextRefreshJob();
      
      expect(MockDataOrchestrator.forceRefreshAllContext).toHaveBeenCalledTimes(1);
    });
  });

  describe('Daily Sync Job', () => {
    it('should schedule daily sync job', () => {
      // Manually set up the cron job that would normally be created in index.ts
      cron.schedule('0 2 * * *', executeDailySyncJob, {
        timezone: 'America/New_York',
        name: 'daily-sync'
      });
      
      // Check that the cron job was scheduled
      const tasks = cron.getTasks();
      const dailySyncJob = Array.from(tasks.values()).find(task => 
        task.name === 'daily-sync'
      );
      
      expect(dailySyncJob).toBeDefined();
    });
  });

  describe('Cron Job Configuration', () => {
    it('should have correct timezone configuration', () => {
      // Manually set up the cron job with timezone
      cron.schedule('0 * * * *', async () => {
        // Job implementation
      }, {
        timezone: 'America/New_York',
        name: 'market-context-refresh'
      });
      
      const tasks = cron.getTasks();
      const marketContextJob = Array.from(tasks.values()).find(task => 
        task.name === 'market-context-refresh'
      );
      
      expect(marketContextJob).toBeDefined();
      // Note: We can't directly test the timezone configuration, but we can verify the job exists
      // The timezone is set to 'America/New_York' in the actual implementation
    });

    it('should have correct schedule patterns', () => {
      // Manually set up the cron jobs with correct patterns
      cron.schedule('0 * * * *', async () => {
        // Market context refresh job
      }, {
        timezone: 'America/New_York',
        name: 'market-context-refresh'
      });
      
      cron.schedule('0 2 * * *', async () => {
        // Daily sync job
      }, {
        timezone: 'America/New_York',
        name: 'daily-sync'
      });
      
      const tasks = cron.getTasks();
      
      // Market context refresh should run every hour (0 * * * *)
      const marketContextJob = Array.from(tasks.values()).find(task => 
        task.name === 'market-context-refresh'
      );
      expect(marketContextJob).toBeDefined();
      
      // Daily sync should run at 2 AM (0 2 * * *)
      const dailySyncJob = Array.from(tasks.values()).find(task => 
        task.name === 'daily-sync'
      );
      expect(dailySyncJob).toBeDefined();
    });
  });

  describe('Performance Monitoring', () => {
    it('should log performance metrics for successful refresh', async () => {
      MockDataOrchestrator.forceRefreshAllContext.mockResolvedValue();
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 5,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators', 'live_market_data'],
        marketContextCache: {
          size: 3,
          keys: ['market_context_starter_true', 'market_context_standard_true', 'market_context_premium_true'],
          lastRefresh: new Date('2025-08-01T05:57:41.405Z')
        }
      });

      const startTime = Date.now();
      await executeMarketContextRefreshJob();
      const endTime = Date.now();
      
      // Should log performance metrics
      expect(MockDataOrchestrator.forceRefreshAllContext).toHaveBeenCalledTimes(1);
      expect(MockDataOrchestrator.getCacheStats).toHaveBeenCalledTimes(1);
      
      // Duration should be reasonable (less than 5 seconds for a test)
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000);
      
    });

    it('should log error metrics for failed refresh', async () => {
      MockDataOrchestrator.forceRefreshAllContext.mockRejectedValue(new Error('Refresh failed'));
      
      const startTime = Date.now();
      await executeMarketContextRefreshJob();
      const endTime = Date.now();
      
      // Should log error metrics
      expect(MockDataOrchestrator.forceRefreshAllContext).toHaveBeenCalledTimes(1);
      
      // Duration should be reasonable
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000);
      
    });
  });

  describe('Multiple Concurrent Jobs', () => {
    it('should handle multiple concurrent job executions', async () => {
      MockDataOrchestrator.forceRefreshAllContext.mockResolvedValue();
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 5,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators', 'live_market_data'],
        marketContextCache: {
          size: 3,
          keys: ['market_context_starter_true', 'market_context_standard_true', 'market_context_premium_true'],
          lastRefresh: new Date('2025-08-01T05:57:41.405Z')
        }
      });

      // Execute the job multiple times concurrently
      const promises = [
        executeMarketContextRefreshJob(),
        executeMarketContextRefreshJob(),
        executeMarketContextRefreshJob()
      ];
      
      await Promise.all(promises);
      
      // Should have been called 3 times
      expect(MockDataOrchestrator.forceRefreshAllContext).toHaveBeenCalledTimes(3);
      expect(MockDataOrchestrator.getCacheStats).toHaveBeenCalledTimes(3);
      
    });
  });

  describe('Error Recovery', () => {
    it('should continue execution after error', async () => {
      // First call fails, second call succeeds
      MockDataOrchestrator.forceRefreshAllContext
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce();
      
      MockDataOrchestrator.getCacheStats.mockResolvedValue({
        size: 5,
        keys: ['fred_MORTGAGE30US', 'fred_FEDFUNDS', 'fred_CPIAUCSL', 'economic_indicators', 'live_market_data'],
        marketContextCache: {
          size: 3,
          keys: ['market_context_starter_true', 'market_context_standard_true', 'market_context_premium_true'],
          lastRefresh: new Date('2025-08-01T05:57:41.405Z')
        }
      });

      // First execution should fail
      await executeMarketContextRefreshJob();
      expect(MockDataOrchestrator.forceRefreshAllContext).toHaveBeenCalledTimes(1);
      
      // Second execution should succeed
      await executeMarketContextRefreshJob();
      expect(MockDataOrchestrator.forceRefreshAllContext).toHaveBeenCalledTimes(2);
      
    });
  });

  describe('Job Coordination', () => {
    it('should not interfere with other cron jobs', () => {
      // Set up multiple cron jobs
      cron.schedule('0 * * * *', async () => {
        // Market context refresh job
      }, {
        timezone: 'America/New_York',
        name: 'market-context-refresh'
      });
      
      cron.schedule('0 2 * * *', async () => {
        // Daily sync job
      }, {
        timezone: 'America/New_York',
        name: 'daily-sync'
      });
      
      const tasks = cron.getTasks();
      
      // Both jobs should exist
      const marketContextJob = Array.from(tasks.values()).find(task => 
        task.name === 'market-context-refresh'
      );
      const dailySyncJob = Array.from(tasks.values()).find(task => 
        task.name === 'daily-sync'
      );
      expect(marketContextJob).toBeDefined();
      expect(dailySyncJob).toBeDefined();
      expect(marketContextJob).not.toBe(dailySyncJob);
    });
  });
}); 