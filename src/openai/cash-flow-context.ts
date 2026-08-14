import { averageCanonicalTransactionSummary } from '../services/transaction-summary-service';
import type { FinancialContextSnapshot } from './types';

export interface IncomeExpenseAnalysisResult {
  text: string;
  averageMonthly: number;
}

/** Build LLM cash-flow context from the same persisted summary used by the app. */
export function buildCanonicalCashFlowAnalyses(
  summary: FinancialContextSnapshot['transactionSummary'],
  monthlyIncomeOverride?: number | null,
  monthlyExpenseOverride?: number | null
): {
  incomeResult?: IncomeExpenseAnalysisResult;
  expenseResult?: IncomeExpenseAnalysisResult;
} {
  const averages = averageCanonicalTransactionSummary(summary);
  if (!averages && monthlyIncomeOverride == null && monthlyExpenseOverride == null) return {};

  const finite = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  const incomeAverage = monthlyIncomeOverride ?? (averages && averages.monthCount > 0 ? averages.averageIncome : null);
  const expenseAverage = monthlyExpenseOverride ?? (averages && averages.monthCount > 0 ? averages.averageExpenses : null);
  const months = averages?.monthCount ?? 0;
  const incomeTotal = finite(summary?.incomeTotal);
  const expenseTotal = finite(summary?.expenseTotal);
  const exclusions = (summary?.unclassifiedTransactionIds?.length || 0)
    + (summary?.currencyMismatchTransactionIds?.length || 0);
  const topCategories = Object.entries(summary?.byCategory || {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([label, value]) => `${label}: $${value.toFixed(2)}`)
    .join(', ');

  return {
    ...(incomeAverage !== null && {
      incomeResult: {
        averageMonthly: incomeAverage,
        text: [
          `Average Monthly Income: $${incomeAverage.toFixed(2)}${monthlyIncomeOverride != null ? ' (Manual Override)' : ''}`,
          incomeTotal !== null ? `Canonical Income Total: $${incomeTotal.toFixed(2)}` : null,
          `Canonical Months Covered: ${months}`,
        ].filter(Boolean).join('\n'),
      },
    }),
    ...(expenseAverage !== null && {
      expenseResult: {
        averageMonthly: expenseAverage,
        text: [
          `Average Monthly Expenses: $${expenseAverage.toFixed(2)}${monthlyExpenseOverride != null ? ' (Manual Override)' : ''}`,
          expenseTotal !== null ? `Canonical Expense Total: $${expenseTotal.toFixed(2)}` : null,
          `Canonical Months Covered: ${months}`,
          `Top Categories: ${topCategories || 'Not available'}`,
          exclusions > 0 ? `Excluded Transactions: ${exclusions} (unclassified or unavailable currency conversion)` : null,
        ].filter(Boolean).join('\n'),
      },
    }),
  };
}
