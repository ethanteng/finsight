import { DataOrchestrator, MarketContextSummary } from '../../data/orchestrator';
import { UserTier } from '../../data/types';
import { FREDProvider } from '../../data/providers/fred';
import { AlphaVantageProvider } from '../../data/providers/alpha-vantage';
import { SearchProvider } from '../../data/providers/search';

// Mock the providers
jest.mock('../../data/providers/fred');
jest.mock('../../data/providers/alpha-vantage');
jest.mock('../../data/providers/search');

const MockFREDProvider = FREDProvider as jest.MockedClass<typeof FREDProvider>;
const MockAlphaVantageProvider = AlphaVantageProvider as jest.MockedClass<typeof AlphaVantageProvider>;
const MockSearchProvider = SearchProvider as jest.MockedClass<typeof SearchProvider>;

describe('Enhanced Market Context System', () => {
  let dataOrchestrator: DataOrchestrator;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Create mock instances
    const mockFredInstance = {
      getEconomicIndicators: jest.fn(),
      getLiveMarketData: jest.fn(),
      getDataPoint: jest.fn()
    };

    const mockAlphaVantageInstance = {
      getEconomicIndicators: jest.fn(),
      getLiveMarketData: jest.fn(),
      getDataPoint: jest.fn()
    };

    const mockSearchInstance = {
      search: jest.fn(),
      enhanceFinancialQuery: jest.fn(),
      filterFinancialResults: jest.fn()
    };
    
    // Mock the constructor calls to return our mock instances
    MockFREDProvider.mockImplementation(() => mockFredInstance as any);
    MockAlphaVantageProvider.mockImplementation(() => mockAlphaVantageInstance as any);
    MockSearchProvider.mockImplementation(() => mockSearchInstance as any);
    
    // Create the orchestrator
    dataOrchestrator = new DataOrchestrator();
  });

  describe('Search Context Integration', () => {
    test('should get search context for Standard tier', async () => {
      const mockSearchResults = [
        {
          title: 'Current Mortgage Rates 2024',
          snippet: 'Average 30-year fixed mortgage rate is 6.85%',
          url: 'https://bankrate.com/mortgage-rates',
          source: 'Bing',
          relevance: 0.9
        },
        {
          title: 'Best CD Rates This Week',
          snippet: 'Top CD rates reaching 5.5% APY for 12-month terms',
          url: 'https://nerdwallet.com/cd-rates',
          source: 'Bing',
          relevance: 0.8
        }
      ];

      MockSearchProvider.mock.results[0].value.search.mockResolvedValue(mockSearchResults);

      const searchContext = await dataOrchestrator.getSearchContext(
        'What are current mortgage rates?',
        UserTier.STANDARD,
        false
      );

      expect(searchContext).toBeDefined();
      expect(searchContext?.query).toBe('What are current mortgage rates?');
      expect(searchContext?.results).toHaveLength(2);
      expect(searchContext?.summary).toContain('Current Mortgage Rates 2024');
      expect(searchContext?.summary).toContain('6.85%');
    });

    test('should not get search context for Starter tier', async () => {
      const searchContext = await dataOrchestrator.getSearchContext(
        'What are current mortgage rates?',
        UserTier.STARTER,
        false
      );

      expect(searchContext).toBeNull();
    });

    test('should cache search results', async () => {
      const mockSearchResults = [
        {
          title: 'Investment Advice 2024',
          snippet: 'Best investment strategies for current market',
          url: 'https://investopedia.com/investment-advice',
          source: 'Bing',
          relevance: 0.9
        }
      ];

      MockSearchProvider.mock.results[0].value.search.mockResolvedValue(mockSearchResults);

      // First call
      const firstResult = await dataOrchestrator.getSearchContext(
        'investment advice',
        UserTier.PREMIUM,
        false
      );

      // Second call with same query
      const secondResult = await dataOrchestrator.getSearchContext(
        'investment advice',
        UserTier.PREMIUM,
        false
      );

      expect(firstResult).toBeDefined();
      expect(secondResult).toBeDefined();
      expect(firstResult?.results).toEqual(secondResult?.results);
      
      // Should only call search once due to caching
      expect(MockSearchProvider.mock.results[0].value.search).toHaveBeenCalledTimes(1);
    });

    test('should handle search errors gracefully', async () => {
      MockSearchProvider.mock.results[0].value.search.mockRejectedValue(new Error('Search API error'));

      const searchContext = await dataOrchestrator.getSearchContext(
        'What are current mortgage rates?',
        UserTier.STANDARD,
        false
      );

      expect(searchContext).toBeNull();
    });

    test('should generate appropriate search summary', async () => {
      const mockSearchResults = [
        {
          title: 'CD Rates Comparison',
          snippet: 'Compare CD rates from top banks',
          url: 'https://bankrate.com/cd-rates',
          source: 'Bing',
          relevance: 0.9
        },
        {
          title: 'High-Yield Savings Accounts',
          snippet: 'Best savings account rates for 2024',
          url: 'https://nerdwallet.com/savings-rates',
          source: 'Bing',
          relevance: 0.8
        }
      ];

      MockSearchProvider.mock.results[0].value.search.mockResolvedValue(mockSearchResults);

      const searchContext = await dataOrchestrator.getSearchContext(
        'savings rates',
        UserTier.STANDARD,
        false
      );

      expect(searchContext?.summary).toContain('Latest real-time information for "savings rates"');
      expect(searchContext?.summary).toContain('CD Rates Comparison');
      expect(searchContext?.summary).toContain('High-Yield Savings Accounts');
    });

    test('should handle empty search results', async () => {
      MockSearchProvider.mock.results[0].value.search.mockResolvedValue([]);

      const searchContext = await dataOrchestrator.getSearchContext(
        'nonexistent query',
        UserTier.STANDARD,
        false
      );

      expect(searchContext).toBeDefined();
      expect(searchContext?.results).toHaveLength(0);
      expect(searchContext?.summary).toContain('No recent information found');
    });
  });

  describe('Tier Access with Search Context', () => {
    test('should include search context in tier access', () => {
      const starterAccess = dataOrchestrator.getTierAccess(UserTier.STARTER);
      const standardAccess = dataOrchestrator.getTierAccess(UserTier.STANDARD);
      const premiumAccess = dataOrchestrator.getTierAccess(UserTier.PREMIUM);

      expect(starterAccess.hasSearchContext).toBe(false);
      expect(standardAccess.hasSearchContext).toBe(true);
      expect(premiumAccess.hasSearchContext).toBe(true);
    });
  });

  describe('Search Provider Integration', () => {
    test('should use correct search provider configuration', () => {
      expect(MockSearchProvider).toHaveBeenCalledWith('test_search_key', 'brave');
    });

    test('should handle different search providers', () => {
      // Test with different provider
      const searchProvider = new SearchProvider('test_key', 'google');
      expect(searchProvider).toBeDefined();
    });
  });

  describe('Market Context Caching', () => {
    it('should cache market context for different tiers', async () => {
      // Mock economic indicators
      MockFREDProvider.mock.results[0].value.getEconomicIndicators.mockResolvedValue({
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
      MockFREDProvider.mock.results[0].value.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      // First call should fetch data
      await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      expect(MockFREDProvider.mock.results[0].value.getEconomicIndicators).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      expect(MockFREDProvider.mock.results[0].value.getEconomicIndicators).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should refresh context when cache is stale', async () => {
      // Mock economic indicators
      MockFREDProvider.mock.results[0].value.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      // First call
      await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      expect(MockFREDProvider.mock.results[0].value.getEconomicIndicators).toHaveBeenCalledTimes(1);

      // Manually invalidate cache to simulate stale data
      await dataOrchestrator.invalidateCache('market');

      // Second call should refresh
      await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      expect(MockFREDProvider.mock.results[0].value.getEconomicIndicators).toHaveBeenCalledTimes(2);
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
      MockFREDProvider.mock.results[0].value.getEconomicIndicators.mockResolvedValue({
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
      MockFREDProvider.mock.results[0].value.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      MockAlphaVantageProvider.mock.results[0].value.getLiveMarketData.mockResolvedValue({
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
      MockFREDProvider.mock.results[0].value.getEconomicIndicators.mockResolvedValue({
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
      MockFREDProvider.mock.results[0].value.getEconomicIndicators.mockResolvedValue({
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
      MockFREDProvider.mock.results[0].value.getEconomicIndicators.mockResolvedValue({
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
      MockFREDProvider.mock.results[0].value.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      MockAlphaVantageProvider.mock.results[0].value.getLiveMarketData.mockResolvedValue({
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
      MockFREDProvider.mock.results[0].value.getEconomicIndicators.mockResolvedValue({
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
      MockFREDProvider.mock.results[0].value.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      MockAlphaVantageProvider.mock.results[0].value.getLiveMarketData.mockResolvedValue({
        cdRates: [],
        treasuryYields: [],
        mortgageRates: []
      });

      await dataOrchestrator.forceRefreshAllContext();

      // Should have called getEconomicIndicators for each tier (4 calls: 2 tiers × 2 modes, since starter doesn't need economic data)
      expect(MockFREDProvider.mock.results[0].value.getEconomicIndicators).toHaveBeenCalledTimes(4);
      
      // Should have called getLiveMarketData for premium tier (2 calls: 2 modes)
      expect(MockAlphaVantageProvider.mock.results[0].value.getLiveMarketData).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle FRED API errors gracefully', async () => {
      MockFREDProvider.mock.results[0].value.getEconomicIndicators.mockRejectedValue(new Error('FRED API error'));

      const context = await dataOrchestrator.getMarketContextSummary(UserTier.STANDARD, true);
      
      // Should still return a context, just without economic indicators
      expect(context).toContain('CURRENT MARKET CONTEXT');
      expect(context).not.toContain('ECONOMIC INDICATORS');
    });

    it('should handle Alpha Vantage API errors gracefully', async () => {
      MockFREDProvider.mock.results[0].value.getEconomicIndicators.mockResolvedValue({
        cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
        creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
      });

      MockAlphaVantageProvider.mock.results[0].value.getLiveMarketData.mockRejectedValue(new Error('Alpha Vantage API error'));

      const context = await dataOrchestrator.getMarketContextSummary(UserTier.PREMIUM, true);
      
      // Should still return context with economic indicators, but no live market data
      expect(context).toContain('ECONOMIC INDICATORS');
      expect(context).not.toContain('LIVE MARKET DATA');
    });
  });

  describe('Context Formatting', () => {
    it('should format context with proper structure', async () => {
      MockFREDProvider.mock.results[0].value.getEconomicIndicators.mockResolvedValue({
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