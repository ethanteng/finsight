import { DataProvider, EconomicIndicator, LiveMarketData, MarketDataPoint } from '../types';
import { cacheService } from '../cache';

type FREDUnits = 'lin' | 'pc1';

export interface FREDSeriesConfig {
  seriesId: string;
  name: string;
  unit: 'percent' | 'index';
  transformation: FREDUnits;
  cacheTtlMs: number;
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const RECENT_OBSERVATION_LIMIT = 12;

/**
 * Canonical FRED series used by Ask Linc.
 *
 * CPIAUCSL is an index, so the API's `pc1` transformation is required before
 * its value can truthfully be described as year-over-year inflation.
 */
export const FRED_ECONOMIC_SERIES = {
  cpi: {
    seriesId: 'CPIAUCSL',
    name: 'Inflation Rate (CPI, YoY)',
    unit: 'percent',
    transformation: 'pc1',
    cacheTtlMs: TWENTY_FOUR_HOURS_MS,
  },
  fedRate: {
    seriesId: 'DFF',
    name: 'Federal Funds Effective Rate',
    unit: 'percent',
    transformation: 'lin',
    cacheTtlMs: FOUR_HOURS_MS,
  },
  mortgageRate: {
    seriesId: 'MORTGAGE30US',
    name: '30-Year Fixed Mortgage Average',
    unit: 'percent',
    transformation: 'lin',
    cacheTtlMs: TWENTY_FOUR_HOURS_MS,
  },
  creditCardAPR: {
    seriesId: 'TERMCBCCALLNS',
    name: 'Commercial Bank Credit Card Rate, All Accounts',
    unit: 'percent',
    transformation: 'lin',
    cacheTtlMs: TWENTY_FOUR_HOURS_MS,
  },
  unemployment: {
    seriesId: 'UNRATE',
    name: 'Unemployment Rate',
    unit: 'percent',
    transformation: 'lin',
    cacheTtlMs: TWENTY_FOUR_HOURS_MS,
  },
  treasury10Y: {
    seriesId: 'DGS10',
    name: '10-Year Treasury Constant Maturity Rate',
    unit: 'percent',
    transformation: 'lin',
    cacheTtlMs: FOUR_HOURS_MS,
  },
  cd12Month: {
    seriesId: 'NDR12MCD',
    name: 'FDIC National 12-Month CD Rate',
    unit: 'percent',
    transformation: 'lin',
    cacheTtlMs: TWENTY_FOUR_HOURS_MS,
  },
} as const satisfies Record<keyof EconomicIndicator, FREDSeriesConfig>;

interface FREDResponse {
  observations?: Array<{
    realtime_start: string;
    realtime_end: string;
    date: string;
    value: string;
  }>;
}

interface GetDataPointOptions {
  units?: FREDUnits;
  cacheTtlMs?: number;
}

const MOCK_VALUES: Record<keyof EconomicIndicator, number> = {
  cpi: 3.1,
  fedRate: 5.25,
  mortgageRate: 6.85,
  creditCardAPR: 24.59,
  unemployment: 4.2,
  treasury10Y: 4.25,
  cd12Month: 1.75,
};

export class FREDProvider implements DataProvider {
  private readonly baseUrl = 'https://api.stlouisfed.org/fred/series/observations';
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  async getEconomicIndicators(): Promise<EconomicIndicator> {
    this.assertConfigured();

    const entries = Object.entries(FRED_ECONOMIC_SERIES) as Array<
      [keyof EconomicIndicator, FREDSeriesConfig]
    >;
    const settled = await Promise.allSettled(entries.map(async ([key, config]) => ({
      key,
      value: await this.getDataPoint(config.seriesId, {
        units: config.transformation,
        cacheTtlMs: config.cacheTtlMs,
      }),
    })));

    const indicators: EconomicIndicator = {};
    const failures: string[] = [];

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        indicators[result.value.key] = result.value.value;
        return;
      }

      const config = entries[index][1];
      failures.push(config.seriesId);
      console.error(`FRED Provider: failed to fetch ${config.seriesId}:`, result.reason);
    });

    if (Object.keys(indicators).length === 0) {
      throw new Error(`FRED returned no usable economic indicators (${failures.join(', ')})`);
    }

    return indicators;
  }

  async getLiveMarketData(): Promise<LiveMarketData | null> {
    return null;
  }

  async getDataPoint(
    seriesId: string,
    options: GetDataPointOptions = {}
  ): Promise<MarketDataPoint> {
    this.assertConfigured();

    const units = options.units ?? 'lin';
    const configEntry = Object.entries(FRED_ECONOMIC_SERIES).find(
      ([, config]) => config.seriesId === seriesId
    ) as [keyof EconomicIndicator, FREDSeriesConfig] | undefined;
    const unit = seriesId === 'CPIAUCSL' && units === 'lin'
      ? 'index'
      : configEntry?.[1].unit ?? 'percent';
    const cacheKey = `economic_indicators:fred:${seriesId}:${units}`;
    const cached = await cacheService.get<MarketDataPoint>(cacheKey);
    if (cached) return cached;

    // Mock/CI responses must still go through the same cache key so repeated
    // reads return identical lastUpdated timestamps (and match live behavior).
    if (this.isMockMode()) {
      const key = configEntry?.[0];
      const dataPoint: MarketDataPoint = {
        value: seriesId === 'CPIAUCSL' && units === 'lin'
          ? 320
          : key ? MOCK_VALUES[key] : 3.1,
        date: '2024-01-01',
        source: 'FRED (mock)',
        lastUpdated: new Date().toISOString(),
        seriesId,
        unit,
        transformation: units,
      };
      await cacheService.set(
        cacheKey,
        dataPoint,
        options.cacheTtlMs ?? TWENTY_FOUR_HOURS_MS
      );
      return dataPoint;
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set('series_id', seriesId);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('limit', String(RECENT_OBSERVATION_LIMIT));
    url.searchParams.set('sort_order', 'desc');
    url.searchParams.set('units', units);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`FRED API error for ${seriesId}: HTTP ${response.status}`);
      }

      const data = (await response.json()) as FREDResponse;
      const observation = data.observations?.find((candidate) => {
        if (candidate.value === '.') return false;
        return Number.isFinite(Number.parseFloat(candidate.value));
      });

      if (!observation) {
        throw new Error(`FRED returned no numeric observations for ${seriesId}`);
      }

      const value = Number.parseFloat(observation.value);
      const dataPoint: MarketDataPoint = {
        value,
        date: observation.date,
        source: 'FRED',
        lastUpdated: new Date().toISOString(),
        seriesId,
        unit,
        transformation: units,
      };

      await cacheService.set(
        cacheKey,
        dataPoint,
        options.cacheTtlMs ?? TWENTY_FOUR_HOURS_MS
      );
      return dataPoint;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetch CPIAUCSL index observations for a date range.
   * Used only by callers that need index levels rather than current YoY inflation.
   * Missing observations are forward-filled after the first valid value; leading
   * missing observations are omitted instead of fabricating an index value.
   */
  async getCPIObservations(
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: string; value: number }>> {
    this.assertConfigured();

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    const cacheKey = `fred:CPIAUCSL:range:${startStr}:${endStr}`;
    const cached = await cacheService.get<Array<{ date: string; value: number }>>(cacheKey);
    if (cached) return cached;

    if (this.isMockMode()) {
      const observations = this.generateMockCPIObservations(startDate, endDate);
      await cacheService.set(cacheKey, observations, TWENTY_FOUR_HOURS_MS);
      return observations;
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set('series_id', 'CPIAUCSL');
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('observation_start', startStr);
    url.searchParams.set('observation_end', endStr);
    url.searchParams.set('sort_order', 'asc');
    url.searchParams.set('units', 'lin');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`FRED API error for CPIAUCSL: HTTP ${response.status}`);
      }

      const data = (await response.json()) as FREDResponse;
      const observations: Array<{ date: string; value: number }> = [];
      let lastValidValue: number | undefined;

      for (const observation of data.observations ?? []) {
        const parsed = Number.parseFloat(observation.value);
        if (observation.value !== '.' && Number.isFinite(parsed)) {
          lastValidValue = parsed;
        }
        if (lastValidValue !== undefined) {
          observations.push({ date: observation.date, value: lastValidValue });
        }
      }

      if (observations.length === 0) {
        throw new Error('FRED returned no numeric CPIAUCSL observations');
      }

      await cacheService.set(cacheKey, observations, TWENTY_FOUR_HOURS_MS);
      return observations;
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new Error('FRED_API_KEY is not configured');
    }
  }

  private isMockMode(): boolean {
    return this.apiKey === 'test_fred_key'
      || this.apiKey.startsWith('test_')
      || Boolean(process.env.GITHUB_ACTIONS);
  }

  private generateMockCPIObservations(
    startDate: Date,
    endDate: Date
  ): Array<{ date: string; value: number }> {
    const observations: Array<{ date: string; value: number }> = [];
    let cpi = 100;
    const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (current <= end) {
      const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-01`;
      observations.push({ date: dateStr, value: cpi });
      cpi *= 1.002;
      current.setMonth(current.getMonth() + 1);
    }
    return observations;
  }
}
