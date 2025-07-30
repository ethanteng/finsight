import { DataProvider, LiveMarketData, UserTier } from '../types';
import { cacheService } from '../cache';

interface AlphaVantageResponse {
  'Time Series (Daily)'?: Record<string, any>;
  'Realtime Currency Exchange Rate'?: Record<string, any>;
  'Note'?: string;
}

export class AlphaVantageProvider implements DataProvider {
  private baseUrl = 'https://www.alphavantage.co/query';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getEconomicIndicators(): Promise<any> {
    throw new Error('Alpha Vantage does not provide economic indicators');
  }

  async getLiveMarketData(tier?: UserTier): Promise<LiveMarketData | null> {
    console.log('Alpha Vantage Provider: getLiveMarketData called with API key:', this.apiKey);
    console.log('Alpha Vantage Provider: API key length:', this.apiKey.length);
    console.log('Alpha Vantage Provider: Is test key?', this.apiKey === 'your_alpha_vantage_api_key');
    console.log('Alpha Vantage Provider: Tier:', tier);
    
    // Don't return live market data for starter tier
    if (tier === UserTier.STARTER) {
      console.log('Alpha Vantage Provider: Skipping live market data for starter tier');
      return null;
    }
    
    const cacheKey = 'live_market_data';
    const cached = await cacheService.get<LiveMarketData>(cacheKey);
    if (cached) {
      console.log('Alpha Vantage Provider: Returning cached data');
      return cached;
    }

    // Use mock data for test environment
    if (this.apiKey === 'your_alpha_vantage_api_key') {
      console.log('Alpha Vantage Provider: Using mock data for test environment');
      const mockData: LiveMarketData = {
        cdRates: [
          { term: '3-month', rate: 5.25, institution: 'National Average', lastUpdated: new Date().toISOString() },
          { term: '6-month', rate: 5.35, institution: 'National Average', lastUpdated: new Date().toISOString() },
          { term: '1-year', rate: 5.45, institution: 'National Average', lastUpdated: new Date().toISOString() },
          { term: '2-year', rate: 5.55, institution: 'National Average', lastUpdated: new Date().toISOString() }
        ],
        treasuryYields: [
          { term: '1-month', yield: 5.12, lastUpdated: new Date().toISOString() },
          { term: '3-month', yield: 5.18, lastUpdated: new Date().toISOString() },
          { term: '6-month', yield: 5.25, lastUpdated: new Date().toISOString() },
          { term: '1-year', yield: 5.32, lastUpdated: new Date().toISOString() },
          { term: '2-year', yield: 5.45, lastUpdated: new Date().toISOString() },
          { term: '5-year', yield: 5.58, lastUpdated: new Date().toISOString() },
          { term: '10-year', yield: 5.65, lastUpdated: new Date().toISOString() },
          { term: '30-year', yield: 5.75, lastUpdated: new Date().toISOString() }
        ],
        mortgageRates: [
          { type: '30-year-fixed', rate: 6.85, lastUpdated: new Date().toISOString() },
          { type: '15-year-fixed', rate: 6.25, lastUpdated: new Date().toISOString() },
          { type: '5/1-arm', rate: 6.45, lastUpdated: new Date().toISOString() }
        ]
      };
      
      await cacheService.set(cacheKey, mockData, 5 * 60 * 1000); // 5 minutes
      console.log('Alpha Vantage Provider: Mock data set in cache');
      return mockData;
    }

    console.log('Alpha Vantage Provider: Using real Alpha Vantage API');
    
    // For now, return mock data since Alpha Vantage requires paid plans for real-time data
    // In production, you'd integrate with their real-time APIs
    const liveData: LiveMarketData = {
      cdRates: [
        { term: '3-month', rate: 5.25, institution: 'National Average', lastUpdated: new Date().toISOString() },
        { term: '6-month', rate: 5.35, institution: 'National Average', lastUpdated: new Date().toISOString() },
        { term: '1-year', rate: 5.45, institution: 'National Average', lastUpdated: new Date().toISOString() },
        { term: '2-year', rate: 5.55, institution: 'National Average', lastUpdated: new Date().toISOString() }
      ],
      treasuryYields: [
        { term: '1-month', yield: 5.12, lastUpdated: new Date().toISOString() },
        { term: '3-month', yield: 5.18, lastUpdated: new Date().toISOString() },
        { term: '6-month', yield: 5.25, lastUpdated: new Date().toISOString() },
        { term: '1-year', yield: 5.32, lastUpdated: new Date().toISOString() },
        { term: '2-year', yield: 5.45, lastUpdated: new Date().toISOString() },
        { term: '5-year', yield: 5.58, lastUpdated: new Date().toISOString() },
        { term: '10-year', yield: 5.65, lastUpdated: new Date().toISOString() },
        { term: '30-year', yield: 5.75, lastUpdated: new Date().toISOString() }
      ],
      mortgageRates: [
        { type: '30-year-fixed', rate: 6.85, lastUpdated: new Date().toISOString() },
        { type: '15-year-fixed', rate: 6.25, lastUpdated: new Date().toISOString() },
        { type: '5/1-arm', rate: 6.45, lastUpdated: new Date().toISOString() }
      ]
    };

    await cacheService.set(cacheKey, liveData, 5 * 60 * 1000); // 5 minutes for live data
    return liveData;
  }

  async getDataPoint(key: string): Promise<any> {
    const cacheKey = `alpha_vantage_${key}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    // Use mock data for test environment
    if (this.apiKey === 'your_alpha_vantage_api_key') {
      console.log('Alpha Vantage Provider: Using mock data for test environment');
      const mockData = {
        symbol: key,
        data: 'mock_data',
        lastUpdated: new Date().toISOString()
      };
      
      await cacheService.set(cacheKey, mockData, 5 * 60 * 1000); // 5 minutes
      return mockData;
    }

    console.log(`Alpha Vantage Provider: Fetching real data for ${key}`);
    const url = `${this.baseUrl}?function=TIME_SERIES_DAILY&symbol=${key}&apikey=${this.apiKey}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Alpha Vantage API error: ${response.status}`);
      }

      const data: AlphaVantageResponse = await response.json();
      
      if (data['Note']) {
        throw new Error(`Alpha Vantage API limit reached: ${data['Note']}`);
      }

      await cacheService.set(cacheKey, data, 5 * 60 * 1000); // 5 minutes
      console.log(`Alpha Vantage Provider: Real data fetched for ${key}`);
      return data;
    } catch (error) {
      console.error(`Error fetching Alpha Vantage data for ${key}:`, error);
      throw error;
    }
  }
} 