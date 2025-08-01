import { DataOrchestrator } from '../../data/orchestrator';
import { UserTier } from '../../data/types';
import { FREDProvider } from '../../data/providers/fred';
import { AlphaVantageProvider } from '../../data/providers/alpha-vantage';

// Mock the providers
jest.mock('../../data/providers/fred');
jest.mock('../../data/providers/alpha-vantage');

const MockFREDProvider = FREDProvider as jest.MockedClass<typeof FREDProvider>;
const MockAlphaVantageProvider = AlphaVantageProvider as jest.MockedClass<typeof AlphaVantageProvider>;

describe('Enhanced Market Context System - Core Functionality', () => {
  let dataOrchestrator: DataOrchestrator;
  let mockFredProvider: jest.Mocked<FREDProvider>;
  let mockAlphaVantageProvider: jest.Mocked<AlphaVantageProvider>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup mock providers
    mockFredProvider = {
      getEconomicIndicators: jest.fn(),
    } as any;
    
    mockAlphaVantageProvider = {
      getLiveMarketData: jest.fn(),
    } as any;
    
    MockFREDProvider.mockImplementation(() => mockFredProvider);
    MockAlphaVantageProvider.mockImplementation(() => mockAlphaVantageProvider);
    
    // Create orchestrator instance
    dataOrchestrator = new DataOrchestrator();
  });

  describe('Core Market Context Features', () => {
    it('should provide basic context for starter tier', async () => {
      const context = await dataOrchestrator.getMarketContextSummary(UserTier.STARTER, true);
      
      expect(context).toContain('CURRENT MARKET CONTEXT');
      expect(context).toContain('Use this current market context');
      expect(context).not.toContain('ECONOMIC INDICATORS');
      expect(context).not.toContain('LIVE MARKET DATA');
    });

    it('should provide economic indicators for standard tier', async () => {
      mockFredProvider.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      const context = await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      
      expect(context).toContain('ECONOMIC INDICATORS');
      expect(context).toContain('Fed Funds Rate: 5.25%');
      expect(context).toContain('CPI (YoY): 3.1%');
      expect(context).not.toContain('LIVE MARKET DATA');
    });

    it('should provide full market data for premium tier', async () => {
      mockFredProvider.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      mockAlphaVantageProvider.getLiveMarketData.mockResolvedValue({
        cdRates: [
          { term: '3-month', rate: 5.25, institution: 'Test Bank', lastUpdated: '2025-08-01T05:57:37.801Z' },
          { term: '6-month', rate: 5.35, institution: 'Test Bank', lastUpdated: '2025-08-01T05:57:37.801Z' }
        ],
        treasuryYields: [
          { term: '1-month', yield: 5.12, lastUpdated: '2025-08-01T05:57:37.801Z' },
          { term: '3-month', yield: 5.18, lastUpdated: '2025-08-01T05:57:37.801Z' }
        ],
        mortgageRates: [
          { type: '30-year-fixed', rate: 6.85, lastUpdated: '2025-08-01T05:57:37.801Z' },
          { type: '15-year-fixed', rate: 6.25, lastUpdated: '2025-08-01T05:57:37.801Z' }
        ]
      });

      const context = await dataOrchestrator.getMarketContextSummary(UserTier.PREMIUM, true);
      
      expect(context).toContain('ECONOMIC INDICATORS');
      expect(context).toContain('LIVE MARKET DATA');
      expect(context).toContain('CD Rates: 3-month: 5.25%, 6-month: 5.35%');
      expect(context).toContain('Treasury Yields: 1-month: 5.12%, 3-month: 5.18%');
      expect(context).toContain('Mortgage Rates: 30-year-fixed: 6.85%, 15-year-fixed: 6.25%');
    });
  });

  describe('Caching and Performance', () => {
    it('should cache market context and reuse it', async () => {
      mockFredProvider.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      // Clear any existing cache first
      await dataOrchestrator.invalidateCache('market');

      // First call should fetch data
      await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      expect(mockFredProvider.getEconomicIndicators).toHaveBeenCalledTimes(1);

      // Second call should use cache (same instance)
      await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      expect(mockFredProvider.getEconomicIndicators).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should provide cache statistics', async () => {
      const cacheStats = await dataOrchestrator.getCacheStats();
      
      expect(cacheStats).toHaveProperty('size');
      expect(cacheStats).toHaveProperty('keys');
      expect(cacheStats).toHaveProperty('marketContextCache');
      expect(cacheStats.marketContextCache).toHaveProperty('size');
      expect(cacheStats.marketContextCache).toHaveProperty('keys');
      expect(cacheStats.marketContextCache).toHaveProperty('lastRefresh');
    });
  });

  describe('Error Handling', () => {
    it('should handle FRED API errors gracefully', async () => {
      mockFredProvider.getEconomicIndicators.mockRejectedValue(new Error('FRED API error'));

      const context = await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      
      // Should still return a context, just without economic indicators
      expect(context).toContain('CURRENT MARKET CONTEXT');
      expect(context).not.toContain('ECONOMIC INDICATORS');
    });

    it('should handle Alpha Vantage API errors gracefully', async () => {
      mockFredProvider.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      mockAlphaVantageProvider.getLiveMarketData.mockRejectedValue(new Error('Alpha Vantage API error'));

      const context = await dataOrchestrator.getMarketContextSummary(UserTier.PREMIUM, true);
      
      // Should still return context with economic indicators, but no live market data
      expect(context).toContain('ECONOMIC INDICATORS');
      expect(context).not.toContain('LIVE MARKET DATA');
    });
  });

  describe('Market Insights', () => {
    it('should generate insights for high interest rates', async () => {
      mockFredProvider.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.5, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      const context = await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      
      expect(context).toContain('High interest rates favor savers');
      expect(context).toContain('consider high-yield savings accounts and CDs');
    });

    it('should generate insights for high inflation', async () => {
      mockFredProvider.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.5, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      const context = await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      
      expect(context).toContain('Elevated inflation suggests TIPS');
      expect(context).toContain('inflation-protected investments may be beneficial');
    });
  });

  describe('Cache Management', () => {
    it('should clear market context cache when invalidating', async () => {
      // First, populate cache
      mockFredProvider.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      
      // Check cache is populated
      let cacheStats = await dataOrchestrator.getCacheStats();
      expect(cacheStats.marketContextCache.size).toBeGreaterThan(0);

      // Invalidate cache
      await dataOrchestrator.invalidateCache('market');

      // Check cache is cleared
      cacheStats = await dataOrchestrator.getCacheStats();
      expect(cacheStats.marketContextCache.size).toBe(0);
    });
  });
}); 