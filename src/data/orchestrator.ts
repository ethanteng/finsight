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

  async getMarketContext(tier: UserTier): Promise<{
    economicIndicators?: EconomicIndicator;
    liveMarketData?: LiveMarketData;
  }> {
    const access = this.getTierAccess(tier);
    const context: any = {};

    try {
      if (access.hasEconomicContext) {
        context.economicIndicators = await this.getEconomicIndicators();
      }

      if (access.hasLiveData) {
        context.liveMarketData = await this.getLiveMarketData();
      }
    } catch (error) {
      console.error('Error fetching market context:', error);
      // Return empty context on error, don't fail the entire request
    }

    return context;
  }

  private async getEconomicIndicators(): Promise<EconomicIndicator> {
    const cacheKey = 'economic_indicators';
    const cached = await cacheService.get<EconomicIndicator>(cacheKey);
    if (cached) return cached;

    try {
      const indicators = await this.fredProvider.getEconomicIndicators();
      await cacheService.set(cacheKey, indicators, 24 * 60 * 60 * 1000); // 24 hours
      return indicators;
    } catch (error) {
      console.error('Error fetching economic indicators:', error);
      // Return mock data as fallback
      return {
        cpi: { value: 3.1, date: '2024-01', source: 'FRED (fallback)', lastUpdated: new Date().toISOString() },
        fedRate: { value: 5.25, date: '2024-01', source: 'FRED (fallback)', lastUpdated: new Date().toISOString() },
        mortgageRate: { value: 6.85, date: '2024-01', source: 'FRED (fallback)', lastUpdated: new Date().toISOString() },
        creditCardAPR: { value: 24.59, date: '2024-01', source: 'FRED (fallback)', lastUpdated: new Date().toISOString() }
      };
    }
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