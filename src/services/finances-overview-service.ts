import { newestExpiringSourceAsOf, type SnapshotQuality } from '../domain/financial-truth';
import { averageCanonicalTransactionSummary } from './transaction-summary-service';
export { averageCanonicalTransactionSummary } from './transaction-summary-service';
import { classifyAccount } from './account-classifier';
import {
  buildCanonicalInvestmentPortfolio,
  holdingBelongsToInvestmentAccount,
  resolveInvestmentAccountValue,
} from './canonical-financial-snapshot';

export type FinancesSnapshotStatus = SnapshotQuality['status'];

/** Source-observation id prefix for a single account, as written by the snapshot builder. */
const ACCOUNT_SOURCE_PREFIX = 'account:';

export interface FinancesAccount {
  id?: string;
  account_id?: string;
  name?: string;
  type?: string;
  subtype?: string;
  institution?: string;
  source?: 'plaid' | 'snaptrade' | 'manual' | string;
  displayBalance?: number | null;
  /**
   * When the provider last observed this account, taken from the snapshot's own
   * source observation rather than from the account payload, so it is the same
   * time the quality evaluation judged. Null when the snapshot predates source
   * observations or the account has no observation of its own.
   */
  dataAsOf?: string | null;
  /**
   * This account's observation is older than its own max age. Read from the
   * snapshot's `staleSourceIds`, never recomputed here: one definition of stale
   * for the whole product.
   */
  isDataStale?: boolean;
  balance?:
    | number
    | null
    | {
        current?: number | null;
        available?: number | null;
        limit?: number | null;
        iso_currency_code?: string | null;
      };
  [key: string]: unknown;
}

export interface FinancesManualAccount {
  id: string;
  name: string;
  amount: number;
  type: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface FinancesHomeData {
  address: string;
  value: number;
  valueLow: number | null;
  valueHigh: number | null;
  lastUpdated: string;
  isManualOverride: boolean;
  isSnapshotAligned: boolean;
}

export interface FinancesSnapshotLike {
  computedAt: string | Date;
  asOf?: string | Date | null;
  status?: string | null;
  reportingCurrency?: string | null;
  financialOverview: Record<string, unknown>;
  investmentPortfolio: Record<string, unknown>;
  accounts?: unknown;
  holdings?: unknown;
  securities?: unknown;
  transactions?: unknown;
  transactionsSummary?: unknown;
  activities?: unknown;
  quality?: unknown;
  sourceObservations?: unknown;
  meta?: unknown;
}

export interface FinancesOverviewInput {
  snapshot: FinancesSnapshotLike;
  manualAccounts?: readonly FinancesManualAccount[];
  overrides?: {
    monthlyIncome: number | null;
    monthlyExpense: number | null;
  };
  currentHome?: FinancesHomeData | null;
  userTimeZone?: string | null;
  /** True when a newer revision is already scheduled, running, or queued for this user. */
  rebuildPending?: boolean;
  /**
   * Current display names keyed by account id. A name is presentation metadata the user
   * owns, not a figure derived from provider data, so it is read live rather than waiting
   * for the next snapshot. Balances and totals still come only from the snapshot.
   */
  accountNames?: ReadonlyMap<string, string>;
  /**
   * Connections the user must re-authenticate before they can sync again. Read
   * live rather than from the snapshot: the snapshot records what the providers
   * returned, not the health of the link to them.
   */
  reauthRequiredConnections?: ReadonlyArray<{
    id: string;
    institutionName: string | null;
    /** Which integration owns the repair flow. Absent on older callers means Plaid. */
    provider?: 'plaid' | 'snaptrade';
  }>;
}

export interface FinancesAccountGroup {
  accounts: FinancesAccount[];
  totalBalance: number | null;
  unavailableBalanceCount: number;
}

export interface FinancesOverview {
  userTimeZone: string | null;
  revision: {
    id: string;
    /** Oldest expiring source observation — how old the oldest part of this snapshot is. */
    asOf: string | null;
    computedAt: string;
    /**
     * Newest expiring source observation — when something in this snapshot last updated.
     * What the UI shows, because a user reading a timestamp under their totals is asking
     * when the numbers last moved. It is bounded below by `asOf`, so this must not be read
     * as "everything here is this fresh".
     */
    newestSourceAsOf: string | null;
    status: FinancesSnapshotStatus;
    reportingCurrency: string;
    /**
     * A newer revision is already on its way, so these values are not the final word for
     * the edits made so far. Process-local on the server: false means "none known here".
     */
    rebuildPending: boolean;
  };
  warnings: Array<{ code: string; message: string }>;
  /**
   * Broken connections the account holder can repair themselves. Surfaced on
   * every financial surface, not just the accounts screen, because a connection
   * nobody notices is one whose balances silently go stale.
   */
  connectionHealth: {
    /** Connections awaiting re-authentication. Zero means nothing to show. */
    reauthRequiredCount: number;
    /** Institution names for the copy, deduplicated. Unnamed connections are omitted. */
    reauthRequiredInstitutions: string[];
  };
  financialOverview: {
    netWorth: number;
    totalCash: number;
    totalInvestments: number;
    totalDebt: number;
    homeValue: number | null;
  };
  investmentPortfolio: Record<string, unknown>;
  accountGroups: {
    cash: FinancesAccountGroup;
    investments: FinancesAccountGroup;
    debt: FinancesAccountGroup;
    other: FinancesAccountGroup;
  };
  cashFlow: {
    monthCount: number;
    calculatedMonthlyIncome: number | null;
    calculatedMonthlyExpense: number | null;
    calculatedMonthlyOperatingCashFlow: number | null;
    monthlyIncomeOverride: number | null;
    monthlyExpenseOverride: number | null;
    effectiveMonthlyIncome: number | null;
    effectiveMonthlyExpense: number | null;
  };
  home: FinancesHomeData | null;
  manualAccounts: FinancesManualAccount[];
}

export interface FinancesAccountDetails {
  revisionId: string;
  accountId: string;
  transactions: any[];
  holdings: any[];
  investmentTransactions: any[];
  portfolio: ReturnType<typeof buildCanonicalInvestmentPortfolio>;
}

function iso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function requiredFinite(value: unknown, field: string): number {
  const result = finite(value);
  if (result === null) throw new Error(`Finances snapshot ${field} is unavailable`);
  return result;
}

function accountId(account: FinancesAccount): string {
  return String(
    account.account_id
    || (account as FinancesAccount & { plaidAccountId?: string }).plaidAccountId
    || (account as FinancesAccount & { persistentAccountId?: string }).persistentAccountId
    || account.id
    || ''
  );
}

function accountBalance(account: FinancesAccount): number | null {
  if (Object.prototype.hasOwnProperty.call(account, 'displayBalance')) {
    return finite(account.displayBalance);
  }
  if (typeof account.balance === 'number') return finite(account.balance);
  if (!account.balance || typeof account.balance !== 'object') return null;
  return finite(account.balance.current) ?? finite(account.balance.available);
}

function totalKnownBalances(accounts: readonly FinancesAccount[], absolute = false): number | null {
  const balances = accounts.map(accountBalance).filter((value): value is number => value !== null);
  if (accounts.length > 0 && balances.length === 0) return null;
  return balances.reduce((total, value) => total + (absolute ? Math.abs(value) : value), 0);
}

function unavailableBalanceCount(accounts: readonly FinancesAccount[]): number {
  return accounts.filter(account => accountBalance(account) === null).length;
}

export function buildAccountDisplayBalances(
  accountsInput: unknown,
  holdingsInput: unknown,
  reportingCurrencyInput: unknown,
  options: { reconcileReportedBalance?: boolean } = {}
): Record<string, number | null> {
  const accounts = Array.isArray(accountsInput) ? accountsInput as FinancesAccount[] : [];
  const holdings = Array.isArray(holdingsInput) ? holdingsInput as any[] : [];
  const reportingCurrency = typeof reportingCurrencyInput === 'string'
    ? reportingCurrencyInput.toUpperCase()
    : 'USD';
  // Fresh snapshot writes reconcile rows to the reported balance. Legacy
  // backfills must not: their financialOverview was holdings-sum based, and
  // raising only the rows would reopen the row-vs-group discrepancy this fix
  // closes until the next full recompute.
  const reconcileReportedBalance = options.reconcileReportedBalance !== false;
  const balances: Record<string, number | null> = {};

  for (const account of accounts) {
    const id = accountId(account);
    if (!id) continue;
    const classified = classifyAccount(account);
    const rawBalance = accountBalance(account);
    if (classified.isInvestment && account.source !== 'manual') {
      const values = holdings
        .filter(holding => holdingBelongsToInvestmentAccount(holding?.account_id, account))
        .filter(holding => String(holding?.iso_currency_code || '').toUpperCase() === reportingCurrency)
        .map(holding => finite(holding?.institution_value))
        .filter((value): value is number => value !== null);
      const holdingsValue = values.length > 0
        ? values.reduce((total, value) => total + value, 0)
        : null;
      if (!reconcileReportedBalance) {
        balances[id] = holdingsValue;
      } else {
        // Resolved the same way the canonical total is, so a row and the group
        // total above it can never tell the user two different numbers.
        balances[id] = resolveInvestmentAccountValue(account, holdingsValue, reportingCurrency);
      }
    } else if ((classified.isDebt || classified.balance < 0) && rawBalance !== null) {
      balances[id] = Math.abs(rawBalance);
    } else {
      balances[id] = rawBalance;
    }
  }
  return balances;
}

export function hasAccountDisplayBalances(snapshot: FinancesSnapshotLike): boolean {
  if (!snapshot.meta || typeof snapshot.meta !== 'object') return false;
  const balances = (snapshot.meta as any).accountDisplayBalances;
  return Boolean(balances && typeof balances === 'object' && !Array.isArray(balances));
}

export function withAccountDisplayBalances<T extends FinancesSnapshotLike>(snapshot: T): T {
  if (hasAccountDisplayBalances(snapshot)) return snapshot;
  const meta = snapshot.meta && typeof snapshot.meta === 'object' ? snapshot.meta as any : {};
  return {
    ...snapshot,
    meta: {
      ...meta,
      accountDisplayBalances: buildAccountDisplayBalances(
        snapshot.accounts,
        snapshot.holdings,
        snapshot.reportingCurrency,
        { reconcileReportedBalance: false }
      ),
    },
  };
}

function normalizeStatus(value: unknown): FinancesSnapshotStatus {
  return value === 'stale' || value === 'partial' || value === 'unavailable' ? value : 'current';
}

function snapshotHome(snapshot: FinancesSnapshotLike, currentHome?: FinancesHomeData | null): FinancesHomeData | null {
  const meta = snapshot.meta && typeof snapshot.meta === 'object' ? snapshot.meta as any : {};
  const stored = meta.home && typeof meta.home === 'object' ? meta.home as any : null;
  const candidate = stored || currentHome;
  const canonicalValue = finite(snapshot.financialOverview.homeValue);
  if (canonicalValue === null) return null;

  const candidateValue = finite(candidate?.valueMid) ?? finite(candidate?.value);
  const isSnapshotAligned = candidateValue !== null && Math.abs(candidateValue - canonicalValue) < 0.01;
  const isManualOverride = Boolean(candidate?.isManualOverride) && isSnapshotAligned;
  const lastUpdated = iso(candidate?.lastUpdated) || iso(snapshot.computedAt)!;

  return {
    address: typeof candidate?.address === 'string' ? candidate.address : '',
    value: canonicalValue,
    // Provider estimates may have a range. A manual number is a point value,
    // not a lower/upper estimate, so never manufacture a range for it.
    valueLow: !isSnapshotAligned || isManualOverride ? null : finite(candidate?.valueLow),
    valueHigh: !isSnapshotAligned || isManualOverride ? null : finite(candidate?.valueHigh),
    lastUpdated,
    isManualOverride,
    isSnapshotAligned,
  };
}

/**
 * Top-level account observation ids are `account:{id}`. Compound ids such as
 * `account:{id}:holdings-coverage` or `account:{id}:balance` are separate
 * signals and must not be treated as the account's own observation.
 */
function accountIdFromSourceId(sourceId: string): string | null {
  if (!sourceId.startsWith(ACCOUNT_SOURCE_PREFIX)) return null;
  const accountId = sourceId.slice(ACCOUNT_SOURCE_PREFIX.length);
  if (!accountId || accountId.includes(':')) return null;
  return accountId;
}

/** `account:{id}` -> provider observation time, from the snapshot's own source observations. */
function accountObservationTimes(snapshot: FinancesSnapshotLike): Map<string, string> {
  const observations = Array.isArray(snapshot.sourceObservations) ? snapshot.sourceObservations : [];
  const times = new Map<string, string>();
  for (const observation of observations) {
    if (!observation || typeof observation !== 'object') continue;
    const accountId = accountIdFromSourceId(String((observation as any).id || ''));
    if (!accountId) continue;
    // An unavailable source has no observation to report. Leaving it out means the
    // row says nothing rather than dating the account to a read that failed.
    if ((observation as any).status === 'unavailable') continue;
    const asOf = iso((observation as any).asOf);
    if (asOf) times.set(accountId, asOf);
  }
  return times;
}

/** Account ids the snapshot's quality evaluation already judged stale. */
function staleAccountIds(snapshot: FinancesSnapshotLike): Set<string> {
  const quality = snapshot.quality && typeof snapshot.quality === 'object' ? snapshot.quality as any : {};
  const ids = Array.isArray(quality.staleSourceIds) ? quality.staleSourceIds : [];
  const stale = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string') continue;
    const accountId = accountIdFromSourceId(id);
    if (accountId) stale.add(accountId);
  }
  return stale;
}

function groupAccounts(snapshot: FinancesSnapshotLike, accountNames?: ReadonlyMap<string, string>) {
  const groups = {
    cash: [] as FinancesAccount[],
    investments: [] as FinancesAccount[],
    debt: [] as FinancesAccount[],
    other: [] as FinancesAccount[],
  };
  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts as FinancesAccount[] : [];
  const meta = snapshot.meta && typeof snapshot.meta === 'object' ? snapshot.meta as any : {};
  const storedDisplayBalances = meta.accountDisplayBalances && typeof meta.accountDisplayBalances === 'object'
    ? meta.accountDisplayBalances as Record<string, unknown>
    : {};
  const observationTimes = accountObservationTimes(snapshot);
  const staleAccounts = staleAccountIds(snapshot);

  for (const account of accounts) {
    const classified = classifyAccount(account);
    const id = accountId(account);
    let displayBalance = Object.prototype.hasOwnProperty.call(storedDisplayBalances, id)
      ? finite(storedDisplayBalances[id])
      : accountBalance(account);
    if (classified.isDebt && displayBalance !== null) displayBalance = Math.abs(displayBalance);
    const currentName = accountNames?.get(id);
    // Every account carries its own observation time, so a page-level "as of" built
    // from the newest source can never imply that an account nobody has synced in
    // months is as current as the one that synced this morning.
    const displayAccount = {
      ...account,
      ...(currentName ? { name: currentName } : {}),
      displayBalance,
      dataAsOf: observationTimes.get(id) ?? null,
      isDataStale: staleAccounts.has(id),
    };
    // Canonical truth treats an overdraft as debt, not negative cash.
    if (classified.isCash && classified.balance < 0) groups.debt.push({ ...displayAccount, displayBalance: Math.abs(classified.balance) });
    else if (classified.isCash) groups.cash.push(displayAccount);
    else if (classified.isInvestment) groups.investments.push(displayAccount);
    else if (classified.isDebt) groups.debt.push(displayAccount);
    else groups.other.push(displayAccount);
  }
  return groups;
}

function buildConnectionHealth(
  connections: FinancesOverviewInput['reauthRequiredConnections']
): FinancesOverview['connectionHealth'] {
  const list = connections ?? [];
  const institutions: string[] = [];
  for (const connection of list) {
    const name = connection.institutionName?.trim();
    // An unnamed connection still counts toward the total -- the user needs to
    // know something is broken even when we cannot say which institution.
    if (name && !institutions.includes(name)) institutions.push(name);
  }
  return { reauthRequiredCount: list.length, reauthRequiredInstitutions: institutions };
}

export function buildFinancesOverview(input: FinancesOverviewInput): FinancesOverview {
  const { snapshot } = input;
  const computedAt = iso(snapshot.computedAt);
  if (!computedAt) throw new Error('Finances snapshot computedAt is invalid');

  const overview = snapshot.financialOverview || {};
  const totalCash = requiredFinite(overview.totalCash, 'totalCash');
  const totalInvestments = requiredFinite(overview.totalInvestments, 'totalInvestments');
  const totalDebt = requiredFinite(overview.totalDebt, 'totalDebt');
  const netWorth = requiredFinite(overview.netWorth, 'netWorth');
  const groups = groupAccounts(snapshot, input.accountNames);
  const averages = averageCanonicalTransactionSummary(snapshot.transactionsSummary);
  const monthlyIncomeOverride = input.overrides?.monthlyIncome ?? null;
  const monthlyExpenseOverride = input.overrides?.monthlyExpense ?? null;
  const home = snapshotHome(snapshot, input.currentHome);
  const manualAccounts = (input.manualAccounts || []).map(account => ({ ...account }));

  const warnings: FinancesOverview['warnings'] = [];
  const status = normalizeStatus(snapshot.status);
  if (status === 'partial') warnings.push({ code: 'partial', message: 'Some connected sources were unavailable when this snapshot was created.' });
  if (status === 'unavailable') warnings.push({ code: 'unavailable', message: 'Connected-source data was unavailable for this snapshot.' });
  // A 'stale' status deliberately produces no warning. It fires whenever a provider's own
  // observation is older than our refresh window, which is routinely outside the user's
  // control -- an institution that publishes investment balances daily, or a holding priced
  // at the last market close over a weekend. Refreshing cannot clear it, so warning about it
  // asks for an action that does not exist. Staleness stays on the snapshot for diagnostics
  // and retention decisions; it is simply not something to put in front of the user.

  const quality = snapshot.quality && typeof snapshot.quality === 'object' ? snapshot.quality as any : {};
  const unavailableSourceIds: string[] = Array.isArray(quality.unavailableSourceIds)
    ? quality.unavailableSourceIds.filter((id: unknown): id is string => typeof id === 'string')
    : [];
  // A holdings-coverage gap is not a missing source: the account's reported balance is in
  // the totals either way. It changes what the allocation can say, not what anything is
  // worth, so it gets its own note instead of being counted as unavailable data.
  const coverageGapCount = unavailableSourceIds
    .filter(id => id.endsWith(':holdings-coverage')).length;
  const unavailableSources = unavailableSourceIds.length - coverageGapCount;
  // 'partial' and 'unavailable' already say a source is missing; anything else must not
  // swallow this, or a stale snapshot would hide the only note explaining a missing value.
  if (unavailableSources > 0 && status !== 'partial' && status !== 'unavailable') {
    warnings.push({ code: 'optional-sources-unavailable', message: `${unavailableSources} optional data source${unavailableSources === 1 ? ' was' : 's were'} unavailable.` });
  }
  if (coverageGapCount > 0) {
    warnings.push({
      code: 'incomplete-holdings-coverage',
      message: `${coverageGapCount} investment account${coverageGapCount === 1 ? '' : 's'} report${coverageGapCount === 1 ? 's' : ''} a balance its listed holdings do not fully account for. Totals use the balance the institution reports; the remainder appears as Not itemized in your allocation.`,
    });
  }

  const transactionSummary = snapshot.transactionsSummary && typeof snapshot.transactionsSummary === 'object'
    ? snapshot.transactionsSummary as any
    : null;
  const excludedClassificationCount = Array.isArray(transactionSummary?.unclassifiedTransactionIds)
    ? transactionSummary.unclassifiedTransactionIds.length
    : 0;
  const excludedCurrencyCount = Array.isArray(transactionSummary?.currencyMismatchTransactionIds)
    ? transactionSummary.currencyMismatchTransactionIds.length
    : 0;
  if (excludedClassificationCount > 0) {
    warnings.push({ code: 'unclassified-transactions', message: `${excludedClassificationCount} transaction${excludedClassificationCount === 1 ? ' was' : 's were'} excluded from income and spending because categorization was unavailable.` });
  }
  if (excludedCurrencyCount > 0) {
    warnings.push({ code: 'currency-mismatch', message: `${excludedCurrencyCount} transaction${excludedCurrencyCount === 1 ? ' was' : 's were'} excluded because currency conversion was unavailable.` });
  }
  if (home && !home.isSnapshotAligned) {
    warnings.push({ code: 'home-metadata-out-of-sync', message: 'Home details changed after this financial snapshot; refresh totals to align them.' });
  }

  const snapshotManualAccounts = new Map(
    [...groups.cash, ...groups.investments, ...groups.debt, ...groups.other]
      .filter(account => account.source === 'manual')
      .map(account => [accountId(account), account] as const)
  );
  // Membership alone misses renames and amount edits, which leave the id set unchanged
  // while the snapshot still carries the old name and balance. Compare the values too so
  // the warning stays honest until the background revision catches up. Debt and mortgage
  // are stored as positive magnitudes in the snapshot, so compare magnitudes.
  const manualAccountsAligned = snapshotManualAccounts.size === manualAccounts.length
    && manualAccounts.every(account => {
      const snapshotAccount = snapshotManualAccounts.get(`manual-${account.id}`);
      if (!snapshotAccount) return false;
      if (snapshotAccount.name !== account.name) return false;
      const snapshotBalance = accountBalance(snapshotAccount);
      if (snapshotBalance === null) return false;
      return Math.abs(snapshotBalance - Math.abs(account.amount)) < 0.01;
    });
  if (!manualAccountsAligned) {
    warnings.push({ code: 'manual-accounts-out-of-sync', message: 'Manual accounts changed after this financial snapshot; refresh totals to align them.' });
  }

  // A snapshot written before source observations were persisted has no per-source
  // times to reduce, so the oldest is the only source time it can offer. Falling back
  // keeps its timestamp on screen until the next rebuild replaces the row.
  const observations = Array.isArray(snapshot.sourceObservations) && snapshot.sourceObservations.length > 0
    ? snapshot.sourceObservations
    : null;
  const newestSourceAsOf = observations
    ? iso(newestExpiringSourceAsOf(observations))
    : iso(snapshot.asOf);

  return {
    userTimeZone: input.userTimeZone?.trim() || null,
    revision: {
      id: computedAt,
      asOf: iso(snapshot.asOf),
      computedAt,
      newestSourceAsOf,
      status,
      reportingCurrency: typeof snapshot.reportingCurrency === 'string'
        ? snapshot.reportingCurrency
        : 'USD',
      rebuildPending: Boolean(input.rebuildPending),
    },
    warnings,
    connectionHealth: buildConnectionHealth(input.reauthRequiredConnections),
    financialOverview: {
      netWorth,
      totalCash,
      totalInvestments,
      totalDebt,
      homeValue: finite(overview.homeValue),
    },
    investmentPortfolio: snapshot.investmentPortfolio || {},
    accountGroups: {
      cash: { accounts: groups.cash, totalBalance: totalCash, unavailableBalanceCount: unavailableBalanceCount(groups.cash) },
      investments: { accounts: groups.investments, totalBalance: totalInvestments, unavailableBalanceCount: unavailableBalanceCount(groups.investments) },
      debt: { accounts: groups.debt, totalBalance: totalDebt, unavailableBalanceCount: unavailableBalanceCount(groups.debt) },
      other: { accounts: groups.other, totalBalance: totalKnownBalances(groups.other), unavailableBalanceCount: unavailableBalanceCount(groups.other) },
    },
    cashFlow: {
      monthCount: averages?.monthCount ?? 0,
      calculatedMonthlyIncome: averages?.averageIncome ?? null,
      calculatedMonthlyExpense: averages?.averageExpenses ?? null,
      calculatedMonthlyOperatingCashFlow: averages?.averageOperatingCashFlow ?? null,
      monthlyIncomeOverride,
      monthlyExpenseOverride,
      effectiveMonthlyIncome: monthlyIncomeOverride ?? averages?.averageIncome ?? null,
      effectiveMonthlyExpense: monthlyExpenseOverride ?? averages?.averageExpenses ?? null,
    },
    home,
    manualAccounts,
  };
}

function accountIdMatches(candidate: unknown, requested: string): boolean {
  if (typeof candidate !== 'string') return false;
  if (candidate === requested) return true;
  return candidate.replace(/^snaptrade-/, '') === requested.replace(/^snaptrade-/, '');
}

export function buildFinancesAccountDetails(
  snapshot: FinancesSnapshotLike,
  requestedAccountId: string
): FinancesAccountDetails | null {
  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts as FinancesAccount[] : [];
  const account = accounts.find(candidate =>
    accountIdMatches(candidate.account_id, requestedAccountId)
      || accountIdMatches(candidate.id, requestedAccountId)
  );
  if (!account) return null;

  const resolvedId = accountId(account);
  const forAccount = (entry: any) => holdingBelongsToInvestmentAccount(entry?.account_id, account);
  const transactions = (Array.isArray(snapshot.transactions) ? snapshot.transactions : [])
    .filter(forAccount)
    .sort((left: any, right: any) => Date.parse(right?.date || '') - Date.parse(left?.date || ''));
  const holdings = (Array.isArray(snapshot.holdings) ? snapshot.holdings : []).filter(forAccount);
  const investmentTransactions = (Array.isArray(snapshot.activities) ? snapshot.activities : [])
    .filter(forAccount)
    .sort((left: any, right: any) => Date.parse(right?.date || '') - Date.parse(left?.date || ''));
  const securities = Array.isArray(snapshot.securities) ? snapshot.securities : [];
  const reportingCurrency = typeof snapshot.reportingCurrency === 'string'
    ? snapshot.reportingCurrency
    : 'USD';

  return {
    revisionId: iso(snapshot.computedAt)!,
    accountId: resolvedId,
    transactions,
    holdings,
    investmentTransactions,
    portfolio: buildCanonicalInvestmentPortfolio(holdings, securities, [account], reportingCurrency),
  };
}
