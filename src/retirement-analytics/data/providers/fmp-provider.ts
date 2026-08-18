// Financial Modeling Prep Provider
// Phase 2: Historical Data Plumbing

import { FundExposure, FundExposureData, SecurityMetadata } from '../../types';
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
  assetUnderManagement?: number;
  aum?: number;
  netAssetValue?: number;
  nav?: number;
  holdingsCount?: number;
  inceptionDate?: string;
  currency?: string;
}

interface FMPCountryWeighting {
  country?: string;
  weightPercentage?: string | number;
  weight?: string | number;
}

interface FMPSectorWeighting {
  sector?: string;
  industry?: string;
  weightPercentage?: string | number;
  exposure?: string | number;
  weight?: string | number;
}

export const FMP_METADATA_VERSION = 2;
const FMP_REQUEST_TIMEOUT_MS = 10_000;

export class FMPProvider {
  private baseUrl = 'https://financialmodelingprep.com/stable';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch security metadata from FMP API
   * Returns asset class, expense ratio, geographic focus, etc.
   *
   * @param options.persistToDatabase - When false, skips DB writes (caller persists, e.g. batch upsert).
   * @param options.skipDatabaseLookup - When true, skips the DB cache read (caller already loaded batch).
   */
  async getSecurityMetadata(
    ticker: string,
    options?: { persistToDatabase?: boolean; skipDatabaseLookup?: boolean }
  ): Promise<SecurityMetadata> {
    const persistToDatabase = options?.persistToDatabase !== false;
    const skipDatabaseLookup = options?.skipDatabaseLookup === true;

    const cacheKey = `fmp_metadata_${ticker}`;
    const isTestKey = this.apiKey === 'test_fmp_key' || this.apiKey.startsWith('test_') || process.env.GITHUB_ACTIONS;
    
    // Check in-memory cache first (fastest)
    const cached = await cacheService.get<SecurityMetadata>(cacheKey);
    if (cached) {
      // If we have a real API key and cached data is inferred, try API anyway
      if (!isTestKey && (cached.provider === 'inferred' || cached.metadataVersion !== FMP_METADATA_VERSION)) {
        console.log(`🔄 FMP: Cached data for ${ticker} is inferred, will try API with real key`);
      } else {
        console.log(`📦 FMP: Using in-memory cache for ${ticker}`);
        return cached;
      }
    }

    if (!skipDatabaseLookup) {
      // Check database cache (persistent across restarts)
      const dbCached = await dbCache.getSecurityMetadata(ticker);
      if (dbCached) {
        // If we have a real API key and cached data is inferred, try API anyway to get better data
        if (!isTestKey && (dbCached.provider === 'inferred' || dbCached.metadataVersion !== FMP_METADATA_VERSION)) {
          console.log(`🔄 FMP: Database cache for ${ticker} is inferred, will try API with real key`);
        } else {
          console.log(`💾 FMP: Using database cache for ${ticker}`);
          // Also populate in-memory cache for faster subsequent access
          await cacheService.set(cacheKey, dbCached, 7 * 24 * 60 * 60 * 1000);
          return dbCached;
        }
      }
    }

    // Use mock data for test environment
    if (this.apiKey === 'test_fmp_key' || this.apiKey.startsWith('test_') || process.env.GITHUB_ACTIONS) {
      console.log(`⚠️ FMP Provider: Using inferred metadata for ${ticker} (test key or CI environment detected)`);
      const mockMetadata = this.generateMockMetadata(ticker);
      // Still save mock metadata to database for consistency (but only in non-CI environments)
      if (persistToDatabase && !process.env.GITHUB_ACTIONS) {
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
        console.log(`🔗 FMP: Fetching ETF info for ${ticker}`);
        const etfData = await this.fetchList<FMPETFInfo>('/etf/info', ticker);
        if (etfData.length > 0) {
            const [countryResult, sectorResult] = await Promise.allSettled([
              this.fetchList<FMPCountryWeighting>('/etf/country-weightings', ticker),
              this.fetchList<FMPSectorWeighting>('/etf/sector-weightings', ticker),
            ]);
            const metadata = this.parseETFInfo(
              etfData[0],
              ticker,
              countryResult.status === 'fulfilled' ? countryResult.value : [],
              sectorResult.status === 'fulfilled' ? sectorResult.value : [],
            );
            console.log(`✅ FMP: Successfully fetched ETF metadata for ${ticker}`);
            // Cache in memory
            await cacheService.set(cacheKey, metadata, 7 * 24 * 60 * 60 * 1000); // 7 days
            if (persistToDatabase) {
              console.log(`💾 FMP: Saving to database cache for ${ticker}`);
              await dbCache.saveSecurityMetadata(ticker, metadata, 'fmp').catch((err) => {
                console.error(`⚠️ Failed to save metadata to database for ${ticker}:`, err);
              });
            }
            return metadata;
        } else {
          console.log(`⚠️ FMP: ETF info returned empty data for ${ticker}`);
          // Some mutual funds have allocation coverage even when /etf/info is
          // empty. Starter exposes those vectors, so preserve them and merge
          // them with the regular profile rather than discarding the coverage.
          if (this.looksLikeMutualFund(ticker)) {
            const [profileResult, countryResult, sectorResult] = await Promise.allSettled([
              this.fetchList<FMPProfileResponse>('/profile', ticker),
              this.fetchList<FMPCountryWeighting>('/etf/country-weightings', ticker),
              this.fetchList<FMPSectorWeighting>('/etf/sector-weightings', ticker),
            ]);
            const countryData = countryResult.status === 'fulfilled' ? countryResult.value : [];
            const sectorData = sectorResult.status === 'fulfilled' ? sectorResult.value : [];
            if (countryData.length || sectorData.length) {
              const profile = profileResult.status === 'fulfilled' ? profileResult.value[0] : undefined;
              const metadata = this.parseFundAllocationsWithoutInfo(profile, ticker, countryData, sectorData);
              await cacheService.set(cacheKey, metadata, 7 * 24 * 60 * 60 * 1000);
              if (persistToDatabase) await dbCache.saveSecurityMetadata(ticker, metadata, 'fmp');
              return metadata;
            }
          }
        }
      } catch (etfError) {
        console.log(`⚠️ FMP: ETF info error for ${ticker}, trying regular profile:`, etfError instanceof Error ? etfError.message : String(etfError));
      }

      // Fallback to regular profile
      console.log(`🔗 FMP: Fetching regular profile for ${ticker}`);
      const data = await this.fetchList<FMPProfileResponse>('/profile', ticker);
      
      if (!data || data.length === 0) {
        console.warn(`⚠️ FMP: No metadata found in profile response for ${ticker}`);
        throw new Error(`No metadata found for ${ticker}`);
      }

      const metadata = this.parseProfile(data[0], ticker);
      console.log(`✅ FMP: Successfully fetched profile metadata for ${ticker}`);
      
      // Cache in memory for 7 days (metadata changes rarely)
      await cacheService.set(cacheKey, metadata, 7 * 24 * 60 * 60 * 1000);
      if (persistToDatabase) {
        console.log(`💾 FMP: Saving to database cache for ${ticker}`);
        await dbCache.saveSecurityMetadata(ticker, metadata, 'fmp').catch((err) => {
          console.error(`⚠️ Failed to save metadata to database for ${ticker}:`, err);
        });
      }
      
      return metadata;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error fetching FMP metadata for ${ticker}:`, errorMessage);
      console.log(`🔄 FMP: Falling back to inferred metadata for ${ticker}`);
      // Return inferred metadata instead of throwing
      const inferredMetadata = this.inferMetadata(ticker);
      if (persistToDatabase) {
        await dbCache.saveSecurityMetadata(ticker, inferredMetadata, 'inferred').catch(() => {
          // Ignore errors saving inferred metadata
        });
      }
      return inferredMetadata;
    }
  }

  /**
   * Parse ETF info response (new /stable/etf/info endpoint)
   */
  private parseETFInfo(
    data: FMPETFInfo,
    ticker: string,
    countries: FMPCountryWeighting[],
    sectors: FMPSectorWeighting[],
  ): SecurityMetadata {
    // Asset class is directly provided in the new API
    const assetClass = data.assetClass || undefined;

    const fundData = this.buildFundData(data, ticker, countries, sectors);
    const geographicFocus = this.deriveGeographicFocus(
      fundData.countryCoverage === 'available' ? fundData.countryAllocations : [],
      undefined,
      data.name,
      data.description,
    );

    return {
      tickerSymbol: ticker,
      securityName: data.name || ticker,
      assetClass,
      fundCategory: undefined,
      // FMP reports 0.09 for a 0.09% fee. Internal ratios use decimal form.
      expenseRatio: this.normalizeExpenseRatio(data.expenseRatio),
      geographicFocus,
      isETF: !this.looksLikeMutualFund(ticker),
      fundData,
      metadataVersion: FMP_METADATA_VERSION,
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
    } else {
      assetClass = 'Equity';
    }

    // Profile country/sector describe a single-name equity, not fund look-through
    // weights. Treating ETF/mutual-fund domicile as coverage='available' would
    // override name/ticker international heuristics (e.g. US-domiciled VXUS).
    const isFund = Boolean(data.isEtf) || this.looksLikeMutualFund(ticker);

    // Determine geographic focus. For funds, prefer name/description signals over
    // legal domicile (US-domiciled international ETFs are common).
    const nameForGeo = data.companyName || data.name || ticker;
    let geographicFocus: string | undefined;
    if (isFund) {
      geographicFocus = this.deriveGeographicFocus([], data.country, nameForGeo, data.description);
    } else {
      const country = data.country?.toLowerCase() || '';
      if (country.includes('united states') || country.includes('usa') || country === 'us') {
        geographicFocus = 'US';
      } else if (country && country !== 'united states' && country !== 'us') {
        geographicFocus = 'International';
      }
    }

    const countryAllocations = !isFund && data.country
      ? [{ name: data.country, weight: 1 }]
      : [];
    const sectorAllocations = !isFund && data.sector
      ? [{ name: data.sector, weight: 1 }]
      : [];

    return {
      tickerSymbol: ticker,
      securityName: data.companyName || data.name || ticker,
      assetClass,
      fundCategory: industry || sector || undefined,
      expenseRatio: undefined, // Regular profile doesn't provide expense ratio
      geographicFocus,
      isETF: data.isEtf || false,
      fundData: {
        instrumentType: data.isEtf
          ? 'etf'
          : this.looksLikeMutualFund(ticker)
            ? 'mutual_fund'
            : 'equity',
        currency: data.currency,
        countryAllocations,
        sectorAllocations,
        countryCoverage: countryAllocations.length ? 'available' : 'unavailable',
        sectorCoverage: sectorAllocations.length ? 'available' : 'unavailable',
      },
      metadataVersion: FMP_METADATA_VERSION,
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
      metadataVersion: FMP_METADATA_VERSION,
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
      metadataVersion: FMP_METADATA_VERSION,
      provider: 'fmp',
      lastUpdated: new Date()
    };
  }

  private async fetchList<T>(path: string, ticker: string): Promise<T[]> {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('symbol', ticker.trim().toUpperCase());
    url.searchParams.set('apikey', this.apiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FMP_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`FMP API error for ${path}: HTTP ${response.status}`);
      }
      const body = await response.json();
      if (!Array.isArray(body)) throw new Error(`FMP API returned an unexpected response for ${path}`);
      return body as T[];
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseFundAllocationsWithoutInfo(
    profile: FMPProfileResponse | undefined,
    ticker: string,
    countries: FMPCountryWeighting[],
    sectors: FMPSectorWeighting[],
  ): SecurityMetadata {
    const fundData = this.buildFundData({}, ticker, countries, sectors);
    const name = profile?.companyName || profile?.name || ticker;
    const nameLower = name.toLowerCase();
    const assetClass = nameLower.includes('bond') || nameLower.includes('fixed income')
      ? 'Fixed Income'
      : nameLower.includes('money market') || nameLower.includes('cash')
        ? 'Cash'
        : 'Equity';
    return {
      tickerSymbol: ticker,
      securityName: name,
      assetClass,
      fundCategory: profile?.industry || profile?.sector,
      geographicFocus: this.deriveGeographicFocus(
        fundData.countryCoverage === 'available' ? fundData.countryAllocations : [],
        profile?.country,
        name,
      ),
      isETF: false,
      fundData,
      metadataVersion: FMP_METADATA_VERSION,
      provider: 'fmp',
      lastUpdated: new Date(),
    };
  }

  private buildFundData(
    info: Partial<FMPETFInfo>,
    ticker: string,
    countries: FMPCountryWeighting[],
    sectors: FMPSectorWeighting[],
  ): FundExposureData {
    const countryAllocations = this.normalizeCountryExposures(countries);
    const sectorAllocations = this.normalizeSectorExposures(sectors);
    return {
      instrumentType: this.looksLikeMutualFund(ticker) ? 'mutual_fund' : 'etf',
      assetUnderManagement: info.assetUnderManagement ?? info.aum,
      nav: info.netAssetValue ?? info.nav,
      currency: info.currency,
      holdingsCount: info.holdingsCount,
      inceptionDate: info.inceptionDate,
      countryAllocations,
      sectorAllocations,
      countryCoverage: this.exposureCoverage(countryAllocations, ['other']),
      // FMP's sector vector for multi-asset/target-date funds describes an
      // equity sleeve but Starter does not expose that sleeve's size. Preserve
      // the vector, but do not present it as whole-fund sector exposure.
      sectorCoverage: info.assetClass?.toLowerCase().includes('multi-asset')
        ? 'degenerate'
        : this.exposureCoverage(sectorAllocations, ['cash & others', 'other']),
    };
  }

  private normalizeCountryExposures(rows: FMPCountryWeighting[]): FundExposure[] {
    const combined = new Map<string, number>();
    for (const row of rows) {
      const name = row.country?.trim();
      const weight = row.weightPercentage !== undefined && row.weightPercentage !== null
        ? this.normalizeAllocationWeight(row.weightPercentage, true)
        : this.normalizeAllocationWeight(row.weight, false);
      if (!name || weight === undefined || weight < 0) continue;
      combined.set(name, (combined.get(name) ?? 0) + weight);
    }
    return [...combined.entries()]
      .map(([name, weight]) => ({ name, weight }))
      .sort((left, right) => right.weight - left.weight);
  }

  private normalizeSectorExposures(rows: FMPSectorWeighting[]): FundExposure[] {
    const combined = new Map<string, number>();
    for (const row of rows) {
      const name = (row.sector ?? row.industry)?.trim();
      // Prefer explicit percentage fields; fall back to fractional exposure/weight.
      const weight = row.weightPercentage !== undefined && row.weightPercentage !== null
        ? this.normalizeAllocationWeight(row.weightPercentage, true)
        : this.normalizeAllocationWeight(row.exposure ?? row.weight, false);
      if (!name || weight === undefined || weight < 0) continue;
      combined.set(name, (combined.get(name) ?? 0) + weight);
    }
    return [...combined.entries()]
      .map(([name, weight]) => ({ name, weight }))
      .sort((left, right) => right.weight - left.weight);
  }

  /**
   * @param treatAsPercentage When true (FMP `weightPercentage` fields), values
   *   like `0.5` mean 0.5% even without a `%` suffix. Fractional `weight` /
   *   `exposure` fields stay as 0-1 unless they include `%` or exceed 1.
   */
  private normalizeAllocationWeight(
    value: string | number | undefined,
    treatAsPercentage = false,
  ): number | undefined {
    if (value === undefined || value === null) return undefined;
    const text = String(value).trim();
    const numeric = Number.parseFloat(text.replace('%', ''));
    if (!Number.isFinite(numeric)) return undefined;
    return text.includes('%') || treatAsPercentage || numeric > 1
      ? numeric / 100
      : numeric;
  }

  private normalizeExpenseRatio(value: number | undefined): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value / 100 : undefined;
  }

  private exposureCoverage(
    exposures: FundExposure[],
    degenerateLabels: string[],
  ): FundExposureData['countryCoverage'] {
    if (!exposures.length) return 'unavailable';
    if (
      exposures.length === 1
      && degenerateLabels.includes(exposures[0].name.trim().toLowerCase())
      && exposures[0].weight >= 0.95
    ) return 'degenerate';
    return 'available';
  }

  private deriveGeographicFocus(
    countries: FundExposure[],
    fallbackCountry?: string,
    name?: string,
    description?: string,
  ): string | undefined {
    if (countries.length) {
      const usWeight = countries
        .filter(item => ['united states', 'us', 'usa'].includes(item.name.trim().toLowerCase()))
        .reduce((sum, item) => sum + item.weight, 0);
      if (usWeight >= 0.85) return 'US';
      if (usWeight <= 0.35) return 'International';
      return 'Global';
    }

    const fallback = fallbackCountry?.toLowerCase() || '';
    const combined = `${name || ''} ${description || ''}`.toLowerCase();
    if (combined.includes('international') || combined.includes('ex-us')) return 'International';
    if (combined.includes('global') || combined.includes('world')) return 'Global';
    if (fallback.includes('united states') || fallback === 'us' || fallback === 'usa') return 'US';
    return fallback ? 'International' : undefined;
  }

  private looksLikeMutualFund(ticker: string): boolean {
    return /^[A-Z]{4,5}X$/.test(ticker.trim().toUpperCase());
  }
}
