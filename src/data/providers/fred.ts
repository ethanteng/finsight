import { DataProvider, EconomicIndicator, MarketDataPoint } from '../types';
import { cacheService } from '../cache';

interface FREDResponse {
  observations: Array<{
    realtime_start: string;
    realtime_end: string;
    date: string;
    value: string;
  }>;
}

export class FREDProvider implements DataProvider {
  private baseUrl = 'https://api.stlouisfed.org/fred/series/observations';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getEconomicIndicators(): Promise<EconomicIndicator> {
    const cacheKey = 'economic_indicators';
    const cached = await cacheService.get<EconomicIndicator>(cacheKey);
    if (cached) return cached;

    const [cpi, fedRate, mortgageRate, creditCardAPR] = await Promise.all([
      this.getDataPoint('CPIAUCSL'), // CPI
      this.getDataPoint('FEDFUNDS'), // Fed Funds Rate
      this.getDataPoint('MORTGAGE30US'), // 30-year mortgage rate
      this.getDataPoint('CCRSA') // Credit card rate
    ]);

    const indicators: EconomicIndicator = {
      cpi,
      fedRate,
      mortgageRate,
      creditCardAPR
    };

    await cacheService.set(cacheKey, indicators, 24 * 60 * 60 * 1000); // 24 hours
    return indicators;
  }

  async getLiveMarketData(): Promise<any> {
    throw new Error('FRED does not provide live market data');
  }

  async getDataPoint(seriesId: string): Promise<MarketDataPoint> {
    const cacheKey = `fred_${seriesId}`;
    const cached = await cacheService.get<MarketDataPoint>(cacheKey);
    if (cached) return cached;

    const url = `${this.baseUrl}?series_id=${seriesId}&api_key=${this.apiKey}&file_type=json&limit=1&sort_order=desc`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`FRED API error: ${response.status}`);
      }

      const data: FREDResponse = await response.json();
      const observation = data.observations[0];
      
      const dataPoint: MarketDataPoint = {
        value: parseFloat(observation.value),
        date: observation.date,
        source: 'FRED',
        lastUpdated: new Date().toISOString()
      };

      await cacheService.set(cacheKey, dataPoint, 24 * 60 * 60 * 1000); // 24 hours
      return dataPoint;
    } catch (error) {
      console.error(`Error fetching FRED data for ${seriesId}:`, error);
      throw error;
    }
  }
} 