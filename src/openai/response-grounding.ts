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

const NUMERIC_TOKEN = String.raw`(?:\$\s*)?(-?\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|[kmb])?\s*%?`;

function parseNumericToken(rawValue: string, rawMagnitude?: string): number | null {
  const value = Number(rawValue.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const magnitude = rawMagnitude?.toLowerCase();
  const multiplier = magnitude === 'k' || magnitude === 'thousand'
    ? 1_000
    : magnitude === 'm' || magnitude === 'million'
      ? 1_000_000
      : magnitude === 'b' || magnitude === 'billion'
        ? 1_000_000_000
        : 1;
  return value * multiplier;
}

function findValuesForLabel(text: string, labelPattern: string): number[] {
  const connector = String.raw`(?:\s+(?:is|are|of|at|currently|about|approximately|roughly|totals?|stands?))*\s*[:=]?\s*`;
  const afterLabel = new RegExp(`${labelPattern}${connector}${NUMERIC_TOKEN}`, 'gi');
  const beforeLabel = new RegExp(String.raw`${NUMERIC_TOKEN}\s*(?:in|of|for)?\s*${labelPattern}`, 'gi');
  const values: number[] = [];
  for (const match of text.matchAll(afterLabel)) {
    const value = parseNumericToken(match[1], match[2]);
    if (value !== null) values.push(value);
  }
  for (const match of text.matchAll(beforeLabel)) {
    const value = parseNumericToken(match[1], match[2]);
    if (value !== null) values.push(value);
  }
  return values;
}

function userFacingText(response: AskLincResponse): string {
  return [response.summary, ...(response.insights || []), ...(response.suggested_actions || [])]
    .filter(Boolean)
    .join('\n');
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

  const text = userFacingText(response);
  const textualMetrics: Array<{ label: string; pattern: string; value: number }> = [];
  if (overview) {
    textualMetrics.push(
      { label: 'net worth', pattern: String.raw`\bnet\s*worth\b`, value: overview.netWorth },
      { label: 'total cash', pattern: String.raw`\btotal\s+cash\b`, value: overview.totalCash },
      { label: 'total investments', pattern: String.raw`\b(?:total\s+investments?|investment\s+total|portfolio\s+value)\b`, value: overview.totalInvestments },
      { label: 'total debt', pattern: String.raw`\btotal\s+debt\b`, value: overview.totalDebt },
    );
    if (overview.homeValue !== null) {
      textualMetrics.push({ label: 'home value', pattern: String.raw`\bhome\s+value\b`, value: overview.homeValue });
    }
  }
  if (snapshot.averageMonthlyIncome != null) {
    textualMetrics.push({
      label: 'average monthly income',
      pattern: String.raw`\b(?:average\s+monthly|monthly\s+average|monthly)\s+income\b`,
      value: snapshot.averageMonthlyIncome,
    });
  }
  if (snapshot.averageMonthlyExpense != null) {
    textualMetrics.push({
      label: 'average monthly expenses',
      pattern: String.raw`\b(?:average\s+monthly|monthly\s+average|monthly)\s+expenses?\b`,
      value: snapshot.averageMonthlyExpense,
    });
  }
  if (retirement?.metrics) {
    textualMetrics.push(
      { label: 'withdrawal rate', pattern: String.raw`\bwithdrawal\s+rate\b`, value: retirement.metrics.withdrawalRate * 100 },
      { label: 'equity allocation', pattern: String.raw`\bequity\s+allocation\b`, value: retirement.metrics.equityAllocation },
      { label: 'years of expenses', pattern: String.raw`\byears?\s+of\s+expenses\b`, value: retirement.metrics.yearsOfExpenses },
    );
  }
  if (retirement?.stressTest) {
    textualMetrics.push({
      label: 'survival rate',
      pattern: String.raw`\bsurvival\s+rate\b`,
      value: retirement.stressTest.survivalRate * 100,
    });
  }

  for (const metric of textualMetrics) {
    const mentionedValues = findValuesForLabel(text, metric.pattern);
    if (mentionedValues.some((value) => !approximatelyEqual(value, metric.value))) {
      issues.push(`User-facing text must use the canonical ${metric.label} value ${metric.value}.`);
      invalidSummary = true;
    }
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
    const summaryDollarValues = Array.from(response.summary.matchAll(new RegExp(NUMERIC_TOKEN, 'gi')))
      .map((match) => parseNumericToken(match[1], match[2]))
      .filter((value): value is number => value !== null);
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

  if (invalidKeyNumbers.length > 0) {
    invalidSummary = true;
  }

  return { valid: issues.length === 0, issues, invalidKeyNumbers, invalidSummary };
}

export function sanitizeUngroundedResponse(
  response: AskLincResponse,
  result: ResponseGroundingResult
): AskLincResponse {
  const withoutInvalidNumbers = omitInvalidKeyNumbers(response, result.invalidKeyNumbers);
  if (!result.invalidSummary && result.invalidKeyNumbers.length === 0) return withoutInvalidNumbers;
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
