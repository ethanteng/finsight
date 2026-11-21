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
  currency: string;
  /** Oldest first, at most one per day. */
  points: AccountValuePoint[];
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

function observedAt(account: FinancesAccount): string | null {
  const raw = (account as FinancesAccount & { lastSyncedAt?: unknown }).lastSyncedAt;
  if (typeof raw !== 'string' && !(raw instanceof Date)) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
 * zero instead of as a positive debt.
 */
function recordableValue(
  account: FinancesAccount,
  id: string,
  displayBalances: Record<string, unknown>
): number | null {
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
  displayBalancesInput: unknown
): RecordedAccountValues {
  const accounts = Array.isArray(accountsInput) ? accountsInput as FinancesAccount[] : [];
  const displayBalances = isRecord(displayBalancesInput) ? displayBalancesInput : {};
  const values: RecordedAccountValues = {};
  for (const account of accounts) {
    const id = financesAccountId(account);
    if (!id || Object.prototype.hasOwnProperty.call(values, id)) continue;
    values[id] = {
      value: recordableValue(account, id, displayBalances),
      observedAt: observedAt(account),
    };
  }
  return values;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * Rebuild a cash account's or card's end-of-day balances from its posted
 * transactions, or null when they cannot honestly explain it: no reported
 * balance, a currency other than the reporting one, or a transaction with no
 * usable date or amount. Pending transactions are left out, as the reported
 * balance leaves them out.
 */
function walkBackFromTransactions(
  account: FinancesAccount,
  transactionsInput: unknown,
  reportingCurrency: string,
  anchorDate: CalendarDate
): AccountValuePoint[] | null {
  const balance = reportedBalance(account);
  if (balance === null) return null;
  const accountCurrency = isRecord(account.balance) && typeof account.balance.iso_currency_code === 'string'
    ? account.balance.iso_currency_code.toUpperCase()
    : reportingCurrency;
  if (accountCurrency !== reportingCurrency) return null;

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
    // The provider's own amount: positive when money leaves the account.
    const amount = finite(Number(transaction?.source_amount ?? transaction?.sourceAmount ?? transaction?.amount));
    const date = calendarDateFrom(transaction?.date ?? transaction?.posted_date);
    if (currency !== reportingCurrency || amount === null || !date) return null;
    netCentsByDate.set(date, (netCentsByDate.get(date) ?? 0) + toCents(amount));
    if (!earliest || date < earliest) earliest = date;
    if (!latest || date > latest) latest = date;
  }
  if (!earliest || !latest) return null;

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
  return points.reverse();
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

  if ((category === 'cash' || category === 'credit') && account.source !== 'manual') {
    const observed = observedAt(account);
    const anchorDate = calendarDateInTimeZone(observed ? new Date(observed) : input.computedAt, timeZone);
    const points = walkBackFromTransactions(account, input.transactions, reportingCurrency, anchorDate);
    if (points && points.length >= 2) {
      return { accountId: id, measure, method: 'transactions', currency: reportingCurrency, points };
    }
  }

  const displayBalances = isRecord(input.displayBalances) ? input.displayBalances : {};
  const current: RecordedAccountValue = {
    value: recordableValue(account, id, displayBalances),
    observedAt: observedAt(account),
  };
  return {
    accountId: id,
    measure,
    method: 'recorded',
    currency: reportingCurrency,
    points: recordedSeries(id, input.recorded, current, timeZone),
  };
}
