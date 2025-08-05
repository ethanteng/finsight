import { UserTier, TierAccess, EconomicIndicator, LiveMarketData } from './types';
import { FREDProvider } from './providers/fred';
import { AlphaVantageProvider } from './providers/alpha-vantage';
import { SearchProvider } from './providers/search';
import { cacheService } from './cache';
import { DataSourceManager, dataSourceRegistry } from './sources';

export interface TierAwareContext {
  accounts: any[];
  transactions: any[];
  marketContext: {
    economicIndicators?: EconomicIndicator;
    liveMarketData?: LiveMarketData;
    searchContext?: SearchContext;
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

export interface SearchContext {
  query: string;
  results: SearchResult[];
  summary: string;
  lastUpdate: Date;
}

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
  relevance: number;
}

export interface MarketContextSummary {
  lastUpdate: Date;
  economicSummary: string;
  marketSummary: string;
  searchSummary?: string;
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
  private searchProvider: SearchProvider;
  private marketContextCache: Map<string, MarketContextSummary> = new Map();
  private searchCache: Map<string, SearchContext> = new Map();
  private lastContextRefresh: Date = new Date(0);
  private readonly CONTEXT_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour
  private readonly SEARCH_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  constructor() {
    // For integration tests, use test API keys to avoid hitting live APIs
    const fredApiKey = process.env.NODE_ENV === 'test' ? 'test_fred_key' : process.env.FRED_API_KEY;
    const alphaVantageApiKey = process.env.NODE_ENV === 'test' ? 'test_alpha_vantage_key' : process.env.ALPHA_VANTAGE_API_KEY;
    const searchApiKey = process.env.NODE_ENV === 'test' ? 'test_search_key' : process.env.SEARCH_API_KEY;

    console.log('DataOrchestrator: Initializing with API keys:');
    console.log('DataOrchestrator: FRED_API_KEY:', fredApiKey ? 'SET' : 'NOT SET');
    console.log('DataOrchestrator: ALPHA_VANTAGE_API_KEY:', alphaVantageApiKey ? 'SET' : 'NOT SET');
    console.log('DataOrchestrator: SEARCH_API_KEY:', searchApiKey ? 'SET' : 'NOT SET');

    if (!fredApiKey) {
      console.warn('FRED_API_KEY not set, economic indicators will be unavailable');
    }
    if (!alphaVantageApiKey) {
      console.warn('ALPHA_VANTAGE_API_KEY not set, live market data will be unavailable');
    }
    if (!searchApiKey) {
      console.warn('SEARCH_API_KEY not set, search context will be unavailable');
    }

    this.fredProvider = new FREDProvider(fredApiKey || '');
    this.alphaVantageProvider = new AlphaVantageProvider(alphaVantageApiKey || '');
    
    // Make search provider configurable
    const searchProviderType = process.env.SEARCH_PROVIDER || 'brave';
    this.searchProvider = new SearchProvider(searchApiKey || '', searchProviderType as 'bing' | 'google' | 'brave' | 'serpapi');
    
    console.log('DataOrchestrator: Search provider initialized with key:', searchApiKey ? 'PRESENT' : 'MISSING');
    console.log('DataOrchestrator: Search provider type:', process.env.SEARCH_PROVIDER || 'brave');
  }

  getTierAccess(tier: UserTier): TierAccess {
    switch (tier) {
      case UserTier.STARTER:
        return {
          tier: UserTier.STARTER,
          hasEconomicContext: false,
          hasLiveData: false,
          hasScenarioPlanning: false,
          hasSearchContext: false
        };
      
      case UserTier.STANDARD:
        return {
          tier: UserTier.STANDARD,
          hasEconomicContext: true,
          hasLiveData: false,
          hasScenarioPlanning: false,
          hasSearchContext: true
        };
      
      case UserTier.PREMIUM:
        return {
          tier: UserTier.PREMIUM,
          hasEconomicContext: true,
          hasLiveData: true,
          hasScenarioPlanning: true,
          hasSearchContext: true
        };
      
      default:
        return {
          tier: UserTier.STARTER,
          hasEconomicContext: false,
          hasLiveData: false,
          hasScenarioPlanning: false,
          hasSearchContext: false
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
    if (data.unemployment) {
      summary.push(`• Unemployment Rate: ${data.unemployment.value}%`);
    }
    
    return summary.join('\n');
  }

  /**
   * Process live market data into readable summary
   */
  private processLiveMarketData(data: LiveMarketData): string {
    const summary = [];
    
    if (data.cdRates && data.cdRates.length > 0) {
      summary.push(`• CD Rates: ${data.cdRates.slice(0, 3).map(cd => `${cd.term}: ${cd.rate}%`).join(', ')}`);
    }
    if (data.treasuryYields && data.treasuryYields.length > 0) {
      summary.push(`• Treasury Yields: ${data.treasuryYields.slice(0, 3).map(t => `${t.term}: ${t.yield}%`).join(', ')}`);
    }
    if (data.mortgageRates && data.mortgageRates.length > 0) {
      summary.push(`• Mortgage Rates: ${data.mortgageRates.slice(0, 2).map(m => `${m.type}: ${m.rate}%`).join(', ')}`);
    }
    
    return summary.join('\n');
  }

  /**
   * Extract key metrics for quick reference
   */
  private extractKeyMetrics(data: EconomicIndicator): MarketContextSummary['keyMetrics'] {
    return {
      fedRate: data.fedRate?.value?.toString() || 'N/A',
      treasury10Y: 'N/A', // Not available in current EconomicIndicator type
      cpi: data.cpi?.value?.toString() || 'N/A',
      unemployment: data.unemployment?.value?.toString() || 'N/A',
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
    
    if (data.unemployment && data.unemployment.value < 5) {
      insights.push('• Low unemployment suggests a strong job market - good time to negotiate salary or seek new opportunities');
    } else if (data.unemployment && data.unemployment.value > 6) {
      insights.push('• Elevated unemployment suggests building emergency savings and maintaining job security');
    }
    
    return insights;
  }

  /**
   * Generate market insights for GPT context
   */
  private generateMarketInsights(data: LiveMarketData): string[] {
    const insights = [];
    
    // Check CD rates for savings opportunities
    if (data.cdRates && data.cdRates.length > 0) {
      const highYieldCDs = data.cdRates.filter(cd => cd.rate > 4);
      if (highYieldCDs.length > 0) {
        insights.push('• High-yield CD rates available - consider laddering CDs for steady income');
      }
    }
    
    // Check Treasury yields for safe investment opportunities
    if (data.treasuryYields && data.treasuryYields.length > 0) {
      const highYieldTreasuries = data.treasuryYields.filter(t => t.yield > 4);
      if (highYieldTreasuries.length > 0) {
        insights.push('• Attractive Treasury yields available for conservative investors');
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

  async getSearchContext(query: string, tier: UserTier, isDemo: boolean = false): Promise<SearchContext | null> {
    console.log('DataOrchestrator: getSearchContext called with query:', query, 'tier:', tier, 'isDemo:', isDemo);
    
    const tierAccess = this.getTierAccess(tier);
    console.log('DataOrchestrator: Tier access hasSearchContext:', tierAccess.hasSearchContext);
    
    if (!tierAccess.hasSearchContext) {
      console.log('DataOrchestrator: No search context access for tier:', tier);
      return null;
    }

    const cacheKey = `search_${tier}_${isDemo}_${this.hashQuery(query)}`;
    const cached = this.searchCache.get(cacheKey);
    
    if (cached && this.isSearchFresh(cached.lastUpdate)) {
      console.log('DataOrchestrator: Using cached search results');
      return cached;
    }

    console.log('DataOrchestrator: Performing new search for query:', query);
    try {
      const results = await this.searchProvider.search(query);
      console.log('DataOrchestrator: Search completed, found', results.length, 'results');
      
      const summary = await this.generateSearchSummary(results, query);
      
      const searchContext: SearchContext = {
        query,
        results,
        summary,
        lastUpdate: new Date()
      };

      this.searchCache.set(cacheKey, searchContext);
      return searchContext;
    } catch (error) {
      console.error('DataOrchestrator: Failed to get search context:', error);
      return null;
    }
  }

  private hashQuery(query: string): string {
    // Simple hash for cache key
    return query.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
  }

  private isSearchFresh(lastUpdate: Date): boolean {
    return Date.now() - lastUpdate.getTime() < this.SEARCH_CACHE_TTL;
  }

  private async generateSearchSummary(results: SearchResult[], query: string): Promise<string> {
    if (results.length === 0) {
      return `No recent information found for "${query}".`;
    }

    const topResults = results.slice(0, 5);
    const summary = topResults.map(result => {
      // Clean HTML tags from snippet
      const cleanSnippet = result.snippet.replace(/<[^>]*>/g, '');
      return `• ${result.title}: ${cleanSnippet} (Source: ${result.source})`;
    }).join('\n');

    return `Latest real-time information for "${query}":\n${summary}`;
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

// Lazy initialization to ensure environment variables are loaded
let _dataOrchestrator: DataOrchestrator | null = null;

export function getDataOrchestrator(): DataOrchestrator {
  if (!_dataOrchestrator) {
    _dataOrchestrator = new DataOrchestrator();
  }
  return _dataOrchestrator;
}

// For backward compatibility - make this truly lazy
export const dataOrchestrator = new Proxy({} as DataOrchestrator, {
  get(target, prop) {
    const orchestrator = getDataOrchestrator();
    return (orchestrator as any)[prop];
  }
}); 