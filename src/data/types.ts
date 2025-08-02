// Data Feed Types
export interface MarketDataPoint {
  value: number;
  date: string;
  source: string;
  lastUpdated: string;
}

export interface EconomicIndicator {
  cpi: MarketDataPoint;
  fedRate: MarketDataPoint;
  mortgageRate: MarketDataPoint;
  creditCardAPR: MarketDataPoint;
}

export interface LiveMarketData {
  cdRates: CDRate[];
  treasuryYields: TreasuryYield[];
  mortgageRates: MortgageRate[];
}

export interface CDRate {
  term: string; // "3-month", "6-month", "1-year", etc.
  rate: number;
  institution: string;
  lastUpdated: string;
}

export interface TreasuryYield {
  term: string; // "1-month", "3-month", "6-month", "1-year", "2-year", "5-year", "10-year", "30-year"
  yield: number;
  lastUpdated: string;
}

export interface MortgageRate {
  type: string; // "30-year-fixed", "15-year-fixed", "5/1-arm", etc.
  rate: number;
  lastUpdated: string;
}

// User Tier Types - will be used in Step 4
export enum UserTier {
  STARTER = 'starter',
  STANDARD = 'standard',
  PREMIUM = 'premium'
}

// Tier access configuration - will be used in Step 4
export interface TierAccess {
  tier: UserTier; // Will be used in Step 4
  hasEconomicContext: boolean;
  hasLiveData: boolean;
  hasScenarioPlanning: boolean;
  hasSearchContext: boolean;
}

// Data Source Types
export interface DataSource {
  name: string;
  baseUrl: string;
  apiKey?: string;
  rateLimit: number; // requests per minute
  cacheDuration: number; // milliseconds
}

export interface DataProvider {
  getEconomicIndicators(): Promise<EconomicIndicator>;
  getLiveMarketData(tier?: UserTier): Promise<LiveMarketData | null>;
  getDataPoint(key: string): Promise<MarketDataPoint>; // Will be used in Step 4
}

// Cache Types - will be implemented in Step 4
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, data: T, ttl?: number): Promise<void>; // Will be used in Step 4
  invalidate(pattern: string): Promise<void>; // Will be used in Step 4
} 