import { SearchProvider } from '../data/providers/search';
import { FREDProvider, FRED_ECONOMIC_SERIES } from '../data/providers/fred';
import {
  MassiveDailyBar,
  MassiveInflationExpectation,
  MassiveProvider,
  MassiveTreasuryYield,
} from '../data/providers/massive';

export interface MarketNewsSource {
  id: string;
  name: string;
  enabled: boolean;
}

export interface MarketNewsData {
  source: string;
  timestamp: Date;
  data: Record<string, unknown>;
  type: 'economic_indicator' | 'market_data' | 'news_article' | 'rate_information';
  relevance: number; // 0-1, how relevant to current market conditions
}

export class MarketNewsAggregator {
  private sources: Map<string, MarketNewsSource> = new Map();
  private searchProvider: SearchProvider;
  private fredProvider: FREDProvider;
  private massiveProvider: MassiveProvider | null;
  
  constructor() {
    this.initializeSources();
    this.searchProvider = new SearchProvider(process.env.SEARCH_API_KEY || '', 'brave');
    const fredApiKey = process.env.NODE_ENV === 'test' || process.env.GITHUB_ACTIONS
      ? 'test_fred_key'
      : process.env.FRED_API_KEY || '';
    this.fredProvider = new FREDProvider(fredApiKey);
    const massiveApiKey = this.getMassiveApiKey();
    this.massiveProvider = massiveApiKey ? new MassiveProvider(massiveApiKey) : null;
  }
  
  private initializeSources() {
    // Premium tier sources (Massive, formerly Polygon.io - highest priority)
    this.sources.set('massive', {
      id: 'massive',
      name: 'Massive Financial Data',
      enabled: !!this.getMassiveApiKey()
    });
    
    // Standard tier sources (FRED + Brave Search)
    this.sources.set('fred', {
      id: 'fred',
      name: 'Federal Reserve Economic Data',
      enabled: true
    });
    
    this.sources.set('brave_search', {
      id: 'brave_search',
      name: 'Brave Search Financial News',
      enabled: true
    });
    
  }
  
  private getMassiveApiKey(): string | undefined {
    return process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
  }
  
  async aggregateMarketData(): Promise<MarketNewsData[]> {
    const allData: MarketNewsData[] = [];
    
    // Sources are independent. Each provider handles partial endpoint failures,
    // so collect them concurrently to keep a refresh from accumulating latency.
    const enabledSourceIds = [...this.sources.values()]
      .filter(source => source.enabled)
      .map(source => source.id);
    const sourceResults = await Promise.allSettled(
      enabledSourceIds.map(sourceId => this.fetchFromSource(sourceId)),
    );

    sourceResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allData.push(...result.value);
      } else {
        console.error(`Error fetching from ${enabledSourceIds[index]}:`, result.reason);
      }
    });
    
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
      case 'massive':
        return this.fetchMassiveData(); // Premium tier only
      default:
        return [];
    }
  }
  
  private async fetchFREDData(): Promise<MarketNewsData[]> {
    try {
      const indicators = await this.fredProvider.getEconomicIndicators();
      const configuredSeries = Object.entries(FRED_ECONOMIC_SERIES) as Array<
        [keyof typeof FRED_ECONOMIC_SERIES, (typeof FRED_ECONOMIC_SERIES)[keyof typeof FRED_ECONOMIC_SERIES]]
      >;

      return configuredSeries.flatMap(([key, config]) => {
        const point = indicators[key];
        if (!point) return [];

        return [{
          source: 'fred',
          timestamp: new Date(point.date),
          data: {
            series: config.seriesId,
            name: config.name,
            value: point.value,
            date: point.date,
            unit: point.unit,
            transformation: point.transformation,
          },
          type: 'economic_indicator' as const,
          relevance: this.calculateEconomicRelevance(config.seriesId, point.value),
        }];
      });
    } catch (error) {
      console.error('Error fetching FRED data:', error);
      return [];
    }
  }
  
  private async fetchBraveSearchData(): Promise<MarketNewsData[]> {
    try {
      // Search for current financial news and market trends
      const searchQueries = [
        'current US mortgage rates',
        'Federal Reserve interest rate latest',
        'US inflation latest',
        'US stock market trends',
        'US economic indicators latest',
        'US labor market latest'
      ];
      
      const searchData: MarketNewsData[] = [];
      
      for (const query of searchQueries) {
        try {
          const results = await this.searchProvider.search(query, {
            maxResults: 3,
            freshness: 'pd'
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
  
  private async fetchMassiveData(): Promise<MarketNewsData[]> {
    if (!this.massiveProvider) return [];

    const to = new Date();
    const from = new Date(to.getTime() - 10 * 24 * 60 * 60 * 1000);
    const [barsResult, treasuryResult, expectationsResult] = await Promise.allSettled([
      this.massiveProvider.getDailyBars('SPY', this.toDateString(from), this.toDateString(to)),
      this.massiveProvider.getLatestTreasuryYields(),
      this.massiveProvider.getLatestInflationExpectations(),
    ] as const);

    const massiveData: MarketNewsData[] = [];

    if (barsResult.status === 'fulfilled') {
      const marketPoint = this.normalizeMassiveDailyBars(barsResult.value.results, barsResult.value.status);
      if (marketPoint) massiveData.push(marketPoint);
    } else {
      console.error('Error fetching Massive SPY daily bars:', barsResult.reason);
    }

    if (treasuryResult.status === 'fulfilled') {
      const treasuryPoint = this.normalizeMassiveTreasuryYields(treasuryResult.value.results?.[0]);
      if (treasuryPoint) massiveData.push(treasuryPoint);
    } else {
      console.error('Error fetching Massive Treasury yields:', treasuryResult.reason);
    }

    if (expectationsResult.status === 'fulfilled') {
      const expectationsPoint = this.normalizeMassiveInflationExpectations(
        expectationsResult.value.results?.[0],
      );
      if (expectationsPoint) massiveData.push(expectationsPoint);
    } else {
      console.error('Error fetching Massive inflation expectations:', expectationsResult.reason);
    }

    return massiveData;
  }

  private normalizeMassiveDailyBars(
    results: MassiveDailyBar[] | undefined,
    feedStatus: string | undefined,
  ): MarketNewsData | null {
    const bars = (results ?? [])
      .filter((bar): bar is MassiveDailyBar & { c: number; t: number } =>
        this.isFiniteNumber(bar.c) && this.isFiniteNumber(bar.t),
      )
      .sort((a, b) => b.t - a.t);

    if (bars.length < 2 || bars[1].c === 0) return null;

    const [latest, previous] = bars;
    const change = latest.c - previous.c;
    const changePercent = (change / previous.c) * 100;
    const timestamp = new Date(latest.t);
    if (Number.isNaN(timestamp.getTime())) return null;

    return {
      source: 'massive',
      timestamp,
      data: {
        symbol: 'SPY',
        priceType: 'adjusted_daily_close',
        closingPrice: latest.c,
        change,
        changePercent,
        date: this.toDateString(timestamp),
        ...(this.isFiniteNumber(latest.v) && { volume: latest.v }),
        ...(this.isFiniteNumber(latest.h) && { high: latest.h }),
        ...(this.isFiniteNumber(latest.l) && { low: latest.l }),
        ...(feedStatus && { feedStatus }),
        marketContext: 'S&P 500 ETF - broad U.S. equity-market movement',
      },
      type: 'market_data',
      relevance: this.calculateMarketRelevance(changePercent),
    };
  }

  private normalizeMassiveTreasuryYields(
    result: MassiveTreasuryYield | undefined,
  ): MarketNewsData | null {
    const timestamp = this.observationTimestamp(result?.date);
    if (!result || !timestamp) return null;

    const yields = this.compactNumbers({
      '1_month': result.yield_1_month,
      '3_month': result.yield_3_month,
      '1_year': result.yield_1_year,
      '2_year': result.yield_2_year,
      '3_year': result.yield_3_year,
      '5_year': result.yield_5_year,
      '10_year': result.yield_10_year,
      '20_year': result.yield_20_year,
      '30_year': result.yield_30_year,
    });
    if (Object.keys(yields).length === 0) return null;

    return {
      source: 'massive',
      timestamp,
      data: {
        symbol: 'TREASURY_YIELDS',
        date: result.date,
        yields,
        yieldType: 'U.S. Treasury yield curve',
      },
      type: 'rate_information',
      relevance: 0.9,
    };
  }

  private normalizeMassiveInflationExpectations(
    result: MassiveInflationExpectation | undefined,
  ): MarketNewsData | null {
    const timestamp = this.observationTimestamp(result?.date);
    if (!result || !timestamp) return null;

    const expectations = this.compactNumbers({
      model_1_year: result.model_1_year,
      model_5_year: result.model_5_year,
      model_10_year: result.model_10_year,
      model_30_year: result.model_30_year,
      market_5_year: result.market_5_year,
      market_10_year: result.market_10_year,
      forward_years_5_to_10: result.forward_years_5_to_10,
    });
    if (Object.keys(expectations).length === 0) return null;

    return {
      source: 'massive',
      timestamp,
      data: {
        symbol: 'INFLATION_EXPECTATIONS',
        date: result.date,
        expectations,
        expectationsType: 'Inflation expectations',
      },
      type: 'economic_indicator',
      relevance: 0.9,
    };
  }

  private compactNumbers(values: Record<string, number | undefined>): Record<string, number> {
    return Object.fromEntries(
      Object.entries(values).filter((entry): entry is [string, number] => this.isFiniteNumber(entry[1])),
    );
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private observationTimestamp(date: string | undefined): Date | null {
    if (!date) return null;
    const timestamp = new Date(`${date}T00:00:00Z`);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp;
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
  
  private calculateEconomicRelevance(series: string, value: number): number {
    // Higher relevance for key economic indicators
    const keyIndicators = ['CPIAUCSL', 'DFF', 'FEDFUNDS', 'MORTGAGE30US', 'DGS10'];
    const baseRelevance = keyIndicators.includes(series) ? 0.8 : 0.6;
    
    // Adjust relevance based on value significance
    if (['DFF', 'FEDFUNDS'].includes(series) && value > 5) return 1.0; // High rates are very relevant
    if (series === 'CPIAUCSL' && value > 3) return 0.9; // Elevated YoY inflation is relevant
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

  private calculateMarketRelevance(changePercent: number): number {
    // Broad-market movement is always useful context; large moves rank higher.
    const absChange = Math.abs(changePercent || 0);
    return Math.min(1, 0.7 + absChange / 10);
  }
}
