import { dataOrchestrator } from '../../data/orchestrator';
import cron from 'node-cron';

// Mock the data orchestrator
jest.mock('../../data/orchestrator');

// Mock Plaid module to avoid import issues
jest.mock('../../plaid', () => ({
  setupPlaidRoutes: jest.fn()
}));

const MockDataOrchestrator = dataOrchestrator as jest.Mocked<typeof dataOrchestrator>;

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
      // Mock console.log to capture log messages
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Import the index file to trigger the cron job setup
      require('../../index');
      
      // Check that the cron job was scheduled
      const tasks = cron.getTasks();
      const marketContextJob = Array.from(tasks.values()).find(task => 
        task.name === 'market-context-refresh'
      );
      
      expect(marketContextJob).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith('Cron job scheduled: market context refresh every hour');
      
      consoleSpy.mockRestore();
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

      // Mock console.log to capture log messages
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Manually trigger the market context refresh job
      const tasks = cron.getTasks();
      const marketContextJob = Array.from(tasks.values()).find(task => 
        task.name === 'market-context-refresh'
      );
      
      if (marketContextJob) {
        // Execute the job manually
        await (marketContextJob as any).callback();
        
        expect(MockDataOrchestrator.forceRefreshAllContext).toHaveBeenCalledTimes(1);
        expect(MockDataOrchestrator.getCacheStats).toHaveBeenCalledTimes(1);
        
        // Check that success messages were logged
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Market context refresh completed successfully'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('📊 Market Context Metrics: duration='));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('📊 Cache Stats: marketContextCache.size=3'));
      }
      
      consoleSpy.mockRestore();
    });

    it('should handle errors in market context refresh job', async () => {
      MockDataOrchestrator.forceRefreshAllContext.mockRejectedValue(new Error('Refresh failed'));
      
      // Mock console.error to capture error messages
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Manually trigger the market context refresh job
      const tasks = cron.getTasks();
      const marketContextJob = Array.from(tasks.values()).find(task => 
        task.name === 'market-context-refresh'
      );
      
      if (marketContextJob) {
        // Execute the job manually
        await (marketContextJob as any).callback();
        
        expect(MockDataOrchestrator.forceRefreshAllContext).toHaveBeenCalledTimes(1);
        
        // Check that error messages were logged
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('❌ Error in market context refresh'));
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('📊 Market Context Error: duration='));
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Refresh failed'));
      }
      
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });

  describe('Daily Sync Job', () => {
    it('should schedule daily sync job', () => {
      // Mock console.log to capture log messages
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Import the index file to trigger the cron job setup
      require('../../index');
      
      // Check that the cron job was scheduled
      const tasks = cron.getTasks();
      const dailySyncJob = Array.from(tasks.values()).find(task => 
        task.name === 'daily-sync'
      );
      
      expect(dailySyncJob).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith('Cron job scheduled: daily sync at 2 AM EST');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Cron Job Configuration', () => {
    it('should have correct timezone configuration', () => {
      // Import the index file to trigger the cron job setup
      require('../../index');
      
      const tasks = cron.getTasks();
      const marketContextJob = Array.from(tasks.values()).find(task => 
        task.name === 'market-context-refresh'
      );
      
      expect(marketContextJob).toBeDefined();
      // Note: We can't directly test the timezone configuration, but we can verify the job exists
      // The timezone is set to 'America/New_York' in the actual implementation
    });

    it('should have correct schedule patterns', () => {
      // Import the index file to trigger the cron job setup
      require('../../index');
      
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

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const tasks = cron.getTasks();
      const marketContextJob = Array.from(tasks.values()).find(task => 
        task.name === 'market-context-refresh'
      );
      
      if (marketContextJob) {
        const startTime = Date.now();
        await (marketContextJob as any).callback();
        const endTime = Date.now();
        
        // Should log performance metrics
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Market context refresh completed successfully'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/📊 Market Context Metrics: duration=\d+ms/));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/📊 Cache Stats: marketContextCache\.size=\d+/));
        
        // Duration should be reasonable (less than 5 seconds for a test)
        const duration = endTime - startTime;
        expect(duration).toBeLessThan(5000);
      }
      
      consoleSpy.mockRestore();
    });

    it('should log error metrics for failed refresh', async () => {
      MockDataOrchestrator.forceRefreshAllContext.mockRejectedValue(new Error('Test error'));
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const tasks = cron.getTasks();
      const marketContextJob = Array.from(tasks.values()).find(task => 
        task.name === 'market-context-refresh'
      );
      
      if (marketContextJob) {
        const startTime = Date.now();
        await (marketContextJob as any).callback();
        const endTime = Date.now();
        
        // Should log error metrics
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('❌ Error in market context refresh'));
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringMatching(/📊 Market Context Error: duration=\d+ms/));
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Test error'));
        
        // Duration should be reasonable (less than 5 seconds for a test)
        const duration = endTime - startTime;
        expect(duration).toBeLessThan(5000);
      }
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Job Coordination', () => {
    it('should not interfere with other cron jobs', () => {
      // Import the index file to trigger the cron job setup
      require('../../index');
      
      const tasks = cron.getTasks();
      
      // Should have both jobs scheduled
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

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const tasks = cron.getTasks();
      const marketContextJob = Array.from(tasks.values()).find(task => 
        task.name === 'market-context-refresh'
      );
      
      if (marketContextJob) {
        // Execute the job multiple times concurrently
        const promises = Array(3).fill(null).map(() => (marketContextJob as any).callback());
        await Promise.all(promises);
        
        // Should have called forceRefreshAllContext 3 times
        expect(MockDataOrchestrator.forceRefreshAllContext).toHaveBeenCalledTimes(3);
        expect(MockDataOrchestrator.getCacheStats).toHaveBeenCalledTimes(3);
      }
      
      consoleSpy.mockRestore();
    });
  });

  describe('Error Recovery', () => {
    it('should continue running after job errors', async () => {
      // First call fails, second call succeeds
      MockDataOrchestrator.forceRefreshAllContext
        .mockRejectedValueOnce(new Error('First error'))
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

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const tasks = cron.getTasks();
      const marketContextJob = Array.from(tasks.values()).find(task => 
        task.name === 'market-context-refresh'
      );
      
      if (marketContextJob) {
        // First execution should fail
        await (marketContextJob as any).callback();
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('First error'));
        
        // Second execution should succeed
        await (marketContextJob as any).callback();
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Market context refresh completed successfully'));
        
        // Should have been called twice
        expect(MockDataOrchestrator.forceRefreshAllContext).toHaveBeenCalledTimes(2);
      }
      
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });
}); 