import { UserTier, TierAccess, EconomicIndicator, LiveMarketData } from './types';
import { FREDProvider } from './providers/fred';
import { AlphaVantageProvider } from './providers/alpha-vantage';
import { cacheService } from './cache';

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

  async getMarketContext(tier: UserTier, isDemo: boolean = false): Promise<{
    economicIndicators?: EconomicIndicator;
    liveMarketData?: LiveMarketData;
  }> {
    console.log('DataOrchestrator: getMarketContext called with tier:', tier, 'isDemo:', isDemo);
    const access = this.getTierAccess(tier);
    console.log('DataOrchestrator: Tier access:', access);
    const context: any = {};

    if (access.hasEconomicContext) {
      console.log('DataOrchestrator: Fetching economic indicators...');
      context.economicIndicators = await this.fredProvider.getEconomicIndicators();
      console.log('DataOrchestrator: Economic indicators fetched:', context.economicIndicators);
    }

    if (access.hasLiveData) {
      console.log('DataOrchestrator: Fetching live market data...');
      context.liveMarketData = await this.alphaVantageProvider.getLiveMarketData();
    }

    console.log('DataOrchestrator: Returning context:', context);
    return context;
  }

  private async getLiveMarketData(): Promise<LiveMarketData> {
    const cacheKey = 'live_market_data';
    const cached = await cacheService.get<LiveMarketData>(cacheKey);
    if (cached) return cached;

    try {
      const liveData = await this.alphaVantageProvider.getLiveMarketData();
      await cacheService.set(cacheKey, liveData, 5 * 60 * 1000); // 5 minutes
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