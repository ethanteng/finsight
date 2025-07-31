import { UserTier, TierAccess, EconomicIndicator, LiveMarketData } from './types';
import { FREDProvider } from './providers/fred';
import { AlphaVantageProvider } from './providers/alpha-vantage';
import { cacheService } from './cache';
import { DataSourceManager, dataSourceRegistry } from './sources';

export interface TierAwareContext {
  accounts: any[];
  transactions: any[];
  marketContext: {
    economicIndicators?: EconomicIndicator;
    liveMarketData?: LiveMarketData;
  };
  tierInfo: {
    currentTier: UserTier;
    availableSources: string[];
    unavailableSources: string[];
    upgradeSuggestions: string[];
    limitations: string[];
  };
  upgradeHints: {
    feature: string;
    benefit: string;
    requiredTier: UserTier;
  }[];
}

export class DataOrchestrator {
  private fredProvider: FREDProvider;
  private alphaVantageProvider: AlphaVantageProvider;

  constructor() {
    const fredApiKey = process.env.FRED_API_KEY;
    const alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY;

    if (!fredApiKey) {
      console.warn('FRED_API_KEY not set, economic indicators will be unavailable');
    }
    if (!alphaVantageApiKey) {
      console.warn('ALPHA_VANTAGE_API_KEY not set, live market data will be unavailable');
    }

    this.fredProvider = new FREDProvider(fredApiKey || '');
    this.alphaVantageProvider = new AlphaVantageProvider(alphaVantageApiKey || '');
  }

  getTierAccess(tier: UserTier): TierAccess {
    switch (tier) {
      case UserTier.STARTER:
        return {
          tier: UserTier.STARTER,
          hasEconomicContext: false,
          hasLiveData: false,
          hasScenarioPlanning: false
        };
      
      case UserTier.STANDARD:
        return {
          tier: UserTier.STANDARD,
          hasEconomicContext: true,
          hasLiveData: false,
          hasScenarioPlanning: false
        };
      
      case UserTier.PREMIUM:
        return {
          tier: UserTier.PREMIUM,
          hasEconomicContext: true,
          hasLiveData: true,
          hasScenarioPlanning: true
        };
      
      default:
        return {
          tier: UserTier.STARTER,
          hasEconomicContext: false,
          hasLiveData: false,
          hasScenarioPlanning: false
        };
    }
  }

  async buildTierAwareContext(
    tier: UserTier, 
    accounts: any[] = [], 
    transactions: any[] = [],
    isDemo: boolean = false
  ): Promise<TierAwareContext> {
    console.log('DataOrchestrator: buildTierAwareContext called with tier:', tier, 'isDemo:', isDemo);
    
    // Get available and unavailable sources for this tier
    const availableSources = DataSourceManager.getSourcesForTier(tier);
    const unavailableSources = DataSourceManager.getUnavailableSourcesForTier(tier);
    const upgradeSuggestions = DataSourceManager.getUpgradeSuggestions(tier);
    const limitations = DataSourceManager.getTierLimitations(tier);

    console.log('DataOrchestrator: Available sources for tier', tier, ':', availableSources.map(s => s.name));
    console.log('DataOrchestrator: Unavailable sources for tier', tier, ':', unavailableSources.map(s => s.name));

    // Fetch market context based on available sources
    const marketContext = await this.getMarketContextForSources(availableSources, tier, isDemo);

    // Generate upgrade hints
    const upgradeHints = unavailableSources.map(source => ({
      feature: source.name,
      benefit: source.upgradeBenefit || source.description,
      requiredTier: source.tiers[0] // First tier that has access
    }));

    const context: TierAwareContext = {
      accounts,
      transactions,
      marketContext,
      tierInfo: {
        currentTier: tier,
        availableSources: availableSources.map(s => s.name),
        unavailableSources: unavailableSources.map(s => s.name),
        upgradeSuggestions,
        limitations
      },
      upgradeHints
    };

    console.log('DataOrchestrator: Built tier-aware context:', {
      tier: context.tierInfo.currentTier,
      availableSourcesCount: context.tierInfo.availableSources.length,
      unavailableSourcesCount: context.tierInfo.unavailableSources.length,
      upgradeHintsCount: context.upgradeHints.length
    });

    return context;
  }

  private async getMarketContextForSources(
    availableSources: any[], 
    tier: UserTier, 
    isDemo: boolean
  ): Promise<{ economicIndicators?: EconomicIndicator; liveMarketData?: LiveMarketData }> {
    const context: { economicIndicators?: EconomicIndicator; liveMarketData?: LiveMarketData } = {};

    // Check if economic indicators are available
    const hasEconomicSources = availableSources.some(source => 
      source.category === 'economic' && source.provider === 'fred'
    );

    if (hasEconomicSources) {
      console.log('DataOrchestrator: Fetching economic indicators...');
      try {
        context.economicIndicators = await this.fredProvider.getEconomicIndicators();
        console.log('DataOrchestrator: Economic indicators fetched successfully');
      } catch (error) {
        console.error('DataOrchestrator: Error fetching economic indicators:', error);
      }
    }

    // Check if live market data is available
    const hasLiveDataSources = availableSources.some(source => 
      source.category === 'external' && source.provider === 'alpha-vantage'
    );

    if (hasLiveDataSources) {
      console.log('DataOrchestrator: Fetching live market data...');
      try {
        const liveMarketData = await this.alphaVantageProvider.getLiveMarketData(tier);
        if (liveMarketData) {
          context.liveMarketData = liveMarketData as LiveMarketData;
          console.log('DataOrchestrator: Live market data fetched successfully');
        }
      } catch (error) {
        console.error('DataOrchestrator: Error fetching live market data:', error);
      }
    }

    return context;
  }

  async getMarketContext(tier: UserTier, isDemo: boolean = false): Promise<{
    economicIndicators?: EconomicIndicator;
    liveMarketData?: LiveMarketData;
  }> {
    console.log('DataOrchestrator: getMarketContext called with tier:', tier, 'isDemo:', isDemo);
    const access = this.getTierAccess(tier);
    console.log('DataOrchestrator: Tier access:', access);
    const context: {
      economicIndicators?: EconomicIndicator;
      liveMarketData?: LiveMarketData;
    } = {};

    if (access.hasEconomicContext) {
      console.log('DataOrchestrator: Fetching economic indicators...');
      context.economicIndicators = await this.fredProvider.getEconomicIndicators();
      console.log('DataOrchestrator: Economic indicators fetched:', context.economicIndicators);
    }

    if (access.hasLiveData) {
      console.log('DataOrchestrator: Fetching live market data...');
      const liveMarketData = await this.alphaVantageProvider.getLiveMarketData(tier);
      if (liveMarketData) {
        context.liveMarketData = liveMarketData as LiveMarketData;
      }
    }

    console.log('DataOrchestrator: Returning context:', context);
    return context;
  }

  private async getLiveMarketData(tier: UserTier): Promise<LiveMarketData | null> {
    const cacheKey = 'live_market_data';
    const cached = await cacheService.get<LiveMarketData>(cacheKey);
    if (cached) return cached;

    try {
      const liveData = await this.alphaVantageProvider.getLiveMarketData(tier);
      if (liveData) {
        await cacheService.set(cacheKey, liveData, 5 * 60 * 1000); // 5 minutes
      }
      return liveData;
    } catch (error) {
      console.error('Error fetching live market data:', error);
      throw error; // Live data is critical for Premium tier
    }
  }

  // Helper method for debugging
  async getCacheStats() {
    return cacheService.getStats();
  }

  // Method to invalidate cache (useful for testing)
  async invalidateCache(pattern: string) {
    await cacheService.invalidate(pattern);
  }
}

export const dataOrchestrator = new DataOrchestrator(); 