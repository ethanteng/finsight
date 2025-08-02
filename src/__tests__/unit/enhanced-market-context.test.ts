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
      expect(context).toContain('CD RATES:');
      expect(context).toContain('Test Bank');
      expect(context).toContain('TREASURY YIELDS:');
      expect(context).toContain('MORTGAGE RATES:');
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
      expect(context).toContain('Best 3-month CD:');
      expect(context).toContain('Best 6-month CD:');
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

describe('Enhanced CD Rate Analysis', () => {
  it('should provide detailed CD rate information with specific banks and features', async () => {
    // Setup mock providers for this test
    const mockFredProvider = {
      getEconomicIndicators: jest.fn(),
    } as any;
    
    const mockAlphaVantageProvider = {
      getLiveMarketData: jest.fn(),
    } as any;
    
    MockFREDProvider.mockImplementation(() => mockFredProvider);
    MockAlphaVantageProvider.mockImplementation(() => mockAlphaVantageProvider);
    
    // Mock successful API responses
    mockFredProvider.getEconomicIndicators.mockResolvedValue({
      cpi: { value: 3.1, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
      fedRate: { value: 5.25, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
      mortgageRate: { value: 6.72, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' },
      creditCardAPR: { value: 24.59, date: '2025-07-31', source: 'FRED', lastUpdated: '2025-08-01T05:57:37.801Z' }
    });

    mockAlphaVantageProvider.getLiveMarketData.mockResolvedValue({
      cdRates: [
        { 
          term: '3-month', 
          rate: 5.25, 
          institution: 'Marcus by Goldman Sachs', 
          lastUpdated: new Date().toISOString(),
          minimumDeposit: 500,
          maximumDeposit: 1000000,
          earlyWithdrawalPenalty: '3 months of interest',
          apy: 5.25,
          compoundingFrequency: 'daily',
          fdicInsured: true,
          specialFeatures: ['no penalty'],
          bankType: 'online',
          state: 'NY'
        },
        { 
          term: '6-month', 
          rate: 5.35, 
          institution: 'Ally Bank', 
          lastUpdated: new Date().toISOString(),
          minimumDeposit: 2500,
          maximumDeposit: 1000000,
          earlyWithdrawalPenalty: '6 months of interest',
          apy: 5.35,
          compoundingFrequency: 'daily',
          fdicInsured: true,
          specialFeatures: ['bump-up'],
          bankType: 'online',
          state: 'MI'
        }
      ],
      treasuryYields: [
        { term: '1-month', yield: 5.12, lastUpdated: new Date().toISOString() },
        { term: '3-month', yield: 5.18, lastUpdated: new Date().toISOString() }
      ],
      mortgageRates: [
        { type: '30-year-fixed', rate: 6.85, lastUpdated: new Date().toISOString() },
        { type: '15-year-fixed', rate: 6.25, lastUpdated: new Date().toISOString() }
      ]
    });

    const dataOrchestrator = new DataOrchestrator();
    
    // Get market context for premium tier
    const marketContext = await dataOrchestrator.getMarketContext(UserTier.PREMIUM, true);
    
    expect(marketContext.liveMarketData).toBeDefined();
    expect(marketContext.liveMarketData?.cdRates).toBeDefined();
    expect(marketContext.liveMarketData?.cdRates?.length).toBeGreaterThan(0);
    
    const cdRates = marketContext.liveMarketData!.cdRates!;
    
    // Verify detailed CD information
    cdRates.forEach(cd => {
      expect(cd.institution).toBeDefined();
      expect(cd.rate).toBeGreaterThan(0);
      expect(cd.term).toBeDefined();
      expect(cd.lastUpdated).toBeDefined();
      
      // Check for enhanced fields
      expect(cd.minimumDeposit).toBeDefined();
      expect(cd.maximumDeposit).toBeDefined();
      expect(cd.earlyWithdrawalPenalty).toBeDefined();
      expect(cd.apy).toBeDefined();
      expect(cd.compoundingFrequency).toBeDefined();
      expect(cd.fdicInsured).toBeDefined();
      expect(cd.specialFeatures).toBeDefined();
      expect(cd.bankType).toBeDefined();
      expect(cd.state).toBeDefined();
    });
    
    // Verify specific banks are included
    const bankNames = cdRates.map(cd => cd.institution);
    expect(bankNames).toContain('Marcus by Goldman Sachs');
    expect(bankNames).toContain('Ally Bank');
    
    // Verify special features
    const noPenaltyCDs = cdRates.filter(cd => cd.specialFeatures?.includes('no penalty'));
    const bumpUpCDs = cdRates.filter(cd => cd.specialFeatures?.includes('bump-up'));
    
    expect(noPenaltyCDs.length).toBeGreaterThan(0);
    expect(bumpUpCDs.length).toBeGreaterThan(0);
    
    // Verify rate ranges
    const rates = cdRates.map(cd => cd.rate);
    expect(Math.max(...rates)).toBeGreaterThan(5.0);
    expect(Math.min(...rates)).toBeGreaterThan(5.0);
  });
  
  it('should generate actionable CD recommendations', async () => {
    const dataOrchestrator = new DataOrchestrator();
    
    // Get market context
    const marketContext = await dataOrchestrator.getMarketContext(UserTier.PREMIUM, true);
    const cdRates = marketContext.liveMarketData?.cdRates || [];
    
    // Import the function from index.ts
    const { generateCDRecommendations } = await import('../../index');
    
    // Test recommendation generation
    const recommendations = generateCDRecommendations(cdRates);
    
    expect(recommendations.length).toBeGreaterThan(0);
    
    // Check for best rates recommendation
    const bestRatesRec = recommendations.find((r: any) => r.type === 'best_rates') as any;
    expect(bestRatesRec).toBeDefined();
    expect(bestRatesRec?.rates?.length).toBeGreaterThan(0);
    
    // Check for laddering recommendation
    const ladderingRec = recommendations.find((r: any) => r.type === 'laddering') as any;
    if (ladderingRec) {
      expect(ladderingRec.strategy?.length).toBe(4);
    }
    
    // Check for no-penalty recommendation
    const noPenaltyRec = recommendations.find((r: any) => r.type === 'no_penalty') as any;
    if (noPenaltyRec) {
      expect(noPenaltyRec.options?.length).toBeGreaterThan(0);
    }
  });
}); 