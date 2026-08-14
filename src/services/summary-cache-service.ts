import { PrismaClient } from '@prisma/client';
import { plaidClient } from '../plaid';
import { BalanceService } from './balance-service';
import { FinancialDataService } from './financial-data-service';
import { classifyAccount } from './account-classifier';
import { buildTransactionSummary } from './transaction-summary-service';
import { financialAccountIdentityKey, isNewerAccountSnapshot } from './account-identity';

// Lazy Prisma to avoid multiple instances during different runtimes
let prisma: PrismaClient | null = null;
const getPrisma = (): PrismaClient => {
  if (!prisma) prisma = new PrismaClient();
  return prisma!;
};

type ViewMode = 'summary' | 'full';

export class SummaryCacheService {
  static getEnvWindows() {
    const txDays = Number(process.env.TRANSACTION_HISTORY_DAYS || 365);
    const invYears = Number(process.env.INVESTMENT_HISTORY_YEARS || 5);
    const balanceHours = Number(process.env.BALANCE_REFRESH_HOURS || 24);
    return { txDays, invYears, balanceHours };
  }

  /**
   * Compute and upsert the snapshot for a given user.
   * Applies env-driven windows and balance refresh throttling.
   * opts.categorize: when true, runs heavier categorization; when false, skips for faster completion.
   */
  static async computeForUser(userId: string, opts: { categorize?: boolean } = {}) {
    const prisma = getPrisma();
    const { txDays, invYears, balanceHours } = this.getEnvWindows();

    // Determine date ranges
    const txSince = new Date(Date.now() - txDays * 24 * 60 * 60 * 1000);
    const invSince = new Date();
    invSince.setFullYear(invSince.getFullYear() - invYears);

    // Ensure balances are fresh (token-scoped; throttle by BALANCE_REFRESH_HOURS)
    // Strategy: if any account for the user has stale balanceLastFetched, refresh all tokens' balances once.
    const oldestRecentAllowed = new Date(Date.now() - balanceHours * 60 * 60 * 1000);
    const anyStale = await prisma.account.findFirst({
      where: {
        userId,
        OR: [
          { balanceLastFetched: null },
          { balanceLastFetched: { lt: oldestRecentAllowed } },
        ],
      },
      select: { plaidAccountId: true },
    });

    if (anyStale) {
      // Refresh balances for all access tokens of this user (throttled via BalanceService internals)
      const tokens = await prisma.accessToken.findMany({
        where: { userId, isActive: true },
        select: { token: true, id: true },
      });
      for (const t of tokens) {
        try {
          await BalanceService.getAccountBalances(t.token, plaidClient, false);
        } catch (err) {
          console.warn(`SummaryCacheService: Balance refresh skipped/failed for token ${t.id}:`, err);
        }
      }
    }

    // Fetch unified financial data using existing service
    const fds = new FinancialDataService();
    const data = await fds.getUserFinancialData(userId, {
      includeTransactions: true,
      includeInvestments: true,
      includeHomeValue: true,
      // Fast path by default for on-demand refresh; cron can request categorize=true
      skipCategorization: opts.categorize ? false : true,
      // Persist categorized transactions to database when categorization is enabled
      shouldPersistTransactions: opts.categorize ? true : false,
    });

    // Derive overview/portfolio and pre-aggregations
    const overview = SummaryCacheService.computeFinancialOverview(data);
    const portfolio = SummaryCacheService.computeInvestmentPortfolio(data);
    const computedAt = new Date();
    const allTransactions = [
      ...(Array.isArray(data?.bankingTransactions) ? data.bankingTransactions : []),
      ...(Array.isArray(data?.investments?.transactions) ? data.investments.transactions : []),
    ];
    const { windowedTransactions, transactionsSummary } = buildTransactionSummary(
      allTransactions,
      txSince,
      computedAt,
      'USD'
    );
    const activities = SummaryCacheService.extractWindowedInvestmentActivities(data, invSince);

    // ✅ CRITICAL: Deduplicate accounts before storing in snapshot
    // Even though mergeFinancialData() should have deduplicated, ensure no duplicates slip through
    // Use the same robust deduplication logic as mergeFinancialData() for consistency
    const accountMap = new Map<string, any>();
    const rawAccounts = data?.accounts || [];
    
    for (const account of rawAccounts) {
      const accountId = financialAccountIdentityKey(account);
      
      if (!accountId) {
        console.warn(`⚠️ SummaryCacheService: Account without ID found: ${account.name} (${account.type}/${account.subtype}), skipping`);
        continue;
      }

      const existing = accountMap.get(accountId);
      if (!existing) {
        // New account - add it
        accountMap.set(accountId, account);
        continue;
      }

      if (isNewerAccountSnapshot(existing, account)) {
        accountMap.set(accountId, account);
      }
    }
    
    const deduplicatedAccounts = Array.from(accountMap.values());
    const duplicatesRemoved = rawAccounts.length - deduplicatedAccounts.length;
    
    if (duplicatesRemoved > 0) {
      console.warn(`⚠️ SummaryCacheService: Deduplicated accounts before storing snapshot: ${rawAccounts.length} → ${deduplicatedAccounts.length} (removed ${duplicatesRemoved} duplicates)`);
    }

    const payload: any = {
      computedAt,
      financialOverview: overview,
      investmentPortfolio: portfolio,
      accounts: deduplicatedAccounts, // Use deduplicated accounts
      holdings: data?.investments?.holdings || [],
      securities: data?.investments?.securities || [],
      transactions: windowedTransactions,
      transactionsSummary,
      activities,
      meta: {
        version: '1.0',
        source: 'SummaryCacheService',
        transactionsWindowDays: txDays,
        investmentWindowYears: invYears,
        balanceRefreshHours: balanceHours || null,
      },
    };

    await this.upsertSnapshot(userId, payload);
    
    // Save historical snapshot for trend tracking
    try {
      const { FinancialHistoryService } = await import('./financial-history-service');
      await FinancialHistoryService.saveHistoricalSnapshot(userId, overview);
    } catch (error) {
      // Log but don't fail - historical snapshot is non-critical
      console.warn(`Failed to save historical snapshot for user ${userId}:`, error);
    }
    
    return payload;
  }

  static async upsertSnapshot(userId: string, payload: any) {
    const prisma = getPrisma();
    await prisma.financialSummarySnapshot.upsert({
      where: { userId },
      update: {
        computedAt: payload.computedAt,
        financialOverview: payload.financialOverview,
        investmentPortfolio: payload.investmentPortfolio,
        accounts: payload.accounts,
        holdings: payload.holdings,
        securities: payload.securities,
        transactions: payload.transactions,
        transactionsSummary: payload.transactionsSummary,
        activities: payload.activities,
        meta: payload.meta,
      },
      create: {
        userId,
        computedAt: payload.computedAt,
        financialOverview: payload.financialOverview,
        investmentPortfolio: payload.investmentPortfolio,
        accounts: payload.accounts,
        holdings: payload.holdings,
        securities: payload.securities,
        transactions: payload.transactions,
        transactionsSummary: payload.transactionsSummary,
        activities: payload.activities,
        meta: payload.meta,
      },
    });
  }

  static async getLatestSnapshot(userId: string, view: ViewMode = 'summary') {
    const prisma = getPrisma();
    const snap = await prisma.financialSummarySnapshot.findUnique({
      where: { userId },
    });
    if (!snap) return null;
    if (view === 'full') return snap;
    // summary view: strip heavy arrays
    const { accounts, holdings, securities, transactions, activities, ...rest } = snap as any;
    return rest;
  }

  static async refreshAllUsers() {
    const prisma = getPrisma();
    const userIds = await prisma.user.findMany({
      where: {
        accessTokens: { some: { isActive: true } },
      },
      select: { id: true },
    });

    let processed = 0;
    for (const u of userIds) {
      try {
        // Cron: run full categorization for richer GPT context
        await this.computeForUser(u.id, { categorize: true });
        processed++;
      } catch (err) {
        console.error(`SummaryCacheService: Failed to refresh snapshot for user ${u.id}`, err);
      }
    }
    return { success: true, usersProcessed: processed };
  }

  // ---- Helpers to compute sections ----
  private static computeFinancialOverview(data: any) {
    // ✅ Use portfolio.totalValue which already includes manual investment accounts
    // The portfolio is calculated by analyzePortfolio() which includes manual investment accounts
    const portfolio = data?.investments?.portfolio;
    const totalInvestments = portfolio?.totalValue || 0;
    // ✅ Calculate totalCash including manual cash accounts via the shared classifier
    // (single source of truth). Manual cash accounts are mapped to type='depository'.
    let totalCash = 0;
    let totalDebt = 0;
    for (const a of data?.accounts || []) {
      const classified = classifyAccount(a);
      const b = classified.balance;
      // Investment accounts are counted via portfolio.totalValue, not their balance.
      if (classified.isInvestment) continue;
      if (classified.isDebt) {
        // liabilityValue = Math.abs(balance) — APIs use inconsistent sign conventions
        totalDebt += Math.abs(b);
      } else if (classified.isCash) {
        totalCash += Math.max(0, b);
        if (b < 0) totalDebt += Math.abs(b); // overdraft
      }
    }
    // Extract homeValue: prioritize valueMid (manual override or RentCast estimate), then fall back to valueHigh or valueLow
    // Use explicit null checks to handle 0 values correctly (0 is a valid home value, though unlikely)
    const homeValue = data?.homeValue?.valueMid != null && data.homeValue.valueMid > 0
      ? data.homeValue.valueMid
      : (data?.homeValue?.valueHigh != null && data.homeValue.valueHigh > 0
        ? data.homeValue.valueHigh
        : (data?.homeValue?.valueLow != null && data.homeValue.valueLow > 0
          ? data.homeValue.valueLow
          : null));
    const netWorth = totalCash + totalInvestments + (homeValue ?? 0) - totalDebt;
    return { netWorth, totalCash, totalInvestments, totalDebt, homeValue };
  }

  private static computeInvestmentPortfolio(data: any) {
    // ✅ CRITICAL: Use the portfolio analysis from FinancialDataService, not recalculate
    // The portfolio analysis already includes proper deduplication and calculations
    const portfolio = data?.investments?.portfolio;
    if (portfolio) {
      return {
        totalValue: portfolio.totalValue || 0,
        holdingCount: portfolio.holdingCount || 0,
        securityCount: portfolio.securityCount || 0,
        assetAllocation: portfolio.assetAllocation || []
      };
    }
    
    // Fallback: calculate from holdings if portfolio not available
    const holdings = Array.isArray(data?.investments?.holdings) ? data.investments.holdings : [];
    const totalValue = holdings.reduce((s: number, h: any) => s + (h.institution_value ?? h.value ?? 0), 0);
    const holdingCount = holdings.length;
    const securityCount = new Set(holdings.map((h: any) => h.security_id)).size;
    const assetAllocation: Array<{ type: string; value: number; percentage: number }> = [];
    return { totalValue, holdingCount, securityCount, assetAllocation };
  }

  private static extractWindowedInvestmentActivities(data: any, invSince: Date) {
    const acts = Array.isArray(data?.investments?.transactions) ? data.investments.transactions : [];
    return acts.filter((a: any) => {
      const d = new Date(a.tradeDate || a.settlementDate || a.date || a.createdAt);
      return !isNaN(d.getTime()) && d >= invSince;
    });
  }
}

export default SummaryCacheService;
