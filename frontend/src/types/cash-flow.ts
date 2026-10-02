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
  /** Interest the card model projects, for cards whose APR and pace are known. */
  cardInterest: number;
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
  /** The payee's key, which a forecast adjustment names it by. */
  payeeKey: string;
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
  /** It had stopped, and is projected because the user kept it. */
  continuedByUser: boolean;
}

/** What a forecast adjustment does: leave a payee out, count a one-off, keep a stopped item, or leave a transfer out. */
export type ForecastAdjustmentKind = 'exclude_payee' | 'include_one_off' | 'continue_stream' | 'exclude_transfer';

export interface CashFlowAdjustment {
  id: string;
  kind: ForecastAdjustmentKind;
  /** For a transfer, `income` is money in. */
  flow: 'income' | 'spending';
  /** A payee's key, or a one-off's transaction id. */
  key: string;
  label: string;
  /** For a counted one-off: when it happened and how much it was. */
  date: string | null;
  amount: number | null;
}

export interface CashFlowTypicalPayee {
  flow: 'income' | 'spending';
  payeeKey: string;
  label: string;
  monthlyAmount: number;
}

export type PlannedEventKind = 'income' | 'expense' | 'card_payment';
export type PlannedEventRecurrence = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually';
export type CardPaymentMode = 'full' | 'fixed';

export interface PlannedCashFlowEvent {
  id: string;
  label: string;
  kind: PlannedEventKind;
  /** Zero for a card payment that pays in full: the balance sizes it. */
  amount: number;
  startDate: string;
  recurrence: PlannedEventRecurrence;
  endDate: string | null;
  /** The credit card a card payment pays. */
  accountId: string | null;
  paymentMode: CardPaymentMode | null;
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
  /** The payees behind the typical rates, largest first. */
  typicalPayees: CashFlowTypicalPayee[];
  /** The user's choices about what the forecast counts. */
  adjustments: CashFlowAdjustment[];
  plannedEvents: CashFlowPlannedEventSummary[];
  accounts: Array<{
    id: string;
    name: string;
    institution: string | null;
    kind: 'cash' | 'credit';
    subtype: string | null;
    mask: string | null;
    /** The balance the provider reported: cash held, or what a card owes. Null when it gave none. */
    balance: number | null;
  }>;
  excluded: { unclassified: number; currencyMismatch: number };
  cards: CashFlowCardSummary[];
  position: CashFlowPositionSummary;
  snapshot: { computedAt: string; asOf: string | null; status: string | null };
}

export type CardPaymentBehavior = 'pays_in_full' | 'average_payment' | 'minimum_payment' | 'unknown';

export interface CardOutcome {
  /** `YYYY-MM`: from this month on, no balance is carried; null if not within the projection. */
  paidOffBy: string | null;
  carryingBalanceNow: boolean;
  interestTwelveMonths: number | null;
  interestTotal: number | null;
  balanceInTwelveMonths: number | null;
  months: Array<{ month: string; payment: number; interest: number | null; endBalance: number }>;
}

export interface CashFlowCardSummary {
  accountId: string;
  name: string;
  mask: string | null;
  institution: string | null;
  balance: number | null;
  apr: number | null;
  minimumPayment: number | null;
  paymentDay: number;
  behavior: CardPaymentBehavior;
  usualMonthlyPayment: number | null;
  paymentSource: 'connected' | 'other';
  currentPace: CardOutcome | null;
  withPlans: CardOutcome | null;
  interestSaved: { twelveMonths: number; total: number } | null;
  planIds: string[];
}

export interface CashFlowPositionSummary {
  available: boolean;
  reason?: 'forecast_unavailable' | 'no_cash_accounts' | 'unknown_balance';
  startingCash: number | null;
  startingCardDebt: number | null;
  /** In step with `periods`; null for a period over before the forecast. */
  periods: Array<{ key: string; cash: number | null; cardDebt: number | null }>;
  lowPoint: { date: string; cash: number } | null;
  milestones: Array<{ key: string; date: string; cash: number; cardDebt: number }>;
  lowNext12Months: { date: string; cash: number } | null;
  transfers: {
    typicalMonthlyNet: number;
    recurring: Array<{
      id: string;
      payeeKey: string;
      label: string;
      cadence: RecurringCadence;
      amount: number;
      direction: 'in' | 'out';
      nextDate: string | null;
    }>;
  };
  cardsLeftOut: Array<{ accountId: string; name: string; reason: 'no_balance' | 'no_pace' }>;
}
