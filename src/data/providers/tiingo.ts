const TIINGO_API_BASE_URL = 'https://api.tiingo.com';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 1_000;
// Every caller runs inside a user request, so a retry is only worth waiting for
// when it is short. A longer Retry-After means "come back later", and we fail
// fast instead of holding the question open for a minute.
const MAX_RETRY_DELAY_MS = 2_000;

type FetchImplementation = typeof fetch;

async function delay(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

type SleepImplementation = typeof delay;

export interface TiingoEodPrice {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  adjOpen?: number;
  adjHigh?: number;
  adjLow?: number;
  adjClose?: number;
  adjVolume?: number;
  divCash?: number;
  splitFactor?: number;
}

export interface TiingoIexQuote {
  ticker: string;
  timestamp?: string;
  quoteTimestamp?: string;
  lastSaleTimestamp?: string;
  last?: number;
  tngoLast?: number;
  prevClose?: number;
  open?: number;
  high?: number;
  low?: number;
  mid?: number;
  bidPrice?: number;
  askPrice?: number;
  volume?: number;
}

export interface TiingoNewsArticle {
  id?: number;
  title?: string;
  url?: string;
  description?: string;
  publishedDate?: string;
  crawlDate?: string;
  tickers?: string[];
  tags?: string[];
  source?: string;
}

interface TiingoProviderOptions {
  baseUrl?: string;
  fetchImplementation?: FetchImplementation;
  sleep?: SleepImplementation;
  requestTimeoutMs?: number;
  maxAttempts?: number;
  maxRetryDelayMs?: number;
}

/** Shared, bounded Tiingo client for the Power-plan endpoints used by Ask Linc. */
export class TiingoProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImplementation: FetchImplementation;
  private readonly sleep: SleepImplementation;
  private readonly requestTimeoutMs: number;
  private readonly maxAttempts: number;
  private readonly maxRetryDelayMs: number;

  constructor(apiKey: string, options: TiingoProviderOptions = {}) {
    this.apiKey = apiKey.trim();
    this.baseUrl = options.baseUrl ?? TIINGO_API_BASE_URL;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.sleep = options.sleep ?? delay;
    this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? MAX_ATTEMPTS);
    this.maxRetryDelayMs = Math.max(0, options.maxRetryDelayMs ?? MAX_RETRY_DELAY_MS);
  }

  async getEodPrices(
    ticker: string,
    startDate: string,
    endDate: string,
    resampleFreq: 'daily' | 'weekly' | 'monthly' = 'daily',
  ): Promise<TiingoEodPrice[]> {
    const normalizedTicker = this.normalizeTicker(ticker);
    return this.request<TiingoEodPrice[]>(
      `/tiingo/daily/${encodeURIComponent(normalizedTicker)}/prices`,
      { startDate, endDate, resampleFreq, format: 'json' },
    );
  }

  async getIexQuotes(tickers: string[]): Promise<TiingoIexQuote[]> {
    const normalized = [...new Set(tickers.map(ticker => this.normalizeTicker(ticker)))];
    if (normalized.length === 0) return [];
    return this.request<TiingoIexQuote[]>('/iex', { tickers: normalized.join(',') });
  }

  async getNews(options: {
    tickers?: string[];
    tags?: string[];
    limit?: number;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<TiingoNewsArticle[]> {
    const params: Record<string, string> = {
      limit: String(Math.min(100, Math.max(1, options.limit ?? 20))),
      sortBy: 'publishedDate',
    };
    if (options.tickers?.length) {
      params.tickers = [...new Set(options.tickers.map(ticker => this.normalizeTicker(ticker)))].join(',');
    }
    if (options.tags?.length) params.tags = options.tags.join(',');
    if (options.startDate) params.startDate = options.startDate;
    if (options.endDate) params.endDate = options.endDate;
    return this.request<TiingoNewsArticle[]>('/tiingo/news', params);
  }

  private normalizeTicker(ticker: string): string {
    // Plaid/SnapTrade commonly use dots for class shares (BRK.B), while
    // Tiingo uses dashes (BRK-B) across EOD, IEX, and news endpoints.
    const normalized = ticker.trim().toUpperCase().replace(/\./g, '-');
    if (!normalized) throw new Error('Tiingo ticker is required');
    return normalized;
  }

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    if (!this.apiKey) throw new Error('TIINGO_API_KEY is not configured');

    const url = new URL(path, this.baseUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
      let response: Response;
      try {
        response = await this.fetchImplementation(url, {
          signal: controller.signal,
          headers: {
            Authorization: `Token ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (error) {
        lastError = error;
        if (attempt === this.maxAttempts) throw error;
        await this.sleep(DEFAULT_RETRY_DELAY_MS * attempt);
        continue;
      } finally {
        clearTimeout(timeout);
      }

      if (response.ok) return await response.json() as T;

      const error = new Error(`Tiingo API error for ${path}: HTTP ${response.status}`);
      if (!this.isRetryableStatus(response.status) || attempt === this.maxAttempts) throw error;
      const retryDelayMs = this.getRetryDelayMs(response, attempt);
      if (retryDelayMs > this.maxRetryDelayMs) throw error;
      lastError = error;
      await this.sleep(retryDelayMs);
    }

    throw lastError instanceof Error ? lastError : new Error(`Tiingo request failed for ${path}`);
  }

  private isRetryableStatus(status: number): boolean {
    return status === 408 || status === 429 || status >= 500;
  }

  /** Suggested wait before the next attempt; the caller gives up if it is too long. */
  private getRetryDelayMs(response: Response, attempt: number): number {
    const retryAfter = response.headers?.get('retry-after');
    if (retryAfter) {
      const seconds = Number.parseFloat(retryAfter);
      if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
      const retryAt = Date.parse(retryAfter);
      if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
    }
    return DEFAULT_RETRY_DELAY_MS * attempt;
  }
}
