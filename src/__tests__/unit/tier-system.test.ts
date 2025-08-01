import { DataSourceManager, dataSourceRegistry } from '../../data/sources';
import { UserTier } from '../../data/types';
import { DataOrchestrator } from '../../data/orchestrator';

// Mock the DataOrchestrator dependencies
jest.mock('../../data/providers/fred', () => ({
  FREDProvider: jest.fn().mockImplementation(() => ({
    getEconomicIndicators: jest.fn().mockResolvedValue({
      cpi: 3.2,
      fedRate: 5.5,
      mortgageRate: 7.1,
      creditCardAPR: 24.5
    }),
    getLiveMarketData: jest.fn().mockResolvedValue(null)
  }))
}));

jest.mock('../../data/providers/alpha-vantage', () => ({
  AlphaVantageProvider: jest.fn().mockImplementation(() => ({
    getLiveMarketData: jest.fn().mockResolvedValue({
      stocks: {
        AAPL: { price: 150.25, change: 2.5 },
        GOOGL: { price: 2800.50, change: -15.75 }
      },
      bonds: {
        '10Y_TREASURY': { yield: 4.2 },
        '30Y_TREASURY': { yield: 4.8 }
      },
      commodities: {
        GOLD: { price: 1950.00, change: 5.25 },
        OIL: { price: 75.50, change: -1.20 }
      }
    })
  }))
}));

describe('Tier System', () => {
  describe('DataSourceManager', () => {
    test('should get correct sources for Starter tier', () => {
      const sources = DataSourceManager.getSourcesForTier(UserTier.STARTER);
      
      // Starter should only have account-related sources
      expect(sources.length).toBeGreaterThan(0);
      sources.forEach(source => {
        expect(source.category).toBe('account');
        expect(source.provider).toBe('plaid');
      });
    });

    test('should get correct sources for Standard tier', () => {
      const sources = DataSourceManager.getSourcesForTier(UserTier.STANDARD);
      
      // Standard should have account + economic sources
      const accountSources = sources.filter(s => s.category === 'account');
      const economicSources = sources.filter(s => s.category === 'economic');
      
      expect(accountSources.length).toBeGreaterThan(0);
      expect(economicSources.length).toBeGreaterThan(0);
      
      // Should not have external sources (Premium only)
      const externalSources = sources.filter(s => s.category === 'external');
      expect(externalSources.length).toBe(0);
    });

    test('should get correct sources for Premium tier', () => {
      const sources = DataSourceManager.getSourcesForTier(UserTier.PREMIUM);
      
      // Premium should have all source types
      const accountSources = sources.filter(s => s.category === 'account');
      const economicSources = sources.filter(s => s.category === 'economic');
      const externalSources = sources.filter(s => s.category === 'external');
      
      expect(accountSources.length).toBeGreaterThan(0);
      expect(economicSources.length).toBeGreaterThan(0);
      expect(externalSources.length).toBeGreaterThan(0);
    });

    test('should get unavailable sources correctly', () => {
      const unavailableForStarter = DataSourceManager.getUnavailableSourcesForTier(UserTier.STARTER);
      const unavailableForStandard = DataSourceManager.getUnavailableSourcesForTier(UserTier.STANDARD);
      const unavailableForPremium = DataSourceManager.getUnavailableSourcesForTier(UserTier.PREMIUM);
      
      // Starter should have many unavailable sources
      expect(unavailableForStarter.length).toBeGreaterThan(0);
      
      // Standard should have some unavailable sources (external only)
      expect(unavailableForStandard.length).toBeGreaterThan(0);
      
      // Premium should have no unavailable sources
      expect(unavailableForPremium.length).toBe(0);
    });

    test('should generate upgrade suggestions correctly', () => {
      const starterSuggestions = DataSourceManager.getUpgradeSuggestions(UserTier.STARTER);
      const standardSuggestions = DataSourceManager.getUpgradeSuggestions(UserTier.STANDARD);
      const premiumSuggestions = DataSourceManager.getUpgradeSuggestions(UserTier.PREMIUM);
      
      // Starter should have upgrade suggestions
      expect(starterSuggestions.length).toBeGreaterThan(0);
      expect(starterSuggestions.some(s => s.includes('Standard'))).toBe(true);
      expect(starterSuggestions.some(s => s.includes('Premium'))).toBe(true);
      
      // Standard should have Premium upgrade suggestions
      expect(standardSuggestions.length).toBeGreaterThan(0);
      expect(standardSuggestions.some(s => s.includes('Premium'))).toBe(true);
      
      // Premium should have no upgrade suggestions
      expect(premiumSuggestions.length).toBe(0);
    });

    test('should get next tier correctly', () => {
      expect(DataSourceManager.getNextTier(UserTier.STARTER)).toBe(UserTier.STANDARD);
      expect(DataSourceManager.getNextTier(UserTier.STANDARD)).toBe(UserTier.PREMIUM);
      expect(DataSourceManager.getNextTier(UserTier.PREMIUM)).toBe(null);
    });

    test('should get tier limitations correctly', () => {
      const starterLimitations = DataSourceManager.getTierLimitations(UserTier.STARTER);
      const standardLimitations = DataSourceManager.getTierLimitations(UserTier.STANDARD);
      const premiumLimitations = DataSourceManager.getTierLimitations(UserTier.PREMIUM);
      
      expect(starterLimitations.length).toBeGreaterThan(0);
      expect(starterLimitations.some(l => l.includes('account data only'))).toBe(true);
      
      expect(standardLimitations.length).toBeGreaterThan(0);
      expect(standardLimitations.some(l => l.includes('real-time'))).toBe(true);
      
      expect(premiumLimitations.length).toBe(1);
      expect(premiumLimitations[0]).toContain('Full access');
    });
  });

  describe('DataOrchestrator', () => {
    let orchestrator: DataOrchestrator;

    beforeEach(() => {
      orchestrator = new DataOrchestrator();
    });

    test('should build tier-aware context for Starter tier', async () => {
      const context = await orchestrator.buildTierAwareContext(UserTier.STARTER, [], [], false);
      
      expect(context.tierInfo.currentTier).toBe(UserTier.STARTER);
      expect(context.tierInfo.availableSources.length).toBeGreaterThan(0);
      expect(context.tierInfo.unavailableSources.length).toBeGreaterThan(0);
      expect(context.upgradeHints.length).toBeGreaterThan(0);
      expect(context.tierInfo.limitations.length).toBeGreaterThan(0);
    });

    test('should build tier-aware context for Standard tier', async () => {
      const context = await orchestrator.buildTierAwareContext(UserTier.STANDARD, [], [], false);
      
      expect(context.tierInfo.currentTier).toBe(UserTier.STANDARD);
      expect(context.tierInfo.availableSources.length).toBeGreaterThan(0);
      expect(context.upgradeHints.length).toBeGreaterThan(0);
      
      // Should have economic sources
      const hasEconomicSources = context.tierInfo.availableSources.some(source => 
        source.includes('CPI') || source.includes('Fed Rate') || source.includes('Mortgage')
      );
      expect(hasEconomicSources).toBe(true);
    });

    test('should build tier-aware context for Premium tier', async () => {
      const context = await orchestrator.buildTierAwareContext(UserTier.PREMIUM, [], [], false);
      
      expect(context.tierInfo.currentTier).toBe(UserTier.PREMIUM);
      expect(context.tierInfo.availableSources.length).toBeGreaterThan(0);
      expect(context.tierInfo.unavailableSources.length).toBe(0);
      expect(context.upgradeHints.length).toBe(0);
      
      // Should have all source types
      const hasAccountSources = context.tierInfo.availableSources.some(source => 
        source.includes('Account')
      );
      const hasEconomicSources = context.tierInfo.availableSources.some(source => 
        source.includes('CPI') || source.includes('Federal Reserve') || source.includes('Mortgage') || source.includes('Credit Card')
      );
      const hasExternalSources = context.tierInfo.availableSources.some(source => 
        source.includes('CD') || source.includes('Treasury') || source.includes('Stock')
      );
      
      expect(hasAccountSources).toBe(true);
      expect(hasEconomicSources).toBe(true);
      expect(hasExternalSources).toBe(true);
    });

    test('should get tier access correctly', () => {
      const starterAccess = orchestrator.getTierAccess(UserTier.STARTER);
      const standardAccess = orchestrator.getTierAccess(UserTier.STANDARD);
      const premiumAccess = orchestrator.getTierAccess(UserTier.PREMIUM);
      
      expect(starterAccess.hasEconomicContext).toBe(false);
      expect(starterAccess.hasLiveData).toBe(false);
      
      expect(standardAccess.hasEconomicContext).toBe(true);
      expect(standardAccess.hasLiveData).toBe(false);
      
      expect(premiumAccess.hasEconomicContext).toBe(true);
      expect(premiumAccess.hasLiveData).toBe(true);
    });
  });

  describe('Data Source Registry', () => {
    test('should have correct data source configurations', () => {
      // Check that all sources have required fields
      Object.values(dataSourceRegistry).forEach(source => {
        expect(source.id).toBeDefined();
        expect(source.name).toBeDefined();
        expect(source.description).toBeDefined();
        expect(source.tiers).toBeDefined();
        expect(source.category).toBeDefined();
        expect(source.provider).toBeDefined();
        expect(source.cacheDuration).toBeDefined();
        expect(source.isLive).toBeDefined();
      });
    });

    test('should have account sources for all tiers', () => {
      const accountSources = Object.values(dataSourceRegistry).filter(s => s.category === 'account');
      
      accountSources.forEach(source => {
        expect(source.tiers).toContain(UserTier.STARTER);
        expect(source.tiers).toContain(UserTier.STANDARD);
        expect(source.tiers).toContain(UserTier.PREMIUM);
      });
    });

    test('should have economic sources for Standard+ tiers', () => {
      const economicSources = Object.values(dataSourceRegistry).filter(s => s.category === 'economic');
      
      economicSources.forEach(source => {
        expect(source.tiers).toContain(UserTier.STANDARD);
        expect(source.tiers).toContain(UserTier.PREMIUM);
        // Economic sources should not be available for Starter
        expect(source.tiers).not.toContain(UserTier.STARTER);
      });
    });

    test('should have external sources for Premium only', () => {
      const externalSources = Object.values(dataSourceRegistry).filter(s => s.category === 'external');
      
      externalSources.forEach(source => {
        expect(source.tiers).toContain(UserTier.PREMIUM);
        // External sources should not be available for Starter or Standard
        expect(source.tiers).not.toContain(UserTier.STARTER);
        expect(source.tiers).not.toContain(UserTier.STANDARD);
      });
    });

    test('should have appropriate cache durations', () => {
      Object.values(dataSourceRegistry).forEach(source => {
        expect(source.cacheDuration).toBeGreaterThan(0);
        
        // Live data should have shorter cache durations (5 minutes max)
        if (source.isLive) {
          expect(source.cacheDuration).toBeLessThanOrEqual(300000); // 5 minutes max
        } else {
          expect(source.cacheDuration).toBeGreaterThan(300000); // More than 5 minutes
        }
      });
    });

    test('should have unique IDs', () => {
      const ids = Object.values(dataSourceRegistry).map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    test('should have descriptive names', () => {
      Object.values(dataSourceRegistry).forEach(source => {
        expect(source.name.length).toBeGreaterThan(0);
        expect(source.description.length).toBeGreaterThan(10);
      });
    });
  });

  describe('Tier Upgrade Path', () => {
    test('should provide clear upgrade path from Starter to Standard', () => {
      const starterSources = DataSourceManager.getSourcesForTier(UserTier.STARTER);
      const standardSources = DataSourceManager.getSourcesForTier(UserTier.STANDARD);
      
      // Standard should have more sources than Starter
      expect(standardSources.length).toBeGreaterThan(starterSources.length);
      
      // Standard should include all Starter sources
      const starterSourceIds = starterSources.map(s => s.id);
      const standardSourceIds = standardSources.map(s => s.id);
      
      starterSourceIds.forEach(id => {
        expect(standardSourceIds).toContain(id);
      });
    });

    test('should provide clear upgrade path from Standard to Premium', () => {
      const standardSources = DataSourceManager.getSourcesForTier(UserTier.STANDARD);
      const premiumSources = DataSourceManager.getSourcesForTier(UserTier.PREMIUM);
      
      // Premium should have more sources than Standard
      expect(premiumSources.length).toBeGreaterThan(standardSources.length);
      
      // Premium should include all Standard sources
      const standardSourceIds = standardSources.map(s => s.id);
      const premiumSourceIds = premiumSources.map(s => s.id);
      
      standardSourceIds.forEach(id => {
        expect(premiumSourceIds).toContain(id);
      });
    });

    test('should have meaningful upgrade suggestions', () => {
      const starterSuggestions = DataSourceManager.getUpgradeSuggestions(UserTier.STARTER);
      const standardSuggestions = DataSourceManager.getUpgradeSuggestions(UserTier.STANDARD);
      
      // Starter suggestions should mention Standard features
      expect(starterSuggestions.some(s => s.includes('economic'))).toBe(true);
      expect(starterSuggestions.some(s => s.includes('economic indicators'))).toBe(true);
      
      // Standard suggestions should mention Premium features
      expect(standardSuggestions.some(s => s.includes('real-time'))).toBe(true);
      expect(standardSuggestions.some(s => s.includes('real-time market data'))).toBe(true);
    });
  });
}); 