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

// User Tier Types
export enum UserTier {
  FREE = 'free',
  STANDARD = 'standard',
  PREMIUM = 'premium'
}

export interface TierAccess {
  tier: UserTier;
  hasEconomicContext: boolean;
  hasLiveData: boolean;
  hasScenarioPlanning: boolean;
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
  getLiveMarketData(): Promise<LiveMarketData>;
  getDataPoint(key: string): Promise<MarketDataPoint>;
}

// Cache Types
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, data: T, ttl?: number): Promise<void>;
  invalidate(pattern: string): Promise<void>;
} 