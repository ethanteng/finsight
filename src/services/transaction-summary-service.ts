import {
  averageMonthlyCashFlow,
  summarizeCashFlow,
  type CashFlowSummary,
  type MonthlyCashFlowAverage,
} from '../domain/financial-truth';
import { toCanonicalTransaction } from './canonical-transaction-adapter';

export interface TransactionSummaryResult {
  windowedTransactions: any[];
  transactionsSummary: {
    reportingCurrency: string;
    incomeTotal: number;
    expenseTotal: number;
    operatingCashFlow: number;
    byCategory: Record<string, number>;
    byMonth: Record<string, { income: number; expense: number; operatingCashFlow: number }>;
    includedTransactionIds: string[];
    excludedTransactionIds: string[];
    unclassifiedTransactionIds: string[];
    currencyMismatchTransactionIds: string[];
    /**
     * First calendar date (YYYY-MM-DD) the summary covers. Later than the
     * requested window when the connected accounts have less history than it
     * asks for; null when there is no activity to establish coverage at all.
     */
    coverageStartDate: string | null;
  };
}

export function averageCanonicalTransactionSummary(value: unknown): MonthlyCashFlowAverage | null {
  if (!value || typeof value !== 'object') return null;
  const summary = value as any;
  if (!summary.byMonth || typeof summary.byMonth !== 'object') return null;
  const finite = (candidate: unknown): number =>
    typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0;
  const canonical: CashFlowSummary = {
    currency: typeof summary.reportingCurrency === 'string' ? summary.reportingCurrency : 'USD',
    incomeTotal: finite(summary.incomeTotal),
    expenseTotal: finite(summary.expenseTotal),
    operatingCashFlow: finite(summary.operatingCashFlow),
    byExpenseCategory: summary.byCategory && typeof summary.byCategory === 'object'
      ? summary.byCategory
      : {},
    byMonth: Object.fromEntries(
      Object.entries(summary.byMonth).map(([month, raw]) => {
        const entry = raw && typeof raw === 'object' ? raw as any : {};
        return [month, {
          income: finite(entry.income),
          expenses: finite(entry.expense),
          operatingCashFlow: finite(entry.operatingCashFlow),
        }];
      })
    ),
    includedTransactionIds: Array.isArray(summary.includedTransactionIds)
      ? summary.includedTransactionIds
      : [],
    excludedTransactionIds: Array.isArray(summary.excludedTransactionIds)
      ? summary.excludedTransactionIds
      : [],
  };
  const average = averageMonthlyCashFlow(canonical);
  // No covered months means cash flow is unknown, not a string of $0 averages.
  return average.monthCount > 0 ? average : null;
}

function transactionDate(transaction: any): Date | null {
  const raw =
    transaction?.date ||
    transaction?.authorized_date ||
    transaction?.posted_date ||
    transaction?.trade_date ||
    transaction?.transaction_date ||
    transaction?.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPendingTransaction(transaction: any): boolean {
  return transaction?.pending === true || String(transaction?.pending || '').toLowerCase() === 'true';
}

/**
 * The earliest day the connected history reaches. A window wider than the
 * history a connection holds would otherwise report the months before it as
 * zero income and zero spending, and every monthly average would divide by them.
 * Those months are unknown, not zero. Pending observations do not count:
 * they are excluded from cash-flow totals and from the persisted window.
 */
function coverageStart(transactions: readonly any[], windowStart: Date, endExclusive: Date): Date | null {
  let earliest: Date | null = null;
  for (const transaction of transactions) {
    if (isPendingTransaction(transaction)) continue;
    const date = transactionDate(transaction);
    if (!date || date < windowStart || date >= endExclusive) continue;
    if (!earliest || date < earliest) earliest = date;
  }
  if (!earliest) return null;
  const day = new Date(Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), earliest.getUTCDate()));
  return day > windowStart ? day : windowStart;
}

function transactionId(transaction: any): string {
  return String(
    transaction?.transaction_id ||
      transaction?.investment_transaction_id ||
      transaction?.id ||
      'unknown'
  );
}

export interface TransactionSummaryOptions {
  /**
   * The transactions whose dates establish coverage. Pass the banking activity:
   * it carries income and spending, while a brokerage feed often reaches back
   * years further and would hide the gap. Defaults to every transaction.
   */
  coverageTransactions?: readonly any[];
}

export function buildTransactionSummary(
  transactions: readonly any[],
  start: Date,
  endExclusive: Date,
  reportingCurrency = 'USD',
  options: TransactionSummaryOptions = {}
): TransactionSummaryResult {
  const transactionsInWindow = transactions.filter((transaction) => {
    const date = transactionDate(transaction);
    return date !== null && date >= start && date < endExclusive;
  });
  // Persist only posted observations in the canonical snapshot. The raw
  // pending observation remains represented in excludedTransactionIds below,
  // while a later posted replacement is retained as the authoritative detail.
  const windowedTransactions = transactionsInWindow.filter(
    transaction => !isPendingTransaction(transaction)
  );

  const canonicalTransactions = [];
  const unclassifiedTransactionIds: string[] = [];
  const currencyMismatchTransactionIds: string[] = [];
  for (const transaction of transactionsInWindow) {
    const canonical = toCanonicalTransaction(transaction);
    if (!canonical) {
      unclassifiedTransactionIds.push(transactionId(transaction));
      continue;
    }
    if (canonical.currency !== reportingCurrency.toUpperCase()) {
      currencyMismatchTransactionIds.push(canonical.id);
      continue;
    }
    canonicalTransactions.push(canonical);
  }

  const coverageCandidates = options.coverageTransactions?.length
    ? options.coverageTransactions
    : transactionsInWindow;
  const coveredFrom = coverageStart(coverageCandidates, start, endExclusive)
    ?? coverageStart(transactionsInWindow, start, endExclusive);

  // No posted activity means coverage is unknown. Do not fill the requested
  // window with zero months — consumers average byMonth directly and would
  // report a year of $0 income and spending.
  if (!coveredFrom) {
    const reportingCurrencyCode = reportingCurrency.toUpperCase();
    return {
      windowedTransactions,
      transactionsSummary: {
        reportingCurrency: reportingCurrencyCode,
        incomeTotal: 0,
        expenseTotal: 0,
        operatingCashFlow: 0,
        byCategory: {},
        byMonth: {},
        includedTransactionIds: [],
        excludedTransactionIds: canonicalTransactions
          .filter((transaction) => transaction.pending)
          .map((transaction) => transaction.id),
        unclassifiedTransactionIds,
        currencyMismatchTransactionIds,
        coverageStartDate: null,
      },
    };
  }

  const canonicalSummary = summarizeCashFlow(
    canonicalTransactions,
    { start: coveredFrom, endExclusive },
    reportingCurrency
  );
  const byMonth = Object.fromEntries(
    Object.entries(canonicalSummary.byMonth).map(([month, values]) => [
      month,
      {
        income: values.income,
        expense: values.expenses,
        operatingCashFlow: values.operatingCashFlow,
      },
    ])
  );

  return {
    windowedTransactions,
    transactionsSummary: {
      reportingCurrency: canonicalSummary.currency,
      incomeTotal: canonicalSummary.incomeTotal,
      expenseTotal: canonicalSummary.expenseTotal,
      operatingCashFlow: canonicalSummary.operatingCashFlow,
      byCategory: canonicalSummary.byExpenseCategory,
      byMonth,
      includedTransactionIds: canonicalSummary.includedTransactionIds,
      excludedTransactionIds: canonicalSummary.excludedTransactionIds,
      unclassifiedTransactionIds,
      currencyMismatchTransactionIds,
      coverageStartDate: coveredFrom.toISOString().slice(0, 10),
    },
  };
}
