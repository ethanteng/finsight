import { UserTier } from './types';

export interface DataSourceConfig {
  id: string;
  name: string;
  description: string;
  tiers: UserTier[];
  category: 'account' | 'market' | 'external' | 'economic';
  provider: 'plaid' | 'fred' | 'massive' | 'tiingo' | 'fmp' | 'internal' | 'brave' | 'rentcast';
  cacheDuration: number; // milliseconds
  rateLimit?: number; // requests per minute
  isLive: boolean;
  upgradeBenefit?: string;
}

export const dataSourceRegistry: Record<string, DataSourceConfig> = {
  // Account Data (all tiers)
  'account-balances': {
    id: 'account-balances',
    name: 'Account Balances',
    description: 'Current and available balances for all connected accounts',
    tiers: [UserTier.STARTER, UserTier.STANDARD, UserTier.PREMIUM],
    category: 'account',
    provider: 'plaid',
    cacheDuration: 5 * 60 * 1000, // 5 minutes
    isLive: true
  },
  'account-transactions': {
    id: 'account-transactions',
    name: 'Transaction History',
    description: 'Detailed transaction history with categories and merchants',
    tiers: [UserTier.STARTER, UserTier.STANDARD, UserTier.PREMIUM],
    category: 'account',
    provider: 'plaid',
    cacheDuration: 5 * 60 * 1000, // 5 minutes
    isLive: true
  },
  'account-institutions': {
    id: 'account-institutions',
    name: 'Financial Institutions',
    description: 'Connected banks and financial institutions',
    tiers: [UserTier.STARTER, UserTier.STANDARD, UserTier.PREMIUM],
    category: 'account',
    provider: 'plaid',
    cacheDuration: 60 * 60 * 1000, // 1 hour
    isLive: false
  },

  // Investment Data (All tiers - Plaid data should be available to everyone)
  'plaid-investments': {
    id: 'plaid-investments',
    name: 'Investment Holdings',
    description: 'Investment portfolio holdings and securities information',
    tiers: [UserTier.STARTER, UserTier.STANDARD, UserTier.PREMIUM],
    category: 'account',
    provider: 'plaid',
    cacheDuration: 15 * 60 * 1000, // 15 minutes
    isLive: true
  },
  'plaid-investment-transactions': {
    id: 'plaid-investment-transactions',
    name: 'Investment Transactions',
    description: 'Buy/sell transactions and portfolio activity history',
    tiers: [UserTier.STARTER, UserTier.STANDARD, UserTier.PREMIUM],
    category: 'account',
    provider: 'plaid',
    cacheDuration: 15 * 60 * 1000, // 15 minutes
    isLive: true
  },

  'fmp-fund-exposures': {
    id: 'fmp-fund-exposures',
    name: 'Fund Fees and Look-Through Exposures',
    description: 'FMP Starter fund metadata, expense ratios, country allocations and sector weightings when covered',
    tiers: [UserTier.STARTER, UserTier.STANDARD, UserTier.PREMIUM],
    // This enriches the user's connected positions, so it follows the account
    // data entitlement rather than the separate market-context tier gate.
    category: 'account',
    provider: 'fmp',
    cacheDuration: 7 * 24 * 60 * 60 * 1000,
    isLive: false,
  },
  'tiingo-investment-market-data': {
    id: 'tiingo-investment-market-data',
    name: 'Investment Market Data',
    description: 'Tiingo Power adjusted price history and batched IEX quotes for connected positions',
    tiers: [UserTier.STARTER, UserTier.STANDARD, UserTier.PREMIUM],
    category: 'account',
    provider: 'tiingo',
    cacheDuration: 5 * 60 * 1000,
    isLive: true,
  },
  'tiingo-market-context': {
    id: 'tiingo-market-context',
    name: 'Tiingo Market Context',
    description: 'Broad-market IEX observations and ticker-linked financial news',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'external',
    provider: 'tiingo',
    cacheDuration: 5 * 60 * 1000,
    isLive: true,
    upgradeBenefit: 'Add live broad-market quotes and structured market news',
  },

  // Home Valuations (All tiers)
  'home-valuations': {
    id: 'home-valuations',
    name: 'Home Valuations',
    description: 'Track your home value and include it in Net Worth calculations',
    tiers: [UserTier.STARTER, UserTier.STANDARD, UserTier.PREMIUM],
    category: 'account',
    provider: 'rentcast',
    cacheDuration: 30 * 24 * 60 * 60 * 1000, // 30 days
    isLive: false
  },

  // Economic Indicators (Standard+)
  'fred-cpi': {
    id: 'fred-cpi',
    name: 'CPI Inflation Rate',
    description: 'Year-over-year inflation calculated from CPIAUCSL by FRED',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'economic',
    provider: 'fred',
    cacheDuration: 24 * 60 * 60 * 1000, // 24 hours
    isLive: false,
    upgradeBenefit: 'Track inflation impact on your savings'
  },
  'fred-fed-rate': {
    id: 'fred-fed-rate',
    name: 'Federal Funds Effective Rate',
    description: 'Latest published daily federal funds effective rate',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'economic',
    provider: 'fred',
    cacheDuration: 4 * 60 * 60 * 1000, // 4 hours
    isLive: false,
    upgradeBenefit: 'Understand how Fed policy affects your loans and savings'
  },
  'fred-mortgage-rate': {
    id: 'fred-mortgage-rate',
    name: 'Mortgage Rates',
    description: 'Latest Freddie Mac 30-year fixed mortgage market average',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'economic',
    provider: 'fred',
    cacheDuration: 24 * 60 * 60 * 1000, // 24 hours
    isLive: false,
    upgradeBenefit: 'Compare mortgage rates for refinancing decisions'
  },
  'fred-credit-card-apr': {
    id: 'fred-credit-card-apr',
    name: 'Average Credit Card Rate',
    description: 'Latest published commercial-bank credit card rate for all accounts',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'economic',
    provider: 'fred',
    cacheDuration: 24 * 60 * 60 * 1000, // 24 hours
    isLive: false,
    upgradeBenefit: 'Understand credit card costs and debt management'
  },
  'fred-unemployment': {
    id: 'fred-unemployment',
    name: 'Unemployment Rate',
    description: 'Latest published U.S. unemployment rate',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'economic',
    provider: 'fred',
    cacheDuration: 24 * 60 * 60 * 1000,
    isLive: false,
    upgradeBenefit: 'Add labor-market context to financial planning'
  },
  'fred-treasury-10y': {
    id: 'fred-treasury-10y',
    name: '10-Year Treasury Rate',
    description: 'Latest numeric 10-year Treasury constant-maturity rate',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'economic',
    provider: 'fred',
    cacheDuration: 4 * 60 * 60 * 1000,
    isLive: false,
    upgradeBenefit: 'Compare borrowing and investment rates with a Treasury benchmark'
  },
  'fred-cd-12-month': {
    id: 'fred-cd-12-month',
    name: 'National 12-Month CD Rate',
    description: 'FDIC national average rate for 12-month CDs (NDR12MCD)',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'economic',
    provider: 'fred',
    cacheDuration: 24 * 60 * 60 * 1000,
    isLive: false,
    upgradeBenefit: 'Compare CD offers with the FDIC national average'
  },

  // Premium market context is supplied by Massive (formerly Polygon.io) in the
  // persisted market-news pipeline. It includes SPY daily bars, the Treasury
  // yield curve, and inflation expectations. Realized inflation comes from FRED.
  'massive-market-context': {
    id: 'massive-market-context',
    name: 'Advanced Market Context',
    description: 'SPY daily movement, the Treasury yield curve, and inflation expectations',
    tiers: [UserTier.PREMIUM],
    category: 'external',
    provider: 'massive',
    cacheDuration: 4 * 60 * 60 * 1000,
    isLive: false,
    upgradeBenefit: 'Add market movement, yield-curve, and inflation-expectations context to financial analysis'
  },

  // Search Context (Standard+)
  'brave-search': {
    id: 'brave-search',
    name: 'Real-time Financial Search',
    description: 'Search for current financial information and rates',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'external',
    provider: 'brave',
    cacheDuration: 30 * 60 * 1000, // 30 minutes
    isLive: true,
    upgradeBenefit: 'Get real-time financial information and current rates'
  }
};

export class DataSourceManager {
  static getSourcesForTier(tier: UserTier): DataSourceConfig[] {
    return Object.values(dataSourceRegistry).filter(source => 
      source.tiers.includes(tier)
    );
  }

  static getUnavailableSourcesForTier(tier: UserTier): DataSourceConfig[] {
    return Object.values(dataSourceRegistry).filter(source => 
      !source.tiers.includes(tier)
    );
  }

  static getUpgradeSuggestions(tier: UserTier): string[] {
    const unavailableSources = this.getUnavailableSourcesForTier(tier);
    const suggestions: string[] = [];

    if (tier === UserTier.STARTER) {
      // Sources unlocked at Standard (may also be available at Premium).
      const standardSources = unavailableSources.filter(s =>
        s.tiers.includes(UserTier.STANDARD)
      );
      if (standardSources.length > 0) {
        suggestions.push(`Upgrade to Standard to access economic indicators like ${standardSources.map(s => s.name).join(', ')}`);
      }

      // Premium-only sources (exclude anything already unlocked at Standard).
      const premiumOnlySources = unavailableSources.filter(
        s => s.tiers.includes(UserTier.PREMIUM) && !s.tiers.includes(UserTier.STANDARD)
      );
      if (premiumOnlySources.length > 0) {
        suggestions.push(`Upgrade to Premium for advanced market context including ${premiumOnlySources.map(s => s.name).join(', ')}`);
      }
    } else if (tier === UserTier.STANDARD) {
      const premiumOnlySources = unavailableSources.filter(
        s => s.tiers.includes(UserTier.PREMIUM) && !s.tiers.includes(UserTier.STANDARD)
      );
      if (premiumOnlySources.length > 0) {
        suggestions.push(`Upgrade to Premium for advanced market context including ${premiumOnlySources.map(s => s.name).join(', ')}`);
      }
    }

    return suggestions;
  }

  static getNextTier(tier: UserTier): UserTier | null {
    switch (tier) {
      case UserTier.STARTER:
        return UserTier.STANDARD;
      case UserTier.STANDARD:
        return UserTier.PREMIUM;
      case UserTier.PREMIUM:
        return null; // Already at highest tier
      default:
        return UserTier.STANDARD;
    }
  }

  static getTierLimitations(tier: UserTier): string[] {
    const limitations: string[] = [];
    
    switch (tier) {
      case UserTier.STARTER:
        limitations.push('No economic context for financial decisions');
        limitations.push('No real-time search for current financial information');
        limitations.push('No premium Massive market and yield-curve context');
        break;
      case UserTier.STANDARD:
        limitations.push('No premium Massive market and yield-curve context');
        break;
      case UserTier.PREMIUM:
        limitations.push('Full access to all data sources');
        break;
    }

    return limitations;
  }
}
