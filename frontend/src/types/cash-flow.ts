/**
 * The cash flow (beta) report, as `GET /api/cash-flow` returns it.
 *
 * Every figure is computed by the backend engine (src/cash-flow). The page
 * formats and arranges these numbers; it never derives new ones.
 */

export type CashFlowGranularity = 'week' | 'month' | 'quarter' | 'year';

export interface CashFlowTotals {
  income: number;
  spending: number;
  net: number;
}

export interface ForecastComponents {
  recurringIncome: number;
  typicalIncome: number;
  plannedIncome: number;
  recurringSpending: number;
  typicalSpending: number;
  plannedSpending: number;
}

export type ForecastTotals = CashFlowTotals & { components: ForecastComponents };

export interface CashFlowPeriod {
  key: string;
  start: string;
  endExclusive: string;
  clipped: boolean;
  phase: 'past' | 'current' | 'future';
  coverage: 'full' | 'partial' | 'none';
  actual: CashFlowTotals | null;
  forecast: ForecastTotals | null;
  total: CashFlowTotals | null;
}

export type CashFlowHighlightKey =
  | 'this_month'
  | 'next_month'
  | 'this_quarter'
  | 'next_quarter'
  | 'this_year'
  | 'next_3_months'
  | 'next_6_months'
  | 'next_12_months';

export interface CashFlowHighlight {
  key: CashFlowHighlightKey;
  start: string;
  endExclusive: string;
  actualToDate: CashFlowTotals | null;
  actualCoverage: 'full' | 'partial' | 'none' | null;
  remaining: ForecastTotals | null;
  projected: CashFlowTotals | null;
  planned: CashFlowTotals;
  projectedWithoutPlanned: CashFlowTotals | null;
}

export type RecurringCadence = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly';

export interface CashFlowRecurringItem {
  id: string;
  label: string;
  flow: 'income' | 'spending';
  cadence: RecurringCadence;
  amount: number;
  monthlyAmount: number;
  occurrences: number;
  lastDate: string;
  nextDate: string | null;
  status: 'active' | 'lapsed';
  category: string;
  replacedByOverride: boolean;
}

export type PlannedEventKind = 'income' | 'expense';
export type PlannedEventRecurrence = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually';

export interface PlannedCashFlowEvent {
  id: string;
  label: string;
  kind: PlannedEventKind;
  amount: number;
  startDate: string;
  recurrence: PlannedEventRecurrence;
  endDate: string | null;
}

export interface CashFlowPlannedEventSummary extends PlannedCashFlowEvent {
  nextDate: string | null;
  occurrencesInRange: number;
}

export type ForecastUnavailableReason = 'no_accounts' | 'no_history' | 'insufficient_history';

export interface CashFlowReport {
  version: number;
  currency: string;
  today: string;
  dataThrough: string;
  forecastStart: string;
  granularity: CashFlowGranularity;
  range: { from: string; toExclusive: string };
  coverageStart: string | null;
  forecast: { available: true } | { available: false; reason: ForecastUnavailableReason };
  periods: CashFlowPeriod[];
  totals: {
    /** `partial` means the range reaches back before the history, so its totals are withheld. */
    coverage: 'full' | 'partial' | 'none';
    actual: CashFlowTotals | null;
    forecast: CashFlowTotals | null;
    total: CashFlowTotals | null;
  };
  highlights: CashFlowHighlight[];
  baseline: {
    typicalBasisStart: string | null;
    typicalBasisDays: number;
    typicalMonthlyIncome: number;
    typicalMonthlySpending: number;
    incomeSource: 'transactions' | 'override';
    spendingSource: 'transactions' | 'override';
    monthlyIncomeOverride: number | null;
    monthlyExpenseOverride: number | null;
  };
  recurring: CashFlowRecurringItem[];
  oneOffs: Array<{ id: string; date: string; label: string; flow: 'income' | 'spending'; amount: number }>;
  plannedEvents: CashFlowPlannedEventSummary[];
  accounts: Array<{ id: string; name: string; institution: string | null; kind: 'cash' | 'credit'; subtype: string | null; mask: string | null }>;
  excluded: { unclassified: number; currencyMismatch: number };
  snapshot: { computedAt: string; asOf: string | null; status: string | null };
}
