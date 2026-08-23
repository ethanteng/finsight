import type { SearchResult } from '../orchestrator';
import type { SearchFreshness } from '../search-types';
import {
  discardResponseBody,
  exhaustedWindowResets,
  fetchWithBoundedRetry,
  type BoundedFetchOptions,
  type ProviderRequestInit,
} from './http-retry';

export interface SearchProviderConfig {
  apiKey: string;
  baseUrl: string;
  provider: 'bing' | 'google' | 'brave' | 'serpapi';
  maxResults?: number;
  timeout?: number;
}

export interface SearchProviderOptions {
  maxResults?: number;
  /** Brave freshness code: pd, pw, pm or py. */
  freshness?: SearchFreshness;
  /** Legacy option retained for non-Brave providers and old callers. */
  timeRange?: string;
  region?: string;
  /** Search-result language, for example en. */
  language?: string;
  /** Response-interface language, for example en-US. */
  uiLanguage?: string;
}

interface SearchProviderClientOptions {
  fetchImplementation?: typeof fetch;
  sleep?: BoundedFetchOptions['sleep'];
  requestTimeoutMs?: number;
  maxAttempts?: number;
  maxRetryDelayMs?: number;
  rateLimiter?: {
    waitForNextCall(): Promise<void>;
    observeResponse?(response: Response): void;
  };
}

const DEFAULT_MIN_REQUEST_INTERVAL_MS = 1_100;

function braveMinRequestIntervalMs(): number {
  const configured = Number.parseInt(process.env.BRAVE_MIN_REQUEST_INTERVAL_MS ?? '', 10);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_MIN_REQUEST_INTERVAL_MS;
}

// Global rate limiter for Brave Search API calls
export class BraveSearchRateLimiter {
  private static instance: BraveSearchRateLimiter;
  private lastCallTime: number = 0;
  // Brave's per-second allowance is plan-specific: 1/s on the free tier, 50/s
  // on the paid Search plan. Pacing every deployment at the free-tier rate
  // serialises retrieval for no reason, so the floor is configurable.
  private readonly MIN_INTERVAL = braveMinRequestIntervalMs();
  private readonly MAX_SERVER_WAIT_MS = 2_000;
  /**
   * Backstop on how long one response may park the provider. Brave's monthly
   * Reset counts down to the end of the calendar month, so an unbounded block
   * can take search offline for over a week; re-probing and being refused
   * again is strictly better than going dark on a stale reading.
   */
  private readonly MAX_SERVER_BLOCK_MS = 60_000;
  private serverBlockedUntil = 0;

  static getInstance(): BraveSearchRateLimiter {
    if (!BraveSearchRateLimiter.instance) {
      BraveSearchRateLimiter.instance = new BraveSearchRateLimiter();
    }
    return BraveSearchRateLimiter.instance;
  }

  async waitForNextCall(): Promise<void> {
    const now = Date.now();
    // Claim this call's slot before yielding. Concurrent callers all read the
    // same lastCallTime, so without a reservation they would sleep to one
    // shared deadline and then fire together, bursting past the per-second
    // allowance the interval exists to respect.
    const slot = Math.max(this.lastCallTime + this.MIN_INTERVAL, this.serverBlockedUntil, now);
    const waitTime = slot - now;

    if (waitTime > this.MAX_SERVER_WAIT_MS) {
      // Shed the call rather than queue it, and say which limit turned it
      // away: a refusal we are still backing off from is a quota problem,
      // while anything else is just more demand than the floor allows.
      throw this.serverBlockedUntil - now > this.MAX_SERVER_WAIT_MS
        ? new Error(`Brave Search quota is exhausted for another ${Math.ceil(waitTime / 1000)} seconds`)
        : new Error(`Brave Search is pacing requests; the next free slot is ${Math.ceil(waitTime / 1000)}s away`);
    }

    // Held even while sleeping, so the next caller queues behind this slot.
    this.lastCallTime = slot;
    if (waitTime > 0) {
      console.log(`BraveSearchRateLimiter: Waiting ${waitTime}ms before next API call`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  observeResponse(response: Response): void {
    // Only a refusal is backpressure. A served response says the request was
    // allowed, and its Remaining counters describe windows we are not being
    // refused on, so nothing about it should stop the next call.
    if (response.status !== 429) return;

    const blockingResets = exhaustedWindowResets(response);
    if (blockingResets.length === 0) return;
    // Multiple windows can be exhausted at once. Respect the longest reset;
    // waitForNextCall fails fast when that exceeds an interactive request budget.
    const blockMs = Math.min(Math.max(...blockingResets) * 1_000, this.MAX_SERVER_BLOCK_MS);
    this.serverBlockedUntil = Math.max(this.serverBlockedUntil, Date.now() + blockMs);
  }
}

export class SearchProvider {
  private config: SearchProviderConfig;
  private readonly DEFAULT_TIMEOUT = 10000;
  private readonly DEFAULT_MAX_RESULTS = 10;
  private rateLimiter: {
    waitForNextCall(): Promise<void>;
    observeResponse?(response: Response): void;
  };
  private readonly clientOptions: SearchProviderClientOptions;

  constructor(
    apiKey: string,
    provider: 'bing' | 'google' | 'brave' | 'serpapi' = 'bing',
    clientOptions: SearchProviderClientOptions = {},
  ) {
    this.config = {
      apiKey,
      baseUrl: this.getBaseUrl(provider),
      provider,
      maxResults: this.DEFAULT_MAX_RESULTS,
      timeout: clientOptions.requestTimeoutMs ?? this.DEFAULT_TIMEOUT
    };
    this.clientOptions = clientOptions;
    this.rateLimiter = clientOptions.rateLimiter ?? BraveSearchRateLimiter.getInstance();
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

  async search(query: string, options: SearchProviderOptions = {}): Promise<SearchResult[]> {
    console.log('SearchProvider: Starting search for query:', query);
    console.log('SearchProvider: Using provider:', this.config.provider);
    
    const {
      maxResults = this.config.maxResults,
      timeRange = 'day',
      region = 'US',
      language = 'en',
      uiLanguage = 'en-US',
      freshness,
    } = options;

    try {
      const results = await this.performSearch(query, {
        maxResults,
        timeRange,
        region,
        language,
        uiLanguage,
        freshness,
      });

      console.log('SearchProvider: Raw search results received');
      const formattedResults = this.formatResults(results);
      console.log('SearchProvider: Formatted', formattedResults.length, 'results');
      
      return formattedResults;
    } catch (error) {
      console.error('SearchProvider: Search failed:', error);
      throw error;
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
    // Use mock data for test environment
    if (this.config.apiKey === 'test_search_key' || this.config.apiKey.startsWith('test_')) {
      console.log('SearchProvider: Using mock data for test environment');
      return {
        webPages: {
          value: [
            {
              name: 'Test Bing Search Result',
              snippet: 'This is a mock Bing search result for testing purposes. The query was: ' + query,
              url: 'https://example.com/test-bing-result'
            }
          ]
        }
      };
    }
    
    const params = new URLSearchParams({
      q: query,
      count: options.maxResults?.toString() || '10',
      mkt: options.language || 'en-US',
      freshness: options.timeRange || 'day',
      responseFilter: 'Webpages',
      textFormat: 'Raw',
      safeSearch: 'Moderate'
    });

    const response = await this.request(`${this.config.baseUrl}?${params}`, {
      headers: {
        'Ocp-Apim-Subscription-Key': this.config.apiKey,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      await discardResponseBody(response);
      throw new Error(`Bing search failed: ${response.status}`);
    }

    return response.json();
  }

  private async googleSearch(query: string, options: any): Promise<any> {
    // Use mock data for test environment or CI/CD
    if (this.config.apiKey === 'test_search_key' || this.config.apiKey.startsWith('test_') || process.env.GITHUB_ACTIONS) {
      console.log('SearchProvider: Using mock data for test environment or CI/CD');
      return {
        items: [
          {
            title: 'Test Google Search Result',
            snippet: 'This is a mock Google search result for testing purposes. The query was: ' + query,
            link: 'https://example.com/test-google-result'
          }
        ]
      };
    }
    
    const params = new URLSearchParams({
      key: this.config.apiKey,
      cx: process.env.GOOGLE_SEARCH_ENGINE_ID || '',
      q: query,
      num: options.maxResults?.toString() || '10',
      dateRestrict: options.timeRange || 'd1',
      lr: `lang_${options.language?.split('-')[0] || 'en'}`
    });

    const response = await this.request(`${this.config.baseUrl}?${params}`);

    if (!response.ok) {
      await discardResponseBody(response);
      throw new Error(`Google search failed: ${response.status}`);
    }

    return response.json();
  }

  private async braveSearch(query: string, options: any): Promise<any> {
    console.log('SearchProvider: Performing Brave search for query:', query);
    console.log('SearchProvider: Brave search URL:', this.config.baseUrl);
    console.log('SearchProvider: API key present:', !!this.config.apiKey);
    
    // Use mock data for test environment or CI/CD
    if (this.config.apiKey === 'test_search_key' || this.config.apiKey.startsWith('test_') || process.env.GITHUB_ACTIONS) {
      console.log('SearchProvider: Using mock data for test environment or CI/CD');
      return {
        web: {
          results: [{
            title: 'Test Search Result',
            description: 'This is a mock search result for testing purposes. The query was: ' + query,
            url: 'https://example.com/test-result',
          }],
        },
      };
    }
    
    const params = new URLSearchParams({
      q: query,
      count: options.maxResults?.toString() || '10',
      country: options.region || 'US',
      search_lang: options.language || 'en',
      ui_lang: options.uiLanguage || 'en-US',
      safesearch: 'moderate',
      result_filter: 'web',
    });
    if (options.freshness) params.set('freshness', options.freshness);

    console.log('SearchProvider: Brave search params:', params.toString());

    const response = await this.request(`${this.config.baseUrl}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': this.config.apiKey,
        'User-Agent': 'Finsight-Financial-App/1.0'
      }
    }, true);

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
    // Use mock data for test environment
    if (this.config.apiKey === 'test_search_key' || this.config.apiKey.startsWith('test_')) {
      console.log('SearchProvider: Using mock data for test environment');
      return {
        organic_results: [
          {
            title: 'Test SerpAPI Search Result',
            snippet: 'This is a mock SerpAPI search result for testing purposes. The query was: ' + query,
            link: 'https://example.com/test-serpapi-result'
          }
        ]
      };
    }
    
    const params = new URLSearchParams({
      api_key: this.config.apiKey,
      q: query,
      num: options.maxResults?.toString() || '10',
      tbs: options.timeRange === 'day' ? 'qdr:d' : 'qdr:w'
    });

    const response = await this.request(`${this.config.baseUrl}?${params}`);

    if (!response.ok) {
      await discardResponseBody(response);
      throw new Error(`SerpAPI search failed: ${response.status}`);
    }

    return response.json();
  }

  private async request(url: string, init: ProviderRequestInit = {}, rateLimited = false): Promise<Response> {
    const response = await fetchWithBoundedRetry(url, init, {
      fetchImplementation: this.clientOptions.fetchImplementation,
      sleep: this.clientOptions.sleep,
      requestTimeoutMs: this.config.timeout,
      maxAttempts: this.clientOptions.maxAttempts,
      maxRetryDelayMs: this.clientOptions.maxRetryDelayMs,
      beforeAttempt: rateLimited ? () => this.rateLimiter.waitForNextCall() : undefined,
    });
    if (rateLimited) this.rateLimiter.observeResponse?.(response);
    return response;
  }

  private formatResults(rawResults: any): SearchResult[] {
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

    return results.web.results.map((item: any, index: number) => {
      const age = typeof item.age === 'string' && item.age.trim() ? item.age.trim() : undefined;
      const publishedAt = this.parseBravePublicationTime(item.page_age, age);
      return {
        title: item.title,
        snippet: item.description,
        url: item.url,
        source: 'Brave',
        relevance: 1 - (index * 0.1),
        ...(age && { age }),
        ...(publishedAt && { publishedAt }),
      };
    });
  }

  private parseBravePublicationTime(pageAge: unknown, age: string | undefined): string | undefined {
    for (const candidate of [pageAge, age]) {
      if (typeof candidate !== 'string' || !candidate.trim()) continue;
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }

    const relative = age?.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/i);
    if (!relative) return undefined;
    const amount = Number.parseInt(relative[1], 10);
    const unitMs: Record<string, number> = {
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 7 * 86_400_000,
      month: 30 * 86_400_000,
      year: 365 * 86_400_000,
    };
    return new Date(Date.now() - amount * unitMs[relative[2].toLowerCase()]).toISOString();
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

}
