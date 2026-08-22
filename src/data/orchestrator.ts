import { UserTier, TierAccess, EconomicIndicator } from './types';
import { FREDProvider } from './providers/fred';
import { SearchProvider } from './providers/search';
import { cacheService } from './cache';
import { DataSourceManager, dataSourceRegistry } from './sources';
import { createHash } from 'crypto';
import type { PlannedSearchQuery, SearchQueryEvidence, SearchResultEvidence } from './search-types';

export interface TierAwareContext {
  accounts: any[];
  transactions: any[];
  marketContext: {
    economicIndicators?: EconomicIndicator;
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
  queries: PlannedSearchQuery[];
  results: SearchResult[];
  summary: string;
  lastUpdate: Date;
  cacheHits: number;
  providerCalls: number;
  /** Per-query record of cache/provider routing and what each query returned. */
  queryOutcomes?: SearchQueryEvidence[];
}

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
  relevance: number;
  /** Provider publication age, preserved even when it cannot be parsed. */
  age?: string;
  /** Parsed provider publication/page age. Never the retrieval timestamp. */
  publishedAt?: string;
}

export interface MarketContextSummary {
  lastUpdate: Date;
  economicSummary: string;
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
  private searchProvider: SearchProvider;
  private readonly searchProviderType: 'bing' | 'google' | 'brave' | 'serpapi';
  private marketContextCache: Map<string, MarketContextSummary> = new Map();
  private searchCache: Map<string, SearchContext> = new Map();
  private lastContextRefresh: Date = new Date(0);
  private readonly CONTEXT_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour
  private readonly SEARCH_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  constructor() {
    // For integration tests and CI/CD, use test API keys to avoid hitting live APIs
    const fredApiKey = (process.env.NODE_ENV === 'test' || process.env.GITHUB_ACTIONS) ? 'test_fred_key' : process.env.FRED_API_KEY;
    const searchApiKey = (process.env.NODE_ENV === 'test' || process.env.GITHUB_ACTIONS) ? 'test_search_key' : process.env.SEARCH_API_KEY;

    console.log('DataOrchestrator: Initializing with API keys:');
    console.log('DataOrchestrator: FRED_API_KEY:', fredApiKey ? 'SET' : 'NOT SET');
    console.log('DataOrchestrator: SEARCH_API_KEY:', searchApiKey ? 'SET' : 'NOT SET');

    if (!fredApiKey) {
      console.warn('FRED_API_KEY not set, economic indicators will be unavailable');
    }
    if (!searchApiKey) {
      console.warn('SEARCH_API_KEY not set, search context will be unavailable');
    }

    this.fredProvider = new FREDProvider(fredApiKey || '');

    // Make search provider configurable
    this.searchProviderType = (process.env.SEARCH_PROVIDER || 'brave') as 'bing' | 'google' | 'brave' | 'serpapi';
    this.searchProvider = new SearchProvider(searchApiKey || '', this.searchProviderType);

    console.log('DataOrchestrator: Search provider initialized with key:', searchApiKey ? 'PRESENT' : 'MISSING');
    console.log('DataOrchestrator: Search provider type:', process.env.SEARCH_PROVIDER || 'brave');
  }

  getTierAccess(tier: UserTier): TierAccess {
    switch (tier) {
      case UserTier.STARTER:
        return {
          tier: UserTier.STARTER,
          hasEconomicContext: false,
          hasScenarioPlanning: false,
          hasSearchContext: false
        };

      case UserTier.STANDARD:
        return {
          tier: UserTier.STANDARD,
          hasEconomicContext: true,
          hasScenarioPlanning: false,
          hasSearchContext: true
        };

      case UserTier.PREMIUM:
        return {
          tier: UserTier.PREMIUM,
          hasEconomicContext: true,
          hasScenarioPlanning: true,
          hasSearchContext: true
        };

      default:
        return {
          tier: UserTier.STARTER,
          hasEconomicContext: false,
          hasScenarioPlanning: false,
          hasSearchContext: false
        };
    }
  }

  /**
   * Enhanced market context manager with proactive caching
   */
  async getMarketContextSummary(tier: UserTier): Promise<string> {
    const cacheKey = `market_context_${tier}`;

    // Check if we have a recent cached context
    const cached = this.marketContextCache.get(cacheKey);
    if (cached && this.isContextFresh(cached.lastUpdate)) {
      console.log('DataOrchestrator: Using cached market context for tier:', tier);
      return this.formatContextForGPT(cached);
    }

    // Refresh context if needed
    console.log('DataOrchestrator: Refreshing market context for tier:', tier);
    await this.refreshMarketContext(tier);

    const updatedCache = this.marketContextCache.get(cacheKey);
    return updatedCache ? this.formatContextForGPT(updatedCache) : '';
  }

  /**
   * Proactively refresh market context
   */
  async refreshMarketContext(tier: UserTier): Promise<void> {
    const cacheKey = `market_context_${tier}`;
    const access = this.getTierAccess(tier);

    console.log('DataOrchestrator: Refreshing market context for tier:', tier);

    try {
      const context: MarketContextSummary = {
        lastUpdate: new Date(),
        economicSummary: '',
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
    const formatPoint = (label: string, point: NonNullable<EconomicIndicator[keyof EconomicIndicator]>) =>
      `• ${label}: ${point.value}% (observation date: ${point.date})`;

    if (data.fedRate) {
      summary.push(formatPoint('Fed Funds Rate', data.fedRate));
    }
    if (data.cpi) {
      summary.push(formatPoint('CPI (YoY)', data.cpi));
    }
    if (data.mortgageRate) {
      summary.push(formatPoint('Mortgage Rate', data.mortgageRate));
    }
    if (data.creditCardAPR) {
      summary.push(formatPoint('Credit Card APR', data.creditCardAPR));
    }
    if (data.unemployment) {
      summary.push(formatPoint('Unemployment Rate', data.unemployment));
    }
    if (data.treasury10Y) {
      summary.push(formatPoint('10-Year Treasury Rate', data.treasury10Y));
    }
    if (data.cd12Month) {
      summary.push(formatPoint('FDIC National 12-Month CD Rate', data.cd12Month));
    }

    return summary.join('\n');
  }

  /**
   * Extract key metrics for quick reference
   */
  private extractKeyMetrics(data: EconomicIndicator): MarketContextSummary['keyMetrics'] {
    return {
      fedRate: data.fedRate?.value?.toString() || 'N/A',
      treasury10Y: data.treasury10Y?.value?.toString() || 'N/A',
      cpi: data.cpi?.value?.toString() || 'N/A',
      unemployment: data.unemployment?.value?.toString() || 'N/A',
      sp500: 'N/A'
    };
  }

  /**
   * Generate economic insights for GPT context
   */
  private generateEconomicInsights(data: EconomicIndicator): string[] {
    const insights = [];

    if (data.fedRate && data.fedRate.value > 5) {
      insights.push('• An elevated policy rate raises borrowing costs and can support higher cash yields; compare current deposit offers before acting');
    }

    if (data.cpi && data.cpi.value > 3) {
      insights.push('• Elevated inflation suggests TIPS and inflation-protected investments may be beneficial');
    }

    if (data.mortgageRate && data.mortgageRate.value > 6) {
      insights.push('• Mortgage rates are elevated; refinancing generally requires comparing this market average with the borrower’s current rate and closing costs');
    }

    if (data.creditCardAPR && data.creditCardAPR.value > 20) {
      insights.push('• Average credit card borrowing costs are high, increasing the value of paying down revolving balances');
    }

    if (data.unemployment && data.unemployment.value < 5) {
      insights.push('• Low unemployment suggests a strong job market - good time to negotiate salary or seek new opportunities');
    } else if (data.unemployment && data.unemployment.value > 6) {
      insights.push('• Elevated unemployment suggests building emergency savings and maintaining job security');
    }

    return insights;
  }

  async buildTierAwareContext(
    tier: UserTier,
    accounts: any[] = [],
    transactions: any[] = [],
    options: { includeMarketContext?: boolean } = {}
  ): Promise<TierAwareContext> {
    console.log('DataOrchestrator: buildTierAwareContext called with tier:', tier);

    // Get available and unavailable sources for this tier
    const availableSources = DataSourceManager.getSourcesForTier(tier);
    const unavailableSources = DataSourceManager.getUnavailableSourcesForTier(tier);
    const upgradeSuggestions = DataSourceManager.getUpgradeSuggestions(tier);
    const limitations = DataSourceManager.getTierLimitations(tier);

    console.log('DataOrchestrator: Available sources for tier', tier, ':', availableSources.map(s => s.name));
    console.log('DataOrchestrator: Unavailable sources for tier', tier, ':', unavailableSources.map(s => s.name));

    // Some consumers only need tier entitlements. Avoid an implicit external
    // market-data fetch when a question-specific context loader owns that work.
    const marketContext = options.includeMarketContext === false
      ? {}
      : await this.getMarketContextForSources(availableSources);

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
    availableSources: any[]
  ): Promise<{ economicIndicators?: EconomicIndicator }> {
    const context: { economicIndicators?: EconomicIndicator } = {};

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

    return context;
  }

  async getMarketContext(tier: UserTier): Promise<{
    economicIndicators?: EconomicIndicator;
  }> {
    console.log('DataOrchestrator: getMarketContext called with tier:', tier);
    const access = this.getTierAccess(tier);
    console.log('DataOrchestrator: Tier access:', access);
    const context: {
      economicIndicators?: EconomicIndicator;
    } = {};

    if (access.hasEconomicContext) {
      console.log('DataOrchestrator: Fetching economic indicators...');
      context.economicIndicators = await this.fredProvider.getEconomicIndicators();
      console.log('DataOrchestrator: Economic indicators fetched:', context.economicIndicators);
    }

    console.log('DataOrchestrator: Returning context:', context);
    return context;
  }

  async getSearchContext(query: string, tier: UserTier): Promise<SearchContext | null> {
    return this.getSearchContextForQueries([
      { query, purpose: 'other', freshness: null },
    ], tier);
  }

  /** Retrieve a validated semantic query plan, caching each standalone query independently. */
  async getSearchContextForQueries(
    queries: readonly PlannedSearchQuery[],
    tier: UserTier,
    // A plan whose every query failed returns null, so the record of what was
    // attempted is handed back separately rather than lost with the context.
    options: { onQueryOutcomes?: (outcomes: SearchQueryEvidence[]) => void } = {}
  ): Promise<SearchContext | null> {
    console.log('DataOrchestrator: getSearchContextForQueries called with queries:', queries, 'tier:', tier);

    const tierAccess = this.getTierAccess(tier);
    console.log('DataOrchestrator: Tier access hasSearchContext:', tierAccess.hasSearchContext);

    if (!tierAccess.hasSearchContext) {
      console.log('DataOrchestrator: No search context access for tier:', tier);
      return null;
    }

    if (queries.length === 0) return null;

    const contexts: SearchContext[] = [];
    const queryOutcomes: SearchQueryEvidence[] = [];
    let cacheHits = 0;
    let providerCalls = 0;
    const asEvidence = (results: readonly SearchResult[]): SearchResultEvidence[] => results.map((result) => ({
      title: result.title,
      url: result.url,
      source: result.source,
      snippet: result.snippet,
      ...(result.age ? { age: result.age } : {}),
      ...(result.publishedAt ? { publishedAt: result.publishedAt } : {}),
    }));
    for (const request of queries) {
      // Search evidence is public and provider output is tier-independent. The
      // access check above still gates retrieval, while one identical provider
      // request can be reused by Standard and Premium users.
      const cacheKey = `search_${this.hashSearchRequest(request)}`;
      const cached = this.searchCache.get(cacheKey);
      if (cached && this.isSearchFresh(cached.lastUpdate)) {
        console.log('DataOrchestrator: Using cached search results for query:', request.query);
        cacheHits += 1;
        contexts.push(cached);
        queryOutcomes.push({
          ...request,
          source: 'cache',
          status: 'succeeded',
          resultCount: cached.results.length,
          results: asEvidence(cached.results),
        });
        continue;
      }

      console.log('DataOrchestrator: Performing new search for query:', request.query);
      providerCalls += 1;
      try {
        const results = await this.searchProvider.search(request.query, {
          freshness: request.freshness ?? undefined,
        });
        console.log('DataOrchestrator: Search completed, found', results.length, 'results');
        const context: SearchContext = {
          query: request.query,
          queries: [{ ...request }],
          results,
          summary: await this.generateSearchSummary(results, request.query),
          lastUpdate: new Date(),
          cacheHits: 0,
          providerCalls: 1,
        };
        this.searchCache.set(cacheKey, context);
        contexts.push(context);
        queryOutcomes.push({
          ...request,
          source: 'provider',
          status: 'succeeded',
          resultCount: results.length,
          results: asEvidence(results),
        });
      } catch (error) {
        // Keep successful sibling queries. Returning null for the whole plan
        // would discard usable public evidence when only one Brave call fails.
        console.error('DataOrchestrator: Failed to get search context for query:', request.query, error);
        queryOutcomes.push({
          ...request,
          source: 'provider',
          status: 'failed',
          resultCount: 0,
          error: error instanceof Error ? error.message : String(error),
          results: [],
        });
      }
    }

    options.onQueryOutcomes?.(queryOutcomes);
    if (contexts.length === 0) return null;

    const resultsByUrl = new Map<string, SearchResult>();
    for (const context of contexts) {
      for (const result of context.results) {
        if (!resultsByUrl.has(result.url)) resultsByUrl.set(result.url, result);
      }
    }
    return {
      query: contexts.map((context) => context.query).join(' | '),
      queries: contexts.flatMap((context) => context.queries),
      results: Array.from(resultsByUrl.values()),
      summary: contexts.map((context) => context.summary).join('\n\n'),
      lastUpdate: new Date(),
      cacheHits,
      providerCalls,
      queryOutcomes,
    };
  }

  private hashSearchRequest(request: PlannedSearchQuery): string {
    return createHash('sha256').update(JSON.stringify({
      provider: this.searchProviderType,
      query: request.query.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US'),
      freshness: request.freshness,
      country: 'US',
      searchLanguage: 'en',
      maxResults: 10,
    })).digest('hex');
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
      return `• ${result.title}: ${cleanSnippet} (Source: ${result.source}; ${result.url})`;
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
      await this.refreshMarketContext(tier);
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
