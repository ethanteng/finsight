const MASSIVE_API_BASE_URL = 'https://api.massive.com';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 60_000;

type FetchImplementation = typeof fetch;

async function delay(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

type SleepImplementation = typeof delay;

export interface MassiveListResponse<T> {
  status?: string;
  results?: T[];
}

export interface MassiveDailyBar {
  c?: number;
  h?: number;
  l?: number;
  o?: number;
  t?: number;
  v?: number;
  vw?: number;
}

export interface MassiveTreasuryYield {
  date?: string;
  yield_1_month?: number;
  yield_3_month?: number;
  yield_1_year?: number;
  yield_2_year?: number;
  yield_3_year?: number;
  yield_5_year?: number;
  yield_10_year?: number;
  yield_20_year?: number;
  yield_30_year?: number;
}

export interface MassiveInflationExpectation {
  date?: string;
  model_1_year?: number;
  model_5_year?: number;
  model_10_year?: number;
  model_30_year?: number;
  market_5_year?: number;
  market_10_year?: number;
  forward_years_5_to_10?: number;
}

interface MassiveProviderOptions {
  baseUrl?: string;
  fetchImplementation?: FetchImplementation;
  sleep?: SleepImplementation;
  requestTimeoutMs?: number;
  maxAttempts?: number;
}

/**
 * Minimal client for the Massive endpoints used by Ask Linc.
 *
 * The official JavaScript SDK is intentionally not required here: these three
 * endpoints have small response contracts, and keeping request behavior in one
 * place gives us explicit timeouts and bounded retries.
 */
export class MassiveProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImplementation: FetchImplementation;
  private readonly sleep: SleepImplementation;
  private readonly requestTimeoutMs: number;
  private readonly maxAttempts: number;

  constructor(apiKey: string, options: MassiveProviderOptions = {}) {
    this.apiKey = apiKey.trim();
    this.baseUrl = options.baseUrl ?? MASSIVE_API_BASE_URL;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.sleep = options.sleep ?? delay;
    this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? MAX_ATTEMPTS);
  }

  async getDailyBars(
    ticker: string,
    from: string,
    to: string,
  ): Promise<MassiveListResponse<MassiveDailyBar>> {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!normalizedTicker) throw new Error('Massive ticker is required');

    return this.request<MassiveListResponse<MassiveDailyBar>>(
      `/v2/aggs/ticker/${encodeURIComponent(normalizedTicker)}/range/1/day/${from}/${to}`,
      {
        adjusted: 'true',
        sort: 'desc',
        limit: '2',
      },
    );
  }

  async getLatestTreasuryYields(): Promise<MassiveListResponse<MassiveTreasuryYield>> {
    return this.request<MassiveListResponse<MassiveTreasuryYield>>(
      '/fed/v1/treasury-yields',
      { limit: '1', sort: 'date.desc' },
    );
  }

  async getLatestInflationExpectations(): Promise<MassiveListResponse<MassiveInflationExpectation>> {
    return this.request<MassiveListResponse<MassiveInflationExpectation>>(
      '/fed/v1/inflation-expectations',
      { limit: '1', sort: 'date.desc' },
    );
  }

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    if (!this.apiKey) throw new Error('MASSIVE_API_KEY or POLYGON_API_KEY is not configured');

    const url = new URL(path, this.baseUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set('apiKey', this.apiKey);

    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
      let response: Response;

      try {
        response = await this.fetchImplementation(url, { signal: controller.signal });
      } catch (error) {
        lastError = error;
        if (attempt === this.maxAttempts) throw error;
        await this.sleep(DEFAULT_RETRY_DELAY_MS * attempt);
        continue;
      } finally {
        clearTimeout(timeout);
      }

      if (response.ok) return await response.json() as T;

      const error = new Error(`Massive API error for ${path}: HTTP ${response.status}`);
      if (!this.isRetryableStatus(response.status) || attempt === this.maxAttempts) {
        throw error;
      }

      lastError = error;
      await this.sleep(this.getRetryDelayMs(response, attempt));
    }

    throw lastError instanceof Error ? lastError : new Error(`Massive request failed for ${path}`);
  }

  private isRetryableStatus(status: number): boolean {
    return status === 408 || status === 429 || status >= 500;
  }

  private getRetryDelayMs(response: Response, attempt: number): number {
    const retryAfter = response.headers?.get('retry-after');
    if (retryAfter) {
      const seconds = Number.parseFloat(retryAfter);
      if (Number.isFinite(seconds)) {
        return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, seconds * 1_000));
      }

      const retryAt = Date.parse(retryAfter);
      if (Number.isFinite(retryAt)) {
        return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, retryAt - Date.now()));
      }
    }

    return response.status === 429
      ? MAX_RETRY_DELAY_MS
      : Math.min(MAX_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS * attempt);
  }
}
