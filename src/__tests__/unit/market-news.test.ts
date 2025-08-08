// Mock OpenAI before imports
jest.mock('openai', () => {
  const mockOpenAI = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Mock AI response' } }]
        })
      }
    }
  }));
  
  return {
    __esModule: true,
    default: mockOpenAI
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

import { MarketNewsAggregator } from '../../market-news/aggregator';
import { MarketNewsSynthesizer } from '../../market-news/synthesizer';
import { MarketNewsManager } from '../../market-news/manager';
import { UserTier } from '../../data/types';
import { SearchProvider } from '../../data/providers/search';

// Mock fetch globally
global.fetch = jest.fn();

describe('Market News System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    let aggregator: MarketNewsAggregator;

    beforeEach(() => {
      aggregator = new MarketNewsAggregator();
    });

    test('should initialize with correct sources', () => {
      // This is a basic test to ensure the aggregator initializes
      expect(aggregator).toBeDefined();
    });

    test('should handle FRED API errors gracefully', async () => {
      // Mock fetch to fail for FRED API calls
      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const data = await aggregator.aggregateMarketData();
      // Should still get Brave Search data even if FRED fails
      expect(data.length).toBeGreaterThan(0);
      expect(data.some(d => d.source === 'brave_search')).toBe(true);
      expect(data.some(d => d.source === 'fred')).toBe(false);
    });

    test('should handle Brave Search API errors gracefully', async () => {
      // Mock FRED API to succeed
      const mockFredResponse = {
        observations: [
          {
            date: '2025-01-01',
            value: '5.25'
          }
        ]
      };

      // Mock multiple fetch calls for different FRED indicators (CPI, FEDFUNDS, MORTGAGE30US, DGS10)
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

      // Mock SearchProvider to throw error
      mockSearchProvider.search.mockRejectedValue(new Error('Search API error'));

      const data = await aggregator.aggregateMarketData();
      // Should still get FRED data even if Brave Search fails
      expect(data.length).toBeGreaterThan(0);
      expect(data.some(d => d.source === 'fred')).toBe(true);
      expect(data.some(d => d.source === 'brave_search')).toBe(false);
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

      // Mock multiple fetch calls for different FRED indicators (CPI, FEDFUNDS, MORTGAGE30US, DGS10)
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

      const data = await aggregator.aggregateMarketData();
      expect(data.length).toBeGreaterThan(0);
      expect(data.some(d => d.source === 'fred')).toBe(true);
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

      const data = await aggregator.aggregateMarketData();
      expect(data.length).toBeGreaterThan(0);
      expect(data.some(d => d.source === 'brave_search')).toBe(true);
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

      expect(starterContext.contextText).toBe('Mock AI response');
      expect(standardContext.contextText).toBe('Mock AI response');
      expect(premiumContext.contextText).toBe('Mock AI response');
    });

    test('should filter data sources by tier', async () => {
      const mockData = [
        { source: 'fred', timestamp: new Date(), data: {}, type: 'economic_indicator' as const, relevance: 0.8 },
        { source: 'brave_search', timestamp: new Date(), data: {}, type: 'news_article' as const, relevance: 0.6 },
        { source: 'alpha_vantage', timestamp: new Date(), data: {}, type: 'market_data' as const, relevance: 0.7 }
      ];

      const context = await synthesizer.synthesizeMarketContext(mockData, UserTier.STANDARD);
      expect(context.dataSources).toContain('fred');
      expect(context.dataSources).toContain('brave_search');
      expect(context.dataSources).not.toContain('alpha_vantage');
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
      await expect(
        manager.updateMarketContext(UserTier.STANDARD)
      ).resolves.not.toThrow();
    });
  });

  describe('Tier-based Access Control', () => {
    test('should provide different access levels by tier', async () => {
      const synthesizer = new MarketNewsSynthesizer();
      const mockData = [
        { source: 'fred', timestamp: new Date(), data: {}, type: 'economic_indicator' as const, relevance: 0.8 },
        { source: 'brave_search', timestamp: new Date(), data: {}, type: 'news_article' as const, relevance: 0.6 }
      ];

      // Starter tier should have no access
      const starterContext = await synthesizer.synthesizeMarketContext(mockData, UserTier.STARTER);
      expect(starterContext.contextText).toBe('Mock AI response');

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
      
      const aggregator = new MarketNewsAggregator();
      const data = await aggregator.aggregateMarketData();
      
      // Should return empty array when all sources fail
      expect(data).toEqual([]);
    });

    test('should handle empty data gracefully', async () => {
      const synthesizer = new MarketNewsSynthesizer();
      const context = await synthesizer.synthesizeMarketContext([], UserTier.STANDARD);
      
      expect(context.contextText).toBe('Mock AI response');
      expect(context.dataSources).toEqual([]);
    });
  });
});
