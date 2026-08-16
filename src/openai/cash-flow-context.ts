import { mergeLabelKeyedTotals } from '../services/label-normalization';
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
  monthlyExpenseOverride?: number | null,
  includeMonthlyBreakdown = false
): {
  incomeResult?: IncomeExpenseAnalysisResult;
  expenseResult?: IncomeExpenseAnalysisResult;
  monthlyAnalysis?: string;
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
  const topCategories = Object.entries(mergeLabelKeyedTotals(summary?.byCategory, 'Uncategorized'))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([label, value]) => `${label}: $${value.toFixed(2)}`)
    .join(', ');
  const monthlyAnalysis = includeMonthlyBreakdown
    ? Object.entries(summary?.byMonth || {})
      .filter((entry): entry is [string, { income?: number; expense?: number; operatingCashFlow?: number }] =>
        Boolean(entry[1]) && typeof entry[1] === 'object')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, values]) => {
        const income = finite(values.income);
        const expense = finite(values.expense);
        const cashFlow = finite(values.operatingCashFlow);
        const valuesForMonth = [
          income !== null ? `income $${income.toFixed(2)}` : null,
          expense !== null ? `expenses $${expense.toFixed(2)}` : null,
          cashFlow !== null ? `operating cash flow $${cashFlow.toFixed(2)}` : null,
        ].filter(Boolean);
        return `${month}: ${valuesForMonth.join(', ')}`;
      })
      .join('\n')
    : undefined;

  return {
    ...(monthlyAnalysis && { monthlyAnalysis }),
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
