import type {
  CashFlowCardSummary,
  CashFlowGranularity,
  CashFlowPositionAccount,
  CashFlowHighlightKey,
  CashFlowPeriod,
  CashFlowReport,
  ForecastUnavailableReason,
  PlannedCashFlowEvent,
  PlannedEventRecurrence,
  RepeatUnit,
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

/** "Oct 1–5", "Oct 6 – Dec 31", or "Oct 6" for a single day; no year. Both ends are included. */
export function formatShortRange(start: string, last: string): string {
  if (start === last) return formatCalendarDate(start, false);
  if (start.slice(0, 7) === last.slice(0, 7)) return `${formatCalendarDate(start, false)}–${dateParts(last)[2]}`;
  return `${formatCalendarDate(start, false)} – ${formatCalendarDate(last, false)}`;
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

/**
 * Whole numbers for `values` that add up to `total` exactly. Each is rounded
 * down, then the ones that lost the most take the rest a unit at a time (or,
 * when the values add up to more than `total`, the ones that lost least give a
 * unit back).
 */
export function roundToTotal(values: readonly number[], total: number): number[] {
  const result = values.map(value => Math.floor(value));
  const byRemainder = values
    .map((value, index) => ({ index, remainder: value - result[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  let left = Math.round(total) - result.reduce((sum, value) => sum + value, 0);
  for (let step = 0; left !== 0 && byRemainder.length > 0; step += 1) {
    if (left > 0) {
      result[byRemainder[step % byRemainder.length].index] += 1;
      left -= 1;
      continue;
    }
    // Never push a line below zero: a tiny part that floored to 0 must not
    // absorb a take-back and render as a negative dollar.
    let gave = false;
    for (let probe = 0; probe < byRemainder.length; probe += 1) {
      const index = byRemainder[byRemainder.length - 1 - ((step + probe) % byRemainder.length)].index;
      if (result[index] <= 0) continue;
      result[index] -= 1;
      left += 1;
      gave = true;
      break;
    }
    if (!gave) break;
  }
  return result;
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
  semiannually: 'Every 6 months',
  annually: 'Every year',
  custom: 'Custom…',
};

/** "Every 3 weeks", "Every month": a custom recurrence in words. */
export function customRecurrenceLabel(every: number, unit: RepeatUnit): string {
  return every === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`;
}

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

/** "Once on Dec 15, 2026", "Every month from Jan 1, 2027 until Jun 1, 2027", "Every 3 weeks from …". */
export function describeSchedule(
  event: Pick<PlannedCashFlowEvent, 'recurrence' | 'startDate' | 'endDate' | 'repeatEvery' | 'repeatUnit'>
): string {
  const custom = event.recurrence === 'custom' && event.repeatEvery && event.repeatUnit
    ? customRecurrenceLabel(event.repeatEvery, event.repeatUnit)
    : null;
  if (event.recurrence === 'once' || (event.recurrence === 'custom' && !custom)) return `Once on ${formatCalendarDate(event.startDate)}`;
  const base = `${custom ?? RECURRENCE_LABELS[event.recurrence]} from ${formatCalendarDate(event.startDate)}`;
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
    case 'unknown': return 'Not enough payment history to know what you usually pay';
  }
}

/** Whether the cash position carries any card's balance. */
export function projectsCardDebt(report: Pick<CashFlowReport, 'position'>): boolean {
  return report.position.cardIds.length > 0;
}

/** Whether the cash position covers every cash account rather than a chosen few. */
export function coversAllCash(report: Pick<CashFlowReport, 'position'>): boolean {
  return report.position.accountIds.length === report.position.accounts.length;
}

/** "Everyday Checking ••1234". */
export function cashAccountName(account: Pick<CashFlowPositionAccount, 'name' | 'mask'>): string {
  return account.mask ? `${account.name} ••${account.mask}` : account.name;
}

/**
 * Every account's name by id, cash accounts and cards alike, for saying where
 * a regular item is expected. Empty with a single account, where naming it
 * would tell the user nothing.
 */
export function accountNamesById(report: Pick<CashFlowReport, 'position' | 'cards'>): Map<string, string> {
  const names = new Map<string, string>();
  for (const account of report.position.accounts) names.set(account.id, cashAccountName(account));
  for (const card of report.cards) names.set(card.accountId, cardName(card));
  return names.size > 1 ? names : new Map();
}

/** What the cash position covers, for a sentence: "your checking and savings", one account's name, or "2 accounts". */
export function positionScope(report: Pick<CashFlowReport, 'position'>): string {
  if (coversAllCash(report)) return 'your checking and savings';
  const chosen = report.position.accounts.filter(account => report.position.accountIds.includes(account.id));
  return chosen.length === 1 ? cashAccountName(chosen[0]) : `${chosen.length} accounts`;
}

const LEFT_OUT_REASONS: Record<CashFlowReport['position']['cardsLeftOut'][number]['reason'], string> = {
  no_balance: 'its balance isn’t reported',
  no_pace: 'there’s no usual payment to project from',
};

/** "Store Card ••1234 (its balance isn’t reported)", for each card the cash position leaves out; null when none. */
export function cardsLeftOutText(report: Pick<CashFlowReport, 'cards' | 'position'>): string | null {
  if (report.position.cardsLeftOut.length === 0) return null;
  const masks = new Map(report.cards.map(card => [card.accountId, card.mask]));
  return report.position.cardsLeftOut
    .map(card => `${cardName({ name: card.name, mask: masks.get(card.accountId) ?? null })} (${LEFT_OUT_REASONS[card.reason]})`)
    .join(', ');
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

