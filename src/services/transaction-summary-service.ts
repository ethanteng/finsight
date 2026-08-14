import { summarizeCashFlow } from '../domain/financial-truth';
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
  };
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

function transactionId(transaction: any): string {
  return String(
    transaction?.transaction_id ||
      transaction?.investment_transaction_id ||
      transaction?.id ||
      'unknown'
  );
}

export function buildTransactionSummary(
  transactions: readonly any[],
  start: Date,
  endExclusive: Date,
  reportingCurrency = 'USD'
): TransactionSummaryResult {
  const windowedTransactions = transactions.filter((transaction) => {
    const date = transactionDate(transaction);
    return date !== null && date >= start && date < endExclusive;
  });

  const canonicalTransactions = [];
  const unclassifiedTransactionIds: string[] = [];
  const currencyMismatchTransactionIds: string[] = [];
  for (const transaction of windowedTransactions) {
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

  const canonicalSummary = summarizeCashFlow(
    canonicalTransactions,
    { start, endExclusive },
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
    },
  };
}
