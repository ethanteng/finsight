import type { MonthlyCashFlowAverage } from '../domain/financial-truth';
import { mergeLabelKeyedTotals } from '../services/label-normalization';
import { averageCanonicalTransactionSummary } from '../services/transaction-summary-service';
import type { FinancialContextSnapshot } from './types';

export interface CanonicalCashFlowAnalyses {
  /** History: averages over the months the summary covers in full; null when it covers none. */
  averages: MonthlyCashFlowAverage | null;
  incomeAnalysis?: string;
  expenseAnalysis?: string;
  monthlyAnalysis?: string;
}

function expectedLine(
  kind: 'Income' | 'Expenses',
  value: number | null | undefined,
  source: 'transactions' | 'override' | undefined
): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const basis = source === 'override'
    ? 'the user’s own monthly figure, which the cash-flow forecast uses'
    : 'cash-flow forecast, before planned events';
  return `Expected Monthly ${kind} (${basis}): $${value.toFixed(2)}`;
}

/**
 * Build LLM cash-flow context from the same persisted summary used by the app:
 * what happened, averaged over complete months, beside what the cash-flow
 * forecast expects in a typical month.
 */
export function buildCanonicalCashFlowAnalyses(
  summary: FinancialContextSnapshot['transactionSummary'],
  /** When the snapshot was computed: the end of the summary's window. */
  computedAt: Date | string | null | undefined,
  expected?: FinancialContextSnapshot['expectedMonthly'],
  includeMonthlyBreakdown = false
): CanonicalCashFlowAnalyses {
  const averages = averageCanonicalTransactionSummary(summary, computedAt);

  const finite = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  const span = averages
    ? ` over ${averages.monthCount} complete month${averages.monthCount === 1 ? '' : 's'} (${averages.firstMonth} to ${averages.lastMonth})`
    : '';
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

  const incomeLines = [
    averages ? `Average Monthly Income${span}: $${averages.averageIncome.toFixed(2)}` : null,
    expectedLine('Income', expected?.income, expected?.incomeSource),
  ].filter((line): line is string => line !== null);
  const expenseLines = [
    averages ? `Average Monthly Expenses${span}: $${averages.averageExpenses.toFixed(2)}` : null,
    expectedLine('Expenses', expected?.spending, expected?.spendingSource),
  ].filter((line): line is string => line !== null);

  return {
    averages,
    ...(monthlyAnalysis && { monthlyAnalysis }),
    ...(incomeLines.length > 0 && {
      incomeAnalysis: [
        ...incomeLines,
        incomeTotal !== null ? `Canonical Income Total: $${incomeTotal.toFixed(2)}` : null,
      ].filter(Boolean).join('\n'),
    }),
    ...(expenseLines.length > 0 && {
      expenseAnalysis: [
        ...expenseLines,
        expenseTotal !== null ? `Canonical Expense Total: $${expenseTotal.toFixed(2)}` : null,
        `Top Categories: ${topCategories || 'Not available'}`,
        exclusions > 0 ? `Excluded Transactions: ${exclusions} (unclassified or unavailable currency conversion)` : null,
      ].filter(Boolean).join('\n'),
    }),
  };
}
