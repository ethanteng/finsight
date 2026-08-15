import { buildTransactionSummary } from './transaction-summary-service';
import { buildCanonicalSnapshotCore } from './canonical-financial-snapshot';
import {
  buildAccountDisplayBalances,
} from './finances-overview-service';
import { getPrismaClient } from '../prisma-client';
import { upsertFinancialSnapshot } from './financial-snapshot-persistence';
import { ingestFinancialData } from './financial-ingestion';
import { extractWindowedInvestmentActivities } from './financial-calculations';
import {
  FinancialHistoryService,
  type CanonicalHistoryInput,
  type HistoryWriteIntent,
} from './financial-history-service';

export interface SummaryComputeOptions {
  categorize?: boolean;
  history?: HistoryWriteIntent;
  forceBalanceRefresh?: boolean;
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
    const { txDays, invYears, balanceHours } = this.getEnvWindows();

    // Determine date ranges
    const txSince = new Date(Date.now() - txDays * 24 * 60 * 60 * 1000);
    const invSince = new Date();
    invSince.setFullYear(invSince.getFullYear() - invYears);

    const data = await ingestFinancialData(userId, {
      balanceMaxAgeHours: balanceHours,
      categorize: Boolean(opts.categorize),
      forceBalanceRefresh: Boolean(opts.forceBalanceRefresh),
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
    const activities = extractWindowedInvestmentActivities(data, invSince);

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
        version: '2.2',
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

    await upsertFinancialSnapshot(userId, payload);
    
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


  static async refreshAllUsers() {
    const prisma = getPrismaClient();
    // Refresh every user with any financial data source, not just Plaid. A user with
    // only SnapTrade, only manual accounts, or only a home value has no AccessToken row,
    // so gating on accessTokens alone skipped them entirely: no snapshot rebuild and no
    // daily history row for trend tracking.
    //
    // SnapTrade auto-init can create a registration row before a brokerage is linked, so
    // require persisted brokerage accounts or activities rather than registration alone.
    //
    // Home data lives in the (often encrypted) profile text and cannot be filtered in
    // SQL, so the persisted snapshot's homeValue stands in for it. Selecting on the
    // snapshot's mere existence would not work -- every login writes one.
    const userIds = await prisma.user.findMany({
      where: {
        OR: [
          { accessTokens: { some: { isActive: true } } },
          { accounts: { some: { plaidAccountId: { startsWith: 'snaptrade-' } } } },
          { snapTradeUser: { activities: { some: {} } } },
          { manualAccounts: { some: {} } },
          { financialSummarySnapshot: { is: { financialOverview: { path: ['homeValue'], gt: 0 } } } },
        ],
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

}

export default SummaryCacheService;
