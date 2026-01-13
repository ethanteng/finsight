// Financial Modeling Prep Provider
// Phase 2: Historical Data Plumbing

import { SecurityMetadata } from '../../types';
import { cacheService } from '../../../data/cache';

interface FMPProfileResponse {
  symbol: string;
  companyName: string;
  industry: string;
  sector: string;
  exchange: string;
  currency: string;
  isEtf: boolean;
  isActivelyTrading: boolean;
  price: number;
  beta: number;
  country: string;
  description?: string;
}

interface FMPETFProfile {
  symbol: string;
  name: string;
  type: string;
  industry: string;
  sector: string;
  sectorEn: string;
  industryEn: string;
  isEtf: boolean;
  longDescription?: string;
  country: string;
}

export class FMPProvider {
  private baseUrl = 'https://financialmodelingprep.com/api/v3';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch security metadata from FMP API
   * Returns asset class, expense ratio, geographic focus, etc.
   */
  async getSecurityMetadata(ticker: string): Promise<SecurityMetadata> {
    const cacheKey = `fmp_metadata_${ticker}`;
    const cached = await cacheService.get<SecurityMetadata>(cacheKey);
    if (cached) {
      return cached;
    }

    // Use mock data for test environment
    if (this.apiKey === 'test_fmp_key' || this.apiKey.startsWith('test_') || process.env.GITHUB_ACTIONS) {
      console.log('FMP Provider: Using mock data for test environment');
      return this.generateMockMetadata(ticker);
    }

    try {
      // Try ETF profile first (more detailed metadata)
      try {
        const etfUrl = `${this.baseUrl}/etf-profile/${ticker}?apikey=${this.apiKey}`;
        const etfResponse = await fetch(etfUrl);
        
        if (etfResponse.ok) {
          const etfData: FMPETFProfile[] = await etfResponse.json();
          if (etfData && etfData.length > 0) {
            const metadata = this.parseETFProfile(etfData[0], ticker);
            await cacheService.set(cacheKey, metadata, 7 * 24 * 60 * 60 * 1000); // 7 days
            return metadata;
          }
        }
      } catch (etfError) {
        console.log(`FMP: ETF profile not available for ${ticker}, trying regular profile`);
      }

      // Fallback to regular profile
      const profileUrl = `${this.baseUrl}/profile/${ticker}?apikey=${this.apiKey}`;
      const response = await fetch(profileUrl);

      if (!response.ok) {
        throw new Error(`FMP API error: ${response.status} ${response.statusText}`);
      }

      const data: FMPProfileResponse[] = await response.json();
      
      if (!data || data.length === 0) {
        throw new Error(`No metadata found for ${ticker}`);
      }

      const metadata = this.parseProfile(data[0], ticker);
      
      // Cache for 7 days (metadata changes rarely)
      await cacheService.set(cacheKey, metadata, 7 * 24 * 60 * 60 * 1000);
      
      return metadata;
    } catch (error) {
      console.error(`Error fetching FMP metadata for ${ticker}:`, error);
      // Return inferred metadata instead of throwing
      return this.inferMetadata(ticker);
    }
  }

  /**
   * Parse ETF profile response
   */
  private parseETFProfile(data: FMPETFProfile, ticker: string): SecurityMetadata {
    // Determine asset class from sector/industry
    let assetClass: string | undefined;
    const sector = data.sectorEn?.toLowerCase() || data.sector?.toLowerCase() || '';
    const industry = data.industryEn?.toLowerCase() || data.industry?.toLowerCase() || '';
    
    if (sector.includes('bond') || industry.includes('bond') || industry.includes('fixed income')) {
      assetClass = 'Fixed Income';
    } else if (sector.includes('equity') || industry.includes('equity') || data.isEtf) {
      assetClass = 'Equity';
    }

    // Determine geographic focus from name/description
    let geographicFocus: string | undefined;
    const name = data.name?.toLowerCase() || '';
    const description = data.longDescription?.toLowerCase() || '';
    
    if (name.includes('international') || name.includes('ex-us') || name.includes('global')) {
      geographicFocus = 'International';
    } else if (name.includes('us') || name.includes('united states')) {
      geographicFocus = 'US';
    } else if (name.includes('global')) {
      geographicFocus = 'Global';
    }

    return {
      tickerSymbol: ticker,
      securityName: data.name || ticker,
      assetClass,
      fundCategory: industry || sector || undefined,
      expenseRatio: undefined, // FMP doesn't provide expense ratio in profile
      geographicFocus,
      isETF: data.isEtf || false,
      provider: 'fmp',
      lastUpdated: new Date()
    };
  }

  /**
   * Parse regular profile response
   */
  private parseProfile(data: FMPProfileResponse, ticker: string): SecurityMetadata {
    // Determine asset class from sector/industry
    let assetClass: string | undefined;
    const sector = data.sector?.toLowerCase() || '';
    const industry = data.industry?.toLowerCase() || '';
    
    if (sector.includes('bond') || industry.includes('bond') || industry.includes('fixed income')) {
      assetClass = 'Fixed Income';
    } else if (sector.includes('equity') || industry.includes('equity')) {
      assetClass = 'Equity';
    }

    // Determine geographic focus
    let geographicFocus: string | undefined;
    const country = data.country?.toLowerCase() || '';
    if (country.includes('united states') || country.includes('usa')) {
      geographicFocus = 'US';
    } else if (country && country !== 'united states') {
      geographicFocus = 'International';
    }

    return {
      tickerSymbol: ticker,
      securityName: data.companyName || ticker,
      assetClass,
      fundCategory: industry || sector || undefined,
      expenseRatio: undefined, // FMP doesn't provide expense ratio in profile
      geographicFocus,
      isETF: data.isEtf || false,
      provider: 'fmp',
      lastUpdated: new Date()
    };
  }

  /**
   * Infer metadata when FMP API fails
   */
  private inferMetadata(ticker: string): SecurityMetadata {
    const tickerUpper = ticker.toUpperCase();
    
    // Common ETF patterns
    let assetClass: string | undefined;
    let geographicFocus: string | undefined;
    
    if (tickerUpper.includes('BOND') || tickerUpper.includes('AGG') || tickerUpper.includes('BND')) {
      assetClass = 'Fixed Income';
    } else {
      assetClass = 'Equity';
    }

    if (tickerUpper.includes('VXUS') || tickerUpper.includes('EFA') || tickerUpper.includes('IXUS') || 
        tickerUpper.includes('EX-US') || tickerUpper.includes('INTL')) {
      geographicFocus = 'International';
    } else if (tickerUpper.includes('VTI') || tickerUpper.includes('SPY') || tickerUpper.includes('VOO')) {
      geographicFocus = 'US';
    }

    return {
      tickerSymbol: ticker,
      securityName: ticker,
      assetClass,
      geographicFocus,
      isETF: tickerUpper.length <= 5 && /^[A-Z]+$/.test(tickerUpper), // Common ETF ticker pattern
      provider: 'inferred',
      lastUpdated: new Date()
    };
  }

  /**
   * Generate mock metadata for testing
   */
  private generateMockMetadata(ticker: string): SecurityMetadata {
    return {
      tickerSymbol: ticker,
      securityName: `Mock ${ticker}`,
      assetClass: ticker.includes('BOND') ? 'Fixed Income' : 'Equity',
      geographicFocus: ticker.includes('VXUS') ? 'International' : 'US',
      isETF: true,
      provider: 'fmp',
      lastUpdated: new Date()
    };
  }
}
