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
  unemployment?: MarketDataPoint; // Optional for backward compatibility
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
