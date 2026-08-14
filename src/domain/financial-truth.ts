/**
 * Canonical financial semantics for Ask Linc.
 *
 * This module intentionally contains no provider, database, or UI logic. Those
 * layers must adapt their data to this contract instead of redefining financial
 * meanings locally.
 */

export const FINANCIAL_TRUTH_VERSION = '1.0' as const;

export type AccountSource = 'plaid' | 'snaptrade' | 'manual';

/**
 * Stable identity is provider identity scoped to both its owner and connection.
 * Display fields and balances are deliberately excluded because they can change.
 */
export interface AccountIdentity {
  ownerId: string;
  source: AccountSource;
  sourceConnectionId: string;
  sourceAccountId: string;
}

export function accountIdentityKey(identity: AccountIdentity): string {
  const parts = [
    identity.ownerId,
    identity.source,
    identity.sourceConnectionId,
    identity.sourceAccountId,
  ];

  if (parts.some((part) => typeof part !== 'string' || part.trim().length === 0)) {
    throw new Error('Account identity fields must be non-empty strings');
  }

  return parts.map((part) => encodeURIComponent(part.trim())).join(':');
}

export const CANONICAL_TRANSACTION_TYPES = [
  'income',
  'expense',
  'transfer_in',
  'transfer_out',
  'buy',
  'sell',
  'deposit',
  'withdrawal',
  'fee',
  'refund',
  'adjustment',
] as const;

export type CanonicalTransactionType = (typeof CANONICAL_TRANSACTION_TYPES)[number];

const CANONICAL_TRANSACTION_TYPE_SET: ReadonlySet<string> = new Set(CANONICAL_TRANSACTION_TYPES);

export function isCanonicalTransactionType(value: unknown): value is CanonicalTransactionType {
  return typeof value === 'string' && CANONICAL_TRANSACTION_TYPE_SET.has(value);
}

/**
 * cashFlowAmount is from the user's perspective after provider normalization:
 * positive means money received and negative means money paid. sourceAmount is
 * retained separately for reconciliation and must never drive aggregation.
 */
export interface CanonicalTransaction {
  id: string;
  accountKey: string;
  effectiveDate: string | Date;
  type: CanonicalTransactionType;
  sourceAmount: number;
  cashFlowAmount: number;
  currency: string;
  category?: string | null;
  pending?: boolean;
}

export interface ReportingPeriod {
  /** Inclusive date boundary. */
  start: string | Date;
  /** Exclusive date boundary. */
  endExclusive: string | Date;
}

export interface CashFlowMonth {
  income: number;
  expenses: number;
  operatingCashFlow: number;
}

export interface CashFlowSummary {
  currency: string;
  incomeTotal: number;
  expenseTotal: number;
  operatingCashFlow: number;
  byExpenseCategory: Record<string, number>;
  /** Every UTC calendar month touched by the reporting period, including zero months. */
  byMonth: Record<string, CashFlowMonth>;
  includedTransactionIds: string[];
  excludedTransactionIds: string[];
}

const INCOME_TYPES = new Set<CanonicalTransactionType>(['income']);
const EXPENSE_TYPES = new Set<CanonicalTransactionType>(['expense', 'fee']);
const EXCLUDED_TYPES = new Set<CanonicalTransactionType>([
  'transfer_in',
  'transfer_out',
  'buy',
  'sell',
  'deposit',
  'withdrawal',
  'adjustment',
]);

function parseDate(value: string | Date, fieldName: string): Date {
  let parsed: Date;
  if (value instanceof Date) {
    parsed = new Date(value.getTime());
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Financial providers commonly return date-only values. Make their UTC
    // meaning explicit rather than relying on runtime-specific parsing.
    parsed = new Date(`${value}T00:00:00.000Z`);
    if (parsed.toISOString().slice(0, 10) !== value) {
      throw new Error(`${fieldName} must be a valid date`);
    }
  } else {
    // Timestamp strings must identify an instant. A timestamp without an
    // offset would be interpreted in the server's local timezone and can move
    // a transaction into a different UTC month.
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
      throw new Error(`${fieldName} timestamp must include a timezone offset`);
    }
    parsed = new Date(value);
  }
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }
  return parsed;
}

function assertFiniteAmount(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be finite`);
  }
}

function assertCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('currency must be a three-letter ISO currency code');
  }
  return currency;
}

function utcMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function calendarMonths(periodStart: Date, periodEndExclusive: Date): string[] {
  const result: string[] = [];
  const cursor = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), 1));
  const finalMonth = new Date(
    Date.UTC(periodEndExclusive.getUTCFullYear(), periodEndExclusive.getUTCMonth(), 1)
  );

  // An exclusive boundary on the first day does not include that new month.
  if (
    periodEndExclusive.getUTCDate() === 1 &&
    periodEndExclusive.getUTCHours() === 0 &&
    periodEndExclusive.getUTCMinutes() === 0 &&
    periodEndExclusive.getUTCSeconds() === 0 &&
    periodEndExclusive.getUTCMilliseconds() === 0
  ) {
    finalMonth.setUTCMonth(finalMonth.getUTCMonth() - 1);
  }

  while (cursor <= finalMonth) {
    result.push(utcMonthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

function assertCanonicalSign(transaction: CanonicalTransaction): void {
  if (INCOME_TYPES.has(transaction.type) && transaction.cashFlowAmount < 0) {
    throw new Error(`Income transaction ${transaction.id} must have a non-negative cashFlowAmount`);
  }
  if (EXPENSE_TYPES.has(transaction.type) && transaction.cashFlowAmount > 0) {
    throw new Error(`Expense transaction ${transaction.id} must have a non-positive cashFlowAmount`);
  }
  if (transaction.type === 'refund' && transaction.cashFlowAmount < 0) {
    throw new Error(`Refund transaction ${transaction.id} must have a non-negative cashFlowAmount`);
  }
}

/**
 * Summarize operating income and spending without treating transfers or trades
 * as either. Pending transactions are excluded from historical actuals.
 */
export function summarizeCashFlow(
  transactions: readonly CanonicalTransaction[],
  period: ReportingPeriod,
  reportingCurrency: string
): CashFlowSummary {
  const start = parseDate(period.start, 'period.start');
  const endExclusive = parseDate(period.endExclusive, 'period.endExclusive');
  if (endExclusive <= start) {
    throw new Error('period.endExclusive must be after period.start');
  }

  const currency = assertCurrency(reportingCurrency);
  const byMonth: Record<string, CashFlowMonth> = {};
  for (const month of calendarMonths(start, endExclusive)) {
    byMonth[month] = { income: 0, expenses: 0, operatingCashFlow: 0 };
  }

  const summary: CashFlowSummary = {
    currency,
    incomeTotal: 0,
    expenseTotal: 0,
    operatingCashFlow: 0,
    byExpenseCategory: {},
    byMonth,
    includedTransactionIds: [],
    excludedTransactionIds: [],
  };

  for (const transaction of transactions) {
    assertFiniteAmount(transaction.sourceAmount, `sourceAmount for ${transaction.id}`);
    assertFiniteAmount(transaction.cashFlowAmount, `cashFlowAmount for ${transaction.id}`);
    assertCanonicalSign(transaction);

    const effectiveDate = parseDate(transaction.effectiveDate, `effectiveDate for ${transaction.id}`);
    const isInPeriod = effectiveDate >= start && effectiveDate < endExclusive;
    const transactionCurrency = assertCurrency(transaction.currency);

    if (!isInPeriod || transaction.pending || EXCLUDED_TYPES.has(transaction.type)) {
      summary.excludedTransactionIds.push(transaction.id);
      continue;
    }
    if (transactionCurrency !== currency) {
      throw new Error(
        `Transaction ${transaction.id} is ${transactionCurrency}; convert it to ${currency} before aggregation`
      );
    }

    const month = summary.byMonth[utcMonthKey(effectiveDate)];
    if (!month) {
      throw new Error(`Transaction ${transaction.id} falls outside initialized reporting months`);
    }

    if (transaction.type === 'income') {
      summary.incomeTotal += transaction.cashFlowAmount;
      month.income += transaction.cashFlowAmount;
    } else {
      const expenseEffect =
        transaction.type === 'refund'
          ? -transaction.cashFlowAmount
          : Math.abs(transaction.cashFlowAmount);
      const category = transaction.category?.trim() || 'Uncategorized';
      summary.expenseTotal += expenseEffect;
      summary.byExpenseCategory[category] =
        (summary.byExpenseCategory[category] || 0) + expenseEffect;
      month.expenses += expenseEffect;
    }

    month.operatingCashFlow = month.income - month.expenses;
    summary.includedTransactionIds.push(transaction.id);
  }

  summary.operatingCashFlow = summary.incomeTotal - summary.expenseTotal;
  return summary;
}

export interface MonthlyCashFlowAverage {
  monthCount: number;
  averageIncome: number;
  averageExpenses: number;
  averageOperatingCashFlow: number;
}

/** Average over explicit months; zero-activity months remain in the denominator. */
export function averageMonthlyCashFlow(summary: CashFlowSummary): MonthlyCashFlowAverage {
  const months = Object.values(summary.byMonth);
  if (months.length === 0) {
    return { monthCount: 0, averageIncome: 0, averageExpenses: 0, averageOperatingCashFlow: 0 };
  }
  return {
    monthCount: months.length,
    averageIncome: months.reduce((total, month) => total + month.income, 0) / months.length,
    averageExpenses: months.reduce((total, month) => total + month.expenses, 0) / months.length,
    averageOperatingCashFlow:
      months.reduce((total, month) => total + month.operatingCashFlow, 0) / months.length,
  };
}

export interface FinancialOverviewInput {
  reportingCurrency: string;
  totalCash: number;
  totalInvestments: number;
  homeValue?: number | null;
  otherAssets?: number;
  totalDebt: number;
  otherLiabilities?: number;
}

export interface CanonicalFinancialOverview {
  reportingCurrency: string;
  totalCash: number;
  totalInvestments: number;
  homeValue: number | null;
  otherAssets: number;
  totalAssets: number;
  totalDebt: number;
  otherLiabilities: number;
  totalLiabilities: number;
  netWorth: number;
}

/** All input amounts are non-negative magnitudes already converted to reportingCurrency. */
export function computeFinancialOverview(input: FinancialOverviewInput): CanonicalFinancialOverview {
  const reportingCurrency = assertCurrency(input.reportingCurrency);
  const values = {
    totalCash: input.totalCash,
    totalInvestments: input.totalInvestments,
    homeValue: input.homeValue ?? null,
    otherAssets: input.otherAssets ?? 0,
    totalDebt: input.totalDebt,
    otherLiabilities: input.otherLiabilities ?? 0,
  };

  for (const [name, value] of Object.entries(values)) {
    if (value === null) continue;
    assertFiniteAmount(value, name);
    if (value < 0) throw new Error(`${name} must be a non-negative magnitude`);
  }

  const totalAssets =
    values.totalCash + values.totalInvestments + (values.homeValue ?? 0) + values.otherAssets;
  const totalLiabilities = values.totalDebt + values.otherLiabilities;

  return {
    reportingCurrency,
    ...values,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}

export const CORE_METRIC_DEFINITIONS = {
  totalCash: 'Sum of cash-account balances; overdrafts are liabilities, not negative cash.',
  totalInvestments: 'Market value of deduplicated holdings plus manual investment assets.',
  homeValue: 'Current user override or provider midpoint; null means unknown and is not replaced by a range bound.',
  totalAssets: 'totalCash + totalInvestments + known homeValue + otherAssets.',
  totalDebt: 'Positive outstanding principal for debt accounts, including overdrafts.',
  totalLiabilities: 'totalDebt + otherLiabilities.',
  netWorth: 'totalAssets - totalLiabilities.',
  incomeTotal: 'Posted transactions classified as income within the reporting period.',
  expenseTotal: 'Posted expense and fee transactions, net of refunds, within the reporting period.',
  operatingCashFlow: 'incomeTotal - expenseTotal; transfers and investment trades are excluded.',
  averageMonthlyIncome: 'incomeTotal divided by every calendar month in the explicit reporting window.',
  averageMonthlyExpenses: 'expenseTotal divided by every calendar month in the explicit reporting window.',
} as const;

export type SnapshotSourceStatus = 'available' | 'unavailable';

export interface SnapshotSourceObservation {
  id: string;
  required: boolean;
  status: SnapshotSourceStatus;
  /** Provider observation time, not cache write time. */
  asOf: string | Date | null;
  maxAgeMs: number;
  error?: string | null;
}

export type SnapshotStatus = 'current' | 'stale' | 'partial' | 'unavailable';

export interface SnapshotQuality {
  status: SnapshotStatus;
  /** Oldest successful source observation used by the snapshot. */
  asOf: Date | null;
  computedAt: Date;
  staleSourceIds: string[];
  /** Every unavailable source, including optional sources, for provenance. */
  unavailableSourceIds: string[];
  /** Required unavailable sources that make an otherwise available snapshot partial. */
  requiredUnavailableSourceIds: string[];
  errors: Array<{ sourceId: string; message: string }>;
}

/**
 * Snapshot quality is based on source observations. Recomputing or reading a
 * cache never makes underlying data fresher.
 */
export function evaluateSnapshotQuality(
  sources: readonly SnapshotSourceObservation[],
  computedAtInput: string | Date
): SnapshotQuality {
  const computedAt = parseDate(computedAtInput, 'computedAt');
  const availableDates: Date[] = [];
  const staleSourceIds: string[] = [];
  const unavailableSourceIds: string[] = [];
  const requiredUnavailableSourceIds: string[] = [];
  const errors: Array<{ sourceId: string; message: string }> = [];

  for (const source of sources) {
    if (!source.id.trim()) throw new Error('Snapshot source id must be non-empty');
    if (!Number.isFinite(source.maxAgeMs) || source.maxAgeMs < 0) {
      throw new Error(`maxAgeMs for ${source.id} must be a non-negative finite number`);
    }
    if (source.error) errors.push({ sourceId: source.id, message: source.error });

    if (source.status === 'unavailable' || source.asOf === null) {
      unavailableSourceIds.push(source.id);
      if (source.required) requiredUnavailableSourceIds.push(source.id);
      continue;
    }

    const asOf = parseDate(source.asOf, `asOf for ${source.id}`);
    if (asOf > computedAt) throw new Error(`asOf for ${source.id} cannot be after computedAt`);
    availableDates.push(asOf);
    if (computedAt.getTime() - asOf.getTime() > source.maxAgeMs) {
      staleSourceIds.push(source.id);
    }
  }

  const asOf = availableDates.length
    ? new Date(Math.min(...availableDates.map((date) => date.getTime())))
    : null;
  let status: SnapshotStatus = 'current';
  if (availableDates.length === 0) status = 'unavailable';
  else if (requiredUnavailableSourceIds.length > 0) status = 'partial';
  else if (staleSourceIds.length > 0) status = 'stale';

  return {
    status,
    asOf,
    computedAt,
    staleSourceIds,
    unavailableSourceIds,
    requiredUnavailableSourceIds,
    errors,
  };
}
