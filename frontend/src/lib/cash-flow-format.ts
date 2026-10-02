import type {
  CashFlowCardSummary,
  CashFlowGranularity,
  CashFlowHighlightKey,
  CashFlowPeriod,
  ForecastUnavailableReason,
  PlannedCashFlowEvent,
  PlannedEventRecurrence,
  RecurringCadence,
} from '../types/cash-flow';

/**
 * Presentation for the cash flow page. The report's dates are calendar dates
 * (`YYYY-MM-DD`) in the user's own calendar, so they are formatted from their
 * parts rather than through `Date`, which would shift them across time zones.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MINUS = '−';

function dateParts(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  return [year, month, day];
}

/** "Dec 15, 2026", or "Dec 15" without the year. */
export function formatCalendarDate(date: string, withYear = true): string {
  const [year, month, day] = dateParts(date);
  return withYear ? `${MONTHS[month - 1]} ${day}, ${year}` : `${MONTHS[month - 1]} ${day}`;
}

/** The last day inside an exclusive end. */
export function lastIncludedDay(endExclusive: string): string {
  const [year, month, day] = dateParts(endExclusive);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

function dateRange(start: string, endExclusive: string): string {
  const last = lastIncludedDay(endExclusive);
  if (start === last) return formatCalendarDate(start);
  const sameYear = start.slice(0, 4) === last.slice(0, 4);
  return `${formatCalendarDate(start, !sameYear)} – ${formatCalendarDate(last)}`;
}

/** A period's full name: "Oct 2026", "Q4 2026", "2026", "Week of Sep 28, 2026", or its dates when clipped. */
export function periodLabel(period: Pick<CashFlowPeriod, 'key' | 'start' | 'endExclusive' | 'clipped'>, granularity: CashFlowGranularity): string {
  if (period.clipped) return dateRange(period.start, period.endExclusive);
  const [year, month] = dateParts(period.start);
  switch (granularity) {
    case 'week': return `Week of ${formatCalendarDate(period.start)}`;
    case 'month': return `${MONTHS[month - 1]} ${year}`;
    case 'quarter': return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
    case 'year': return String(year);
  }
}

/** A compact axis label: "Oct", "Jan '27", "Q4 '26", "2026", "9/28". */
export function shortPeriodLabel(period: Pick<CashFlowPeriod, 'start'>, granularity: CashFlowGranularity): string {
  const [year, month, day] = dateParts(period.start);
  const shortYear = `'${String(year).slice(2)}`;
  switch (granularity) {
    case 'week': return `${month}/${day}`;
    case 'month': return month === 1 ? `${MONTHS[0]} ${shortYear}` : MONTHS[month - 1];
    case 'quarter': return `Q${Math.floor((month - 1) / 3) + 1} ${shortYear}`;
    case 'year': return String(year);
  }
}

/** "$1,235" -- or with cents, "$1,234.50". Negative amounts use a true minus sign. */
export function formatMoney(value: number, cents = false): string {
  const magnitude = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  const rounded = cents ? Math.round(value * 100) : Math.round(value);
  return rounded < 0 ? `${MINUS}$${magnitude}` : `$${magnitude}`;
}

/** "+$1,235", "−$320", or "$0" for a net figure. */
export function formatSignedMoney(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return '$0';
  return rounded > 0 ? `+${formatMoney(value)}` : formatMoney(value);
}

/** "$1.2K", "$15K", "$1.1M" for chart axes. */
export function formatCompactMoney(value: number): string {
  const magnitude = Math.abs(value);
  const sign = value < 0 ? MINUS : '';
  if (magnitude >= 1_000_000) return `${sign}$${(magnitude / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (magnitude >= 1_000) return `${sign}$${(magnitude / 1_000).toFixed(magnitude >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return `${sign}$${Math.round(magnitude)}`;
}

export const CADENCE_LABELS: Record<RecurringCadence, string> = {
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Every month',
  quarterly: 'Every 3 months',
};

export const RECURRENCE_LABELS: Record<PlannedEventRecurrence, string> = {
  once: 'Doesn’t repeat',
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
  quarterly: 'Every 3 months',
  annually: 'Every year',
};

export const HIGHLIGHT_LABELS: Record<CashFlowHighlightKey, string> = {
  this_month: 'This month',
  next_month: 'Next month',
  this_quarter: 'This quarter',
  next_quarter: 'Next quarter',
  this_year: 'This year',
  next_3_months: 'Next 3 months',
  next_6_months: 'Next 6 months',
  next_12_months: 'Next 12 months',
};

/** "Once on Dec 15, 2026", "Every month from Jan 1, 2027 until Jun 1, 2027". */
export function describeSchedule(event: Pick<PlannedCashFlowEvent, 'recurrence' | 'startDate' | 'endDate'>): string {
  if (event.recurrence === 'once') return `Once on ${formatCalendarDate(event.startDate)}`;
  const base = `${RECURRENCE_LABELS[event.recurrence]} from ${formatCalendarDate(event.startDate)}`;
  return event.endDate ? `${base} until ${formatCalendarDate(event.endDate)}` : base;
}

export function unavailableMessage(reason: ForecastUnavailableReason): string {
  switch (reason) {
    case 'no_accounts':
      return 'Connect a checking account or credit card to see your cash flow.';
    case 'no_history':
      return 'Your connected accounts have no transactions yet. They usually appear within a few minutes of connecting.';
    case 'insufficient_history':
      return 'A forecast needs about four weeks of transactions. Your history so far is shown below, and the forecast will appear as more arrives.';
  }
}

/** "Mar 2027" for a `YYYY-MM` month. */
export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${MONTHS[monthNumber - 1]} ${year}`;
}

/** "Rewards Card ••9876". */
export function cardName(card: Pick<CashFlowCardSummary, 'name' | 'mask'>): string {
  return card.mask ? `${card.name} ••${card.mask}` : card.name;
}

/** How the user usually pays a card, in their terms. */
export function paceDescription(card: Pick<CashFlowCardSummary, 'behavior' | 'usualMonthlyPayment'>): string {
  switch (card.behavior) {
    case 'pays_in_full': return 'You’ve been paying this card in full';
    case 'average_payment': return `You’ve been paying about ${formatMoney(card.usualMonthlyPayment ?? 0)} a month`;
    case 'minimum_payment': return `Assuming the minimum payment of ${formatMoney(card.usualMonthlyPayment ?? 0)} a month`;
    case 'unknown': return 'Not enough payment history to project this card yet';
  }
}

/** "Pay off in full on Oct 25, 2026", "Pay $500 every month from Nov 1, 2026". */
export function describeCardPlan(event: Pick<PlannedCashFlowEvent, 'recurrence' | 'startDate' | 'endDate' | 'paymentMode' | 'amount'>): string {
  const until = event.endDate ? ` until ${formatCalendarDate(event.endDate)}` : '';
  if (event.paymentMode === 'full') {
    return event.recurrence === 'once'
      ? `Pay off in full on ${formatCalendarDate(event.startDate)}`
      : `Pay the statement in full every month from ${formatCalendarDate(event.startDate)}${until}`;
  }
  return event.recurrence === 'once'
    ? `Pay an extra ${formatMoney(event.amount)} on ${formatCalendarDate(event.startDate)}`
    : `Pay ${formatMoney(event.amount)} every month from ${formatCalendarDate(event.startDate)}${until}`;
}

