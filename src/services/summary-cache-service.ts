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

/** Canonical id for an account in a snapshot's `accounts` array. */
function snapshotAccountId(account: unknown): string | null {
  if (!account || typeof account !== 'object') return null;
  const record = account as Record<string, unknown>;
  const id = record.account_id ?? record.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Accounts the previous revision had that this one does not.
 *
 * A snapshot can be 'partial' while still describing every account -- an
 * erroring Plaid token keeps yielding its last known balances through
 * financial-source-persistence, and an advisory about a connection's health
 * costs no data at all. Account loss is one form of coverage regression;
 * holdings loss is checked separately.
 *
 * Returns an empty list when the previous revision recorded no accounts, so a
 * first snapshot or an older revision without the field is never read as a
 * regression.
 */
function accountIdsMissingFrom(previous: unknown, freshAccounts: unknown): string[] {
  const previousAccounts = (previous as { accounts?: unknown })?.accounts;
  if (!Array.isArray(previousAccounts) || previousAccounts.length === 0) return [];
  const fresh = new Set(
    (Array.isArray(freshAccounts) ? freshAccounts : [])
      .map(snapshotAccountId)
      .filter((id): id is string => id !== null)
  );
  const missing = new Set<string>();
  for (const account of previousAccounts) {
    const id = snapshotAccountId(account);
    if (id && !fresh.has(id)) missing.add(id);
  }
  return Array.from(missing);
}

/** Stable identity for a holding across price/quantity updates. */
function holdingIdentity(holding: unknown): string | null {
  if (!holding || typeof holding !== 'object') return null;
  const record = holding as Record<string, unknown>;
  const accountId = typeof record.account_id === 'string' ? record.account_id : null;
  const securityId = typeof record.security_id === 'string' ? record.security_id : null;
  if (accountId && securityId) return `${accountId}:${securityId}`;
  const id = typeof record.id === 'string' ? record.id : null;
  return id && id.length > 0 ? id : null;
}

/**
 * Holdings the previous revision had that this one does not.
 *
 * Account coverage alone is not enough: SnapTrade/Plaid can return every
 * account (and even last-known balances) while a holdings fetch fails, which
 * would publish an empty portfolio and wipe allocation detail. Identity is
 * account+security so a normal price refresh is not treated as a loss.
 *
 * Returns an empty list when the previous revision recorded no holdings.
 */
function holdingIdentitiesMissingFrom(previous: unknown, freshHoldings: unknown): string[] {
  const previousHoldings = (previous as { holdings?: unknown })?.holdings;
  if (!Array.isArray(previousHoldings) || previousHoldings.length === 0) return [];
  const fresh = new Set(
    (Array.isArray(freshHoldings) ? freshHoldings : [])
      .map(holdingIdentity)
      .filter((id): id is string => id !== null)
  );
  const missing = new Set<string>();
  for (const holding of previousHoldings) {
    const id = holdingIdentity(holding);
    if (id && !fresh.has(id)) missing.add(id);
  }
  return Array.from(missing);
}

export interface SummaryComputeOptions {
  categorize?: boolean;
  history?: HistoryWriteIntent;
  forceBalanceRefresh?: boolean;
}

/**
 * The users a scheduled refresh is expected to rebuild, as a Prisma `where`.
 *
 * Exported so health reporting can ask exactly the question the cron asks. A
 * frozen-snapshot count taken over every snapshot instead would permanently
 * include the users this predicate deliberately excludes: `recomputeIfStale`
 * writes a snapshot on every login, so someone who signed up and never linked a
 * source has one that nothing will ever rebuild. Counting those never returns
 * to zero, and a signal that cannot reach zero cannot indicate a problem.
 *
 * Returns a fresh object per call so no caller can mutate a shared literal.
 */
export function refreshEligibleUserWhere() {
  return {
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
  };
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

      // Retention exists to stop a provider outage from blanking assets off the
      // page. It is only the right trade when this revision would actually lose
      // ground -- accounts or holdings the previous revision had. That is not
      // the common case: financial-source-persistence keeps yielding last known
      // balances (and reusable current holdings) for an erroring token, so a
      // partial run usually still covers every account and position, just with
      // something unverified attached.
      //
      // When coverage holds, writing is strictly better than freezing. The user
      // sees today's figures instead of a revision that stops moving, and the
      // provider errors ride along in quality.errors and the source
      // observations, which invariant 5 of the financial truth contract
      // requires be preserved through a successful write either way. Freezing
      // in that situation discards a completely successful refresh of every
      // healthy source, which is what held real users on a stale revision for
      // days while every one of their connections was syncing normally.
      const droppedAccountIds = accountIdsMissingFrom(previous, payload.accounts);
      const droppedHoldingIds = holdingIdentitiesMissingFrom(previous, payload.holdings);
      const lostCoverage = droppedAccountIds.length > 0 || droppedHoldingIds.length > 0;
      if (retainable && !lostCoverage) {
        console.log(
          `SummaryCacheService: provider data for user ${userId} is ${canonical.status} but still covers ` +
          `every account and holding in the prior revision; persisting it rather than retaining`
        );
      }
      if (retainable && lostCoverage) {
        if (droppedAccountIds.length > 0) {
          console.warn(
            `SummaryCacheService: ${droppedAccountIds.length} account(s) missing from this revision for user ${userId}`
          );
        }
        if (droppedHoldingIds.length > 0) {
          console.warn(
            `SummaryCacheService: ${droppedHoldingIds.length} holding(s) missing from this revision for user ${userId}`
          );
        }
        console.warn(
          `SummaryCacheService: retaining ${previous!.status} snapshot for user ${userId}; ` +
          `refusing to replace with ${canonical.status} provider data`
        );
        // Flag the retention on the way out. The returned snapshot is the *previous*
        // revision, so its status describes the run that produced it, not this one --
        // a caller reading status alone cannot tell a successful refresh from one that
        // fell back. Not persisted: it describes this call, not the stored revision.
        return { ...(previous as any), retainedPriorRevision: true } as any;
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
      where: refreshEligibleUserWhere(),
      select: { id: true },
    });

    // Report which users were covered so callers that refreshed other inputs
    // can recompute anyone this pass did not reach.
    const processedUserIds: string[] = [];
    // Users whose snapshot was deliberately left untouched by the retention
    // guard in computeForUser. They are processed successfully -- retention is
    // the intended outcome -- but their stored revision did not move, so a
    // caller reading usersProcessed alone would report a refresh that did not
    // happen. Tracked separately so the run can say so out loud.
    const retainedUserIds: string[] = [];
    const errors: Array<{ userId: string; error: string }> = [];
    for (const u of userIds) {
      try {
        // Cron: run full categorization for richer GPT context
        const result = await this.computeForUser(u.id, { categorize: true });
        processedUserIds.push(u.id);
        if ((result as any)?.retainedPriorRevision) {
          retainedUserIds.push(u.id);
        }
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
      usersRetained: retainedUserIds.length,
      processedUserIds,
      retainedUserIds,
      errors,
    };
  }

}

export default SummaryCacheService;
