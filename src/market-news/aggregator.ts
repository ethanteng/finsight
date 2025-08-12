import { UserTier } from '../data/types';
import { SearchProvider } from '../data/providers/search';

// Polygon.io client will be initialized in constructor
let restClient: any = null;

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

// Polygon.io rate limiter for Premium tier
class PolygonRateLimiter {
  private static instance: PolygonRateLimiter;
  private callCount: number = 0;
  private lastReset: number = Date.now();
  private readonly limit: number = 5; // Free tier: 5 calls/minute
  private readonly window: number = 60000; // 1 minute

  static getInstance(): PolygonRateLimiter {
    if (!PolygonRateLimiter.instance) {
      PolygonRateLimiter.instance = new PolygonRateLimiter();
    }
    return PolygonRateLimiter.instance;
  }

  async checkRateLimit(): Promise<boolean> {
    const now = Date.now();
    
    // Reset counter if window has passed
    if (now - this.lastReset > this.window) {
      this.callCount = 0;
      this.lastReset = now;
    }
    
    if (this.callCount >= this.limit) {
      console.warn('Polygon API rate limit reached');
      return false;
    }
    
    this.callCount++;
    return true;
  }
}

export class MarketNewsAggregator {
  private sources: Map<string, MarketNewsSource> = new Map();
  private dataCache: Map<string, MarketNewsData[]> = new Map();
  private searchProvider: SearchProvider;
  private rateLimiter: BraveSearchRateLimiter;
  private polygonRateLimiter: PolygonRateLimiter;
  private polygonClient: any;
  
  constructor() {
    this.initializeSources();
    this.searchProvider = new SearchProvider(process.env.SEARCH_API_KEY || '', 'brave');
    this.rateLimiter = BraveSearchRateLimiter.getInstance();
    this.polygonRateLimiter = PolygonRateLimiter.getInstance();
  }
  
  private async initializePolygonClient() {
    if (this.polygonClient) {
      return; // Already initialized
    }
    
    try {
      const polygonApiKey = this.getPolygonApiKey();
      console.log('Polygon API key found:', !!polygonApiKey);
      if (polygonApiKey) {
        console.log('Initializing Polygon.io client...');
        
        // Use direct HTTP client with rate limiting
        this.polygonClient = {
          apiKey: polygonApiKey,
          baseUrl: 'https://api.polygon.io',
          lastCallTime: 0,
          callCount: 0,
          maxCallsPerMinute: 5, // Free tier limit
          
          // Rate limiting helper
          async checkRateLimit() {
            const now = Date.now();
            const timeSinceLastCall = now - this.lastCallTime;
            
            // Reset counter if more than 1 minute has passed
            if (timeSinceLastCall > 60000) {
              this.callCount = 0;
            }
            
            // Check if we're at the rate limit
            if (this.callCount >= this.maxCallsPerMinute) {
              const waitTime = 60000 - timeSinceLastCall;
              console.log(`Polygon API rate limit reached. Waiting ${waitTime}ms...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              this.callCount = 0;
            }
            
            this.lastCallTime = now;
            this.callCount++;
          },
          
          // Direct HTTP method for stock aggregates with rate limiting
          async getStocksAggregates(ticker: string, multiplier: number, timespan: string, from: string, to: string) {
            await this.checkRateLimit();
            
            const url = `${this.baseUrl}/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?apiKey=${this.apiKey}`;
            const response = await fetch(url);
            
            if (!response.ok) {
              if (response.status === 429) {
                console.log('Polygon API rate limit hit, waiting 60 seconds...');
                await new Promise(resolve => setTimeout(resolve, 60000));
                return this.getStocksAggregates(ticker, multiplier, timespan, from, to);
              }
              throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
          },
          
          // Direct HTTP method for treasury yields
          async getFedV1TreasuryYields(params: { limit?: string; sort?: string } = {}) {
            await this.checkRateLimit();
            
            const queryParams = new URLSearchParams({
              apiKey: this.apiKey,
              ...(params.limit && { limit: params.limit }),
              ...(params.sort && { sort: params.sort })
            });
            
            const url = `${this.baseUrl}/fed/v1/treasury-yields?${queryParams}`;
            const response = await fetch(url);
            
            if (!response.ok) {
              if (response.status === 429) {
                console.log('Polygon API rate limit hit, waiting 60 seconds...');
                await new Promise(resolve => setTimeout(resolve, 60000));
                return this.getFedV1TreasuryYields(params);
              }
              throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
          },

          // Direct HTTP method for inflation data
          async getFedV1Inflation(params: { limit?: string; sort?: string } = {}) {
            await this.checkRateLimit();
            
            const queryParams = new URLSearchParams({
              apiKey: this.apiKey,
              ...(params.limit && { limit: params.limit }),
              ...(params.sort && { sort: params.sort })
            });
            
            const url = `${this.baseUrl}/fed/v1/inflation?${queryParams}`;
            const response = await fetch(url);
            
            if (!response.ok) {
              if (response.status === 429) {
                console.log('Polygon API rate limit hit, waiting 60 seconds...');
                await new Promise(resolve => setTimeout(resolve, 60000));
                return this.getFedV1Inflation(params);
              }
              throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
          },

          // Direct HTTP method for inflation expectations
          async getFedV1InflationExpectations(params: { limit?: string; sort?: string } = {}) {
            await this.checkRateLimit();
            
            const queryParams = new URLSearchParams({
              apiKey: this.apiKey,
              ...(params.limit && { limit: params.limit }),
              ...(params.sort && { sort: params.sort })
            });
            
            const url = `${this.baseUrl}/fed/v1/inflation-expectations?${queryParams}`;
            const response = await fetch(url);
            
            if (!response.ok) {
              if (response.status === 429) {
                console.log('Polygon API rate limit hit, waiting 60 seconds...');
                await new Promise(resolve => setTimeout(resolve, 60000));
                return this.getFedV1InflationExpectations(params);
              }
              throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
          }
        };
        
        console.log('Polygon.io client initialized successfully (direct HTTP with rate limiting)');
      } else {
        console.log('No Polygon API key found');
      }
    } catch (error) {
      console.warn('Polygon.io client not available:', (error as Error).message);
      this.polygonClient = null;
    }
  }
  
  private initializeSources() {
    // Premium tier sources (Polygon.io - highest priority)
    this.sources.set('polygon', {
      id: 'polygon',
      name: 'Polygon.io Financial Data',
      priority: 1, // Premium tier only
      enabled: !!this.getPolygonApiKey()
    });
    
    // Standard tier sources (FRED + Brave Search)
    this.sources.set('fred', {
      id: 'fred',
      name: 'Federal Reserve Economic Data',
      priority: 2, // Standard tier
      enabled: true
    });
    
    this.sources.set('brave_search', {
      id: 'brave_search',
      name: 'Brave Search Financial News',
      priority: 3, // Standard tier
      enabled: true
    });
    
    // Fallback sources (if needed)
    this.sources.set('alpha_vantage', {
      id: 'alpha_vantage', 
      name: 'Alpha Vantage Market Data',
      priority: 4, // Fallback only
      enabled: false // Disabled by default
    });
  }
  
  private getPolygonApiKey(): string | undefined {
    // In test environment or CI/CD, use the fake key
    if (process.env.NODE_ENV === 'test' || process.env.GITHUB_ACTIONS) {
      return process.env.POLYGON_API_KEY; // Fake key for tests and CI/CD
    }
    
    // In production (Render), use the real key
    if (process.env.NODE_ENV === 'production' && !process.env.GITHUB_ACTIONS) {
      return process.env.POLYGON_API_KEY; // Real key for Render
    }
    
    // In development (localhost), use the real key
    return process.env.POLYGON_API_KEY; // Real key for localhost
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
      case 'polygon':
        return this.fetchPolygonData(); // Premium tier only
      case 'alpha_vantage':
        return this.fetchAlphaVantageData(); // Fallback only
      default:
        return [];
    }
  }
  
  private async fetchFREDData(): Promise<MarketNewsData[]> {
    try {
      // Skip real API calls in test environment or CI/CD
      if (process.env.NODE_ENV === 'test' || process.env.GITHUB_ACTIONS) {
        console.log('MarketNewsAggregator: Using mock data for FRED in test/CI environment');
        return [
          {
            source: 'fred',
            timestamp: new Date(),
            data: {
              series: 'CPIAUCSL',
              name: 'Consumer Price Index',
              value: 3.1,
              date: '2024-01'
            },
            type: 'economic_indicator',
            relevance: 0.8
          }
        ];
      }
      
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
  
  private async fetchPolygonData(): Promise<MarketNewsData[]> {
    // Initialize Polygon.io client if not already done
    if (!this.polygonClient) {
      await this.initializePolygonClient();
    }
    
    if (!this.polygonClient) {
      console.warn('Polygon.io client not initialized. Cannot fetch data.');
      return [];
    }

    try {
      // Check rate limit
      if (!await this.polygonRateLimiter.checkRateLimit()) {
        return [];
      }

      const polygonData: MarketNewsData[] = [];

      // 1. Market Sentiment - Key indices for "How's the market doing?" (reduced to avoid rate limits)
      const marketIndices = ['SPY']; // Focus on S&P 500 as primary market indicator
      for (const ticker of marketIndices) {
        try {
          // Use the correct API method
          const response = await this.polygonClient.getStocksAggregates(
            ticker, 1, 'day',
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days ago
            new Date().toISOString().split('T')[0] // today
          );

          if (response.results && response.results.length > 0) {
            const latest = response.results[response.results.length - 1];
            const previous = response.results[response.results.length - 2];

            polygonData.push({
              source: 'polygon',
              timestamp: new Date(),
              data: {
                symbol: ticker,
                currentPrice: latest.c,
                change: latest.c - previous.c,
                changePercent: ((latest.c - previous.c) / previous.c) * 100,
                volume: latest.v,
                high: latest.h,
                low: latest.l,
                marketContext: this.getMarketContext(ticker)
              },
              type: 'market_data',
              relevance: this.calculateMarketRelevance(ticker, ((latest.c - previous.c) / previous.c) * 100)
            });
          }
        } catch (error) {
          console.error(`Error fetching Polygon data for ${ticker}:`, error);
        }
      }

      // 2. Treasury Yields - Rate planning for retirement and CDs
      try {
        console.log('Fetching treasury yield data from Polygon.io...');
        const treasuryData = await this.polygonClient.getFedV1TreasuryYields({
          limit: '1',
          sort: 'date.desc'
        });
        
        if (treasuryData.results && treasuryData.results.length > 0) {
          const latest = treasuryData.results[0];
          polygonData.push({
            source: 'polygon',
            timestamp: new Date(),
            data: {
              symbol: 'TREASURY_YIELDS',
              yields: {
                '1_year': latest.yield_1_year,
                '5_year': latest.yield_5_year,
                '10_year': latest.yield_10_year
              },
              yieldType: 'Treasury Yields',
              rateContext: this.getTreasuryRateContext(latest)
            },
            type: 'rate_information',
            relevance: 0.9 // High relevance for rate-sensitive advice
          });
                }
      } catch (error) {
        console.log('Error fetching treasury yield data:', (error as Error).message);
        // Continue with other data sources instead of failing completely
      }

      // 3. Inflation Data - Key economic indicators for monetary policy analysis
      try {
        console.log('Fetching inflation data from Polygon.io...');
        const inflationData = await this.polygonClient.getFedV1Inflation({
          limit: '1',
          sort: 'date.desc'
        });
        
        if (inflationData.results && inflationData.results.length > 0) {
          const latest = inflationData.results[0];
          polygonData.push({
            source: 'polygon',
            timestamp: new Date(),
            data: {
              symbol: 'INFLATION_DATA',
              cpi: latest.cpi,
              cpi_core: latest.cpi_core,
              cpi_year_over_year: latest.cpi_year_over_year,
              pce: latest.pce,
              pce_core: latest.pce_core,
              pce_spending: latest.pce_spending,
              date: latest.date,
              inflationType: 'Realized Inflation',
              inflationContext: this.getInflationContext(latest)
            },
            type: 'economic_indicator',
            relevance: 0.95 // Very high relevance for economic analysis
          });
        }
      } catch (error) {
        console.log('Error fetching inflation data:', (error as Error).message);
        // Continue with other data sources instead of failing completely
      }

      // 4. Inflation Expectations - Market and model-based forecasts
      try {
        console.log('Fetching inflation expectations from Polygon.io...');
        const expectationsData = await this.polygonClient.getFedV1InflationExpectations({
          limit: '1',
          sort: 'date.desc'
        });
        
        if (expectationsData.results && expectationsData.results.length > 0) {
          const latest = expectationsData.results[0];
          polygonData.push({
            source: 'polygon',
            timestamp: new Date(),
            data: {
              symbol: 'INFLATION_EXPECTATIONS',
              model_1_year: latest.model_1_year,
              model_5_year: latest.model_5_year,
              model_10_year: latest.model_10_year,
              model_30_year: latest.model_30_year,
              market_5_year: latest.market_5_year,
              market_10_year: latest.market_10_year,
              forward_years_5_to_10: latest.forward_years_5_to_10,
              date: latest.date,
              expectationsType: 'Inflation Expectations',
              expectationsContext: this.getInflationExpectationsContext(latest)
            },
            type: 'economic_indicator',
            relevance: 0.9 // High relevance for economic forecasting
          });
        }
      } catch (error) {
        console.log('Error fetching inflation expectations:', (error as Error).message);
        // Continue with other data sources instead of failing completely
      }
      
      // 5. News for market context - "Why did SPY drop 2%?"
      // Note: News API not available in current Polygon.io client version
      // Using Brave Search for news instead
      try {
        console.log('Polygon.io news API not available, using Brave Search for news');
        // News will be fetched via Brave Search in fetchBraveSearchData()
      } catch (error) {
        console.error('Error with news fetching:', error);
      }

      return polygonData;
    } catch (error) {
      console.error('Error fetching Polygon.io data:', error);
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
    // Calculate relevance based on keywords, sentiment, and recency
    const financialKeywords = ['earnings', 'revenue', 'profit', 'loss', 'market', 'economy', 'inflation', 'interest', 'rate', 'fed', 'trading'];
    const keywordMatches = financialKeywords.filter(keyword => 
      title.toLowerCase().includes(keyword) || description.toLowerCase().includes(keyword)
    ).length;
    
    const keywordScore = keywordMatches / financialKeywords.length;
    const queryMatchScore = query ? (title.toLowerCase().includes(query.toLowerCase()) ? 0.3 : 0) : 0;
    
    return Math.min(1, keywordScore * 0.7 + queryMatchScore);
  }

  private calculateMarketRelevance(symbol: string, changePercent: number): number {
    // Higher relevance for significant market movements
    const absChange = Math.abs(changePercent || 0);
    return Math.min(1, absChange / 10); // Normalize to 0-1 scale
  }

  // Helper methods for context
  private getMarketContext(ticker: string): string {
    const contexts: { [key: string]: string } = {
      'SPY': 'S&P 500 - broad market sentiment',
      'VTI': 'Total US market - overall market health',
      'DIA': 'Dow Jones - blue chip performance'
    };
    return contexts[ticker] || 'market indicator';
  }

  private getYieldType(ticker: string): string {
    const types: { [key: string]: string } = {
      'US1Y': '1-year Treasury yield',
      'US2Y': '2-year Treasury yield', 
      'US10Y': '10-year Treasury yield',
      'US30Y': '30-year Treasury yield'
    };
    return types[ticker] || 'Treasury yield';
  }

  private getRateContext(ticker: string, yieldValue: number): string {
    return `Current ${this.getYieldType(ticker)}: ${yieldValue.toFixed(2)}%. This affects CD rates, mortgage rates, and retirement planning.`;
  }
  
  private getTreasuryRateContext(treasuryData: any): string {
    const yields = treasuryData;
    return `Current Treasury Yields: 1Y: ${yields.yield_1_year?.toFixed(2)}%, 5Y: ${yields.yield_5_year?.toFixed(2)}%, 10Y: ${yields.yield_10_year?.toFixed(2)}%. These affect CD rates, mortgage rates, and retirement planning.`;
  }

  private getInflationContext(inflationData: any): string {
    const data = inflationData;
    return `Current Inflation Data: CPI: ${data.cpi?.toFixed(2)}, Core CPI: ${data.cpi_core?.toFixed(2)}, Year-over-Year: ${data.cpi_year_over_year?.toFixed(2)}%, PCE: ${data.pce?.toFixed(2)}, Core PCE: ${data.pce_core?.toFixed(2)}. This reflects realized inflation and consumer spending patterns.`;
  }

  private getInflationExpectationsContext(expectationsData: any): string {
    const data = expectationsData;
    return `Inflation Expectations: 1Y Model: ${data.model_1_year?.toFixed(2)}%, 5Y Model: ${data.model_5_year?.toFixed(2)}%, 10Y Model: ${data.model_10_year?.toFixed(2)}%, 30Y Model: ${data.model_30_year?.toFixed(2)}%, 5Y Market: ${data.market_5_year?.toFixed(2)}%, 10Y Market: ${data.market_10_year?.toFixed(2)}%. This shows market and model-based inflation forecasts.`;
  }

  private assessMarketImpact(title: string, description: string): string {
    const keywords = ['fed', 'rate', 'earnings', 'inflation', 'recession'];
    const hasMarketKeywords = keywords.some(keyword => 
      title.toLowerCase().includes(keyword) || description.toLowerCase().includes(keyword)
    );
    return hasMarketKeywords ? 'high' : 'medium';
  }
}
