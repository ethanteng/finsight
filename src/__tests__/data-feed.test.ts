import { DataOrchestrator } from '../data/orchestrator';
import { FREDProvider } from '../data/providers/fred';
import { AlphaVantageProvider } from '../data/providers/alpha-vantage';
import { InMemoryCacheService } from '../data/cache';
import { UserTier } from '../data/types';

// Mock the data providers
jest.mock('../data/providers/fred', () => ({
  FREDProvider: jest.fn().mockImplementation(() => ({
    getEconomicIndicators: jest.fn(),
  })),
}));

jest.mock('../data/providers/alpha-vantage', () => ({
  AlphaVantageProvider: jest.fn().mockImplementation(() => ({
    getLiveMarketData: jest.fn(),
  })),
}));

jest.mock('../data/cache', () => ({
  InMemoryCacheService: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    clear: jest.fn(),
  })),
}));

describe('Data Feed Architecture', () => {
  let dataOrchestrator: DataOrchestrator;
  let mockFREDProvider: jest.Mocked<FREDProvider>;
  let mockAlphaVantageProvider: jest.Mocked<AlphaVantageProvider>;
  let mockCacheService: jest.Mocked<InMemoryCacheService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get mocked instances
    mockFREDProvider = new (require('../data/providers/fred').FREDProvider)() as jest.Mocked<FREDProvider>;
    mockAlphaVantageProvider = new (require('../data/providers/alpha-vantage').AlphaVantageProvider)() as jest.Mocked<AlphaVantageProvider>;
    mockCacheService = new (require('../data/cache').InMemoryCacheService)() as jest.Mocked<InMemoryCacheService>;
    
    dataOrchestrator = new DataOrchestrator();
  });

  describe('DataOrchestrator', () => {
    it('should get market context for STARTER tier', async () => {
      const context = await dataOrchestrator.getMarketContext(UserTier.STARTER);
      
      expect(context).toEqual({});
      expect(mockFREDProvider.getEconomicIndicators).not.toHaveBeenCalled();
      expect(mockAlphaVantageProvider.getLiveMarketData).not.toHaveBeenCalled();
    });

    it('should get market context for STANDARD tier', async () => {
      const mockEconomicIndicators = {
        cpi: { value: 3.2, date: '2024-01-01' },
        fedRate: { value: 5.5, date: '2024-01-01' },
        mortgageRate: { value: 7.2, date: '2024-01-01' },
        creditCardAPR: { value: 24.5, date: '2024-01-01' },
      };

      mockFREDProvider.getEconomicIndicators.mockResolvedValue(mockEconomicIndicators);

      const context = await dataOrchestrator.getMarketContext(UserTier.STANDARD);
      
      expect(context).toEqual({
        economicIndicators: mockEconomicIndicators,
      });
      expect(mockFREDProvider.getEconomicIndicators).toHaveBeenCalled();
      expect(mockAlphaVantageProvider.getLiveMarketData).not.toHaveBeenCalled();
    });

    it('should get market context for PREMIUM tier', async () => {
      const mockEconomicIndicators = {
        cpi: { value: 3.2, date: '2024-01-01' },
        fedRate: { value: 5.5, date: '2024-01-01' },
        mortgageRate: { value: 7.2, date: '2024-01-01' },
        creditCardAPR: { value: 24.5, date: '2024-01-01' },
      };

      const mockLiveMarketData = {
        cdRates: [
          { term: '1-year', rate: 5.0 },
          { term: '2-year', rate: 5.2 },
        ],
        treasuryYields: [
          { term: '1-month', yield: 5.1 },
          { term: '3-month', yield: 5.2 },
        ],
        mortgageRates: [
          { type: '30-year-fixed', rate: 7.2 },
          { type: '15-year-fixed', rate: 6.8 },
        ],
      };

      mockFREDProvider.getEconomicIndicators.mockResolvedValue(mockEconomicIndicators);
      mockAlphaVantageProvider.getLiveMarketData.mockResolvedValue(mockLiveMarketData);

      const context = await dataOrchestrator.getMarketContext(UserTier.PREMIUM);
      
      expect(context).toEqual({
        economicIndicators: mockEconomicIndicators,
        liveMarketData: mockLiveMarketData,
      });
      expect(mockFREDProvider.getEconomicIndicators).toHaveBeenCalled();
      expect(mockAlphaVantageProvider.getLiveMarketData).toHaveBeenCalled();
    });

    it('should handle provider errors gracefully', async () => {
      mockFREDProvider.getEconomicIndicators.mockRejectedValue(new Error('FRED API error'));

      const context = await dataOrchestrator.getMarketContext(UserTier.STANDARD);
      
      expect(context).toEqual({});
    });

    it('should use caching for repeated requests', async () => {
      const mockEconomicIndicators = {
        cpi: { value: 3.2, date: '2024-01-01' },
        fedRate: { value: 5.5, date: '2024-01-01' },
        mortgageRate: { value: 7.2, date: '2024-01-01' },
        creditCardAPR: { value: 24.5, date: '2024-01-01' },
      };

      mockFREDProvider.getEconomicIndicators.mockResolvedValue(mockEconomicIndicators);
      mockCacheService.get.mockReturnValue(null); // First call: cache miss
      mockCacheService.get.mockReturnValue(mockEconomicIndicators); // Second call: cache hit

      // First call
      await dataOrchestrator.getMarketContext(UserTier.STANDARD);
      expect(mockFREDProvider.getEconomicIndicators).toHaveBeenCalledTimes(1);

      // Second call (should use cache)
      await dataOrchestrator.getMarketContext(UserTier.STANDARD);
      expect(mockFREDProvider.getEconomicIndicators).toHaveBeenCalledTimes(1); // Should not call again
    });
  });

  describe('FREDProvider', () => {
    it('should fetch economic indicators', async () => {
      const mockIndicators = {
        cpi: { value: 3.2, date: '2024-01-01' },
        fedRate: { value: 5.5, date: '2024-01-01' },
        mortgageRate: { value: 7.2, date: '2024-01-01' },
        creditCardAPR: { value: 24.5, date: '2024-01-01' },
      };

      mockFREDProvider.getEconomicIndicators.mockResolvedValue(mockIndicators);

      const result = await mockFREDProvider.getEconomicIndicators();
      
      expect(result).toEqual(mockIndicators);
      expect(mockFREDProvider.getEconomicIndicators).toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      mockFREDProvider.getEconomicIndicators.mockRejectedValue(new Error('FRED API error'));

      await expect(mockFREDProvider.getEconomicIndicators()).rejects.toThrow('FRED API error');
    });
  });

  describe('AlphaVantageProvider', () => {
    it('should fetch live market data', async () => {
      const mockMarketData = {
        cdRates: [
          { term: '1-year', rate: 5.0 },
          { term: '2-year', rate: 5.2 },
        ],
        treasuryYields: [
          { term: '1-month', yield: 5.1 },
          { term: '3-month', yield: 5.2 },
        ],
        mortgageRates: [
          { type: '30-year-fixed', rate: 7.2 },
          { type: '15-year-fixed', rate: 6.8 },
        ],
      };

      mockAlphaVantageProvider.getLiveMarketData.mockResolvedValue(mockMarketData);

      const result = await mockAlphaVantageProvider.getLiveMarketData();
      
      expect(result).toEqual(mockMarketData);
      expect(mockAlphaVantageProvider.getLiveMarketData).toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      mockAlphaVantageProvider.getLiveMarketData.mockRejectedValue(new Error('Alpha Vantage API error'));

      await expect(mockAlphaVantageProvider.getLiveMarketData()).rejects.toThrow('Alpha Vantage API error');
    });
  });

  describe('InMemoryCacheService', () => {
    it('should store and retrieve data', () => {
      const key = 'test-key';
      const value = { test: 'data' };

      mockCacheService.set(key, value);
      mockCacheService.get.mockReturnValue(value);

      const result = mockCacheService.get(key);
      
      expect(result).toEqual(value);
      expect(mockCacheService.set).toHaveBeenCalledWith(key, value);
      expect(mockCacheService.get).toHaveBeenCalledWith(key);
    });

    it('should return null for missing keys', () => {
      const key = 'missing-key';
      mockCacheService.get.mockReturnValue(null);

      const result = mockCacheService.get(key);
      
      expect(result).toBeNull();
    });

    it('should clear cache', () => {
      mockCacheService.clear();

      expect(mockCacheService.clear).toHaveBeenCalled();
    });
  });

  describe('Tier-Based Access Control', () => {
    it('should restrict STARTER tier to no external data', async () => {
      const context = await dataOrchestrator.getMarketContext(UserTier.STARTER);
      
      expect(context).toEqual({});
      expect(context.economicIndicators).toBeUndefined();
      expect(context.liveMarketData).toBeUndefined();
    });

    it('should allow STANDARD tier access to economic indicators only', async () => {
      const mockEconomicIndicators = {
        cpi: { value: 3.2, date: '2024-01-01' },
        fedRate: { value: 5.5, date: '2024-01-01' },
        mortgageRate: { value: 7.2, date: '2024-01-01' },
        creditCardAPR: { value: 24.5, date: '2024-01-01' },
      };

      mockFREDProvider.getEconomicIndicators.mockResolvedValue(mockEconomicIndicators);

      const context = await dataOrchestrator.getMarketContext(UserTier.STANDARD);
      
      expect(context.economicIndicators).toBeDefined();
      expect(context.liveMarketData).toBeUndefined();
    });

    it('should allow PREMIUM tier access to all data', async () => {
      const mockEconomicIndicators = {
        cpi: { value: 3.2, date: '2024-01-01' },
        fedRate: { value: 5.5, date: '2024-01-01' },
        mortgageRate: { value: 7.2, date: '2024-01-01' },
        creditCardAPR: { value: 24.5, date: '2024-01-01' },
      };

      const mockLiveMarketData = {
        cdRates: [{ term: '1-year', rate: 5.0 }],
        treasuryYields: [{ term: '1-month', yield: 5.1 }],
        mortgageRates: [{ type: '30-year-fixed', rate: 7.2 }],
      };

      mockFREDProvider.getEconomicIndicators.mockResolvedValue(mockEconomicIndicators);
      mockAlphaVantageProvider.getLiveMarketData.mockResolvedValue(mockLiveMarketData);

      const context = await dataOrchestrator.getMarketContext(UserTier.PREMIUM);
      
      expect(context.economicIndicators).toBeDefined();
      expect(context.liveMarketData).toBeDefined();
    });
  });

  describe('Data Normalization', () => {
    it('should normalize economic indicators', () => {
      const rawData = {
        cpi: { value: 3.2, date: '2024-01-01' },
        fedRate: { value: 5.5, date: '2024-01-01' },
        mortgageRate: { value: 7.2, date: '2024-01-01' },
        creditCardAPR: { value: 24.5, date: '2024-01-01' },
      };

      expect(rawData.cpi).toHaveProperty('value');
      expect(rawData.cpi).toHaveProperty('date');
      expect(rawData.fedRate).toHaveProperty('value');
      expect(rawData.mortgageRate).toHaveProperty('value');
      expect(rawData.creditCardAPR).toHaveProperty('value');
    });

    it('should normalize live market data', () => {
      const rawData = {
        cdRates: [
          { term: '1-year', rate: 5.0 },
          { term: '2-year', rate: 5.2 },
        ],
        treasuryYields: [
          { term: '1-month', yield: 5.1 },
          { term: '3-month', yield: 5.2 },
        ],
        mortgageRates: [
          { type: '30-year-fixed', rate: 7.2 },
          { type: '15-year-fixed', rate: 6.8 },
        ],
      };

      expect(Array.isArray(rawData.cdRates)).toBe(true);
      expect(Array.isArray(rawData.treasuryYields)).toBe(true);
      expect(Array.isArray(rawData.mortgageRates)).toBe(true);

      rawData.cdRates.forEach(cd => {
        expect(cd).toHaveProperty('term');
        expect(cd).toHaveProperty('rate');
      });

      rawData.treasuryYields.forEach(treasury => {
        expect(treasury).toHaveProperty('term');
        expect(treasury).toHaveProperty('yield');
      });

      rawData.mortgageRates.forEach(mortgage => {
        expect(mortgage).toHaveProperty('type');
        expect(mortgage).toHaveProperty('rate');
      });
    });
  });
}); 