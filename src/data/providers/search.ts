import { SearchResult } from '../orchestrator';

export interface SearchProviderConfig {
  apiKey: string;
  baseUrl: string;
  provider: 'bing' | 'google' | 'brave' | 'serpapi';
  maxResults?: number;
  timeout?: number;
}

export class SearchProvider {
  private config: SearchProviderConfig;
  private readonly DEFAULT_TIMEOUT = 10000;
  private readonly DEFAULT_MAX_RESULTS = 10;

  constructor(apiKey: string, provider: 'bing' | 'google' | 'brave' | 'serpapi' = 'bing') {
    this.config = {
      apiKey,
      baseUrl: this.getBaseUrl(provider),
      provider,
      maxResults: this.DEFAULT_MAX_RESULTS,
      timeout: this.DEFAULT_TIMEOUT
    };
  }

  private getBaseUrl(provider: string): string {
    switch (provider) {
      case 'bing':
        return 'https://api.bing.microsoft.com/v7.0/search';
      case 'google':
        return 'https://www.googleapis.com/customsearch/v1';
      case 'brave':
        return 'https://api.search.brave.com/res/v1/web/search';
      case 'serpapi':
        return 'https://serpapi.com/search';
      default:
        return 'https://api.bing.microsoft.com/v7.0/search';
    }
  }

  async search(query: string, options: {
    maxResults?: number;
    timeRange?: string;
    region?: string;
    language?: string;
  } = {}): Promise<SearchResult[]> {
    console.log('SearchProvider: Starting search for query:', query);
    console.log('SearchProvider: Using provider:', this.config.provider);
    
    const {
      maxResults = this.config.maxResults,
      timeRange = 'day',
      region = 'US',
      language = 'en-US'
    } = options;

    try {
      const results = await this.performSearch(query, {
        maxResults,
        timeRange,
        region,
        language
      });

      console.log('SearchProvider: Raw search results received');
      const formattedResults = this.formatResults(results, query);
      console.log('SearchProvider: Formatted', formattedResults.length, 'results');
      
      return formattedResults;
    } catch (error) {
      console.error('SearchProvider: Search failed:', error);
      return [];
    }
  }

  private async performSearch(query: string, options: any): Promise<any> {
    const { provider } = this.config;
    
    switch (provider) {
      case 'bing':
        return this.bingSearch(query, options);
      case 'google':
        return this.googleSearch(query, options);
      case 'brave':
        return this.braveSearch(query, options);
      case 'serpapi':
        return this.serpapiSearch(query, options);
      default:
        return this.bingSearch(query, options);
    }
  }

  private async bingSearch(query: string, options: any): Promise<any> {
    const params = new URLSearchParams({
      q: query,
      count: options.maxResults?.toString() || '10',
      mkt: options.language || 'en-US',
      freshness: options.timeRange || 'day',
      responseFilter: 'Webpages',
      textFormat: 'Raw',
      safeSearch: 'Moderate'
    });

    const response = await fetch(`${this.config.baseUrl}?${params}`, {
      headers: {
        'Ocp-Apim-Subscription-Key': this.config.apiKey,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(this.config.timeout!)
    });

    if (!response.ok) {
      throw new Error(`Bing search failed: ${response.status}`);
    }

    return response.json();
  }

  private async googleSearch(query: string, options: any): Promise<any> {
    const params = new URLSearchParams({
      key: this.config.apiKey,
      cx: process.env.GOOGLE_SEARCH_ENGINE_ID || '',
      q: query,
      num: options.maxResults?.toString() || '10',
      dateRestrict: options.timeRange || 'd1',
      lr: `lang_${options.language?.split('-')[0] || 'en'}`
    });

    const response = await fetch(`${this.config.baseUrl}?${params}`, {
      signal: AbortSignal.timeout(this.config.timeout!)
    });

    if (!response.ok) {
      throw new Error(`Google search failed: ${response.status}`);
    }

    return response.json();
  }

  private async braveSearch(query: string, options: any): Promise<any> {
    console.log('SearchProvider: Performing Brave search for query:', query);
    console.log('SearchProvider: Brave search URL:', this.config.baseUrl);
    console.log('SearchProvider: API key present:', !!this.config.apiKey);
    
    const params = new URLSearchParams({
      q: query,
      count: options.maxResults?.toString() || '10',
      country: options.region || 'US',
      language: options.language || 'en'
    });

    console.log('SearchProvider: Brave search params:', params.toString());

    const response = await fetch(`${this.config.baseUrl}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': this.config.apiKey,
        'User-Agent': 'Finsight-Financial-App/1.0'
      },
      signal: AbortSignal.timeout(this.config.timeout!)
    });

    console.log('SearchProvider: Brave search response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SearchProvider: Brave search error response:', errorText);
      throw new Error(`Brave search failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('SearchProvider: Brave search response received');
    return result;
  }

  private async serpapiSearch(query: string, options: any): Promise<any> {
    const params = new URLSearchParams({
      api_key: this.config.apiKey,
      q: query,
      num: options.maxResults?.toString() || '10',
      tbs: options.timeRange === 'day' ? 'qdr:d' : 'qdr:w'
    });

    const response = await fetch(`${this.config.baseUrl}?${params}`, {
      signal: AbortSignal.timeout(this.config.timeout!)
    });

    if (!response.ok) {
      throw new Error(`SerpAPI search failed: ${response.status}`);
    }

    return response.json();
  }

  private formatResults(rawResults: any, query: string): SearchResult[] {
    const { provider } = this.config;
    
    switch (provider) {
      case 'bing':
        return this.formatBingResults(rawResults);
      case 'google':
        return this.formatGoogleResults(rawResults);
      case 'brave':
        return this.formatBraveResults(rawResults);
      case 'serpapi':
        return this.formatSerpapiResults(rawResults);
      default:
        return this.formatBingResults(rawResults);
    }
  }

  private formatBingResults(results: any): SearchResult[] {
    if (!results.webPages?.value) {
      return [];
    }

    return results.webPages.value.map((item: any, index: number) => ({
      title: item.name,
      snippet: item.snippet,
      url: item.url,
      source: 'Bing',
      relevance: 1 - (index * 0.1) // Simple relevance scoring
    }));
  }

  private formatGoogleResults(results: any): SearchResult[] {
    if (!results.items) {
      return [];
    }

    return results.items.map((item: any, index: number) => ({
      title: item.title,
      snippet: item.snippet,
      url: item.link,
      source: 'Google',
      relevance: 1 - (index * 0.1)
    }));
  }

  private formatBraveResults(results: any): SearchResult[] {
    if (!results.web?.results) {
      return [];
    }

    return results.web.results.map((item: any, index: number) => ({
      title: item.title,
      snippet: item.description,
      url: item.url,
      source: 'Brave',
      relevance: 1 - (index * 0.1)
    }));
  }

  private formatSerpapiResults(results: any): SearchResult[] {
    if (!results.organic_results) {
      return [];
    }

    return results.organic_results.map((item: any, index: number) => ({
      title: item.title,
      snippet: item.snippet,
      url: item.link,
      source: 'SerpAPI',
      relevance: 1 - (index * 0.1)
    }));
  }

  // Helper method to enhance financial queries
  enhanceFinancialQuery(query: string): string {
    const financialKeywords = [
      'mortgage rates', 'CD rates', 'savings rates', 'investment advice',
      'retirement planning', 'tax strategies', 'budgeting tips',
      'credit card rates', 'loan rates', 'financial planning',
      'auto loan rate', 'personal loan rate', 'student loan rate',
      'home equity rate', 'heloc rate', 'money market rate',
      'investment account rate', 'ira rate', '401k rate', 'annuity rate',
      'tariffs', 'inflation', 'inflation rate', 'unemployment rate'
    ];

    const hasFinancialKeyword = financialKeywords.some(keyword => 
      query.toLowerCase().includes(keyword)
    );

    if (hasFinancialKeyword) {
      return `${query} financial advice 2025`;
    }

    return query;
  }

  // Helper method to filter financial results
  filterFinancialResults(results: SearchResult[]): SearchResult[] {
    const financialDomains = [
      'bankrate.com', 'nerdwallet.com', 'investopedia.com',
      'fool.com', 'morningstar.com', 'yahoo.com/finance',
      'marketwatch.com', 'wsj.com', 'bloomberg.com',
      'reuters.com', 'cnbc.com', 'forbes.com'
    ];

    return results.filter(result => {
      const url = result.url.toLowerCase();
      return financialDomains.some(domain => url.includes(domain));
    });
  }
} 