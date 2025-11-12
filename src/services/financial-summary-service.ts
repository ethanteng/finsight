import { getPrismaClient } from '../prisma-client';
import { FinancialDataService, UnifiedFinancialData, Account, HomeData } from './financial-data-service';

const prisma = getPrismaClient();

export interface FinancialOverview {
  netWorth: number;
  totalCash: number;
  totalInvestments: number;
  totalDebt: number;
  homeValue: number | null;
}

export interface InvestmentPortfolio {
  totalValue: number;
  holdingsCount: number;
  assetAllocation: Array<{
    type: string;
    value: number;
    percentage: number;
  }>;
  securityCount: number;
}

export interface FinancialSummary {
  financialOverview: FinancialOverview;
  investmentPortfolio: InvestmentPortfolio;
  lastUpdated: Date;
}

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export class FinancialSummaryService {
  private financialDataService: FinancialDataService;

  constructor() {
    this.financialDataService = new FinancialDataService();
  }

  /**
   * Check if summary is stale (older than 24 hours)
   */
  isSummaryStale(lastUpdated: Date | null): boolean {
    if (!lastUpdated) {
      return true;
    }
    const now = new Date();
    const age = now.getTime() - lastUpdated.getTime();
    return age > STALE_THRESHOLD_MS;
  }

  /**
   * Deduplicate accounts by plaidAccountId, keeping most recent entry
   */
  private deduplicateAccounts(accounts: Account[]): Account[] {
    const accountMap = new Map<string, Account>();
    const seenIds = new Set<string>();
    
    for (const account of accounts) {
      const accountAny = account as any;
      
      // Try multiple keys for deduplication
      const plaidAccountId = accountAny.plaidAccountId || 
                             accountAny.persistentAccountId || 
                             account.account_id || 
                             account.id;
      
      // Also check by name+type+subtype+balance as fallback
      const balance = account.balance?.current ?? account.balance?.available ?? 0;
      const fallbackKey = `${account.name}|${account.type}|${account.subtype}|${Math.round(balance * 100)}`;
      
      // Check if we've seen this account before
      const existingByPlaidId = accountMap.get(plaidAccountId);
      const existingByFallback = accountMap.get(fallbackKey);
      const existing = existingByPlaidId || existingByFallback;
      
      if (!existing) {
        // New account - add it with both keys
        accountMap.set(plaidAccountId, account);
        if (plaidAccountId !== fallbackKey) {
          accountMap.set(fallbackKey, account);
        }
        seenIds.add(plaidAccountId);
      } else {
        // Duplicate found - keep the most recent one
        const existingAny = existing as any;
        const existingTimestamp = existingAny.lastSynced || 
                                  existingAny.updatedAt || 
                                  existingAny.createdAt;
        const candidateTimestamp = accountAny.lastSynced || 
                                   accountAny.updatedAt || 
                                   accountAny.createdAt;
        
        let shouldReplace = false;
        
        if (candidateTimestamp && existingTimestamp) {
          const existingTime = existingTimestamp instanceof Date 
            ? existingTimestamp.getTime() 
            : new Date(existingTimestamp).getTime();
          const candidateTime = candidateTimestamp instanceof Date 
            ? candidateTimestamp.getTime() 
            : new Date(candidateTimestamp).getTime();
          shouldReplace = candidateTime > existingTime;
        } else if (candidateTimestamp && !existingTimestamp) {
          shouldReplace = true;
        } else {
          // If timestamps are equal or both missing, prefer the one with higher balance (more recent data)
          const existingBalance = existing.balance?.current ?? existing.balance?.available ?? 0;
          shouldReplace = balance >= existingBalance;
        }
        
        if (shouldReplace) {
          // Remove old entry
          const oldPlaidId = existingAny.plaidAccountId || 
                            existingAny.persistentAccountId || 
                            existing.account_id || 
                            existing.id;
          accountMap.delete(oldPlaidId);
          
          const oldBalance = existing.balance?.current ?? existing.balance?.available ?? 0;
          const oldFallbackKey = `${existing.name}|${existing.type}|${existing.subtype}|${Math.round(oldBalance * 100)}`;
          if (oldFallbackKey !== oldPlaidId) {
            accountMap.delete(oldFallbackKey);
          }
          
          // Add new entry
          accountMap.set(plaidAccountId, account);
          if (plaidAccountId !== fallbackKey) {
            accountMap.set(fallbackKey, account);
          }
        }
      }
    }
    
    // Extract unique accounts (only from plaidAccountId keys, not fallback keys)
    const uniqueAccounts: Account[] = [];
    const seenUniqueIds = new Set<string>();
    
    for (const [key, account] of accountMap.entries()) {
      const accountAny = account as any;
      const uniqueId = accountAny.plaidAccountId || 
                       accountAny.persistentAccountId || 
                       account.account_id || 
                       account.id;
      
      // Only add if we haven't seen this unique ID before
      if (!seenUniqueIds.has(uniqueId)) {
        uniqueAccounts.push(account);
        seenUniqueIds.add(uniqueId);
      }
    }
    
    console.log(`📊 Deduplicated ${accounts.length} accounts to ${uniqueAccounts.length} unique accounts`);
    
    return uniqueAccounts;
  }

  /**
   * Calculate financial overview from accounts, investments, and home value
   */
  private calculateFinancialOverview(
    accounts: Account[],
    investments: UnifiedFinancialData['investments'],
    homeValue: HomeData | null
  ): FinancialOverview {
    const deduplicatedAccounts = this.deduplicateAccounts(accounts);
    
    console.log(`📊 FinancialSummary: Calculating overview from ${deduplicatedAccounts.length} deduplicated accounts (out of ${accounts.length} total)`);
    
    // Log account types for debugging
    const accountTypes = deduplicatedAccounts.reduce((acc, account) => {
      const type = `${account.type}/${account.subtype}`;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`📊 Account type distribution:`, accountTypes);
    
    let totalCash = 0;
    let totalDebt = 0;
    const seenAccountIds = new Set<string>();
    
    for (const account of deduplicatedAccounts) {
      // Get unique identifier to ensure we don't count the same account twice
      const accountAny = account as any;
      const uniqueId = accountAny.plaidAccountId || 
                       accountAny.persistentAccountId || 
                       account.account_id || 
                       account.id;
      
      if (seenAccountIds.has(uniqueId)) {
        console.warn(`⚠️ Duplicate account detected in calculation: ${account.name} (ID: ${uniqueId})`);
        continue; // Skip duplicate
      }
      seenAccountIds.add(uniqueId);
      
      const balance = account.balance?.current ?? account.balance?.available ?? 0;
      const accountType = account.type?.toLowerCase() || '';
      const accountSubtype = account.subtype?.toLowerCase() || '';
      
      // ✅ IMPORTANT: Exclude investment accounts from cash/debt calculations
      // Investment accounts are counted separately via holdings
      if (accountType === 'investment') {
        // Investment accounts should not be counted as cash or debt
        // Their value is already included in totalInvestments via holdings
        continue;
      }
      
      // Debt accounts: credit, loan, mortgage (check first to avoid double counting)
      if (accountType === 'credit' || 
          accountType === 'loan' ||
          accountSubtype === 'credit card' ||
          accountSubtype === 'mortgage' ||
          accountSubtype === 'auto' ||
          accountSubtype === 'student') {
        // For credit cards, positive balance = debt owed
        // For loans, balance represents outstanding debt
        totalDebt += balance > 0 ? balance : Math.abs(balance);
      } else if (accountType === 'depository' || 
          accountSubtype === 'checking' || 
          accountSubtype === 'savings' || 
          accountSubtype === 'money market' ||
          accountSubtype === 'prepaid') {
        // Cash accounts: checking, savings, money market, prepaid
        totalCash += balance;
      }
    }
    
    const totalInvestments = investments.portfolio.totalValue || 0;
    const homeValueAmount = homeValue?.valueMid || homeValue?.valueHigh || homeValue?.valueLow || null;
    
    console.log(`📊 Financial Summary Calculation:
      - Total Cash: $${totalCash.toFixed(2)}
      - Total Investments: $${totalInvestments.toFixed(2)}
      - Total Debt: $${totalDebt.toFixed(2)}
      - Home Value: $${homeValueAmount?.toFixed(2) || 'null'}
      - Net Worth: $${(totalCash + totalInvestments + (homeValueAmount || 0) - totalDebt).toFixed(2)}`);
    
    const netWorth = totalCash + totalInvestments + (homeValueAmount || 0) - totalDebt;
    
    return {
      netWorth,
      totalCash,
      totalInvestments,
      totalDebt,
      homeValue: homeValueAmount
    };
  }

  /**
   * Calculate investment portfolio summary
   */
  private calculateInvestmentPortfolio(
    investments: UnifiedFinancialData['investments']
  ): InvestmentPortfolio {
    return {
      totalValue: investments.portfolio.totalValue || 0,
      holdingsCount: investments.portfolio.holdingCount || 0,
      assetAllocation: investments.portfolio.assetAllocation || [],
      securityCount: investments.portfolio.securityCount || 0
    };
  }

  /**
   * Get user summary from cache or trigger refresh
   */
  async getUserSummary(userId: string): Promise<FinancialSummary> {
    // Try to get cached summary from database
    const cachedSummary = await prisma.financialSummary.findUnique({
      where: { userId }
    });

    if (cachedSummary && !this.isSummaryStale(cachedSummary.lastUpdated)) {
      // Return fresh cached summary
      return {
        financialOverview: {
          netWorth: cachedSummary.netWorth,
          totalCash: cachedSummary.totalCash,
          totalInvestments: cachedSummary.totalInvestments,
          totalDebt: cachedSummary.totalDebt,
          homeValue: cachedSummary.homeValue
        },
        investmentPortfolio: cachedSummary.investmentPortfolio as unknown as InvestmentPortfolio,
        lastUpdated: cachedSummary.lastUpdated
      };
    }

    // Summary is stale or doesn't exist - trigger async refresh but return stale data if available
    if (cachedSummary) {
      // Return stale data immediately, refresh in background
      setImmediate(() => {
        this.refreshUserSummary(userId).catch(error => {
          console.error(`Failed to refresh summary for user ${userId}:`, error);
        });
      });
      
      return {
        financialOverview: {
          netWorth: cachedSummary.netWorth,
          totalCash: cachedSummary.totalCash,
          totalInvestments: cachedSummary.totalInvestments,
          totalDebt: cachedSummary.totalDebt,
          homeValue: cachedSummary.homeValue
        },
        investmentPortfolio: cachedSummary.investmentPortfolio as unknown as InvestmentPortfolio,
        lastUpdated: cachedSummary.lastUpdated
      };
    }

    // No cached summary - refresh synchronously (first time)
    return await this.refreshUserSummary(userId);
  }

  /**
   * Refresh user summary by fetching fresh data and saving to database
   */
  async refreshUserSummary(userId: string): Promise<FinancialSummary> {
    try {
      // Fetch fresh financial data (skip categorization and persistence for performance)
      const financialData = await this.financialDataService.getUserFinancialData(userId, {
        includeTransactions: false,
        includeInvestments: true,
        includeHomeValue: true,
        skipCategorization: true,
        shouldPersistTransactions: false
      });

      // Calculate summaries
      const financialOverview = this.calculateFinancialOverview(
        financialData.accounts,
        financialData.investments,
        financialData.homeValue
      );

      const investmentPortfolio = this.calculateInvestmentPortfolio(financialData.investments);

      const summary: FinancialSummary = {
        financialOverview,
        investmentPortfolio,
        lastUpdated: new Date()
      };

      // Save to database (upsert)
      await prisma.financialSummary.upsert({
        where: { userId },
        create: {
          userId,
          netWorth: financialOverview.netWorth,
          totalCash: financialOverview.totalCash,
          totalInvestments: financialOverview.totalInvestments,
          totalDebt: financialOverview.totalDebt,
          homeValue: financialOverview.homeValue,
          investmentPortfolio: investmentPortfolio as any,
          lastUpdated: summary.lastUpdated
        },
        update: {
          netWorth: financialOverview.netWorth,
          totalCash: financialOverview.totalCash,
          totalInvestments: financialOverview.totalInvestments,
          totalDebt: financialOverview.totalDebt,
          homeValue: financialOverview.homeValue,
          investmentPortfolio: investmentPortfolio as any,
          lastUpdated: summary.lastUpdated
        }
      });

      return summary;
    } catch (error) {
      console.error(`Error refreshing summary for user ${userId}:`, error);
      
      // Try to return stale data if refresh fails
      const cachedSummary = await prisma.financialSummary.findUnique({
        where: { userId }
      });

      if (cachedSummary) {
        return {
          financialOverview: {
            netWorth: cachedSummary.netWorth,
            totalCash: cachedSummary.totalCash,
            totalInvestments: cachedSummary.totalInvestments,
            totalDebt: cachedSummary.totalDebt,
            homeValue: cachedSummary.homeValue
          },
          investmentPortfolio: cachedSummary.investmentPortfolio as unknown as InvestmentPortfolio,
          lastUpdated: cachedSummary.lastUpdated
        };
      }

      // No cached data - throw error
      throw new Error(`Failed to refresh summary and no cached data available: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

