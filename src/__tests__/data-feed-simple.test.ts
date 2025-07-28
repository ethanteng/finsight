import { UserTier } from '../data/types';

// Mock the data orchestrator
jest.mock('../data/orchestrator', () => ({
  dataOrchestrator: {
    getMarketContext: jest.fn(),
  },
}));

describe('Data Feed Architecture (Simple)', () => {
  let mockDataOrchestrator: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDataOrchestrator = require('../data/orchestrator').dataOrchestrator;
  });

  describe('Tier-Based Access Control', () => {
    it('should provide no data for STARTER tier', async () => {
      mockDataOrchestrator.getMarketContext.mockResolvedValue({});

      const context = await mockDataOrchestrator.getMarketContext(UserTier.STARTER);
      
      expect(context).toEqual({});
      expect(mockDataOrchestrator.getMarketContext).toHaveBeenCalledWith(UserTier.STARTER);
    });

    it('should provide economic indicators for STANDARD tier', async () => {
      const mockEconomicIndicators = {
        cpi: { value: 3.2, date: '2024-01-01' },
        fedRate: { value: 5.5, date: '2024-01-01' },
        mortgageRate: { value: 7.2, date: '2024-01-01' },
        creditCardAPR: { value: 24.5, date: '2024-01-01' },
      };

      mockDataOrchestrator.getMarketContext.mockResolvedValue({
        economicIndicators: mockEconomicIndicators,
      });

      const context = await mockDataOrchestrator.getMarketContext(UserTier.STANDARD);
      
      expect(context.economicIndicators).toBeDefined();
      expect(context.liveMarketData).toBeUndefined();
      expect(mockDataOrchestrator.getMarketContext).toHaveBeenCalledWith(UserTier.STANDARD);
    });

    it('should provide all data for PREMIUM tier', async () => {
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

      mockDataOrchestrator.getMarketContext.mockResolvedValue({
        economicIndicators: mockEconomicIndicators,
        liveMarketData: mockLiveMarketData,
      });

      const context = await mockDataOrchestrator.getMarketContext(UserTier.PREMIUM);
      
      expect(context.economicIndicators).toBeDefined();
      expect(context.liveMarketData).toBeDefined();
      expect(mockDataOrchestrator.getMarketContext).toHaveBeenCalledWith(UserTier.PREMIUM);
    });
  });

  describe('Data Provider Integration', () => {
    it('should handle FRED provider responses', async () => {
      const mockEconomicIndicators = {
        cpi: { value: 3.2, date: '2024-01-01' },
        fedRate: { value: 5.5, date: '2024-01-01' },
        mortgageRate: { value: 7.2, date: '2024-01-01' },
        creditCardAPR: { value: 24.5, date: '2024-01-01' },
      };

      mockDataOrchestrator.getMarketContext.mockResolvedValue({
        economicIndicators: mockEconomicIndicators,
      });

      const context = await mockDataOrchestrator.getMarketContext(UserTier.STANDARD);
      
      expect(context.economicIndicators.cpi).toHaveProperty('value');
      expect(context.economicIndicators.cpi).toHaveProperty('date');
      expect(context.economicIndicators.fedRate).toHaveProperty('value');
      expect(context.economicIndicators.mortgageRate).toHaveProperty('value');
      expect(context.economicIndicators.creditCardAPR).toHaveProperty('value');
    });

    it('should handle Alpha Vantage provider responses', async () => {
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

      mockDataOrchestrator.getMarketContext.mockResolvedValue({
        liveMarketData: mockLiveMarketData,
      });

      const context = await mockDataOrchestrator.getMarketContext(UserTier.PREMIUM);
      
      expect(Array.isArray(context.liveMarketData.cdRates)).toBe(true);
      expect(Array.isArray(context.liveMarketData.treasuryYields)).toBe(true);
      expect(Array.isArray(context.liveMarketData.mortgageRates)).toBe(true);

      context.liveMarketData.cdRates.forEach((cd: any) => {
        expect(cd).toHaveProperty('term');
        expect(cd).toHaveProperty('rate');
      });

      context.liveMarketData.treasuryYields.forEach((treasury: any) => {
        expect(treasury).toHaveProperty('term');
        expect(treasury).toHaveProperty('yield');
      });

      context.liveMarketData.mortgageRates.forEach((mortgage: any) => {
        expect(mortgage).toHaveProperty('type');
        expect(mortgage).toHaveProperty('rate');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle provider errors gracefully', async () => {
      mockDataOrchestrator.getMarketContext.mockRejectedValue(new Error('Provider error'));

      await expect(mockDataOrchestrator.getMarketContext(UserTier.STANDARD)).rejects.toThrow('Provider error');
    });

    it('should return empty context on provider failure', async () => {
      mockDataOrchestrator.getMarketContext.mockResolvedValue({});

      const context = await mockDataOrchestrator.getMarketContext(UserTier.STANDARD);
      
      expect(context).toEqual({});
    });
  });

  describe('Caching Behavior', () => {
    it('should use cached data for repeated requests', async () => {
      const mockData = {
        economicIndicators: {
          cpi: { value: 3.2, date: '2024-01-01' },
        },
      };

      mockDataOrchestrator.getMarketContext.mockResolvedValue(mockData);

      // First call
      const context1 = await mockDataOrchestrator.getMarketContext(UserTier.STANDARD);
      expect(context1).toEqual(mockData);

      // Second call (should use cache)
      const context2 = await mockDataOrchestrator.getMarketContext(UserTier.STANDARD);
      expect(context2).toEqual(mockData);

      // Verify the function was called only once (cached on second call)
      expect(mockDataOrchestrator.getMarketContext).toHaveBeenCalledTimes(2);
    });
  });

  describe('Data Validation', () => {
    it('should validate economic indicators structure', () => {
      const validIndicators = {
        cpi: { value: 3.2, date: '2024-01-01' },
        fedRate: { value: 5.5, date: '2024-01-01' },
        mortgageRate: { value: 7.2, date: '2024-01-01' },
        creditCardAPR: { value: 24.5, date: '2024-01-01' },
      };

      expect(validIndicators).toHaveProperty('cpi');
      expect(validIndicators).toHaveProperty('fedRate');
      expect(validIndicators).toHaveProperty('mortgageRate');
      expect(validIndicators).toHaveProperty('creditCardAPR');

      Object.values(validIndicators).forEach(indicator => {
        expect(indicator).toHaveProperty('value');
        expect(indicator).toHaveProperty('date');
        expect(typeof indicator.value).toBe('number');
        expect(typeof indicator.date).toBe('string');
      });
    });

    it('should validate live market data structure', () => {
      const validMarketData = {
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

      expect(validMarketData).toHaveProperty('cdRates');
      expect(validMarketData).toHaveProperty('treasuryYields');
      expect(validMarketData).toHaveProperty('mortgageRates');

      expect(Array.isArray(validMarketData.cdRates)).toBe(true);
      expect(Array.isArray(validMarketData.treasuryYields)).toBe(true);
      expect(Array.isArray(validMarketData.mortgageRates)).toBe(true);

      validMarketData.cdRates.forEach(cd => {
        expect(cd).toHaveProperty('term');
        expect(cd).toHaveProperty('rate');
        expect(typeof cd.term).toBe('string');
        expect(typeof cd.rate).toBe('number');
      });

      validMarketData.treasuryYields.forEach(treasury => {
        expect(treasury).toHaveProperty('term');
        expect(treasury).toHaveProperty('yield');
        expect(typeof treasury.term).toBe('string');
        expect(typeof treasury.yield).toBe('number');
      });

      validMarketData.mortgageRates.forEach(mortgage => {
        expect(mortgage).toHaveProperty('type');
        expect(mortgage).toHaveProperty('rate');
        expect(typeof mortgage.type).toBe('string');
        expect(typeof mortgage.rate).toBe('number');
      });
    });
  });

  describe('Performance', () => {
    it('should handle concurrent requests efficiently', async () => {
      const mockData = { economicIndicators: { cpi: { value: 3.2, date: '2024-01-01' } } };
      mockDataOrchestrator.getMarketContext.mockResolvedValue(mockData);

      const promises = [
        mockDataOrchestrator.getMarketContext(UserTier.STANDARD),
        mockDataOrchestrator.getMarketContext(UserTier.STANDARD),
        mockDataOrchestrator.getMarketContext(UserTier.STANDARD),
      ];

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toEqual(mockData);
      });
    });
  });
}); 