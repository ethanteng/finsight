import type { AskLincResponse } from './structured-response';
import type { FinancialContextSnapshot } from './types';

/** Shown only when no part of the answer could be verified. */
export const UNVERIFIABLE_SUMMARY =
  'I could not verify the generated answer against your current financial snapshot. Please try the question again.';

/**
 * Attached when a second model reviewed the answer and took issue with its
 * reasoning. Every figure has still been checked against the snapshot, so the
 * answer is worth showing — but not without saying that a reviewer objected.
 */
export const SECONDARY_REVIEW_CAVEAT =
  'Note: an automated review flagged part of the reasoning in this answer. The figures above were each checked against your financial snapshot, but treat the interpretation as a starting point and confirm anything you plan to act on.';

/** Append a notice as its own paragraph, without duplicating one already there. */
export function appendNotice(response: AskLincResponse, notice: string): AskLincResponse {
  const summary = response.summary?.trim() || '';
  if (summary.includes(notice)) return response;
  return { ...response, summary: summary ? `${summary}\n\n${notice}` : notice };
}

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
  // Each metric names the values it may take. Monthly income and expenses have
  // two: what happened (the observed average) and what to expect (the month the
  // cash-flow forecast expects), and an answer may quote either.
  const knownMetrics = new Map<string, number[]>();
  if (overview) {
    knownMetrics.set('net_worth', [overview.netWorth]);
    knownMetrics.set('total_cash', [overview.totalCash]);
    knownMetrics.set('total_investments', [overview.totalInvestments]);
    knownMetrics.set('investment_total', [overview.totalInvestments]);
    knownMetrics.set('portfolio_value', [overview.totalInvestments]);
    knownMetrics.set('total_debt', [overview.totalDebt]);
    if (overview.homeValue !== null) knownMetrics.set('home_value', [overview.homeValue]);
  }
  const knownValues = (...values: Array<number | null | undefined>): number[] =>
    values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const monthlyIncome = knownValues(snapshot.averageMonthlyIncome, snapshot.expectedMonthly?.income);
  const monthlyExpenses = knownValues(snapshot.averageMonthlyExpense, snapshot.expectedMonthly?.spending);
  if (monthlyIncome.length > 0) {
    for (const key of ['average_monthly_income', 'monthly_income', 'expected_monthly_income']) {
      knownMetrics.set(key, monthlyIncome);
    }
  }
  if (monthlyExpenses.length > 0) {
    for (const key of [
      'average_monthly_expense', 'average_monthly_expenses', 'monthly_expense', 'monthly_expenses',
      'expected_monthly_expense', 'expected_monthly_expenses',
    ]) {
      knownMetrics.set(key, monthlyExpenses);
    }
  }

  const retirement = snapshot.retirementAnalysis;
  if (retirement?.metrics) {
    knownMetrics.set('withdrawal_rate', [retirement.metrics.withdrawalRate * 100]);
    knownMetrics.set('equity_allocation', [retirement.metrics.equityAllocation]);
    if (retirement.metrics.tipsAllocation !== undefined) {
      knownMetrics.set('tips_allocation', [retirement.metrics.tipsAllocation]);
    }
    knownMetrics.set('years_of_expenses', [retirement.metrics.yearsOfExpenses]);
  }
  if (retirement?.stressTest) {
    knownMetrics.set('survival_rate', [retirement.stressTest.survivalRate * 100]);
  }

  const text = userFacingText(response);
  const textualMetrics: Array<{ label: string; pattern: string; values: number[] }> = [];
  if (overview) {
    textualMetrics.push(
      { label: 'net worth', pattern: String.raw`\bnet\s*worth\b`, values: [overview.netWorth] },
      { label: 'total cash', pattern: String.raw`\btotal\s+cash\b`, values: [overview.totalCash] },
      { label: 'total investments', pattern: String.raw`\b(?:total\s+investments?|investment\s+total|portfolio\s+value)\b`, values: [overview.totalInvestments] },
      { label: 'total debt', pattern: String.raw`\btotal\s+debt\b`, values: [overview.totalDebt] },
    );
    if (overview.homeValue !== null) {
      textualMetrics.push({ label: 'home value', pattern: String.raw`\bhome\s+value\b`, values: [overview.homeValue] });
    }
  }
  if (monthlyIncome.length > 0) {
    textualMetrics.push({
      label: 'monthly income',
      pattern: String.raw`\b(?:average\s+monthly|monthly\s+average|monthly)\s+income\b`,
      values: monthlyIncome,
    });
  }
  if (monthlyExpenses.length > 0) {
    textualMetrics.push({
      label: 'monthly expenses',
      pattern: String.raw`\b(?:average\s+monthly|monthly\s+average|monthly)\s+expenses?\b`,
      values: monthlyExpenses,
    });
  }
  if (retirement?.metrics) {
    textualMetrics.push(
      { label: 'withdrawal rate', pattern: String.raw`\bwithdrawal\s+rate\b`, values: [retirement.metrics.withdrawalRate * 100] },
      { label: 'equity allocation', pattern: String.raw`\bequity\s+allocation\b`, values: [retirement.metrics.equityAllocation] },
      ...(retirement.metrics.tipsAllocation !== undefined ? [{
        label: 'TIPS allocation',
        pattern: String.raw`\bTIPS\s+allocation\b`,
        values: [retirement.metrics.tipsAllocation],
      }] : []),
      { label: 'years of expenses', pattern: String.raw`\byears?\s+of\s+expenses\b`, values: [retirement.metrics.yearsOfExpenses] },
    );
  }
  if (retirement?.stressTest) {
    textualMetrics.push({
      label: 'survival rate',
      pattern: String.raw`\bsurvival\s+rate\b`,
      values: [retirement.stressTest.survivalRate * 100],
    });
  }

  const describe = (values: number[]) => values.join(' or ');
  for (const metric of textualMetrics) {
    const mentionedValues = findValuesForLabel(text, metric.pattern);
    if (mentionedValues.some((value) => !metric.values.some((known) => approximatelyEqual(value, known)))) {
      issues.push(`User-facing text must use the canonical ${metric.label} value ${describe(metric.values)}.`);
      invalidSummary = true;
    }
  }

  // Direct balance and cash-flow questions can omit key_numbers, so also
  // validate dollar amounts in their user-facing summary.
  const q = question.toLowerCase();
  let directMetric: { label: string; values: number[] } | undefined;
  if (/\bnet\s*worth\b/.test(q) && overview) {
    directMetric = { label: 'net worth', values: [overview.netWorth] };
  } else if (/\b(monthly|average)\b.*\b(income|pay)\b|\b(income|pay)\b.*\b(monthly|average)\b/.test(q) && monthlyIncome.length > 0) {
    directMetric = { label: 'monthly income', values: monthlyIncome };
  } else if (/\b(monthly|average)\b.*\b(spend|spending|expense|expenses)\b|\b(spend|spending|expense|expenses)\b.*\b(monthly|average)\b/.test(q) && monthlyExpenses.length > 0) {
    directMetric = { label: 'monthly expenses', values: monthlyExpenses };
  } else if (/\b(total\s+)?cash\b/.test(q) && overview) {
    directMetric = { label: 'total cash', values: [overview.totalCash] };
  } else if (/\b(total\s+)?debt\b/.test(q) && overview) {
    directMetric = { label: 'total debt', values: [overview.totalDebt] };
  }

  if (directMetric && response.summary) {
    const summaryDollarValues = Array.from(response.summary.matchAll(new RegExp(NUMERIC_TOKEN, 'gi')))
      .map((match) => parseNumericToken(match[1], match[2]))
      .filter((value): value is number => value !== null);
    const cites = (value: number) => directMetric!.values.some((known) => approximatelyEqual(value, known));
    if (summaryDollarValues.length > 0 && !summaryDollarValues.some(cites)) {
      issues.push(`The summary must use the canonical ${directMetric.label} value ${describe(directMetric.values)}.`);
      invalidSummary = true;
    }
  }

  for (const [rawKey, metric] of Object.entries(response.key_numbers || {})) {
    const value = typeof metric === 'number' ? metric : metric.value;
    const key = normalizeMetricKey(rawKey);
    if (!Number.isFinite(value)) {
      issues.push(`${rawKey} is not a finite number.`);
      invalidKeyNumbers.push(rawKey);
      continue;
    }
    const expected = knownMetrics.get(key);
    if (expected !== undefined && !expected.some((known) => approximatelyEqual(value, known))) {
      issues.push(`${rawKey} must match the canonical value ${describe(expected)}; received ${value}.`);
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
    summary: UNVERIFIABLE_SUMMARY,
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
