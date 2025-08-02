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

export interface MarketContextSummary {
  lastUpdate: Date;
  economicSummary: string;
  marketSummary: string;
  keyMetrics: {
    fedRate: string;
    treasury10Y: string;
    cpi: string;
    unemployment: string;
    sp500: string;
  };
  insights: string[];
  cacheKey: string;
}

export class DataOrchestrator {
  private fredProvider: FREDProvider;
  private alphaVantageProvider: AlphaVantageProvider;
  private marketContextCache: Map<string, MarketContextSummary> = new Map();
  private lastContextRefresh: Date = new Date(0);
  private readonly CONTEXT_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour

  constructor() {
    // For integration tests, use test API keys to avoid hitting live APIs
    const fredApiKey = process.env.NODE_ENV === 'test' ? 'test_fred_key' : process.env.FRED_API_KEY;
    const alphaVantageApiKey = process.env.NODE_ENV === 'test' ? 'test_alpha_vantage_key' : process.env.ALPHA_VANTAGE_API_KEY;

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

  /**
   * Enhanced market context manager with proactive caching
   */
  async getMarketContextSummary(tier: UserTier, isDemo: boolean = false): Promise<string> {
    const cacheKey = `market_context_${tier}_${isDemo}`;
    
    // Check if we have a recent cached context
    const cached = this.marketContextCache.get(cacheKey);
    if (cached && this.isContextFresh(cached.lastUpdate)) {
      console.log('DataOrchestrator: Using cached market context for tier:', tier);
      return this.formatContextForGPT(cached);
    }

    // Refresh context if needed
    console.log('DataOrchestrator: Refreshing market context for tier:', tier);
    await this.refreshMarketContext(tier, isDemo);
    
    const updatedCache = this.marketContextCache.get(cacheKey);
    return updatedCache ? this.formatContextForGPT(updatedCache) : '';
  }

  /**
   * Proactively refresh market context
   */
  async refreshMarketContext(tier: UserTier, isDemo: boolean = false): Promise<void> {
    const cacheKey = `market_context_${tier}_${isDemo}`;
    const access = this.getTierAccess(tier);
    
    console.log('DataOrchestrator: Refreshing market context for tier:', tier);
    
    try {
      const context: MarketContextSummary = {
        lastUpdate: new Date(),
        economicSummary: '',
        marketSummary: '',
        keyMetrics: {
          fedRate: 'N/A',
          treasury10Y: 'N/A',
          cpi: 'N/A',
          unemployment: 'N/A',
          sp500: 'N/A'
        },
        insights: [],
        cacheKey
      };

      // Fetch economic indicators for Standard and Premium tiers
      if (access.hasEconomicContext) {
        try {
          const economicData = await this.fredProvider.getEconomicIndicators();
          if (economicData) {
            context.economicSummary = this.processEconomicData(economicData);
            context.keyMetrics = this.extractKeyMetrics(economicData);
            context.insights.push(...this.generateEconomicInsights(economicData));
          }
        } catch (error) {
          console.error('DataOrchestrator: Error fetching economic indicators:', error);
        }
      }

      // Fetch live market data for Premium tier
      if (access.hasLiveData) {
        try {
          const liveData = await this.alphaVantageProvider.getLiveMarketData(tier);
          if (liveData) {
            context.marketSummary = this.processLiveMarketData(liveData);
            context.insights.push(...this.generateMarketInsights(liveData));
          }
        } catch (error) {
          console.error('DataOrchestrator: Error fetching live market data:', error);
        }
      }

      // Cache the processed context
      this.marketContextCache.set(cacheKey, context);
      console.log('DataOrchestrator: Market context refreshed and cached for tier:', tier);
      
    } catch (error) {
      console.error('DataOrchestrator: Error refreshing market context:', error);
    }
  }

  /**
   * Check if cached context is still fresh
   */
  private isContextFresh(lastUpdate: Date): boolean {
    const now = new Date();
    const timeDiff = now.getTime() - lastUpdate.getTime();
    return timeDiff < this.CONTEXT_REFRESH_INTERVAL;
  }

  /**
   * Format context for GPT consumption
   */
  private formatContextForGPT(context: MarketContextSummary): string {
    let formatted = `CURRENT MARKET CONTEXT (Updated: ${context.lastUpdate.toLocaleString()}):\n\n`;
    
    if (context.economicSummary) {
      formatted += `ECONOMIC INDICATORS:\n${context.economicSummary}\n\n`;
    }
    
    if (context.marketSummary) {
      formatted += `LIVE MARKET DATA:\n${context.marketSummary}\n\n`;
    }
    
    if (context.insights.length > 0) {
      formatted += `KEY INSIGHTS:\n${context.insights.join('\n')}\n\n`;
    }
    
    formatted += `Use this current market context to provide informed financial advice. Always reference specific data points when making recommendations.`;
    
    return formatted;
  }

  /**
   * Process economic data into readable summary
   */
  private processEconomicData(data: EconomicIndicator): string {
    const summary = [];
    
    if (data.fedRate) {
      summary.push(`• Fed Funds Rate: ${data.fedRate.value}%`);
    }
    if (data.cpi) {
      summary.push(`• CPI (YoY): ${data.cpi.value}%`);
    }
    if (data.mortgageRate) {
      summary.push(`• Mortgage Rate: ${data.mortgageRate.value}%`);
    }
    if (data.creditCardAPR) {
      summary.push(`• Credit Card APR: ${data.creditCardAPR.value}%`);
    }
    
    return summary.join('\n');
  }

  /**
   * Process live market data into readable summary
   */
  private processLiveMarketData(data: LiveMarketData): string {
    const summary = [];
    
    if (data.cdRates && data.cdRates.length > 0) {
      const cdDetails = data.cdRates.map(cd => {
        let detail = `${cd.term}: ${cd.rate}% (${cd.institution})`;
        if (cd.minimumDeposit) {
          detail += ` - Min: $${cd.minimumDeposit.toLocaleString()}`;
        }
        if (cd.specialFeatures && cd.specialFeatures.length > 0) {
          detail += ` - Features: ${cd.specialFeatures.join(', ')}`;
        }
        if (cd.fdicInsured) {
          detail += ' - FDIC Insured';
        }
        return detail;
      });
      summary.push(`CD RATES:\n${cdDetails.join('\n')}`);
    }
    
    if (data.treasuryYields && data.treasuryYields.length > 0) {
      const treasuryDetails = data.treasuryYields.map(t => 
        `${t.term}: ${t.yield}%`
      );
      summary.push(`TREASURY YIELDS:\n${treasuryDetails.join('\n')}`);
    }
    
    if (data.mortgageRates && data.mortgageRates.length > 0) {
      const mortgageDetails = data.mortgageRates.map(m => 
        `${m.type}: ${m.rate}%`
      );
      summary.push(`MORTGAGE RATES:\n${mortgageDetails.join('\n')}`);
    }
    
    return summary.join('\n\n');
  }

  /**
   * Extract key metrics for quick reference
   */
  private extractKeyMetrics(data: EconomicIndicator): MarketContextSummary['keyMetrics'] {
    return {
      fedRate: data.fedRate?.value?.toString() || 'N/A',
      treasury10Y: 'N/A', // Not available in current EconomicIndicator type
      cpi: data.cpi?.value?.toString() || 'N/A',
      unemployment: 'N/A', // Not available in current EconomicIndicator type
      sp500: 'N/A' // Will be updated by live data
    };
  }

  /**
   * Generate economic insights for GPT context
   */
  private generateEconomicInsights(data: EconomicIndicator): string[] {
    const insights = [];
    
    if (data.fedRate && data.fedRate.value > 5) {
      insights.push('• High interest rates favor savers - consider high-yield savings accounts and CDs');
    }
    
    if (data.cpi && data.cpi.value > 3) {
      insights.push('• Elevated inflation suggests TIPS and inflation-protected investments may be beneficial');
    }
    
    if (data.mortgageRate && data.mortgageRate.value > 6) {
      insights.push('• High mortgage rates suggest waiting for refinancing opportunities');
    }
    
    return insights;
  }

  /**
   * Generate market insights for GPT context
   */
  private generateMarketInsights(data: LiveMarketData): string[] {
    const insights = [];
    
    if (data.cdRates && data.cdRates.length > 0) {
      // Find best rates by term
      const bestRates = data.cdRates.reduce((acc, cd) => {
        if (!acc[cd.term] || cd.rate > acc[cd.term].rate) {
          acc[cd.term] = cd;
        }
        return acc;
      }, {} as Record<string, any>);
      
      // Generate CD-specific insights
      const shortTermRates = data.cdRates.filter(cd => cd.term.includes('3-month') || cd.term.includes('6-month'));
      const longTermRates = data.cdRates.filter(cd => cd.term.includes('1-year') || cd.term.includes('2-year') || cd.term.includes('5-year'));
      
      if (shortTermRates.length > 0 && longTermRates.length > 0) {
        const avgShortTerm = shortTermRates.reduce((sum, cd) => sum + cd.rate, 0) / shortTermRates.length;
        const avgLongTerm = longTermRates.reduce((sum, cd) => sum + cd.rate, 0) / longTermRates.length;
        
        if (avgLongTerm > avgShortTerm + 0.5) {
          insights.push('• CD rate curve is steep - consider laddering strategy for optimal returns');
        }
      }
      
      // Highlight special features
      const noPenaltyCDs = data.cdRates.filter(cd => cd.specialFeatures?.includes('no penalty'));
      if (noPenaltyCDs.length > 0) {
        insights.push(`• No-penalty CDs available at ${noPenaltyCDs.map(cd => `${cd.institution} (${cd.rate}%)`).join(', ')}`);
      }
      
      const bumpUpCDs = data.cdRates.filter(cd => cd.specialFeatures?.includes('bump-up'));
      if (bumpUpCDs.length > 0) {
        insights.push(`• Bump-up CDs available for rate protection at ${bumpUpCDs.map(cd => `${cd.institution} (${cd.rate}%)`).join(', ')}`);
      }
      
      // Best rates by term
      Object.entries(bestRates).forEach(([term, cd]) => {
        insights.push(`• Best ${term} CD: ${cd.institution} at ${cd.rate}% (Min: $${cd.minimumDeposit?.toLocaleString() || 'N/A'})`);
      });
    }
    
    if (data.treasuryYields && data.treasuryYields.length > 0) {
      const shortTerm = data.treasuryYields.find(t => t.term === '3-month');
      const longTerm = data.treasuryYields.find(t => t.term === '10-year');
      
      if (shortTerm && longTerm) {
        const spread = longTerm.yield - shortTerm.yield;
        if (spread < 0) {
          insights.push('• Inverted yield curve suggests economic uncertainty - consider defensive positioning');
        } else if (spread > 2) {
          insights.push('• Steep yield curve favors longer-term investments');
        }
      }
    }
    
    if (data.mortgageRates && data.mortgageRates.length > 0) {
      const fixed30 = data.mortgageRates.find(m => m.type === '30-year-fixed');
      const fixed15 = data.mortgageRates.find(m => m.type === '15-year-fixed');
      
      if (fixed30 && fixed15) {
        const rateDiff = fixed30.rate - fixed15.rate;
        if (rateDiff < 0.5) {
          insights.push('• 15-year mortgages offer significant interest savings with minimal rate premium');
        }
      }
    }
    
    return insights;
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
    return {
      ...cacheService.getStats(),
      marketContextCache: {
        size: this.marketContextCache.size,
        keys: Array.from(this.marketContextCache.keys()),
        lastRefresh: this.lastContextRefresh
      }
    };
  }

  // Method to invalidate cache (useful for testing)
  async invalidateCache(pattern: string) {
    await cacheService.invalidate(pattern);
    // Also clear market context cache if pattern matches
    if (pattern.includes('market') || pattern === '*') {
      this.marketContextCache.clear();
      console.log('DataOrchestrator: Market context cache cleared');
    }
  }

  // Method to force refresh all market context
  async forceRefreshAllContext() {
    console.log('DataOrchestrator: Force refreshing all market context...');
    const tiers = [UserTier.STARTER, UserTier.STANDARD, UserTier.PREMIUM];
    
    for (const tier of tiers) {
      await this.refreshMarketContext(tier, false);
      await this.refreshMarketContext(tier, true);
    }
    
    this.lastContextRefresh = new Date();
    console.log('DataOrchestrator: All market context refreshed');
  }
}

export const dataOrchestrator = new DataOrchestrator(); 