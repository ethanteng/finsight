import { UserTier } from './types';

export interface DataSourceConfig {
  id: string;
  name: string;
  description: string;
  tiers: UserTier[];
  category: 'account' | 'market' | 'external' | 'economic';
  provider: 'plaid' | 'fred' | 'alpha-vantage' | 'internal' | 'brave';
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

  // Investment Data (Standard+)
  'plaid-investments': {
    id: 'plaid-investments',
    name: 'Investment Holdings',
    description: 'Investment portfolio holdings and securities information',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'account',
    provider: 'plaid',
    cacheDuration: 15 * 60 * 1000, // 15 minutes
    isLive: true,
    upgradeBenefit: 'Track your investment portfolio and get diversification insights'
  },
  'plaid-investment-transactions': {
    id: 'plaid-investment-transactions',
    name: 'Investment Transactions',
    description: 'Buy/sell transactions and portfolio activity history',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'account',
    provider: 'plaid',
    cacheDuration: 15 * 60 * 1000, // 15 minutes
    isLive: true,
    upgradeBenefit: 'Analyze your investment activity and trading patterns'
  },

  // Economic Indicators (Standard+)
  'fred-cpi': {
    id: 'fred-cpi',
    name: 'Consumer Price Index',
    description: 'Inflation rate tracking via CPI data',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'economic',
    provider: 'fred',
    cacheDuration: 24 * 60 * 60 * 1000, // 24 hours
    isLive: false,
    upgradeBenefit: 'Track inflation impact on your savings'
  },
  'fred-fed-rate': {
    id: 'fred-fed-rate',
    name: 'Federal Reserve Rate',
    description: 'Current Federal Funds Rate',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'economic',
    provider: 'fred',
    cacheDuration: 24 * 60 * 60 * 1000, // 24 hours
    isLive: false,
    upgradeBenefit: 'Understand how Fed policy affects your loans and savings'
  },
  'fred-mortgage-rate': {
    id: 'fred-mortgage-rate',
    name: 'Mortgage Rates',
    description: 'Current 30-year fixed mortgage rates',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'economic',
    provider: 'fred',
    cacheDuration: 24 * 60 * 60 * 1000, // 24 hours
    isLive: false,
    upgradeBenefit: 'Compare mortgage rates for refinancing decisions'
  },
  'fred-credit-card-apr': {
    id: 'fred-credit-card-apr',
    name: 'Credit Card APR',
    description: 'Average credit card interest rates',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'economic',
    provider: 'fred',
    cacheDuration: 24 * 60 * 60 * 1000, // 24 hours
    isLive: false,
    upgradeBenefit: 'Understand credit card costs and debt management'
  },

  // Live Market Data (Premium only)
  'alpha-vantage-cd-rates': {
    id: 'alpha-vantage-cd-rates',
    name: 'CD Rates',
    description: 'Current certificate of deposit rates and APY',
    tiers: [UserTier.PREMIUM],
    category: 'external',
    provider: 'alpha-vantage',
    cacheDuration: 5 * 60 * 1000, // 5 minutes
    rateLimit: 5, // 5 requests per minute
    isLive: true,
    upgradeBenefit: 'Find the best CD rates to maximize your savings'
  },
  'alpha-vantage-treasury-yields': {
    id: 'alpha-vantage-treasury-yields',
    name: 'Treasury Yields',
    description: 'Current Treasury bond yields across all maturities',
    tiers: [UserTier.PREMIUM],
    category: 'external',
    provider: 'alpha-vantage',
    cacheDuration: 5 * 60 * 1000, // 5 minutes
    rateLimit: 5, // 5 requests per minute
    isLive: true,
    upgradeBenefit: 'Compare Treasury yields for safe investment options'
  },
  'alpha-vantage-mortgage-rates': {
    id: 'alpha-vantage-mortgage-rates',
    name: 'Live Mortgage Rates',
    description: 'Real-time mortgage rates from multiple lenders',
    tiers: [UserTier.PREMIUM],
    category: 'external',
    provider: 'alpha-vantage',
    cacheDuration: 5 * 60 * 1000, // 5 minutes
    rateLimit: 5, // 5 requests per minute
    isLive: true,
    upgradeBenefit: 'Get real-time mortgage rates for home buying decisions'
  },
  'alpha-vantage-stock-data': {
    id: 'alpha-vantage-stock-data',
    name: 'Stock Market Data',
    description: 'Real-time stock prices and market data',
    tiers: [UserTier.PREMIUM],
    category: 'external',
    provider: 'alpha-vantage',
    cacheDuration: 1 * 60 * 1000, // 1 minute
    rateLimit: 5, // 5 requests per minute
    isLive: true,
    upgradeBenefit: 'Track your investments with real-time market data'
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
      const standardSources = unavailableSources.filter(s => s.tiers.includes(UserTier.STANDARD));
      if (standardSources.length > 0) {
        suggestions.push(`Upgrade to Standard to access economic indicators like ${standardSources.map(s => s.name).join(', ')}`);
      }
      
      const premiumSources = unavailableSources.filter(s => s.tiers.includes(UserTier.PREMIUM));
      if (premiumSources.length > 0) {
        suggestions.push(`Upgrade to Premium for live market data including ${premiumSources.map(s => s.name).join(', ')}`);
      }
    } else if (tier === UserTier.STANDARD) {
      const premiumSources = unavailableSources.filter(s => s.tiers.includes(UserTier.PREMIUM));
      if (premiumSources.length > 0) {
        suggestions.push(`Upgrade to Premium for real-time market data including ${premiumSources.map(s => s.name).join(', ')}`);
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
        limitations.push('Limited to account data only');
        limitations.push('No economic context for financial decisions');
        limitations.push('No real-time search for current financial information');
        limitations.push('No live market data for investment insights');
        break;
      case UserTier.STANDARD:
        limitations.push('No live CD rates or Treasury yields');
        limitations.push('No stock market tracking');
        limitations.push('No real-time market data feeds');
        break;
      case UserTier.PREMIUM:
        limitations.push('Full access to all data sources');
        break;
    }

    return limitations;
  }
} 