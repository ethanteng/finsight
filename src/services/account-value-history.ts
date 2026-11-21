import { addDays, calendarDateFrom, maxDate, type CalendarDate } from '../cash-flow/calendar';
import { calendarDateInTimeZone } from '../domain/time-zone';
import { classifyAccount } from './account-classifier';
import { holdingBelongsToInvestmentAccount } from './canonical-financial-snapshot';
import {
  accountId as financesAccountId,
  type FinancesAccount,
} from './finances-overview-service';

/**
 * An account's value over time, for the chart in its detail view.
 *
 * Each series has one source, never a blend of two:
 *
 * - A connected cash account or credit card is rebuilt from its posted
 *   transactions, working back day by day from the balance the institution
 *   reported. That is arithmetic on linked data, not an estimate, and it covers
 *   the snapshot's whole transaction window from the day the account's first
 *   posted transaction appears. Before that day the balance is unknown, so the
 *   series starts there rather than at zero.
 * - Every other account (investments, loans, mortgages, balances entered by
 *   hand) has no transaction trail that explains its value -- markets move an
 *   investment account with no transaction at all -- so its series is what
 *   Linc recorded: every daily history observation stores each account's value
 *   with the time its provider reported it. A point is dated by that report,
 *   not by when Linc read it, so an account the provider has not refreshed adds
 *   no new point. An account no provider confirmed has no points.
 *
 * See docs/ACCOUNT_VALUE_HISTORY.md.
 */

/** One account's value at a history observation, as `FinancialSummaryHistory.accountValues` stores it. */
export interface RecordedAccountValue {
  value: number | null;
  /** When the provider reported the account (ISO). Null when none confirmed it. */
  observedAt: string | null;
}

/** Every account's recorded value at one observation, keyed by account id. */
export type RecordedAccountValues = Record<string, RecordedAccountValue>;

/** What the series measures: cash held, what is owed, or what an account is worth. */
export type AccountValueMeasure = 'balance' | 'owed' | 'value';

/** Where the series came from. */
export type AccountValueMethod = 'transactions' | 'recorded';

export interface AccountValuePoint {
  /** The user's calendar date; the value is the account's at the end of it. */
  date: CalendarDate;
  value: number;
}

export interface AccountValueHistory {
  accountId: string;
  measure: AccountValueMeasure;
  method: AccountValueMethod;
  /** The reporting currency every point is in. */
  currency: string;
  /** Oldest first, at most one per day. */
  points: AccountValuePoint[];
  /**
   * The account's balance is in another currency (or none) and Linc does not
   * convert it, so there is no series: points is empty, and the chart says why
   * rather than that nothing has been recorded yet.
   */
  unconverted: boolean;
  /**
   * A cash account or card whose transactions could not be walked back through
   * (one has no usable date or amount, or is in another currency), so it shows
   * its recorded values instead. The chart says so, rather than that recording
   * has only just started for an account with a long transaction history.
   */
  rebuildRefused: boolean;
}

export interface AccountValueHistoryInput {
  account: FinancesAccount;
  /** The snapshot's `meta.accountDisplayBalances`. */
  displayBalances: unknown;
  /** The snapshot's transactions, for every account. */
  transactions: unknown;
  /** Daily history rows, in any order. Rows recorded before per-account values carry none. */
  recorded: ReadonlyArray<{ computedAt: Date; accountValues: unknown }>;
  reportingCurrency: string;
  timeZone: string;
  /** When the snapshot was computed: dates a walk-back whose provider gave no observation time. */
  computedAt: Date;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** The balance the provider reported, signed as it reported it. */
function reportedBalance(account: FinancesAccount): number | null {
  if (typeof account.balance === 'number') return finite(account.balance);
  if (!isRecord(account.balance)) return null;
  return finite(account.balance.current) ?? finite(account.balance.available);
}

function isoTimestamp(raw: unknown): string | null {
  if (typeof raw !== 'string' && !(raw instanceof Date)) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isSnapTrade(account: FinancesAccount): boolean {
  return account.source === 'snaptrade' || String(account.account_id || account.id || '').startsWith('snaptrade-');
}

/**
 * When the provider observed the account's value: the observation the
 * snapshot's quality evaluation judges, `snapshotTimestamp` and then
 * `lastSyncedAt`. They usually agree, but a Plaid account read back from the
 * database when a live fetch fails carries its latest balance fetch in
 * `snapshotTimestamp` and an older account sync in `lastSyncedAt`, so reading
 * only the second would date a fresh balance to an old day.
 *
 * SnapTrade is the exception. Its `snapshotTimestamp` falls back to when Linc
 * read SnapTrade's cache, which confirms nothing about the value, so only its
 * holdings sync (`lastSyncedAt`) dates a point, and an account whose holdings
 * have never synced has none.
 */
function observedAt(account: FinancesAccount): string | null {
  const timestamps = account as FinancesAccount & { snapshotTimestamp?: unknown; lastSyncedAt?: unknown };
  if (isSnapTrade(account)) return isoTimestamp(timestamps.lastSyncedAt);
  return isoTimestamp(timestamps.snapshotTimestamp) ?? isoTimestamp(timestamps.lastSyncedAt);
}

/** The currency the provider reported the balance in, as the canonical snapshot reads it; null when it gave none. */
function accountCurrency(account: FinancesAccount): string | null {
  const code = isRecord(account.balance) ? account.balance.iso_currency_code : undefined;
  return typeof code === 'string' && code.trim() ? code.trim().toUpperCase() : null;
}

/**
 * A connected investment account's value is its reporting-currency holdings, and
 * its reported balance stands in only when it is in that currency (see
 * `resolveInvestmentAccountValue`), so it is already comparable. Any other
 * account's value is its balance as reported, which Linc does not convert: one
 * in another currency, or in none, is left out, as the canonical totals leave
 * it out, rather than charted as if it were dollars.
 */
function isUnconverted(account: FinancesAccount, reportingCurrency: string): boolean {
  const valuedFromHoldings = classifyAccount(account).isInvestment && account.source !== 'manual';
  return !valuedFromHoldings && accountCurrency(account) !== reportingCurrency;
}

function measureFor(account: FinancesAccount): AccountValueMeasure {
  const classified = classifyAccount(account);
  if (classified.isInvestment) return 'value';
  if (classified.isDebt) return 'owed';
  return 'balance';
}

/**
 * The value to record for an account: the figure the Finances page shows for
 * it, except that a cash account keeps its sign, so an overdraft plots below
 * zero instead of as a positive debt. Null for a balance in another currency.
 */
function recordableValue(
  account: FinancesAccount,
  id: string,
  displayBalances: Record<string, unknown>,
  reportingCurrency: string
): number | null {
  if (isUnconverted(account, reportingCurrency)) return null;
  const classified = classifyAccount(account);
  if (classified.isCash) return reportedBalance(account);
  const value = Object.prototype.hasOwnProperty.call(displayBalances, id)
    ? finite(displayBalances[id])
    : reportedBalance(account);
  return classified.isDebt && value !== null ? Math.abs(value) : value;
}

/** Each account's value and observation time, to store with a daily history observation. */
export function accountValuesForHistory(
  accountsInput: unknown,
  displayBalancesInput: unknown,
  reportingCurrencyInput: unknown
): RecordedAccountValues {
  const accounts = Array.isArray(accountsInput) ? accountsInput as FinancesAccount[] : [];
  const displayBalances = isRecord(displayBalancesInput) ? displayBalancesInput : {};
  const reportingCurrency = typeof reportingCurrencyInput === 'string' && reportingCurrencyInput.trim()
    ? reportingCurrencyInput.trim().toUpperCase()
    : 'USD';
  const values: RecordedAccountValues = {};
  for (const account of accounts) {
    const id = financesAccountId(account);
    if (!id || Object.prototype.hasOwnProperty.call(values, id)) continue;
    values[id] = {
      value: recordableValue(account, id, displayBalances, reportingCurrency),
      observedAt: observedAt(account),
    };
  }
  return values;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * The provider's own amount, in dollars: positive when money leaves the account.
 * Missing is null. `Number(null)` is 0, so a missing amount must not be coerced
 * or the walk would treat it as a zero transaction and keep going.
 */
function providerAmount(transaction: any): number | null {
  const raw = transaction?.source_amount ?? transaction?.sourceAmount ?? transaction?.amount;
  if (typeof raw === 'number') return finite(raw);
  if (typeof raw === 'string' && raw.trim()) return finite(Number(raw));
  return null;
}

/**
 * A walk back through an account's transactions: its points, or why there are
 * none. `unusable` is the one worth telling the user about -- the account has a
 * transaction history, but one transaction in it cannot be counted.
 */
type WalkBack =
  | { points: AccountValuePoint[] }
  | { refused: 'no_balance' | 'no_transactions' | 'unusable' };

/**
 * Rebuild a cash account's or card's end-of-day balances from its posted
 * transactions, or refuse when they cannot honestly explain it: no reported
 * balance, nothing posted, or a transaction in another currency or with no
 * usable date or amount. The caller has already checked the balance's own
 * currency. Pending transactions are left out, as the reported balance leaves
 * them out.
 */
function walkBackFromTransactions(
  account: FinancesAccount,
  transactionsInput: unknown,
  reportingCurrency: string,
  anchorDate: CalendarDate
): WalkBack {
  const balance = reportedBalance(account);
  if (balance === null) return { refused: 'no_balance' };

  const transactions = Array.isArray(transactionsInput) ? transactionsInput : [];
  const netCentsByDate = new Map<CalendarDate, number>();
  const seen = new Set<string>();
  let earliest: CalendarDate | null = null;
  let latest: CalendarDate | null = null;

  for (const transaction of transactions as any[]) {
    if (!holdingBelongsToInvestmentAccount(transaction?.account_id, account)) continue;
    if (transaction?.pending === true) continue;
    const transactionId = String(transaction?.transaction_id || transaction?.id || '').trim();
    if (transactionId) {
      if (seen.has(transactionId)) continue;
      seen.add(transactionId);
    }
    const currency = String(transaction?.iso_currency_code || transaction?.currency || reportingCurrency).toUpperCase();
    const amount = providerAmount(transaction);
    const date = calendarDateFrom(transaction?.date ?? transaction?.posted_date);
    if (currency !== reportingCurrency || amount === null || !date) return { refused: 'unusable' };
    netCentsByDate.set(date, (netCentsByDate.get(date) ?? 0) + toCents(amount));
    if (!earliest || date < earliest) earliest = date;
    if (!latest || date > latest) latest = date;
  }
  if (!earliest || !latest) return { refused: 'no_transactions' };

  // A cash account held that much more the day before money left it; a card
  // owed that much less the day before a charge.
  const direction = classifyAccount(account).category === 'credit' ? -1 : 1;
  const end = maxDate(anchorDate, latest);
  let cents = toCents(balance);
  let date = end;
  const points: AccountValuePoint[] = [{ date, value: cents / 100 }];
  while (date > earliest) {
    cents += direction * (netCentsByDate.get(date) ?? 0);
    date = addDays(date, -1);
    points.push({ date, value: cents / 100 });
  }
  return { points: points.reverse() };
}

/** Recorded values for one account, one per provider-observed day; the latest computation wins a day. */
function recordedSeries(
  id: string,
  recorded: AccountValueHistoryInput['recorded'],
  current: RecordedAccountValue,
  timeZone: string
): AccountValuePoint[] {
  const byDate = new Map<CalendarDate, { value: number; at: number }>();
  const add = (entry: unknown, at: number) => {
    if (!isRecord(entry)) return;
    const value = finite(entry.value);
    const observed = typeof entry.observedAt === 'string' ? new Date(entry.observedAt) : null;
    if (value === null || !observed || Number.isNaN(observed.getTime())) return;
    const date = calendarDateInTimeZone(observed, timeZone);
    const existing = byDate.get(date);
    if (!existing || existing.at <= at) byDate.set(date, { value, at });
  };
  for (const row of recorded) {
    if (isRecord(row.accountValues)) add(row.accountValues[id], row.computedAt.getTime());
  }
  // The snapshot on screen is the newest observation, even if writing its
  // history row failed, so the chart always ends where the page's figure is.
  add(current, Number.POSITIVE_INFINITY);
  return [...byDate.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([date, { value }]) => ({ date, value }));
}

export function buildAccountValueHistory(input: AccountValueHistoryInput): AccountValueHistory {
  const { account, timeZone } = input;
  const reportingCurrency = input.reportingCurrency.toUpperCase();
  const id = financesAccountId(account);
  const measure = measureFor(account);
  const category = classifyAccount(account).category;
  const base = { accountId: id, measure, currency: reportingCurrency };

  // Checked on the way out as well as on the way in: an account's currency can
  // change under the same id, and an earlier row would then be in the old one.
  if (isUnconverted(account, reportingCurrency)) {
    return { ...base, method: 'recorded', points: [], unconverted: true, rebuildRefused: false };
  }

  let rebuildRefused = false;
  if ((category === 'cash' || category === 'credit') && account.source !== 'manual') {
    const observed = observedAt(account);
    const anchorDate = calendarDateInTimeZone(observed ? new Date(observed) : input.computedAt, timeZone);
    const walk = walkBackFromTransactions(account, input.transactions, reportingCurrency, anchorDate);
    if ('points' in walk && walk.points.length >= 2) {
      return { ...base, method: 'transactions', points: walk.points, unconverted: false, rebuildRefused: false };
    }
    rebuildRefused = 'refused' in walk && walk.refused === 'unusable';
  }

  const displayBalances = isRecord(input.displayBalances) ? input.displayBalances : {};
  const current: RecordedAccountValue = {
    value: recordableValue(account, id, displayBalances, reportingCurrency),
    observedAt: observedAt(account),
  };
  return {
    ...base,
    method: 'recorded',
    unconverted: false,
    rebuildRefused,
    points: recordedSeries(id, input.recorded, current, timeZone),
  };
}
