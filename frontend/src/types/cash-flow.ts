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

/** One transaction behind an item on the page. */
export interface CashFlowItemTransaction {
  id: string;
  date: string;
  amount: number;
  /** Null when the transaction has no category. */
  category: string | null;
}

/** The latest transactions behind an item (at most 12, latest first), and how many there are in all. */
export interface CashFlowItemTransactions {
  transactions: CashFlowItemTransaction[];
  transactionCount: number;
}

export interface CashFlowRecurringItem extends CashFlowItemTransactions {
  id: string;
  /** The payee's key, which a forecast adjustment names it by. */
  payeeKey: string;
  label: string;
  /** The account it is expected in: a cash account, or a card for a charge on one. An older report leaves it out. */
  accountId?: string;
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
  /** The id of the choice that keeps it; null when none does. */
  continuedBy: string | null;
}

/** What a forecast adjustment does: leave a payee out, count a one-off, keep a stopped item, or leave a transfer out. */
export type ForecastAdjustmentKind = 'exclude_payee' | 'include_one_off' | 'continue_stream' | 'exclude_transfer';

export interface CashFlowAdjustment extends CashFlowItemTransactions {
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

export interface CashFlowTypicalPayee extends CashFlowItemTransactions {
  flow: 'income' | 'spending';
  payeeKey: string;
  label: string;
  monthlyAmount: number;
  /** Transactions in it only because the user counted them, by transaction id. */
  countedOneOffIds: string[];
}

export type PlannedEventKind = 'income' | 'expense' | 'transfer' | 'card_payment';
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
  /**
   * For a card payment, the card it pays; for a transfer, the cash account it
   * leaves; for income or an expense, the cash account it lands in, or null
   * for the primary one.
   */
  accountId: string | null;
  /** For a transfer, the cash account it goes to. Absent from a report built before transfers existed. */
  toAccountId?: string | null;
  paymentMode: CardPaymentMode | null;
}

export interface CashFlowPlannedEventSummary extends PlannedCashFlowEvent {
  nextDate: string | null;
  occurrencesInRange: number;
}

export type ForecastUnavailableReason = 'no_accounts' | 'no_history' | 'insufficient_history';

/** GET /api/cash-flow/expected-monthly: the month the forecast expects, before planned events. */
export interface ExpectedMonthlySummary {
  /** The user's override on a side that has one; null on a learned side while there is no forecast. */
  income: number | null;
  spending: number | null;
  incomeSource: 'transactions' | 'override';
  spendingSource: 'transactions' | 'override';
  forecast: { available: true } | { available: false; reason: ForecastUnavailableReason };
  /** What the forecast expects from the transactions alone; present only while an override replaces a side. */
  learned: { income: number | null; spending: number | null } | null;
}

/** One transaction behind a usual-spending category. */
export interface CashFlowSpendingCategoryTransaction {
  id: string;
  date: string;
  /** The payee or description the provider gave it. */
  label: string;
  /** Spending is positive, a refund negative. */
  amount: number;
}

/**
 * Where part of a category's month comes from: a regular bill at its monthly
 * rate, the typical rate the basis spent in the category, or the card interest
 * the usual pace runs up, which no transaction is behind yet.
 */
export type CashFlowSpendingCategorySource =
  | {
    kind: 'bill';
    streamId: string;
    label: string;
    cadence: RecurringCadence;
    /** Each payment. */
    amount: number;
    monthly: number;
    /** Latest first, at most 12. */
    transactions: CashFlowSpendingCategoryTransaction[];
    transactionCount: number;
  }
  | {
    kind: 'typical';
    monthly: number;
    /** What its transactions add up to over the basis, refunds netted. */
    total: number;
    from: string;
    /** The basis's last day. */
    through: string;
    /** Latest first, at most 100. */
    transactions: CashFlowSpendingCategoryTransaction[];
    transactionCount: number;
  }
  | { kind: 'projected_interest'; monthly: number };

/** One category of the expected month's spending. */
export interface CashFlowSpendingCategory {
  label: string;
  monthly: number;
  /**
   * Largest first; their monthlies add up to the category's. Omitted by older
   * backends that only returned the category total — treat missing as none.
   */
  sources?: CashFlowSpendingCategorySource[];
}

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
  /**
   * The expected month's spending and what it is spent on, largest first; the
   * categories add up to `monthly`. Null when the forecast is unavailable or a
   * Finances override replaces spending.
   */
  usualSpending: { monthly: number; categories: CashFlowSpendingCategory[] } | null;
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
  /** Every one-off in the basis, largest first, so each can be counted. */
  oneOffs: Array<{ id: string; date: string; label: string; flow: 'income' | 'spending'; amount: number; category: string | null }>;
  /** How large a non-repeating amount must be to be a one-off, by direction; null without a basis. */
  oneOffThresholds: { income: number; spending: number } | null;
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
  /** The first day this pace pays the card, and all it pays that day; null when it pays nothing. */
  nextPayment: { date: string; amount: number } | null;
  /** What this pace pays the card in the 12 months from the forecast start. */
  paymentsTwelveMonths: number;
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
  /**
   * How the plans compare with the usual pace: `exactly` (same days and
   * amounts), `monthly` (each month the same, a payment on another day), or
   * null when they change the card or there is nothing to compare.
   */
  plansMatchCurrentPace: 'exactly' | 'monthly' | null;
  planIds: string[];
}

/** A dated amount entering or leaving the accounts the cash position covers. */
export interface CashPositionItem {
  date: string;
  label: string;
  kind:
    | 'income' | 'bill' | 'transfer_in' | 'transfer_out' | 'card_payment'
    | 'planned_income' | 'planned_expense' | 'planned_transfer_in' | 'planned_transfer_out';
  /** Signed: positive into the accounts, negative out of them. */
  amount: number;
  /** Cash at the end of the item's day, everything else that day included. */
  balanceAfter: number;
}

export interface CashFlowPositionAccount {
  id: string;
  name: string;
  institution: string | null;
  subtype: string | null;
  mask: string | null;
  balance: number | null;
  /** Where money that has no account of its own lands: planned events saved without one, for instance. */
  primary: boolean;
}

export interface CashFlowPositionSummary {
  available: boolean;
  reason?: 'forecast_unavailable' | 'no_cash_accounts' | 'unknown_balance';
  /** Every cash account, for choosing which the position covers. */
  accounts: CashFlowPositionAccount[];
  /** The cash accounts the figures cover: all of them unless some were chosen. */
  accountIds: string[];
  /** The cards whose balances `cardDebt` covers. */
  cardIds: string[];
  startingCash: number | null;
  startingCardDebt: number | null;
  /**
   * In step with `periods`: balances at each period's end, and what arrives,
   * leaves and is paid to cards in the period's forecast part. Null for a
   * period over before the forecast.
   */
  periods: Array<{
    key: string;
    cash: number | null;
    cardDebt: number | null;
    cardPayments: number | null;
    moneyIn: number | null;
    moneyOut: number | null;
  }>;
  /** Every dated amount in the month from the forecast start, with the balance after each day. */
  upcoming: CashPositionItem[];
  /** What arrives and leaves every day without being listed in `upcoming`. Null when unavailable; an older report leaves it out. */
  spreadPerDay?: { in: number; out: number } | null;
  lowPoint: { date: string; cash: number } | null;
  milestones: Array<{ key: string; date: string; cash: number; cardDebt: number }>;
  lowNext12Months: { date: string; cash: number } | null;
  transfers: {
    typicalMonthlyNet: number;
    recurring: Array<CashFlowItemTransactions & {
      id: string;
      payeeKey: string;
      label: string;
      /** The cash account it is expected in or out of. An older report leaves it out. */
      accountId?: string;
      cadence: RecurringCadence;
      amount: number;
      direction: 'in' | 'out';
      nextDate: string | null;
    }>;
  };
  cardsLeftOut: Array<{ accountId: string; name: string; reason: 'no_balance' | 'no_pace' }>;
}
