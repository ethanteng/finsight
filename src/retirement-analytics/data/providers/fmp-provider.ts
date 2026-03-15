// Financial Modeling Prep Provider
// Phase 2: Historical Data Plumbing

import { SecurityMetadata } from '../../types';
import { cacheService } from '../../../data/cache';
import { dbCache } from '../db-cache';

interface FMPProfileResponse {
  symbol: string;
  companyName?: string;
  name?: string;
  industry?: string;
  sector?: string;
  exchange?: string;
  currency?: string;
  isEtf?: boolean;
  isActivelyTrading?: boolean;
  price?: number;
  beta?: number;
  country?: string;
  description?: string;
}

interface FMPETFInfo {
  symbol: string;
  name: string;
  description?: string;
  assetClass: string;
  domicile?: string;
  expenseRatio?: number;
  isActivelyTrading?: boolean;
  sectorsList?: Array<{
    industry: string;
    exposure: number;
  }>;
  country?: string;
}

export class FMPProvider {
  private baseUrl = 'https://financialmodelingprep.com/stable';
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
    const isTestKey = this.apiKey === 'test_fmp_key' || this.apiKey.startsWith('test_') || process.env.GITHUB_ACTIONS;
    
    // Check in-memory cache first (fastest)
    const cached = await cacheService.get<SecurityMetadata>(cacheKey);
    if (cached) {
      // If we have a real API key and cached data is inferred, try API anyway
      if (!isTestKey && cached.provider === 'inferred') {
        console.log(`🔄 FMP: Cached data for ${ticker} is inferred, will try API with real key`);
      } else {
        console.log(`📦 FMP: Using in-memory cache for ${ticker}`);
        return cached;
      }
    }

    // Check database cache (persistent across restarts)
    const dbCached = await dbCache.getSecurityMetadata(ticker);
    if (dbCached) {
      // If we have a real API key and cached data is inferred, try API anyway to get better data
      if (!isTestKey && dbCached.provider === 'inferred') {
        console.log(`🔄 FMP: Database cache for ${ticker} is inferred, will try API with real key`);
      } else {
        console.log(`💾 FMP: Using database cache for ${ticker}`);
        // Also populate in-memory cache for faster subsequent access
        await cacheService.set(cacheKey, dbCached, 7 * 24 * 60 * 60 * 1000);
        return dbCached;
      }
    }

    // Use mock data for test environment
    if (this.apiKey === 'test_fmp_key' || this.apiKey.startsWith('test_') || process.env.GITHUB_ACTIONS) {
      console.log(`⚠️ FMP Provider: Using inferred metadata for ${ticker} (test key or CI environment detected)`);
      const mockMetadata = this.generateMockMetadata(ticker);
      // Still save mock metadata to database for consistency (but only in non-CI environments)
      if (!process.env.GITHUB_ACTIONS) {
        await dbCache.saveSecurityMetadata(ticker, mockMetadata, 'inferred').catch(() => {
          // Ignore errors saving mock metadata
        });
      }
      return mockMetadata;
    }

    try {
      console.log(`🌐 FMP: Attempting to fetch metadata for ${ticker} from API`);
      // Try ETF info first (more detailed metadata including expense ratio)
      try {
        const etfUrl = `${this.baseUrl}/etf/info?symbol=${ticker}&apikey=${this.apiKey}`;
        console.log(`🔗 FMP: Fetching ETF info for ${ticker}`);
        const etfResponse = await fetch(etfUrl);
        
        if (etfResponse.ok) {
          const etfData = (await etfResponse.json()) as FMPETFInfo[];
          if (etfData && etfData.length > 0) {
            const metadata = this.parseETFInfo(etfData[0], ticker);
            console.log(`✅ FMP: Successfully fetched ETF metadata for ${ticker}`);
            // Cache in memory
            await cacheService.set(cacheKey, metadata, 7 * 24 * 60 * 60 * 1000); // 7 days
            // Also persist to database
            console.log(`💾 FMP: Saving to database cache for ${ticker}`);
            await dbCache.saveSecurityMetadata(ticker, metadata, 'fmp').catch((err) => {
              console.error(`⚠️ Failed to save metadata to database for ${ticker}:`, err);
            });
            return metadata;
          } else {
            console.log(`⚠️ FMP: ETF info returned empty data for ${ticker}`);
          }
        } else {
          const errorText = await etfResponse.text().catch(() => 'Unable to read error response');
          console.log(`⚠️ FMP: ETF info request failed for ${ticker}: ${etfResponse.status} ${etfResponse.statusText} - ${errorText}`);
        }
      } catch (etfError) {
        console.log(`⚠️ FMP: ETF info error for ${ticker}, trying regular profile:`, etfError instanceof Error ? etfError.message : String(etfError));
      }

      // Fallback to regular profile
      const profileUrl = `${this.baseUrl}/profile?symbol=${ticker}&apikey=${this.apiKey}`;
      console.log(`🔗 FMP: Fetching regular profile for ${ticker}`);
      const response = await fetch(profileUrl);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        console.error(`❌ FMP API error for ${ticker}: ${response.status} ${response.statusText} - ${errorText}`);
        throw new Error(`FMP API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as FMPProfileResponse[];
      
      if (!data || data.length === 0) {
        console.warn(`⚠️ FMP: No metadata found in profile response for ${ticker}`);
        throw new Error(`No metadata found for ${ticker}`);
      }

      const metadata = this.parseProfile(data[0], ticker);
      console.log(`✅ FMP: Successfully fetched profile metadata for ${ticker}`);
      
      // Cache in memory for 7 days (metadata changes rarely)
      await cacheService.set(cacheKey, metadata, 7 * 24 * 60 * 60 * 1000);
      // Also persist to database
      console.log(`💾 FMP: Saving to database cache for ${ticker}`);
      await dbCache.saveSecurityMetadata(ticker, metadata, 'fmp').catch((err) => {
        console.error(`⚠️ Failed to save metadata to database for ${ticker}:`, err);
      });
      
      return metadata;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error fetching FMP metadata for ${ticker}:`, errorMessage);
      console.log(`🔄 FMP: Falling back to inferred metadata for ${ticker}`);
      // Return inferred metadata instead of throwing
      const inferredMetadata = this.inferMetadata(ticker);
      // Cache inferred metadata in database too (so we don't keep trying API)
      await dbCache.saveSecurityMetadata(ticker, inferredMetadata, 'inferred').catch(() => {
        // Ignore errors saving inferred metadata
      });
      return inferredMetadata;
    }
  }

  /**
   * Parse ETF info response (new /stable/etf/info endpoint)
   */
  private parseETFInfo(data: FMPETFInfo, ticker: string): SecurityMetadata {
    // Asset class is directly provided in the new API
    const assetClass = data.assetClass || undefined;

    // Determine geographic focus from domicile, name, or description
    let geographicFocus: string | undefined;
    const domicile = data.domicile?.toLowerCase() || '';
    const name = data.name?.toLowerCase() || '';
    const description = data.description?.toLowerCase() || '';
    
    if (domicile === 'us' || name.includes('us') || name.includes('united states') || description.includes('us index')) {
      geographicFocus = 'US';
    } else if (name.includes('international') || name.includes('ex-us') || description.includes('international')) {
      geographicFocus = 'International';
    } else if (name.includes('global') || description.includes('global')) {
      geographicFocus = 'Global';
    } else if (domicile && domicile !== 'us') {
      geographicFocus = 'International';
    }

    // Determine fund category from sectors list if available
    let fundCategory: string | undefined;
    if (data.sectorsList && data.sectorsList.length > 0) {
      // Use the sector with highest exposure
      const topSector = data.sectorsList.reduce((max, sector) => 
        sector.exposure > max.exposure ? sector : max
      );
      fundCategory = topSector.industry;
    }

    return {
      tickerSymbol: ticker,
      securityName: data.name || ticker,
      assetClass,
      fundCategory,
      expenseRatio: data.expenseRatio, // FMP API returns expenseRatio already in decimal form (e.g., 0.0075 = 0.75%)
      geographicFocus,
      isETF: true, // This endpoint is specifically for ETFs
      provider: 'fmp',
      lastUpdated: new Date()
    };
  }

  /**
   * Parse regular profile response (new /stable/profile endpoint)
   */
  private parseProfile(data: FMPProfileResponse, ticker: string): SecurityMetadata {
    // Determine asset class from sector/industry/name or infer from ETF status
    let assetClass: string | undefined;
    const sector = data.sector?.toLowerCase() || '';
    const industry = data.industry?.toLowerCase() || '';
    const name = (data.companyName || data.name || '').toLowerCase();
    
    if (sector.includes('bond') || industry.includes('bond') || industry.includes('fixed income') ||
        name.includes('bond') || name.includes('fixed income') || name.includes('treasury') ||
        name.includes('tips') || name.includes('aggregate') || name.includes('corporate bond')) {
      assetClass = 'Fixed Income';
    } else if (sector.includes('equity') || industry.includes('equity') || data.isEtf) {
      assetClass = 'Equity';
    }

    // Determine geographic focus
    let geographicFocus: string | undefined;
    const country = data.country?.toLowerCase() || '';
    if (country.includes('united states') || country.includes('usa') || country === 'us') {
      geographicFocus = 'US';
    } else if (country && country !== 'united states' && country !== 'us') {
      geographicFocus = 'International';
    }

    return {
      tickerSymbol: ticker,
      securityName: data.companyName || data.name || ticker,
      assetClass,
      fundCategory: industry || sector || undefined,
      expenseRatio: undefined, // Regular profile doesn't provide expense ratio
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
    
    // Common bond ETF ticker patterns (when FMP API fails)
    const bondTickerPatterns = ['BOND', 'AGG', 'BND', 'BNDX', 'JCPB', 'JPST', 'STIP', 'VWOB', 'EMB',
      'IUSB', 'MUB', 'EAGG', 'SUSC', 'TIP', 'TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'VCIT', 'VCSH'];
    if (bondTickerPatterns.some(p => tickerUpper.includes(p))) {
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
