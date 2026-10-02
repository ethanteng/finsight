import {
  addDays,
  addMonths,
  dayOfMonth,
  daysBetween,
  isCalendarDate,
  maxDate,
  minDate,
  startOfMonth,
  type CalendarDate,
} from './calendar';
import { expandPlannedEvent, type PlannedCashFlowEvent } from './planned-events';

/**
 * Credit cards in the forecast: what each owes, what the user usually pays,
 * and what a payoff plan changes.
 *
 * A card runs on a monthly cycle here. The statement is what the card owed at
 * the end of the previous month. Each month one regular payment goes out on
 * the card's due day: what the user usually pays, or what their monthly plan
 * says, but never more than the statement. A one-time plan payment comes on
 * top of it, and a payoff pays everything the card owes that day. No payment is
 * more than the card owes on its day, so a card never shows a credit. Interest
 * is the purchase APR over twelve on whatever part of the statement is left
 * unpaid, so paying the statement in full keeps the grace period and charges
 * none.
 *
 * Statement dates, daily balances and the interest new purchases attract once
 * a balance is carried are simplified away, and the interest disclosed as an
 * estimate. A card with no known APR still projects balances, with interest
 * reported as unknown rather than as zero. A card with no usual pace is
 * projected only under a monthly plan, which says what it is paid; it then
 * counts only the payments the user plans.
 */

const DAYS_PER_MONTH = 365 / 12;
/** The due day used when neither the provider nor the history gives one. */
const DEFAULT_PAYMENT_DAY = 28;
/** Below this a balance is cents of rounding, not a balance. */
const SETTLED = 0.005;

export type CardPaymentBehavior = 'pays_in_full' | 'average_payment' | 'minimum_payment' | 'unknown';

export interface CardTerms {
  accountId: string;
  name: string;
  mask: string | null;
  institution: string | null;
  /** What the card owes now; null when the provider gave no balance. */
  balance: number | null;
  /** Purchase APR, in percent; null when the provider does not share it. */
  apr: number | null;
  minimumPayment: number | null;
  /** Day of the month the payment goes out, from the due date when there is one. */
  paymentDay: number;
}

export interface CardHistory {
  /** Paid to the card over the basis window. */
  paymentsReceived: number;
  paymentCount: number;
  /** How many of those payments came from a connected cash account. */
  pairedPaymentCount: number;
  interestCharged: number;
  basisDays: number;
  lastPaymentDate: CalendarDate | null;
}

export interface CardBaseline {
  behavior: CardPaymentBehavior;
  /** The usual monthly payment for `average_payment` and `minimum_payment`. */
  monthlyPayment: number | null;
}

export interface CardMonth {
  month: string;
  /** Owed at the start of the month: the previous month's closing balance. */
  statement: number;
  purchases: number;
  payment: number;
  /** The part of the statement left unpaid, which interest applies to. */
  carried: number;
  /** Null when the card's APR is unknown. */
  interest: number | null;
  endBalance: number;
}

export interface CardProjection {
  months: CardMonth[];
  /** The month from which no balance is carried for the rest of the projection; null if it never stops. */
  paidOffBy: string | null;
  carryingBalanceNow: boolean;
  interestTwelveMonths: number | null;
  interestTotal: number | null;
  payments: Array<{ date: CalendarDate; amount: number }>;
  interestPostings: Array<{ date: CalendarDate; amount: number }>;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function round(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  // A balance that rounds to nothing is 0, never -0 (which formats as "-$0.00").
  return rounded === 0 ? 0 : rounded;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Read a card's terms from a snapshot account and its provider liability details. */
export function cardTermsFromAccount(account: any, lastPaymentDate: CalendarDate | null = null): CardTerms {
  const details: any[] = Array.isArray(account?.liabilityDetails) ? account.liabilityDetails : [];
  const credit = details.find(detail => detail?.kind === 'credit') ?? null;
  const aprs: any[] = Array.isArray(credit?.aprs) ? credit.aprs : [];
  const apr = aprs.find(item => item?.type === 'purchase_apr') ?? aprs[0];
  const percentage = finite(apr?.percentage) && apr.percentage >= 0 && apr.percentage <= 100 ? apr.percentage : null;
  const minimum = finite(credit?.minimumPaymentAmount) && credit.minimumPaymentAmount >= 0
    ? credit.minimumPaymentAmount
    : null;
  const dueDate = text(credit?.nextPaymentDueDate);
  const current = account?.balance && typeof account.balance === 'object' ? account.balance.current : account?.balance;
  return {
    accountId: text(account?.account_id) ?? text(account?.id) ?? '',
    name: text(account?.name) ?? 'Credit card',
    mask: text(account?.mask),
    institution: text(account?.institution),
    balance: finite(current) ? current : null,
    apr: percentage,
    minimumPayment: minimum,
    paymentDay: dueDate && isCalendarDate(dueDate)
      ? dayOfMonth(dueDate)
      : lastPaymentDate ? dayOfMonth(lastPaymentDate) : DEFAULT_PAYMENT_DAY,
  };
}

/**
 * What the user usually pays, from the recent history. A card that was paid
 * and charged no interest has been paid in full. One that was paid but still
 * charged interest carries a balance, and its average payment is the pace,
 * never below the minimum. With no payments seen, the minimum is the pace if
 * the provider gave one; otherwise there is nothing to project from.
 */
export function cardBaseline(terms: CardTerms, history: CardHistory): CardBaseline {
  if (history.paymentCount > 0 && history.basisDays > 0) {
    if (history.interestCharged <= SETTLED) return { behavior: 'pays_in_full', monthlyPayment: null };
    const average = (history.paymentsReceived / history.basisDays) * DAYS_PER_MONTH;
    return { behavior: 'average_payment', monthlyPayment: round(Math.max(average, terms.minimumPayment ?? 0)) };
  }
  if (terms.balance !== null && terms.balance <= SETTLED) return { behavior: 'pays_in_full', monthlyPayment: null };
  if (terms.minimumPayment !== null && terms.minimumPayment > 0) {
    return { behavior: 'minimum_payment', monthlyPayment: terms.minimumPayment };
  }
  return { behavior: 'unknown', monthlyPayment: null };
}

interface MonthPlan {
  /** A monthly plan pays every statement in full, on its own date. */
  statementInFull: CalendarDate | null;
  /** A monthly plan pays a set amount in place of the usual payment. */
  fixedMonthly: { date: CalendarDate; amount: number } | null;
  /** One-time plans that clear everything the card owes on their day. */
  clearDates: CalendarDate[];
  /** One-time extra payments. */
  extras: Array<{ date: CalendarDate; amount: number }>;
}

function emptyPlan(): MonthPlan {
  return { statementInFull: null, fixedMonthly: null, clearDates: [], extras: [] };
}

/** Each month's plan payments for one card, from the user's card-payment events. */
function plansByMonth(
  events: readonly PlannedCashFlowEvent[],
  from: CalendarDate,
  toExclusive: CalendarDate
): Map<string, MonthPlan> {
  const byMonth = new Map<string, MonthPlan>();
  const planFor = (date: CalendarDate) => {
    const key = date.slice(0, 7);
    const plan = byMonth.get(key) ?? emptyPlan();
    byMonth.set(key, plan);
    return plan;
  };
  for (const event of events) {
    if (event.kind !== 'card_payment' || !event.paymentMode) continue;
    for (const date of expandPlannedEvent(event, from, toExclusive)) {
      const plan = planFor(date);
      if (event.recurrence === 'monthly') {
        if (event.paymentMode === 'full') {
          plan.statementInFull = plan.statementInFull ? minDate(plan.statementInFull, date) : date;
        } else {
          plan.fixedMonthly = plan.fixedMonthly
            ? { date: minDate(plan.fixedMonthly.date, date), amount: plan.fixedMonthly.amount + event.amount }
            : { date, amount: event.amount };
        }
      } else if (event.paymentMode === 'full') {
        plan.clearDates.push(date);
      } else {
        plan.extras.push({ date, amount: event.amount });
      }
    }
  }
  return byMonth;
}

/** What a card is charged from the forecast start: everyday spending, plus purchases dated to a day. */
export interface CardPurchases {
  dailyRate: number;
  dated: ReadonlyArray<{ date: CalendarDate; amount: number }>;
}

/** Purchases on the card in `[from, toExclusive)`; nothing before the forecast start counts. */
export function purchasesBetween(
  purchases: CardPurchases,
  forecastStart: CalendarDate,
  from: CalendarDate,
  toExclusive: CalendarDate
): number {
  const start = maxDate(from, forecastStart);
  if (start >= toExclusive) return 0;
  let total = purchases.dailyRate * daysBetween(start, toExclusive);
  for (const item of purchases.dated) {
    if (item.date >= start && item.date < toExclusive) total += item.amount;
  }
  return total;
}

export interface CardProjectionInput {
  terms: CardTerms;
  baseline: CardBaseline;
  purchases: CardPurchases;
  /** The user's card-payment events for this card; pass none for the current pace. */
  plans: readonly PlannedCashFlowEvent[];
  forecastStart: CalendarDate;
  forecastEndLimit: CalendarDate;
}

/**
 * Project one card month by month across the forecast window. Null when there
 * is no balance to start from or no pace to project: with no usual pace, only
 * a monthly plan says what the card is paid.
 *
 * Months are accounted whole, through the one the window ends in: a payment
 * due after the window still decides what that month carries. Only payments
 * and interest dated inside the window are scheduled.
 */
export function projectCard(input: CardProjectionInput): CardProjection | null {
  const { terms, baseline, forecastStart, forecastEndLimit } = input;
  if (terms.balance === null) return null;
  const projectionEnd = addMonths(startOfMonth(addDays(forecastEndLimit, -1)), 1, 1);
  const plans = plansByMonth(input.plans, forecastStart, projectionEnd);
  const monthlyPlan = [...plans.values()].some(plan => plan.statementInFull || plan.fixedMonthly);
  if (baseline.behavior === 'unknown' && !monthlyPlan) return null;
  const inWindow = (date: CalendarDate) => date >= forecastStart && date < forecastEndLimit;
  const purchased = (from: CalendarDate, toExclusive: CalendarDate) =>
    purchasesBetween(input.purchases, forecastStart, from, toExclusive);

  const months: CardMonth[] = [];
  const payments: Array<{ date: CalendarDate; amount: number }> = [];
  const interestPostings: Array<{ date: CalendarDate; amount: number }> = [];
  let owed = terms.balance;

  for (let monthStart = startOfMonth(forecastStart); monthStart < projectionEnd; monthStart = addMonths(monthStart, 1, 1)) {
    const month = monthStart.slice(0, 7);
    const nextMonth = addMonths(monthStart, 1, 1);
    const lastDay = addDays(nextMonth, -1);
    const plan = plans.get(month) ?? emptyPlan();
    const statement = owed;
    const purchases = purchased(monthStart, nextMonth);

    // This month's usual payment went out before the forecast began: it is
    // already in the balance the card reported.
    const dueDate = addMonths(monthStart, 0, terms.paymentDay);
    const paidBeforeForecast = dueDate < forecastStart;

    // The regular payment: a monthly plan if one is running, otherwise the
    // usual pace. With no usual pace, a month the plan does not cover pays
    // only what one-time plans pay.
    let regular: { date: CalendarDate; amount: number } | null = null;
    if (plan.statementInFull) regular = { date: plan.statementInFull, amount: Math.max(0, statement) };
    else if (plan.fixedMonthly) regular = plan.fixedMonthly;
    else if (!paidBeforeForecast && baseline.behavior !== 'unknown') {
      regular = {
        date: dueDate,
        amount: baseline.behavior === 'pays_in_full' ? Math.max(0, statement) : baseline.monthlyPayment ?? 0,
      };
    }

    // In date order; on a shared day the regular payment goes first.
    const due = [
      ...(regular ? [{ ...regular, kind: 'regular' as const }] : []),
      ...plan.clearDates.map(date => ({ date, amount: 0, kind: 'clear' as const })),
      ...plan.extras.map(extra => ({ ...extra, kind: 'extra' as const })),
    ].sort((left, right) => left.date.localeCompare(right.date));

    let paid = 0;
    for (const item of due) {
      const owedThatDay = Math.max(0, statement + purchased(monthStart, addDays(item.date, 1)) - paid);
      const wanted = item.kind === 'clear'
        ? owedThatDay
        : item.kind === 'regular' ? Math.min(item.amount, Math.max(0, statement - paid)) : item.amount;
      const amount = Math.min(wanted, owedThatDay);
      if (amount <= 0) continue;
      paid += amount;
      // Unrounded: the cash position sums payments against unrounded
      // purchases, and rounding one side leaves cents of phantom balance.
      if (inWindow(item.date)) payments.push({ date: item.date, amount });
    }

    // A card paid in full had this month's statement settled before the forecast.
    const carried = paidBeforeForecast && baseline.behavior === 'pays_in_full' ? 0 : Math.max(0, statement - paid);
    const interest = terms.apr === null ? null : round((carried * terms.apr) / 1200);
    owed = statement + purchases - paid + (interest ?? 0);
    if (interest && inWindow(lastDay)) interestPostings.push({ date: lastDay, amount: interest });

    months.push({
      month,
      statement: round(statement),
      purchases: round(purchases),
      payment: round(paid),
      carried: round(carried),
      interest,
      endBalance: round(owed),
    });
  }

  let lastCarried = -1;
  months.forEach((month, index) => {
    if (month.carried > SETTLED) lastCarried = index;
  });
  const interestOver = (count: number) => terms.apr === null
    ? null
    : round(months.slice(0, count).reduce((total, month) => total + (month.interest ?? 0), 0));

  return {
    months,
    paidOffBy: lastCarried < 0
      ? months[0]?.month ?? null
      : lastCarried === months.length - 1 ? null : months[lastCarried + 1].month,
    carryingBalanceNow: (months[0]?.carried ?? 0) > SETTLED,
    interestTwelveMonths: interestOver(12),
    interestTotal: interestOver(months.length),
    payments: payments.sort((left, right) => left.date.localeCompare(right.date)),
    interestPostings,
  };
}
