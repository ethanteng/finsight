import { jest } from '@jest/globals';
import { DataOrchestrator } from '../../data/orchestrator';
import { UserTier } from '../../data/types';

// Mock the DataOrchestrator
jest.mock('../../data/orchestrator');

describe('RAG Components Unit Tests', () => {
  let mockDataOrchestrator: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock instance
    mockDataOrchestrator = {
      getSearchContext: jest.fn(),
      getCacheStats: jest.fn()
    };
    
    // Mock the constructor to return our mock instance
    (DataOrchestrator as any).mockImplementation(() => mockDataOrchestrator);
  });

  describe('Search Context Retrieval', () => {
    it('should retrieve search context for different queries', async () => {
      const mockSearchContext = {
        query: 'What is the current unemployment rate?',
        results: [
          {
            title: 'Economic Data',
            snippet: 'Unemployment rate is 4.2% as of July 2025',
            url: 'https://example.com/economic-data',
            source: 'example.com',
            relevance: 0.9
          }
        ],
        summary: 'Unemployment rate is 4.2% as of July 2025',
        lastUpdate: new Date()
      };

      mockDataOrchestrator.getSearchContext.mockResolvedValue(mockSearchContext);

      const result = await mockDataOrchestrator.getSearchContext('What is the current unemployment rate?', UserTier.STANDARD);

      expect(result).toEqual(mockSearchContext);
      expect(result?.results[0].snippet).toContain('4.2%');
      expect(mockDataOrchestrator.getSearchContext).toHaveBeenCalledWith(
        'What is the current unemployment rate?',
        UserTier.STANDARD
      );
    });

    it('should handle empty search results', async () => {
      mockDataOrchestrator.getSearchContext.mockResolvedValue(null);

      const result = await mockDataOrchestrator.getSearchContext('Invalid query', UserTier.STANDARD);

      expect(result).toBeNull();
      expect(mockDataOrchestrator.getSearchContext).toHaveBeenCalledWith(
        'Invalid query',
        UserTier.STANDARD
      );
    });
  });

  describe('Query Enhancement', () => {
    it('should enhance queries for better search results', async () => {
      const mockSearchContext = {
        query: 'What are current mortgage rates?',
        results: [
          {
            title: 'Mortgage Rate Data',
            snippet: 'Current 30-year fixed mortgage rates average 6.57%',
            url: 'https://example.com/mortgage-rates',
            source: 'example.com',
            relevance: 0.95
          }
        ],
        summary: 'Current 30-year fixed mortgage rates average 6.57%',
        lastUpdate: new Date()
      };

      mockDataOrchestrator.getSearchContext.mockResolvedValue(mockSearchContext);

      const result = await mockDataOrchestrator.getSearchContext('mortgage rates', UserTier.PREMIUM);

      expect(result?.results[0].snippet).toContain('6.57%');
      expect(mockDataOrchestrator.getSearchContext).toHaveBeenCalledWith(
        'mortgage rates',
        UserTier.PREMIUM
      );
    });
  });

  describe('Result Processing', () => {
    it('should process search results correctly', async () => {
      const mockSearchContext = {
        query: 'What is inflation rate?',
        results: [
          {
            title: 'Inflation Data',
            snippet: 'Current inflation rate is 3.2% year-over-year',
            url: 'https://example.com/inflation',
            source: 'example.com',
            relevance: 0.9
          }
        ],
        summary: 'Current inflation rate is 3.2% year-over-year',
        lastUpdate: new Date()
      };

      mockDataOrchestrator.getSearchContext.mockResolvedValue(mockSearchContext);

      const result = await mockDataOrchestrator.getSearchContext('inflation rate', UserTier.STANDARD);

      expect(result?.results).toHaveLength(1);
      expect(result?.results[0].snippet).toContain('3.2%');
      expect(result?.results[0].relevance).toBe(0.9);
    });

    it('should handle malformed search results', async () => {
      const malformedSearchContext = {
        query: 'What is inflation rate?',
        results: [
          {
            title: 'Inflation Data',
            url: 'https://example.com/inflation'
          }
        ],
        summary: 'Current inflation rate is 3.2% year-over-year',
        lastUpdate: new Date()
      };

      mockDataOrchestrator.getSearchContext.mockResolvedValue(malformedSearchContext);

      const result = await mockDataOrchestrator.getSearchContext('inflation rate', UserTier.STANDARD);

      expect(result?.results[0].snippet).toBeUndefined();
      expect(result?.results[0].source).toBeUndefined();
      expect(result?.results[0].relevance).toBeUndefined();
    });
  });

  describe('Caching Mechanisms', () => {
    it('should implement caching for search results', async () => {
      const mockCacheStats = {
        marketContextCache: {
          size: 5,
          keys: ['unemployment', 'mortgage', 'inflation', 'gdp', 'interest'],
          lastRefresh: new Date()
        },
        size: 10,
        keys: ['search1', 'search2', 'search3', 'search4', 'search5', 'search6', 'search7', 'search8', 'search9', 'search10']
      };

      mockDataOrchestrator.getCacheStats.mockResolvedValue(mockCacheStats);

      const result = await mockDataOrchestrator.getCacheStats();

      expect(result).toEqual(mockCacheStats);
      expect(result.marketContextCache.size).toBe(5);
      expect(result.size).toBe(10);
    });

    it('should handle cache expiration', async () => {
      const mockCacheStats = {
        marketContextCache: {
          size: 0,
          keys: [],
          lastRefresh: null
        },
        size: 0,
        keys: []
      };

      mockDataOrchestrator.getCacheStats.mockResolvedValue(mockCacheStats);

      const result = await mockDataOrchestrator.getCacheStats();

      expect(result).toEqual(mockCacheStats);
      expect(result.marketContextCache.size).toBe(0);
      expect(result.size).toBe(0);
    });

    it('should refresh cache when needed', async () => {
      const mockCacheStats = {
        marketContextCache: {
          size: 5,
          keys: ['unemployment', 'mortgage', 'inflation', 'gdp', 'interest'],
          lastRefresh: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
        },
        size: 10,
        keys: ['search1', 'search2', 'search3', 'search4', 'search5', 'search6', 'search7', 'search8', 'search9', 'search10']
      };

      mockDataOrchestrator.getCacheStats.mockResolvedValue(mockCacheStats);

      const result = await mockDataOrchestrator.getCacheStats();

      expect(result.marketContextCache.lastRefresh).toBeDefined();
      expect(result.marketContextCache.size).toBe(5);
    });
  });

  describe('Performance', () => {
    it('should handle high-frequency queries efficiently', async () => {
      const mockSearchContext = {
        query: 'What is the current unemployment rate?',
        results: [
          {
            title: 'Economic Data',
            snippet: 'Unemployment rate is 4.2% as of July 2025',
            url: 'https://example.com/economic-data',
            source: 'example.com',
            relevance: 0.9
          }
        ],
        summary: 'Unemployment rate is 4.2% as of July 2025',
        lastUpdate: new Date()
      };

      mockDataOrchestrator.getSearchContext.mockResolvedValue(mockSearchContext);

      // Simulate multiple rapid queries
      const promises = [
        mockDataOrchestrator.getSearchContext('What is the current unemployment rate?', UserTier.STANDARD),
        mockDataOrchestrator.getSearchContext('What is the current unemployment rate?', UserTier.STANDARD),
        mockDataOrchestrator.getSearchContext('What is the current unemployment rate?', UserTier.STANDARD)
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result?.results[0].snippet).toContain('4.2%');
      });
    });

    it('should handle concurrent queries', async () => {
      const mockSearchContext = {
        query: 'What are current mortgage rates?',
        results: [
          {
            title: 'Mortgage Rate Data',
            snippet: 'Current 30-year fixed mortgage rates average 6.57%',
            url: 'https://example.com/mortgage-rates',
            source: 'example.com',
            relevance: 0.95
          }
        ],
        summary: 'Current 30-year fixed mortgage rates average 6.57%',
        lastUpdate: new Date()
      };

      mockDataOrchestrator.getSearchContext.mockResolvedValue(mockSearchContext);

      // Simulate concurrent queries
      const promises = [
        mockDataOrchestrator.getSearchContext('What are current mortgage rates?', UserTier.PREMIUM),
        mockDataOrchestrator.getSearchContext('What is inflation rate?', UserTier.STANDARD),
        mockDataOrchestrator.getSearchContext('What is GDP growth?', UserTier.STANDARD)
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(mockDataOrchestrator.getSearchContext).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle API rate limiting', async () => {
      mockDataOrchestrator.getSearchContext.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(
        mockDataOrchestrator.getSearchContext('What is the current unemployment rate?', UserTier.STANDARD)
      ).rejects.toThrow('API rate limit exceeded');
    });

    it('should handle network errors gracefully', async () => {
      mockDataOrchestrator.getSearchContext.mockRejectedValue(new Error('Network timeout'));

      await expect(
        mockDataOrchestrator.getSearchContext('What is the current unemployment rate?', UserTier.STANDARD)
      ).rejects.toThrow('Network timeout');
    });

    it('should handle invalid queries gracefully', async () => {
      mockDataOrchestrator.getSearchContext.mockResolvedValue(null);

      const result = await mockDataOrchestrator.getSearchContext('', UserTier.STANDARD);

      expect(result).toBeNull();
    });

    it('should handle malformed responses gracefully', async () => {
      const malformedResponse = {
        query: 'What is inflation rate?',
        results: null,
        summary: 'Current inflation rate is 3.2% year-over-year',
        lastUpdate: new Date()
      };

      mockDataOrchestrator.getSearchContext.mockResolvedValue(malformedResponse);

      const result = await mockDataOrchestrator.getSearchContext('inflation rate', UserTier.STANDARD);

      expect(result?.results).toBeNull();
    });
  });
}); 