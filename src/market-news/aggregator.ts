import { UserTier } from '../data/types';
import { SearchProvider } from '../data/providers/search';

export interface MarketNewsSource {
  id: string;
  name: string;
  priority: number; // Higher priority sources are processed first
  enabled: boolean;
}

export interface MarketNewsData {
  source: string;
  timestamp: Date;
  data: any;
  type: 'economic_indicator' | 'market_data' | 'news_article' | 'rate_information';
  relevance: number; // 0-1, how relevant to current market conditions
}

// Global rate limiter for Brave Search API calls
class BraveSearchRateLimiter {
  private static instance: BraveSearchRateLimiter;
  private lastCallTime: number = 0;
  private readonly MIN_INTERVAL = 1100; // 1.1 seconds between calls

  static getInstance(): BraveSearchRateLimiter {
    if (!BraveSearchRateLimiter.instance) {
      BraveSearchRateLimiter.instance = new BraveSearchRateLimiter();
    }
    return BraveSearchRateLimiter.instance;
  }

  async waitForNextCall(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    
    if (timeSinceLastCall < this.MIN_INTERVAL) {
      const waitTime = this.MIN_INTERVAL - timeSinceLastCall;
      console.log(`BraveSearchRateLimiter: Waiting ${waitTime}ms before next API call`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastCallTime = Date.now();
  }
}

export class MarketNewsAggregator {
  private sources: Map<string, MarketNewsSource> = new Map();
  private dataCache: Map<string, MarketNewsData[]> = new Map();
  private searchProvider: SearchProvider;
  private rateLimiter: BraveSearchRateLimiter;
  
  constructor() {
    this.initializeSources();
    this.searchProvider = new SearchProvider(process.env.SEARCH_API_KEY || '', 'brave');
    this.rateLimiter = BraveSearchRateLimiter.getInstance();
  }
  
  private initializeSources() {
    // Standard tier sources (FRED + Brave Search)
    this.sources.set('fred', {
      id: 'fred',
      name: 'Federal Reserve Economic Data',
      priority: 1, // Standard tier
      enabled: true
    });
    
    this.sources.set('brave_search', {
      id: 'brave_search',
      name: 'Brave Search Financial News',
      priority: 2, // Standard tier
      enabled: true
    });
    
    // Fallback sources (if needed)
    this.sources.set('alpha_vantage', {
      id: 'alpha_vantage', 
      name: 'Alpha Vantage Market Data',
      priority: 3, // Fallback only
      enabled: false // Disabled by default
    });
  }
  
  async aggregateMarketData(): Promise<MarketNewsData[]> {
    const allData: MarketNewsData[] = [];
    
    // Aggregate from all enabled sources
    for (const [sourceId, source] of this.sources) {
      if (!source.enabled) continue;
      
      try {
        const sourceData = await this.fetchFromSource(sourceId);
        allData.push(...sourceData);
      } catch (error) {
        console.error(`Error fetching from ${sourceId}:`, error);
      }
    }
    
    // Sort by relevance and timestamp
    return allData.sort((a, b) => {
      if (a.relevance !== b.relevance) {
        return b.relevance - a.relevance;
      }
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
  }
  
  private async fetchFromSource(sourceId: string): Promise<MarketNewsData[]> {
    switch (sourceId) {
      case 'fred':
        return this.fetchFREDData();
      case 'brave_search':
        return this.fetchBraveSearchData();
      case 'alpha_vantage':
        return this.fetchAlphaVantageData(); // Fallback only
      default:
        return [];
    }
  }
  
  private async fetchFREDData(): Promise<MarketNewsData[]> {
    try {
      // Fetch key economic indicators from FRED
      const indicators = [
        { series: 'CPIAUCSL', name: 'Consumer Price Index' },
        { series: 'FEDFUNDS', name: 'Federal Funds Rate' },
        { series: 'MORTGAGE30US', name: '30-Year Fixed Rate Mortgage' },
        { series: 'DGS10', name: '10-Year Treasury Rate' }
      ];
      
      const fredData: MarketNewsData[] = [];
      
      for (const indicator of indicators) {
        try {
          const response = await fetch(
            `https://api.stlouisfed.org/fred/series/observations?series_id=${indicator.series}&api_key=${process.env.FRED_API_KEY}&file_type=json&limit=1&sort_order=desc`
          );
          
          if (!response.ok) {
            console.error(`FRED API error for ${indicator.series}:`, response.status);
            continue;
          }
          
          const data = await response.json();
          const latestObservation = data.observations?.[0];
          
          if (latestObservation && latestObservation.value !== '.') {
            fredData.push({
              source: 'fred',
              timestamp: new Date(latestObservation.date),
              data: {
                series: indicator.series,
                name: indicator.name,
                value: parseFloat(latestObservation.value),
                date: latestObservation.date
              },
              type: 'economic_indicator',
              relevance: this.calculateEconomicRelevance(indicator.series, parseFloat(latestObservation.value))
            });
          }
        } catch (error) {
          console.error(`Error fetching FRED data for ${indicator.series}:`, error);
        }
      }
      
      return fredData;
    } catch (error) {
      console.error('Error fetching FRED data:', error);
      return [];
    }
  }
  
  private async fetchBraveSearchData(): Promise<MarketNewsData[]> {
    try {
      // Search for current financial news and market trends
      const searchQueries = [
        'current mortgage rates 2025',
        'federal reserve interest rate today',
        'inflation rate latest news',
        'stock market trends today',
        'economic indicators latest'
      ];
      
      const searchData: MarketNewsData[] = [];
      
      for (const query of searchQueries) {
        try {
          // Use global rate limiter to prevent concurrent API calls
          await this.rateLimiter.waitForNextCall();
          
          const results = await this.searchProvider.search(query, {
            maxResults: 3,
            timeRange: 'day'
          });
          
          for (const result of results) {
            searchData.push({
              source: 'brave_search',
              timestamp: new Date(),
              data: {
                title: result.title,
                description: result.snippet,
                url: result.url,
                query: query
              },
              type: 'news_article',
              relevance: this.calculateNewsRelevance(result.title, result.snippet, query)
            });
          }
        } catch (error) {
          console.error(`Error fetching Brave Search data for query "${query}":`, error);
        }
      }
      
      return searchData;
    } catch (error) {
      console.error('Error fetching Brave Search data:', error);
      return [];
    }
  }
  
  private async fetchAlphaVantageData(): Promise<MarketNewsData[]> {
    // This is a fallback source, not used for Starter/Standard tiers
    return [];
  }
  
  private calculateEconomicRelevance(series: string, value: number): number {
    // Higher relevance for key economic indicators
    const keyIndicators = ['CPIAUCSL', 'FEDFUNDS', 'MORTGAGE30US'];
    const baseRelevance = keyIndicators.includes(series) ? 0.8 : 0.6;
    
    // Adjust relevance based on value significance
    if (series === 'FEDFUNDS' && value > 5) return 1.0; // High rates are very relevant
    if (series === 'CPIAUCSL' && value > 300) return 0.9; // High inflation is relevant
    if (series === 'MORTGAGE30US' && value > 7) return 0.9; // High mortgage rates are relevant
    
    return baseRelevance;
  }
  
  private calculateNewsRelevance(title: string, description: string, query: string): number {
    // Calculate relevance based on keywords, content, and query match
    const financialKeywords = ['earnings', 'revenue', 'profit', 'loss', 'market', 'economy', 'inflation', 'interest', 'rate', 'fed', 'trading'];
    const keywordMatches = financialKeywords.filter(keyword => 
      title.toLowerCase().includes(keyword) || description.toLowerCase().includes(keyword)
    ).length;
    
    const keywordScore = keywordMatches / financialKeywords.length;
    const queryMatchScore = title.toLowerCase().includes(query.toLowerCase()) ? 0.3 : 0;
    
    return Math.min(1, keywordScore * 0.7 + queryMatchScore);
  }
}
