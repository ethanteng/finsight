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

import { MarketNewsAggregator } from '../../market-news/aggregator';
import { MarketNewsSynthesizer } from '../../market-news/synthesizer';
import { MarketNewsManager } from '../../market-news/manager';
import { UserTier } from '../../data/types';

// Mock fetch globally
global.fetch = jest.fn();

describe('Market News System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const data = await aggregator.aggregateMarketData();
      expect(data).toEqual([]);
    });

    test('should handle Brave Search API errors gracefully', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const data = await aggregator.aggregateMarketData();
      expect(data).toEqual([]);
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

      // Mock multiple fetch calls for different indicators
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

    test('should filter data correctly for Starter tier', async () => {
      const mockData = [
        { source: 'fred', timestamp: new Date(), data: {}, type: 'economic_indicator' as const, relevance: 0.8 },
        { source: 'brave_search', timestamp: new Date(), data: {}, type: 'news_article' as const, relevance: 0.6 }
      ];

      const context = await synthesizer.synthesizeMarketContext(mockData, UserTier.STARTER);
      expect(context.contextText).toBe('Mock AI response');
      expect(context.dataSources).toEqual([]);
    });

    test('should filter data correctly for Standard tier', async () => {
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
      (fetch as jest.Mock).mockRejectedValue(new Error('API Error'));
      
      const aggregator = new MarketNewsAggregator();
      const data = await aggregator.aggregateMarketData();
      
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
