import type { AskLincResponse } from './structured-response';
import type { FinancialContextSnapshot } from './types';

export interface ResponseGroundingResult {
  valid: boolean;
  issues: string[];
  invalidKeyNumbers: string[];
  invalidSummary: boolean;
}

function normalizeMetricKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function approximatelyEqual(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= Math.max(0.01, Math.abs(expected) * 0.000001);
}

export function validateResponseGrounding(
  response: AskLincResponse,
  snapshot: FinancialContextSnapshot,
  question = ''
): ResponseGroundingResult {
  const issues: string[] = [];
  const invalidKeyNumbers: string[] = [];
  let invalidSummary = false;
  if (!response.summary?.trim()) {
    issues.push('The response summary is empty.');
    invalidSummary = true;
  }

  const overview = snapshot.financialSummary?.financialOverview;
  const knownMetrics = new Map<string, number>();
  if (overview) {
    knownMetrics.set('net_worth', overview.netWorth);
    knownMetrics.set('total_cash', overview.totalCash);
    knownMetrics.set('total_investments', overview.totalInvestments);
    knownMetrics.set('investment_total', overview.totalInvestments);
    knownMetrics.set('portfolio_value', overview.totalInvestments);
    knownMetrics.set('total_debt', overview.totalDebt);
    if (overview.homeValue !== null) knownMetrics.set('home_value', overview.homeValue);
  }
  if (snapshot.averageMonthlyIncome != null) {
    knownMetrics.set('average_monthly_income', snapshot.averageMonthlyIncome);
    knownMetrics.set('monthly_income', snapshot.averageMonthlyIncome);
  }
  if (snapshot.averageMonthlyExpense != null) {
    knownMetrics.set('average_monthly_expense', snapshot.averageMonthlyExpense);
    knownMetrics.set('average_monthly_expenses', snapshot.averageMonthlyExpense);
    knownMetrics.set('monthly_expense', snapshot.averageMonthlyExpense);
    knownMetrics.set('monthly_expenses', snapshot.averageMonthlyExpense);
  }

  const retirement = snapshot.retirementAnalysis;
  if (retirement?.metrics) {
    knownMetrics.set('withdrawal_rate', retirement.metrics.withdrawalRate * 100);
    knownMetrics.set('equity_allocation', retirement.metrics.equityAllocation);
    knownMetrics.set('years_of_expenses', retirement.metrics.yearsOfExpenses);
  }
  if (retirement?.stressTest) {
    knownMetrics.set('survival_rate', retirement.stressTest.survivalRate * 100);
  }

  // Direct balance and cash-flow questions can omit key_numbers, so also
  // validate dollar amounts in their user-facing summary.
  const q = question.toLowerCase();
  let directMetric: { label: string; value: number } | undefined;
  if (/\bnet\s*worth\b/.test(q) && overview) {
    directMetric = { label: 'net worth', value: overview.netWorth };
  } else if (/\b(monthly|average)\b.*\b(income|pay)\b|\b(income|pay)\b.*\b(monthly|average)\b/.test(q) && snapshot.averageMonthlyIncome != null) {
    directMetric = { label: 'average monthly income', value: snapshot.averageMonthlyIncome };
  } else if (/\b(monthly|average)\b.*\b(spend|spending|expense|expenses)\b|\b(spend|spending|expense|expenses)\b.*\b(monthly|average)\b/.test(q) && snapshot.averageMonthlyExpense != null) {
    directMetric = { label: 'average monthly expenses', value: snapshot.averageMonthlyExpense };
  } else if (/\b(total\s+)?cash\b/.test(q) && overview) {
    directMetric = { label: 'total cash', value: overview.totalCash };
  } else if (/\b(total\s+)?debt\b/.test(q) && overview) {
    directMetric = { label: 'total debt', value: overview.totalDebt };
  }

  if (directMetric && response.summary) {
    const summaryDollarValues = Array.from(response.summary.matchAll(/\$\s*(-?\d[\d,]*(?:\.\d+)?)/g))
      .map((match) => Number(match[1].replace(/,/g, '')))
      .filter(Number.isFinite);
    if (summaryDollarValues.length > 0 && !summaryDollarValues.some((value) => approximatelyEqual(value, directMetric.value))) {
      issues.push(`The summary must use the canonical ${directMetric.label} value ${directMetric.value}.`);
      invalidSummary = true;
    }
  }

  for (const [rawKey, value] of Object.entries(response.key_numbers || {})) {
    const key = normalizeMetricKey(rawKey);
    if (!Number.isFinite(value)) {
      issues.push(`${rawKey} is not a finite number.`);
      invalidKeyNumbers.push(rawKey);
      continue;
    }
    const expected = knownMetrics.get(key);
    if (expected !== undefined && !approximatelyEqual(value, expected)) {
      issues.push(`${rawKey} must match the canonical value ${expected}; received ${value}.`);
      invalidKeyNumbers.push(rawKey);
      continue;
    }
    if (key.includes('allocation') && (value < 0 || value > 100)) {
      issues.push(`${rawKey} must be expressed as a percentage between 0 and 100; received ${value}.`);
      invalidKeyNumbers.push(rawKey);
    }
  }

  return { valid: issues.length === 0, issues, invalidKeyNumbers, invalidSummary };
}

export function sanitizeUngroundedResponse(
  response: AskLincResponse,
  result: ResponseGroundingResult
): AskLincResponse {
  const withoutInvalidNumbers = omitInvalidKeyNumbers(response, result.invalidKeyNumbers);
  if (!result.invalidSummary) return withoutInvalidNumbers;
  return {
    summary: 'I could not verify the generated answer against your current financial snapshot. Please try the question again.',
    key_numbers: withoutInvalidNumbers.key_numbers,
    insights: [],
    suggested_actions: [],
  };
}

export function omitInvalidKeyNumbers(
  response: AskLincResponse,
  invalidKeys: readonly string[]
): AskLincResponse {
  if (!response.key_numbers || invalidKeys.length === 0) return response;
  const invalid = new Set(invalidKeys);
  const key_numbers = Object.fromEntries(
    Object.entries(response.key_numbers).filter(([key]) => !invalid.has(key))
  );
  return {
    ...response,
    key_numbers: Object.keys(key_numbers).length > 0 ? key_numbers : undefined,
  };
}
