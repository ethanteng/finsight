import { PrismaClient } from '@prisma/client';
import { withTransientProviderRetry } from './provider-request-policy';
import { PlaidApi } from 'plaid';
import { cacheService } from '../data/cache';

// Initialize Prisma client lazily to avoid import issues during ts-node startup
let prisma: PrismaClient | null = null;

const getPrismaClient = (): PrismaClient => {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
};

export interface BalanceData {
  account_id: string;
  available: number | null;
  current: number | null;
  limit: number | null;
  iso_currency_code: string | null;
  unofficial_currency_code: string | null;
  last_fetched: Date;
}

export interface CachedBalanceData extends BalanceData {
  cached_at: Date;
  expires_at: Date;
}

interface AccessTokenScope {
  id: string;
  userId: string | null;
}

export class BalanceService {
  private static readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private static readonly CACHE_PREFIX = 'balance_';

  /**
   * Get account balances with smart caching
   * Only calls Plaid API if data is stale or missing
   */
  static async getAccountBalances(
    accessToken: string,
    plaidClient: PlaidApi,
    forceRefresh: boolean = false
  ): Promise<BalanceData[]> {
    const tokenScope = await this.getAccessTokenScope(accessToken);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const cacheKey = `${this.CACHE_PREFIX}${tokenScope.id}_${today}`;

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await cacheService.get<CachedBalanceData[]>(cacheKey);
      if (cached) {
        console.log(`BalanceService: Using cached balance data for ${today}`);
        return cached.map(this.convertCachedToBalanceData);
      }
    }

    // Check database for recent data (within 24 hours)
    if (!forceRefresh) {
      const dbBalances = await this.getRecentBalancesFromDB(tokenScope.id);
      if (dbBalances.length > 0) {
        console.log(`BalanceService: Using recent database balance data`);
        // Cache the database data for future requests
        await this.cacheBalanceData(cacheKey, dbBalances);
        return dbBalances;
      }
    }

    // Fetch fresh data from Plaid API
    console.log(`BalanceService: Fetching fresh balance data from Plaid API`);
    const freshBalances = await this.fetchBalancesFromPlaid(accessToken, plaidClient);
    
    // Cache the fresh data
    await this.cacheBalanceData(cacheKey, freshBalances);
    
    // Update database with fresh data
    await this.updateDatabaseBalances(freshBalances, tokenScope);

    return freshBalances;
  }

  /**
   * Get balances for a specific account with smart caching
   */
  static async getAccountBalance(
    plaidAccountId: string,
    accessToken: string,
    plaidClient: PlaidApi,
    forceRefresh: boolean = false
  ): Promise<BalanceData | null> {
    const allBalances = await this.getAccountBalances(accessToken, plaidClient, forceRefresh);
    return allBalances.find(balance => balance.account_id === plaidAccountId) || null;
  }

  /**
   * Check if balance data is fresh (fetched within 24 hours)
   */
  static async isBalanceFresh(plaidAccountId: string): Promise<boolean> {
    const account = await getPrismaClient().account.findUnique({
      where: { plaidAccountId },
      select: { balanceLastFetched: true }
    });

    if (!account?.balanceLastFetched) {
      return false;
    }

    const now = new Date();
    const lastFetched = account.balanceLastFetched;
    const hoursSinceLastFetch = (now.getTime() - lastFetched.getTime()) / (1000 * 60 * 60);

    return hoursSinceLastFetch < 24;
  }

  /**
   * Force refresh all balances for a user (for background jobs)
   */
  static async refreshAllUserBalances(
    userId: string,
    plaidClient: PlaidApi
  ): Promise<{
    totalTokens: number;
    successful: number;
    failed: number;
    errors: Array<{ tokenId: string; error: string }>;
  }> {
    const accessTokens = await getPrismaClient().accessToken.findMany({
      where: { userId, isActive: true, supersededAt: null }
    });

    const errors: Array<{ tokenId: string; error: string }> = [];
    let successful = 0;

    for (const tokenRecord of accessTokens) {
      try {
        await this.getAccountBalances(tokenRecord.token, plaidClient, true);
        successful++;
        console.log(`BalanceService: Refreshed balances for user ${userId}, token ${tokenRecord.id}`);
      } catch (error) {
        console.error(`BalanceService: Error refreshing balances for user ${userId}:`, error);
        errors.push({
          tokenId: tokenRecord.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      totalTokens: accessTokens.length,
      successful,
      failed: errors.length,
      errors,
    };
  }

  /**
   * Private helper methods
   */
  private static async fetchBalancesFromPlaid(
    accessToken: string,
    plaidClient: PlaidApi
  ): Promise<BalanceData[]> {
    const response = await withTransientProviderRetry(() => plaidClient.accountsBalanceGet({
      access_token: accessToken,
    }));

    return response.data.accounts.map(account => ({
      account_id: account.account_id,
      available: account.balances.available,
      current: account.balances.current,
      limit: account.balances.limit,
      iso_currency_code: account.balances.iso_currency_code,
      unofficial_currency_code: account.balances.unofficial_currency_code,
      last_fetched: new Date()
    }));
  }

  private static async getAccessTokenScope(accessToken: string): Promise<AccessTokenScope> {
    const tokenRecord = await getPrismaClient().accessToken.findUnique({
      where: { token: accessToken },
      select: { id: true, userId: true }
    });
    if (!tokenRecord) {
      throw new Error('Cannot refresh balances for an unknown Plaid connection');
    }
    return tokenRecord;
  }

  private static async getRecentBalancesFromDB(accessTokenId: string): Promise<BalanceData[]> {
    const accounts = await getPrismaClient().account.findMany({
      where: { accessTokenId }
    });

    // Freshness is a property of the whole connection, not of individual rows.
    // Returning only the fresh subset would both drop accounts from the caller's
    // view and cache that partial set, so an account that stopped updating would
    // never trigger the live Plaid fetch that would repair it.
    const freshAfter = new Date(Date.now() - this.CACHE_TTL);
    const isFresh = (account: any) =>
      account.balanceLastFetched instanceof Date && account.balanceLastFetched >= freshAfter;

    if (accounts.length === 0 || !accounts.every(isFresh)) {
      return [];
    }

    return accounts.map((account: any) => ({
      account_id: account.plaidAccountId,
      available: account.availableBalance,
      current: account.currentBalance,
      limit: account.limit,
      iso_currency_code: account.currency,
      unofficial_currency_code: null,
      last_fetched: account.balanceLastFetched || new Date()
    }));
  }

  private static async cacheBalanceData(cacheKey: string, balances: BalanceData[]): Promise<void> {
    const cachedData: CachedBalanceData[] = balances.map(balance => ({
      ...balance,
      cached_at: new Date(),
      expires_at: new Date(Date.now() + this.CACHE_TTL)
    }));

    await cacheService.set(cacheKey, cachedData, this.CACHE_TTL);
  }

  private static async updateDatabaseBalances(
    balances: BalanceData[],
    tokenScope: AccessTokenScope
  ): Promise<void> {
    for (const balance of balances) {
      await getPrismaClient().account.updateMany({
        where: {
          plaidAccountId: balance.account_id,
          ...(tokenScope.userId
            ? {
                OR: [
                  { accessTokenId: tokenScope.id },
                  // Repair a legacy unscoped account only when it belongs to
                  // this token's owner.
                  { accessTokenId: null, userId: tokenScope.userId },
                ],
              }
            : { accessTokenId: tokenScope.id }),
        },
        data: {
          currentBalance: balance.current,
          availableBalance: balance.available,
          limit: balance.limit,
          currency: balance.iso_currency_code,
          balanceLastFetched: balance.last_fetched,
          accessTokenId: tokenScope.id
        }
      });
    }
  }

  private static convertCachedToBalanceData(cached: CachedBalanceData): BalanceData {
    return {
      account_id: cached.account_id,
      available: cached.available,
      current: cached.current,
      limit: cached.limit,
      iso_currency_code: cached.iso_currency_code,
      unofficial_currency_code: cached.unofficial_currency_code,
      last_fetched: cached.last_fetched
    };
  }

  /**
   * Get cache statistics for monitoring
   */
  static async getCacheStats(): Promise<{ size: number; keys: string[] }> {
    return cacheService.getStats();
  }

  /**
   * Clear all balance cache entries
   */
  static async clearCache(): Promise<void> {
    await cacheService.invalidate(this.CACHE_PREFIX);
  }
}
