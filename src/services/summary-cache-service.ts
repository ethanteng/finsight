import { PrismaClient } from '@prisma/client';
import { plaidClient } from '../plaid';
import { BalanceService } from './balance-service';
import { FinancialDataService } from './financial-data-service';
import { buildTransactionSummary } from './transaction-summary-service';
import { buildCanonicalSnapshotCore } from './canonical-financial-snapshot';
import {
  buildAccountDisplayBalances,
  hasAccountDisplayBalances,
  withAccountDisplayBalances,
} from './finances-overview-service';
import {
  FinancialHistoryService,
  type CanonicalHistoryInput,
  type HistoryWriteIntent,
} from './financial-history-service';

// Lazy Prisma to avoid multiple instances during different runtimes
let prisma: PrismaClient | null = null;
const getPrisma = (): PrismaClient => {
  if (!prisma) prisma = new PrismaClient();
  return prisma!;
};

type ViewMode = 'summary' | 'finances' | 'full';

export interface SummaryComputeOptions {
  categorize?: boolean;
  history?: HistoryWriteIntent;
}

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
  static async computeForUser(userId: string, opts: SummaryComputeOptions = {}) {
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

    // Build every user-facing metric and quality field through the canonical producer.
    const computedAt = new Date();
    const canonical = buildCanonicalSnapshotCore(data, {
      computedAt,
      reportingCurrency: 'USD',
      balanceMaxAgeMs: balanceHours * 60 * 60 * 1000,
    });
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

    const payload: any = {
      computedAt,
      asOf: canonical.asOf,
      status: canonical.status,
      reportingCurrency: canonical.reportingCurrency,
      financialOverview: canonical.financialOverview,
      investmentPortfolio: canonical.investmentPortfolio,
      accounts: data?.accounts || [],
      holdings: data?.investments?.holdings || [],
      securities: data?.investments?.securities || [],
      transactions: windowedTransactions,
      transactionsSummary,
      activities,
      quality: {
        ...canonical.quality,
        asOf: canonical.quality.asOf?.toISOString() || null,
        computedAt: canonical.quality.computedAt.toISOString(),
      },
      sourceObservations: canonical.sourceObservations.map(source => ({
        ...source,
        asOf: source.asOf instanceof Date ? source.asOf.toISOString() : source.asOf,
      })),
      meta: {
        version: '2.1',
        source: 'SummaryCacheService',
        status: canonical.status,
        asOf: canonical.asOf?.toISOString() || null,
        reportingCurrency: canonical.reportingCurrency,
        transactionsWindowDays: txDays,
        investmentWindowYears: invYears,
        balanceRefreshHours: balanceHours || null,
        accountDisplayBalances: buildAccountDisplayBalances(
          data.accounts,
          data.investments?.holdings,
          canonical.reportingCurrency
        ),
        // Persist presentation metadata with the same revision as homeValue.
        // A manual point value deliberately has no estimate range.
        home: data.homeValue ? {
          address: data.homeValue.address,
          valueMid: data.homeValue.valueMid,
          valueLow: data.homeValue.isManualOverride ? null : data.homeValue.valueLow,
          valueHigh: data.homeValue.isManualOverride ? null : data.homeValue.valueHigh,
          lastUpdated: data.homeValue.lastUpdated,
          isManualOverride: data.homeValue.isManualOverride,
        } : null,
      },
    };

    await this.upsertSnapshot(userId, payload);
    
    // Save historical snapshot for trend tracking
    try {
      const historySnapshot: CanonicalHistoryInput = {
        computedAt,
        asOf: canonical.asOf,
        status: canonical.status,
        reportingCurrency: canonical.reportingCurrency,
        financialOverview: canonical.financialOverview,
      };
      await FinancialHistoryService.saveHistoricalSnapshot(
        userId,
        historySnapshot,
        opts.history || { kind: 'daily', reason: 'automatic-refresh' }
      );
    } catch (error) {
      // Log but don't fail - historical snapshot is non-critical
      console.warn(`Failed to save historical snapshot for user ${userId}:`, error);
    }
    
    return payload;
  }

  static async upsertSnapshot(userId: string, payload: any) {
    const prisma = getPrisma();
    const snapshotData = {
      computedAt: payload.computedAt,
      asOf: payload.asOf,
      status: payload.status,
      reportingCurrency: payload.reportingCurrency,
      financialOverview: payload.financialOverview,
      investmentPortfolio: payload.investmentPortfolio,
      accounts: payload.accounts,
      holdings: payload.holdings,
      securities: payload.securities,
      transactions: payload.transactions,
      transactionsSummary: payload.transactionsSummary,
      activities: payload.activities,
      quality: payload.quality,
      sourceObservations: payload.sourceObservations,
      meta: payload.meta,
    };
    const overview = payload.financialOverview;
    await prisma.$transaction([
      prisma.financialSummarySnapshot.upsert({
        where: { userId },
        update: snapshotData,
        create: { userId, ...snapshotData },
      }),
      // Keep the legacy table synchronized from the same canonical values while
      // older callers are migrated. It no longer fetches or calculates data.
      prisma.financialSummary.upsert({
        where: { userId },
        update: {
          netWorth: overview.netWorth,
          totalCash: overview.totalCash,
          totalInvestments: overview.totalInvestments,
          totalDebt: overview.totalDebt,
          homeValue: overview.homeValue,
          investmentPortfolio: payload.investmentPortfolio,
          lastUpdated: payload.computedAt,
        },
        create: {
          userId,
          netWorth: overview.netWorth,
          totalCash: overview.totalCash,
          totalInvestments: overview.totalInvestments,
          totalDebt: overview.totalDebt,
          homeValue: overview.homeValue,
          investmentPortfolio: payload.investmentPortfolio,
          lastUpdated: payload.computedAt,
        },
      }),
    ]);
  }

  static async getLatestSnapshot(userId: string, view: ViewMode = 'summary') {
    const prisma = getPrisma();
    if (view === 'finances') {
      const select = {
        computedAt: true,
        asOf: true,
        status: true,
        reportingCurrency: true,
        financialOverview: true,
        investmentPortfolio: true,
        accounts: true,
        transactionsSummary: true,
        meta: true,
        quality: true,
      } as const;
      const snapshot = await prisma.financialSummarySnapshot.findUnique({
        where: { userId },
        select,
      });
      if (!snapshot || hasAccountDisplayBalances(snapshot as any)) return snapshot;

      // Version-2.0 snapshots predate canonical per-account display balances.
      // Load their holdings once, derive the missing metadata, and persist it so
      // subsequent Finances reads remain lightweight without calling providers.
      const fullSnapshot = await prisma.financialSummarySnapshot.findUnique({ where: { userId } });
      if (!fullSnapshot) return null;
      const upgraded = withAccountDisplayBalances(fullSnapshot as any);
      const update = await prisma.financialSummarySnapshot.updateMany({
        where: { userId, computedAt: fullSnapshot.computedAt },
        data: { meta: upgraded.meta as any },
      });
      if (update.count === 0) {
        // A newer snapshot won the race; return that revision instead of
        // overwriting its metadata with values derived from the older one.
        return prisma.financialSummarySnapshot.findUnique({ where: { userId }, select });
      }
      return {
        computedAt: fullSnapshot.computedAt,
        asOf: fullSnapshot.asOf,
        status: fullSnapshot.status,
        reportingCurrency: fullSnapshot.reportingCurrency,
        financialOverview: fullSnapshot.financialOverview,
        investmentPortfolio: fullSnapshot.investmentPortfolio,
        accounts: fullSnapshot.accounts,
        transactionsSummary: fullSnapshot.transactionsSummary,
        meta: upgraded.meta,
        quality: fullSnapshot.quality,
      };
    }
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

  private static extractWindowedInvestmentActivities(data: any, invSince: Date) {
    const acts = Array.isArray(data?.investments?.transactions) ? data.investments.transactions : [];
    return acts.filter((a: any) => {
      const d = new Date(a.tradeDate || a.settlementDate || a.date || a.createdAt);
      return !isNaN(d.getTime()) && d >= invSince;
    });
  }
}

export default SummaryCacheService;
