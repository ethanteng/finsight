import { DataOrchestrator, MarketContextSummary } from '../../data/orchestrator';
import { UserTier } from '../../data/types';
import { FREDProvider } from '../../data/providers/fred';
import { AlphaVantageProvider } from '../../data/providers/alpha-vantage';

// Mock the providers
jest.mock('../../data/providers/fred');
jest.mock('../../data/providers/alpha-vantage');

const MockFREDProvider = FREDProvider as jest.MockedClass<typeof FREDProvider>;
const MockAlphaVantageProvider = AlphaVantageProvider as jest.MockedClass<typeof AlphaVantageProvider>;

describe('Enhanced Market Context System', () => {
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

  describe('Market Context Caching', () => {
    it('should cache market context for different tiers', async () => {
      // Mock economic indicators
      mockFredProvider.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      // Get context for starter tier
      const starterContext = await dataOrchestrator.getMarketContextSummary(UserTier.STARTER, true);
      expect(starterContext).toContain('CURRENT MARKET CONTEXT');
      expect(starterContext).toContain('Use this current market context');

      // Get context for standard tier
      const standardContext = await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      expect(standardContext).toContain('ECONOMIC INDICATORS');
      expect(standardContext).toContain('Fed Funds Rate: 5.25%');

      // Check cache stats
      const cacheStats = await dataOrchestrator.getCacheStats();
      expect(cacheStats.marketContextCache.size).toBe(2);
      expect(cacheStats.marketContextCache.keys).toContain('market_context_starter_true');
      expect(cacheStats.marketContextCache.keys).toContain('market_context_standard_true');
    });

    it('should use cached context when fresh', async () => {
      // Mock economic indicators
      mockFredProvider.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      // First call should fetch data
      await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      expect(mockFredProvider.getEconomicIndicators).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      expect(mockFredProvider.getEconomicIndicators).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should refresh context when cache is stale', async () => {
      // Mock economic indicators
      mockFredProvider.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      // First call
      await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      expect(mockFredProvider.getEconomicIndicators).toHaveBeenCalledTimes(1);

      // Manually invalidate cache to simulate stale data
      await dataOrchestrator.invalidateCache('market');

      // Second call should refresh
      await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      expect(mockFredProvider.getEconomicIndicators).toHaveBeenCalledTimes(2);
    });
  });

  describe('Tier-Specific Context', () => {
    it('should provide minimal context for starter tier', async () => {
      const context = await dataOrchestrator.getMarketContextSummary(UserTier.STARTER, true);
      
      expect(context).toContain('CURRENT MARKET CONTEXT');
      expect(context).not.toContain('ECONOMIC INDICATORS');
      expect(context).not.toContain('LIVE MARKET DATA');
      expect(context).toContain('Use this current market context');
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

  describe('Market Insights Generation', () => {
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

    it('should generate insights for high mortgage rates', async () => {
      mockFredProvider.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 7.2, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      const context = await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      
      expect(context).toContain('High mortgage rates suggest waiting');
      expect(context).toContain('refinancing opportunities');
    });

    it('should generate insights for high-yield CDs', async () => {
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
        treasuryYields: [],
        mortgageRates: []
      });

      const context = await dataOrchestrator.getMarketContextSummary(UserTier.PREMIUM, true);
      
      expect(context).toContain('High-yield CD rates available');
      expect(context).toContain('consider laddering CDs for steady income');
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

    it('should force refresh all contexts', async () => {
      mockFredProvider.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      mockAlphaVantageProvider.getLiveMarketData.mockResolvedValue({
        cdRates: [],
        treasuryYields: [],
        mortgageRates: []
      });

      await dataOrchestrator.forceRefreshAllContext();

      // Should have called getEconomicIndicators for each tier (4 calls: 2 tiers × 2 modes, since starter doesn't need economic data)
      expect(mockFredProvider.getEconomicIndicators).toHaveBeenCalledTimes(4);
      
      // Should have called getLiveMarketData for premium tier (2 calls: 2 modes)
      expect(mockAlphaVantageProvider.getLiveMarketData).toHaveBeenCalledTimes(2);
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

  describe('Context Formatting', () => {
    it('should format context with proper structure', async () => {
      mockFredProvider.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      const context = await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      
      // Check structure
      expect(context).toMatch(/CURRENT MARKET CONTEXT \(Updated: .+\):/);
      expect(context).toContain('ECONOMIC INDICATORS:');
      expect(context).toContain('KEY INSIGHTS:');
      expect(context).toContain('Use this current market context to provide informed financial advice');
    });

    it('should include timestamp in context', async () => {
      const context = await dataOrchestrator.getMarketContextSummary(UserTier.STARTER, true);
      
      // Should include a timestamp
      expect(context).toMatch(/Updated: \d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} [AP]M/);
    });
  });
}); 