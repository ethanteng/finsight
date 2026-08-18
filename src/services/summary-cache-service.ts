import { buildTransactionSummary } from './transaction-summary-service';
import { buildCanonicalSnapshotCore } from './canonical-financial-snapshot';
import {
  buildAccountDisplayBalances,
} from './finances-overview-service';
import { getPrismaClient } from '../prisma-client';
import {
  getLatestFinancialSnapshot,
  upsertFinancialSnapshot,
} from './financial-snapshot-persistence';
import { ingestFinancialData } from './financial-ingestion';
import { extractWindowedInvestmentActivities } from './financial-calculations';
import {
  FinancialHistoryService,
  type CanonicalHistoryInput,
  type HistoryWriteIntent,
} from './financial-history-service';

// How long a prior snapshot may stand in for a partial rebuild. Long enough to
// ride out a provider outage across a daily refresh cycle, short enough that a
// connection needing user action cannot freeze the snapshot indefinitely.
const RETAINED_SNAPSHOT_MAX_AGE_MS = 48 * 60 * 60 * 1000;

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
          propertyId: data.homeValue.propertyId,
          valueMid: data.homeValue.valueMid,
          valueLow: data.homeValue.isManualOverride ? null : data.homeValue.valueLow,
          valueHigh: data.homeValue.isManualOverride ? null : data.homeValue.valueHigh,
          lastUpdated: data.homeValue.lastUpdated,
          isManualOverride: data.homeValue.isManualOverride,
        } : null,
      },
    };

    // Do not replace a usable canonical snapshot with a revision that is known
    // to be missing a connected provider. A transient Plaid/SnapTrade outage
    // otherwise makes assets disappear from the finances page and LLM context.
    // First-time users still receive the partial snapshot so the available
    // sources are visible and its quality flags explain the limitation.
    //
    // Retention is a successful protective outcome for this user — return the
    // prior snapshot instead of throwing, so scheduled refreshAllUsers does not
    // treat every flaky connection as a hard cron failure.
    //
    // Only a transient outage earns this. Some provider failures persist for
    // days (ITEM_LOGIN_REQUIRED until the user re-authenticates), and retaining
    // indefinitely would freeze the snapshot: its stored status stays 'current'
    // because nothing recomputes it, so the page and the LLM would keep quoting
    // week-old figures as current. Past the window, persist the partial
    // snapshot and let its quality flags say what is missing.
    if (data.metadata?.partialData && (canonical.status === 'partial' || canonical.status === 'unavailable')) {
      const previous = await getLatestFinancialSnapshot(userId, 'full');
      const previousComputedAt = previous?.computedAt ? new Date(previous.computedAt) : null;
      const previousAgeMs = previousComputedAt && !Number.isNaN(previousComputedAt.getTime())
        ? computedAt.getTime() - previousComputedAt.getTime()
        : null;
      const retainable = previous
        && (previous.status === 'current' || previous.status === 'stale')
        && previousAgeMs !== null
        && previousAgeMs <= RETAINED_SNAPSHOT_MAX_AGE_MS;

      if (retainable) {
        console.warn(
          `SummaryCacheService: retaining ${previous!.status} snapshot for user ${userId}; ` +
          `refusing to replace with ${canonical.status} provider data`
        );
        return previous as any;
      }
      if (previous && previousAgeMs !== null && previousAgeMs > RETAINED_SNAPSHOT_MAX_AGE_MS) {
        console.warn(
          `SummaryCacheService: prior snapshot for user ${userId} is ${Math.round(previousAgeMs / 3600000)}h old; ` +
          `persisting ${canonical.status} provider data rather than freezing it further`
        );
      }
    }

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
    // SnapTrade auto-init creates a registration row before a brokerage is linked
    // (SnapTradeButton calls /snaptrade/init on mount), so registration alone would pull
    // in users with nothing connected. Brokerage evidence has to come from a source this
    // cron does not write, or selection becomes circular: persisted `snaptrade-` accounts
    // need Plaid banking transactions, and SnapTradeActivity rows need categorize: true,
    // which only refreshAllUsers passes -- a SnapTrade-only user would never qualify.
    //
    // The persisted snapshot is the non-circular signal. Every login writes one through
    // recomputeIfStale, so holdings and home value are already recorded there. That also
    // covers home data, which lives in the (often encrypted) profile text and cannot be
    // filtered in SQL. Snapshot existence alone means nothing -- every login writes one.
    const userIds = await prisma.user.findMany({
      where: {
        OR: [
          { accessTokens: { some: { isActive: true } } },
          { snapTradeUser: { is: { activities: { some: {} } } } },
          { manualAccounts: { some: {} } },
          {
            financialSummarySnapshot: {
              is: {
                OR: [
                  { investmentPortfolio: { path: ['holdingCount'], gt: 0 } },
                  { financialOverview: { path: ['homeValue'], gt: 0 } },
                ],
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    // Report which users were covered so callers that refreshed other inputs
    // can recompute anyone this pass did not reach.
    const processedUserIds: string[] = [];
    const errors: Array<{ userId: string; error: string }> = [];
    for (const u of userIds) {
      try {
        // Cron: run full categorization for richer GPT context
        await this.computeForUser(u.id, { categorize: true });
        processedUserIds.push(u.id);
      } catch (err) {
        console.error(`SummaryCacheService: Failed to refresh snapshot for user ${u.id}`, err);
        errors.push({
          userId: u.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
      success: errors.length === 0,
      usersProcessed: processedUserIds.length,
      usersFailed: errors.length,
      processedUserIds,
      errors,
    };
  }

}

export default SummaryCacheService;
