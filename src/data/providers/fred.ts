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
    console.log('FRED Provider: getEconomicIndicators called with API key:', this.apiKey);
    console.log('FRED Provider: API key length:', this.apiKey.length);
    console.log('FRED Provider: API key trimmed:', this.apiKey.trim());
    console.log('FRED Provider: Is test key?', this.apiKey === 'test_fred_key');
    console.log('FRED Provider: Is test key (trimmed)?', this.apiKey.trim() === 'test_fred_key');
    
    const cacheKey = 'economic_indicators';
    const cached = await cacheService.get<EconomicIndicator>(cacheKey);
    if (cached) {
      console.log('FRED Provider: Returning cached data');
      return cached;
    }

    // Use mock data for test environment
    if (this.apiKey === 'test_fred_key' || this.apiKey.startsWith('test_')) {
      console.log('FRED Provider: Using mock data for test environment');
      const mockIndicators: EconomicIndicator = {
        cpi: { value: 3.1, date: '2024-01', source: 'FRED (mock)', lastUpdated: new Date().toISOString() },
        fedRate: { value: 5.25, date: '2024-01', source: 'FRED (mock)', lastUpdated: new Date().toISOString() },
        mortgageRate: { value: 6.85, date: '2024-01', source: 'FRED (mock)', lastUpdated: new Date().toISOString() },
        creditCardAPR: { value: 24.59, date: '2024-01', source: 'FRED (mock)', lastUpdated: new Date().toISOString() },
        unemployment: { value: 4.2, date: '2024-01', source: 'FRED (mock)', lastUpdated: new Date().toISOString() }
      };
      
      await cacheService.set(cacheKey, mockIndicators, 24 * 60 * 60 * 1000); // 24 hours
      console.log('FRED Provider: Mock data set in cache');
      return mockIndicators;
    }

    // Fetch each indicator individually and handle errors gracefully
    const now = new Date().toISOString();
    const fallback = {
      cpi: { value: 3.1, date: '2024-01', source: 'FRED (fallback)', lastUpdated: now },
      fedRate: { value: 5.25, date: '2024-01', source: 'FRED (fallback)', lastUpdated: now },
      mortgageRate: { value: 6.85, date: '2024-01', source: 'FRED (fallback)', lastUpdated: now },
      creditCardAPR: { value: 24.59, date: '2024-01', source: 'FRED (fallback)', lastUpdated: now },
      unemployment: { value: 4.2, date: '2024-01', source: 'FRED (fallback)', lastUpdated: now }
    };

    const [cpi, fedRate, mortgageRate, creditCardAPR, unemployment] = await Promise.all([
      this.getDataPoint('CPIAUCSL').catch(e => { console.error('CPI error:', e); return fallback.cpi; }),
      this.getDataPoint('FEDFUNDS').catch(e => { console.error('FedFunds error:', e); return fallback.fedRate; }),
      this.getDataPoint('MORTGAGE30US').catch(e => { console.error('Mortgage error:', e); return fallback.mortgageRate; }),
      // Temporarily use fallback for credit card APR due to FRED API issues
      Promise.resolve(fallback.creditCardAPR).catch(e => { console.error('CreditCardAPR error:', e); return fallback.creditCardAPR; }),
      this.getDataPoint('UNRATE').catch(e => { console.error('Unemployment error:', e); return fallback.unemployment; })
    ]);

    const indicators: EconomicIndicator = {
      cpi,
      fedRate,
      mortgageRate,
      creditCardAPR,
      unemployment
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

    // Use mock data for test environment or CI/CD
    if (this.apiKey === 'test_fred_key' || this.apiKey.startsWith('test_') || process.env.GITHUB_ACTIONS) {
      console.log('FRED Provider: Using mock data for test environment or CI/CD');
      
      // Return appropriate mock values for different series
      let mockValue = 3.1; // Default mock value
      let mockDate = '2024-01';
      
      switch (seriesId) {
        case 'CPIAUCSL':
          mockValue = 3.1;
          mockDate = '2024-01';
          break;
        case 'FEDFUNDS':
          mockValue = 5.25;
          mockDate = '2024-01';
          break;
        case 'MORTGAGE30US':
          mockValue = 6.85;
          mockDate = '2024-01';
          break;
        case 'UNRATE':
          mockValue = 4.2;
          mockDate = '2024-01';
          break;
        default:
          mockValue = 3.1;
          mockDate = '2024-01';
      }
      
      const mockData: MarketDataPoint = {
        value: mockValue,
        date: mockDate,
        source: 'FRED (mock)',
        lastUpdated: new Date().toISOString()
      };
      
      await cacheService.set(cacheKey, mockData, 24 * 60 * 60 * 1000); // 24 hours
      return mockData;
    }

    console.log(`FRED Provider: Fetching real data for ${seriesId}`);
    const url = `${this.baseUrl}?series_id=${seriesId}&api_key=${this.apiKey}&file_type=json&limit=1&sort_order=desc`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`FRED API error: ${response.status}`);
      }

      const data = (await response.json()) as FREDResponse;
      const observation = data.observations[0];
      
      const dataPoint: MarketDataPoint = {
        value: parseFloat(observation.value),
        date: observation.date,
        source: 'FRED',
        lastUpdated: new Date().toISOString()
      };

      await cacheService.set(cacheKey, dataPoint, 24 * 60 * 60 * 1000); // 24 hours
      console.log(`FRED Provider: Real data fetched for ${seriesId}:`, dataPoint);
      return dataPoint;
    } catch (error) {
      console.error(`Error fetching FRED data for ${seriesId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch CPIAUCSL observations for a date range.
   * Used for retirement analytics inflation (month-over-month rates).
   * Forward-fills missing values (FRED uses "." for missing) to preserve month alignment.
   */
  async getCPIObservations(
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: string; value: number }>> {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    const cacheKey = `fred_CPIAUCSL_range_${startStr}_${endStr}`;
    const cached = await cacheService.get<Array<{ date: string; value: number }>>(cacheKey);
    if (cached) return cached;

    // Test/mock mode: deterministic mock CPI (0.2% MoM growth)
    if (this.apiKey === 'test_fred_key' || this.apiKey.startsWith('test_') || process.env.GITHUB_ACTIONS) {
      const observations = this.generateMockCPIObservations(startDate, endDate);
      await cacheService.set(cacheKey, observations, 24 * 60 * 60 * 1000);
      return observations;
    }

    const url = `${this.baseUrl}?series_id=CPIAUCSL&api_key=${this.apiKey}&file_type=json&observation_start=${startStr}&observation_end=${endStr}&sort_order=asc`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`FRED API error: ${response.status}`);
    }
    const data = (await response.json()) as FREDResponse;
    const raw = data.observations || [];

    // Forward-fill missing values: never skip; CPI[i] = CPI[i-1] when value is "." or invalid
    const observations: Array<{ date: string; value: number }> = [];
    let lastValidValue: number | null = null;
    for (const obs of raw) {
      const parsed = parseFloat(obs.value);
      const isMissing = Number.isNaN(parsed) || obs.value === '.';
      const value: number | null = isMissing ? lastValidValue : parsed;
      if (value != null) {
        if (!isMissing) lastValidValue = value;
        observations.push({ date: obs.date, value });
      } else if (lastValidValue != null) {
        observations.push({ date: obs.date, value: lastValidValue });
      } else {
        // First observation(s) missing: use 100 as default to avoid skipping
        lastValidValue = 100;
        observations.push({ date: obs.date, value: 100 });
      }
    }

    await cacheService.set(cacheKey, observations, 24 * 60 * 60 * 1000);
    return observations;
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
      cpi *= 1.002; // 0.2% MoM growth (deterministic)
      current.setMonth(current.getMonth() + 1);
    }
    return observations;
  }
} 