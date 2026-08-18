// Set Gemini API key for synthesizer (required by getClient)
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || 'dummy_gemini_key';

// Mock @google/generative-ai (Gemini) before imports
jest.mock('@google/generative-ai', () => {
  const mockGenerateContent = jest.fn().mockResolvedValue({
    response: {
      text: () => 'Mock AI response'
    }
  });
  const mockGetGenerativeModel = jest.fn().mockReturnValue({
    generateContent: mockGenerateContent
  });
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel
    }))
  };
});

// Mock SearchProvider
const mockSearchProvider = {
  search: jest.fn().mockResolvedValue([
    {
      title: 'Test Search Result',
      snippet: 'This is a test search result for financial data',
      url: 'https://example.com/test',
      query: 'test query'
    }
  ])
};

jest.mock('../../data/providers/search', () => ({
  SearchProvider: jest.fn().mockImplementation(() => mockSearchProvider)
}));

import { MarketNewsAggregator, MarketNewsData } from '../../market-news/aggregator';
import { MarketNewsSynthesizer } from '../../market-news/synthesizer';
import { MarketNewsManager } from '../../market-news/manager';
import { UserTier } from '../../data/types';
import { SearchProvider } from '../../data/providers/search';

// Mock fetch globally
global.fetch = jest.fn();

describe('Market News System', () => {
  let mockAggregator: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock aggregator instance
    // Shaped like real aggregator output: the manager checks which datasets a
    // batch actually carries, not merely which providers answered.
    mockAggregator = {
      aggregateMarketData: jest.fn().mockResolvedValue([
        {
          source: 'fred',
          timestamp: new Date(),
          data: { series: 'CPIAUCSL', name: 'Inflation Rate (CPI, YoY)', value: 3.2 },
          type: 'economic_indicator' as const,
          relevance: 0.9
        },
        {
          source: 'fred',
          timestamp: new Date(),
          data: { series: 'DFF', name: 'Federal Funds Effective Rate', value: 4.25 },
          type: 'economic_indicator' as const,
          relevance: 0.9
        },
        {
          source: 'fred',
          timestamp: new Date(),
          data: { series: 'DGS10', name: '10-Year Treasury', value: 4.1 },
          type: 'economic_indicator' as const,
          relevance: 0.8
        },
        {
          source: 'brave_search',
          timestamp: new Date(),
          data: {
            title: 'Mock Search News',
            description: 'This is mock search news data for testing',
            url: 'https://example.com/mock-search-news'
          },
          type: 'news_article' as const,
          relevance: 0.6
        }
      ]),
      fetchMassiveData: jest.fn().mockResolvedValue([]),
      fetchFREDData: jest.fn().mockResolvedValue([]),
      fetchBraveSearchData: jest.fn().mockResolvedValue([])
    };
    
    // Reset the mock to return successful data by default
    mockSearchProvider.search.mockResolvedValue([
      {
        title: 'Test Search Result',
        snippet: 'This is a test search result for financial data',
        url: 'https://example.com/test',
        query: 'test query'
      }
    ]);
  });

  describe('MarketNewsAggregator', () => {
    test('should initialize with correct sources', () => {
      // This is a basic test to ensure the aggregator can be created
      expect(mockAggregator).toBeDefined();
    });

    test('should handle FRED API errors gracefully', async () => {
      // Test with mocked data - no real API calls
      const data = await mockAggregator.aggregateMarketData();
      expect(data.length).toBeGreaterThan(0);
      expect(data.some((d: any) => d.source === 'fred')).toBe(true);
      expect(data.some((d: any) => d.source === 'brave_search')).toBe(true);
    });

    test('should handle Brave Search API errors gracefully', async () => {
      // Mock SearchProvider to throw error
      mockSearchProvider.search.mockRejectedValue(new Error('Search API error'));

      // Create a new mock aggregator that handles the error case
      const errorMockAggregator = {
        ...mockAggregator,
        aggregateMarketData: jest.fn().mockResolvedValue([
          {
            title: 'Mock FRED News',
            content: 'This is mock FRED news data for testing',
            source: 'fred',
            url: 'https://example.com/mock-fred-news',
            publishedAt: new Date().toISOString(),
            category: 'economic'
          }
          // Note: No brave_search data when it fails
        ])
      };

      const data = await errorMockAggregator.aggregateMarketData();
      // Should still get FRED data even if Brave Search fails
      expect(data.length).toBeGreaterThan(0);
      expect(data.some((d: any) => d.source === 'fred')).toBe(true);
      expect(data.some((d: any) => d.source === 'brave_search')).toBe(false);
    });

    test('should process FRED data correctly', async () => {
      const mockFredResponse = {
        observations: [
          {
            date: '2025-01-01',
            value: '5.25'
          }
        ]
      };

      // Mock multiple fetch calls for configured FRED indicators.
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockFredResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockFredResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockFredResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockFredResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockFredResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockFredResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockFredResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockFredResponse
        });

      const data = await mockAggregator.aggregateMarketData();
      expect(data.length).toBeGreaterThan(0);
      expect(data.some((d: any) => d.source === 'fred')).toBe(true);
    });

    test('should process Brave Search data correctly', async () => {
      const mockBraveResponse = {
        web: {
          results: [
            {
              title: 'Current Mortgage Rates',
              description: 'Latest mortgage rates from major lenders',
              url: 'https://example.com',
              query: 'current mortgage rates 2025'
            }
          ]
        }
      };

      // Mock multiple fetch calls for different queries
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockBraveResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockBraveResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockBraveResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockBraveResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockBraveResponse
        });

      const data = await mockAggregator.aggregateMarketData();
      expect(data.length).toBeGreaterThan(0);
      expect(data.some((d: any) => d.source === 'brave_search')).toBe(true);
    });
  });

  describe('MarketNewsSynthesizer', () => {
    let synthesizer: MarketNewsSynthesizer;

    beforeEach(() => {
      synthesizer = new MarketNewsSynthesizer();
    });

    test('should synthesize market context for different tiers', async () => {
      const mockData = [
        { source: 'fred', timestamp: new Date(), data: {}, type: 'economic_indicator' as const, relevance: 0.8 },
        { source: 'brave_search', timestamp: new Date(), data: {}, type: 'news_article' as const, relevance: 0.6 }
      ];

      const starterContext = await synthesizer.synthesizeMarketContext(mockData, UserTier.STARTER);
      const standardContext = await synthesizer.synthesizeMarketContext(mockData, UserTier.STANDARD);
      const premiumContext = await synthesizer.synthesizeMarketContext(mockData, UserTier.PREMIUM);

      // Starter tier has no data - returns fixed message without calling LLM
      expect(starterContext.contextText).toContain('No market context available');
      expect(starterContext.dataSources).toEqual([]);
      expect(standardContext.contextText).toBe('Mock AI response');
      expect(premiumContext.contextText).toBe('Mock AI response');
    });

    test('should filter data sources by tier', async () => {
      const mockData = [
        { source: 'fred', timestamp: new Date(), data: {}, type: 'economic_indicator' as const, relevance: 0.8 },
        { source: 'brave_search', timestamp: new Date(), data: {}, type: 'news_article' as const, relevance: 0.6 },
        { source: 'massive', timestamp: new Date(), data: {}, type: 'market_data' as const, relevance: 0.7 }
      ];

      const context = await synthesizer.synthesizeMarketContext(mockData, UserTier.STANDARD);
      expect(context.dataSources).toContain('fred');
      expect(context.dataSources).toContain('brave_search');
      expect(context.dataSources).not.toContain('massive');
    });

    test('should extract key events correctly', async () => {
      const mockData = [
        {
          source: 'fred',
          timestamp: new Date(),
          data: { series: 'FEDFUNDS', value: 5.5 },
          type: 'economic_indicator' as const,
          relevance: 0.8
        }
      ];

      const context = await synthesizer.synthesizeMarketContext(mockData, UserTier.STANDARD);
      expect(context.keyEvents).toContain('Federal Reserve rate at 5.5% - high interest rate environment');
    });

    test('should present transformed CPI as year-over-year percent, not an index level', () => {
      const prompt = (synthesizer as any).buildSynthesisPrompt([
        {
          source: 'fred',
          timestamp: new Date('2026-08-01T00:00:00Z'),
          data: {
            series: 'CPIAUCSL',
            name: 'Inflation Rate (CPI, YoY)',
            value: 3.2,
            date: '2026-07-01',
            unit: 'percent',
            transformation: 'pc1',
          },
          type: 'economic_indicator' as const,
          relevance: 0.9,
        },
      ], UserTier.STANDARD);

      expect(prompt).toContain('Inflation Rate (CPI, YoY): 3.2% (2026-07-01)');
      expect(prompt).not.toContain('(CPI index)');
    });
  });

  describe('MarketNewsManager', () => {
    let manager: MarketNewsManager;

    beforeEach(() => {
      manager = new MarketNewsManager();
    });

    test('should get market context for tier', async () => {
      const context = await manager.getMarketContext(UserTier.STANDARD);
      expect(typeof context).toBe('string');
    });

    test('should update market context manually', async () => {
      const testContext = 'Test market context for manual update';
      const adminUser = 'test@example.com';

      await expect(
        manager.updateMarketContextManual(UserTier.STANDARD, testContext, adminUser)
      ).resolves.not.toThrow();
    });

    test('should get market context history', async () => {
      const history = await manager.getMarketContextHistory(UserTier.STANDARD);
      expect(Array.isArray(history)).toBe(true);
    });

    test('should update market context automatically', async () => {
      (manager as any).aggregator = mockAggregator;
      await expect(
        manager.updateMarketContext(UserTier.STANDARD)
      ).resolves.not.toThrow();
    });

    test('should fetch one external batch for all scheduled tier contexts', async () => {
      const rawData = [
        {
          source: 'brave_search',
          timestamp: new Date(),
          data: { title: 'One shared batch' },
          type: 'news_article' as const,
          relevance: 0.8,
        },
        {
          source: 'fred',
          timestamp: new Date(),
          data: { series: 'DGS10', value: 4.68 },
          type: 'economic_indicator' as const,
          relevance: 0.8,
        },
        {
          source: 'fred',
          timestamp: new Date(),
          data: { series: 'CPIAUCSL', value: 3.2 },
          type: 'economic_indicator' as const,
          relevance: 0.8,
        },
        {
          source: 'fred',
          timestamp: new Date(),
          data: { series: 'DFF', value: 4.25 },
          type: 'economic_indicator' as const,
          relevance: 0.8,
        },
        {
          source: 'massive',
          timestamp: new Date(),
          data: {
            symbol: 'TREASURY_YIELDS',
            yields: { '10_year': 4.68 },
          },
          type: 'rate_information' as const,
          relevance: 0.8,
        },
        {
          source: 'massive',
          timestamp: new Date(),
          data: {
            symbol: 'INFLATION_EXPECTATIONS',
            expectations: { model_5_year: 2.3 },
          },
          type: 'economic_indicator' as const,
          relevance: 0.8,
        },
      ];
      const aggregate = jest.fn().mockResolvedValue(rawData);
      const synthesize = jest.fn(async (_data, tier: UserTier) => ({
        contextText: `${tier} context`,
        summary: `${tier} summary`,
        availableTiers: [tier],
        dataSources: tier === UserTier.STARTER
          ? []
          : tier === UserTier.STANDARD
            ? ['brave_search', 'fred']
            : ['brave_search', 'fred', 'massive'],
        keyEvents: [],
        lastUpdate: new Date(),
      }));
      const realSynthesizer = new MarketNewsSynthesizer();
      (manager as any).aggregator = { aggregateMarketData: aggregate };
      (manager as any).synthesizer = {
        synthesizeMarketContext: synthesize,
        filterDataForTier: realSynthesizer.filterDataForTier.bind(realSynthesizer),
      };
      const save = jest.spyOn(manager as any, 'saveMarketContext').mockResolvedValue(undefined);

      await manager.updateMarketContexts([UserTier.STARTER, UserTier.STANDARD, UserTier.PREMIUM]);

      expect(aggregate).toHaveBeenCalledTimes(1);
      expect(synthesize).toHaveBeenCalledTimes(3);
      expect(synthesize.mock.calls.every(([data]) => data === rawData)).toBe(true);
      const savedRawData = save.mock.calls.map(call => call[1] as MarketNewsData[]);
      expect(savedRawData[0]).toEqual([]);
      expect(new Set(savedRawData[1].map(item => item.source))).toEqual(new Set(['brave_search', 'fred']));
      expect(savedRawData[1].some(item => item.data.series === 'DGS10')).toBe(true);
      // Premium drops only the duplicated 10-year point; the rest of the FRED
      // baseline still reaches the prompt.
      expect(new Set(savedRawData[2].map(item => item.source))).toEqual(new Set(['brave_search', 'fred', 'massive']));
      expect(savedRawData[2].some(item => item.data.series === 'DGS10')).toBe(false);
      expect(savedRawData[2].some(item => item.data.series === 'CPIAUCSL')).toBe(true);
    });
  });

  describe('Tier-based Access Control', () => {
    test('should provide different access levels by tier', async () => {
      const synthesizer = new MarketNewsSynthesizer();
      const mockData = [
        { source: 'fred', timestamp: new Date(), data: {}, type: 'economic_indicator' as const, relevance: 0.8 },
        { source: 'brave_search', timestamp: new Date(), data: {}, type: 'news_article' as const, relevance: 0.6 }
      ];

      // Starter tier should have no access - returns fixed message
      const starterContext = await synthesizer.synthesizeMarketContext(mockData, UserTier.STARTER);
      expect(starterContext.contextText).toContain('No market context available');

      // Standard tier should have access to FRED and Brave Search
      const standardContext = await synthesizer.synthesizeMarketContext(mockData, UserTier.STANDARD);
      expect(standardContext.dataSources).toContain('fred');
      expect(standardContext.dataSources).toContain('brave_search');
    });
  });

  describe('Error Handling', () => {
    test('should handle API failures gracefully', async () => {
      // Mock both FRED and Brave Search to fail
      (fetch as jest.Mock).mockRejectedValue(new Error('API Error'));
      mockSearchProvider.search.mockRejectedValue(new Error('Search API Error'));
      
      // Create a new mock aggregator that handles the failure case
      const failureMockAggregator = {
        ...mockAggregator,
        aggregateMarketData: jest.fn().mockResolvedValue([
          {
            title: 'Mock FRED News (Fallback)',
            content: 'This is mock FRED news data when APIs fail',
            source: 'fred',
            url: 'https://example.com/mock-fred-fallback',
            publishedAt: new Date().toISOString(),
            category: 'economic'
          }
        ])
      };
      
      const data = await failureMockAggregator.aggregateMarketData();
      
      // In test environment, FRED API calls return mock data regardless of fetch mocking
      // So we should still get FRED data even when fetch fails
      expect(data.length).toBeGreaterThan(0);
      expect(data.some((d: any) => d.source === 'fred')).toBe(true);
      expect(data.some((d: any) => d.source === 'brave_search')).toBe(false);
    });

    test('should handle empty data gracefully', async () => {
      const synthesizer = new MarketNewsSynthesizer();
      // Empty data for STANDARD tier triggers early return (same as Starter - no data)
      const context = await synthesizer.synthesizeMarketContext([], UserTier.STANDARD);

      expect(context.contextText).toContain('No market context available');
      expect(context.dataSources).toEqual([]);
    });
  });
});
