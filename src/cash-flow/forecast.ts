import {
  addDays,
  addMonths,
  daysBetween,
  maxDate,
  minDate,
  startOfMonth,
  type CalendarDate,
} from './calendar';
import {
  buildCashFlowLedger,
  type CashFlowAccount,
  type CashFlowDirection,
  type CashFlowEntry,
  type CashFlowLedger,
} from './ledger';
import {
  enumeratePeriods,
  nextPeriodStart,
  periodEndExclusive,
  periodStart,
  type CashFlowGranularity,
} from './periods';
import {
  expandPlannedEvent,
  type PlannedCashFlowEvent,
} from './planned-events';
import {
  detectRecurringStreams,
  scheduleStream,
  streamMonthlyAmount,
  type RecurringCadence,
  type RecurringStream,
} from './recurring';

/**
 * Deterministic cash-flow history and forecast for the savings view.
 *
 * Cash in is canonical income and cash out is canonical spending across cash
 * accounts and credit cards: card purchases count when they are made, and card
 * payments, transfers and trades are neither. Net is what the user kept.
 *
 * The forecast is three disclosed parts and nothing else:
 *   recurring -- streams recognized in the user's history, on their schedule;
 *   typical   -- everything else, as a daily rate over the recent basis window,
 *                with large one-off amounts left out and listed;
 *   planned   -- events the user saved.
 * A monthly income or expense override replaces the recurring and typical
 * parts of that side, because the user has said what the month looks like.
 *
 * Every figure is computed here. Models and the frontend only present them.
 */
export const CASH_FLOW_ENGINE_VERSION = 1;

/** Longest a forecast may run, from its first day. */
export const FORECAST_MAX_MONTHS = 24;
/** Less history than this makes a daily rate meaningless. */
export const MIN_FORECAST_HISTORY_DAYS = 28;
/** Typical rates come from at most this many recent days. */
export const TYPICAL_BASIS_DAYS = 90;
/** A non-repeating amount this large or larger can be a one-off. */
export const ONE_OFF_FLOOR = 1_000;
/** ... once it is also this many typical weeks' worth. */
const ONE_OFF_TYPICAL_WEEKS = 2;
const DAYS_PER_MONTH = 365 / 12;

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

export type ForecastUnavailableReason = 'no_accounts' | 'no_history' | 'insufficient_history';

export interface CashFlowModelInput {
  transactions: readonly any[];
  accounts: readonly any[];
  plannedEvents: readonly PlannedCashFlowEvent[];
  /**
   * Last calendar day the transactions can cover: the snapshot's compute date
   * in the user's zone. The forecast starts the day after, so days the
   * snapshot has not seen yet are forecast rather than counted as empty.
   */
  dataThrough: CalendarDate;
  /** The user's calendar date, which decides "this month". */
  today: CalendarDate;
  overrides?: { monthlyIncome?: number | null; monthlyExpense?: number | null };
  reportingCurrency?: string;
}

type FlowSource = 'transactions' | 'override';

export interface CashFlowModel {
  ledger: CashFlowLedger;
  streams: RecurringStream[];
  plannedEvents: readonly PlannedCashFlowEvent[];
  today: CalendarDate;
  dataThrough: CalendarDate;
  forecastStart: CalendarDate;
  forecastEndLimit: CalendarDate;
  coverageStart: CalendarDate | null;
  forecast: { available: true } | { available: false; reason: ForecastUnavailableReason };
  typical: {
    basisStart: CalendarDate | null;
    basisDays: number;
    dailyIncome: number;
    dailySpending: number;
    incomeSource: FlowSource;
    spendingSource: FlowSource;
    monthlyIncomeOverride: number | null;
    monthlyExpenseOverride: number | null;
  };
  oneOffs: CashFlowEntry[];
  /** Projected stream occurrences over the whole forecast limit. */
  scheduled: Array<{ streamId: string; flow: CashFlowDirection; date: CalendarDate; amount: number }>;
}

export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function totals(income: number, spending: number): CashFlowTotals {
  const roundedIncome = roundCents(income);
  const roundedSpending = roundCents(spending);
  return { income: roundedIncome, spending: roundedSpending, net: roundCents(roundedIncome - roundedSpending) };
}

function addTotals(left: CashFlowTotals, right: CashFlowTotals): CashFlowTotals {
  return totals(left.income + right.income, left.spending + right.spending);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function positiveOverride(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Median of complete 7-day totals across the basis, per flow. */
function typicalWeeklyTotals(
  entries: readonly CashFlowEntry[],
  basisStart: CalendarDate,
  basisEndExclusive: CalendarDate
): Record<CashFlowDirection, number> {
  const weeks = Math.floor(daysBetween(basisStart, basisEndExclusive) / 7);
  const result: Record<CashFlowDirection, number> = { income: 0, spending: 0 };
  if (weeks === 0) return result;
  for (const flow of ['income', 'spending'] as const) {
    const buckets = new Array<number>(weeks).fill(0);
    for (const entry of entries) {
      if (entry.flow !== flow) continue;
      const week = Math.floor(daysBetween(basisStart, entry.date) / 7);
      if (week >= 0 && week < weeks) buckets[week] += entry.amount;
    }
    result[flow] = median(buckets);
  }
  return result;
}

export function buildCashFlowModel(input: CashFlowModelInput): CashFlowModel {
  const ledger = buildCashFlowLedger(input.transactions, input.accounts, input.reportingCurrency);
  const forecastStart = addDays(input.dataThrough, 1);
  const forecastEndLimit = addMonths(forecastStart, FORECAST_MAX_MONTHS);
  const coverageStart = ledger.coverageStart && ledger.coverageStart <= input.dataThrough
    ? ledger.coverageStart
    : null;
  const entries = ledger.entries.filter(entry => entry.date <= input.dataThrough);
  const streams = detectRecurringStreams(entries, input.dataThrough);

  const monthlyIncomeOverride = positiveOverride(input.overrides?.monthlyIncome);
  const monthlyExpenseOverride = positiveOverride(input.overrides?.monthlyExpense);
  const incomeSource: FlowSource = monthlyIncomeOverride !== null ? 'override' : 'transactions';
  const spendingSource: FlowSource = monthlyExpenseOverride !== null ? 'override' : 'transactions';

  let reason: ForecastUnavailableReason | null = null;
  if (ledger.accounts.length === 0) reason = 'no_accounts';
  else if (!coverageStart) reason = 'no_history';

  const basisStart = coverageStart
    ? maxDate(coverageStart, addDays(forecastStart, -TYPICAL_BASIS_DAYS))
    : null;
  const basisDays = basisStart ? daysBetween(basisStart, forecastStart) : 0;
  // Overrides on both sides make history unnecessary for the forecast.
  const needsHistory = incomeSource === 'transactions' || spendingSource === 'transactions';
  if (!reason && needsHistory && basisDays < MIN_FORECAST_HISTORY_DAYS) reason = 'insufficient_history';

  let dailyIncome = 0;
  let dailySpending = 0;
  let oneOffs: CashFlowEntry[] = [];
  if (basisStart && basisDays > 0) {
    const inStream = new Set(streams.flatMap(stream => stream.entryIds));
    const basisEntries = entries.filter(entry => entry.date >= basisStart);
    const residual = basisEntries.filter(entry => !inStream.has(entry.id));
    const typicalWeek = typicalWeeklyTotals(residual, basisStart, forecastStart);

    // A one-off is large for this user and does not repeat: a payee seen more
    // than once in the basis is part of how they live, however large.
    const payeeCounts = new Map<string, number>();
    for (const entry of basisEntries) {
      if (!entry.counterpartyKey) continue;
      const key = `${entry.flow}|${entry.counterpartyKey}`;
      payeeCounts.set(key, (payeeCounts.get(key) ?? 0) + 1);
    }
    const isOneOff = (entry: CashFlowEntry) => {
      const repeats = entry.counterpartyKey
        ? (payeeCounts.get(`${entry.flow}|${entry.counterpartyKey}`) ?? 0) > 1
        : false;
      const threshold = Math.max(ONE_OFF_FLOOR, ONE_OFF_TYPICAL_WEEKS * typicalWeek[entry.flow]);
      return !repeats && Math.abs(entry.amount) >= threshold;
    };

    oneOffs = residual.filter(isOneOff);
    const oneOffIds = new Set(oneOffs.map(entry => entry.id));
    let incomeTotal = 0;
    let spendingTotal = 0;
    for (const entry of residual) {
      if (oneOffIds.has(entry.id)) continue;
      if (entry.flow === 'income') incomeTotal += entry.amount;
      else spendingTotal += entry.amount;
    }
    dailyIncome = Math.max(0, incomeTotal / basisDays);
    dailySpending = Math.max(0, spendingTotal / basisDays);
  }
  if (monthlyIncomeOverride !== null) dailyIncome = monthlyIncomeOverride / DAYS_PER_MONTH;
  if (monthlyExpenseOverride !== null) dailySpending = monthlyExpenseOverride / DAYS_PER_MONTH;

  const scheduled = reason
    ? []
    : streams
      .filter(stream => (stream.flow === 'income' ? incomeSource : spendingSource) === 'transactions')
      .flatMap(stream => scheduleStream(stream, forecastStart, forecastEndLimit)
        .map(occurrence => ({ streamId: stream.id, flow: stream.flow, ...occurrence })));

  return {
    ledger,
    streams,
    plannedEvents: input.plannedEvents,
    today: input.today,
    dataThrough: input.dataThrough,
    forecastStart,
    forecastEndLimit,
    coverageStart,
    forecast: reason ? { available: false, reason } : { available: true },
    typical: {
      basisStart,
      basisDays,
      dailyIncome,
      dailySpending,
      incomeSource,
      spendingSource,
      monthlyIncomeOverride,
      monthlyExpenseOverride,
    },
    oneOffs: oneOffs.sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount)),
    scheduled,
  };
}

/** Observed income and spending in `[start, endExclusive)`, limited to covered, observed days. */
export function actualTotals(
  model: CashFlowModel,
  start: CalendarDate,
  endExclusive: CalendarDate
): CashFlowTotals | null {
  if (!model.coverageStart) return null;
  const from = maxDate(start, model.coverageStart);
  const to = minDate(endExclusive, model.forecastStart);
  if (from >= to) return null;
  let income = 0;
  let spending = 0;
  for (const entry of model.ledger.entries) {
    if (entry.date < from || entry.date >= to) continue;
    if (entry.flow === 'income') income += entry.amount;
    else spending += entry.amount;
  }
  return totals(income, spending);
}

/** How much of `[start, endExclusive)` before the forecast is covered by history. */
export function actualCoverage(
  model: CashFlowModel,
  start: CalendarDate,
  endExclusive: CalendarDate
): 'full' | 'partial' | 'none' {
  const observedEnd = minDate(endExclusive, model.forecastStart);
  if (!model.coverageStart || model.coverageStart >= observedEnd) return 'none';
  return model.coverageStart <= start ? 'full' : 'partial';
}

function plannedTotals(model: CashFlowModel, from: CalendarDate, to: CalendarDate): { income: number; spending: number } {
  let income = 0;
  let spending = 0;
  for (const event of model.plannedEvents) {
    const count = expandPlannedEvent(event, from, to).length;
    if (event.kind === 'income') income += count * event.amount;
    else spending += count * event.amount;
  }
  return { income, spending };
}

/** Forecast for the part of `[start, endExclusive)` that lies in the forecast window. */
export function forecastTotals(
  model: CashFlowModel,
  start: CalendarDate,
  endExclusive: CalendarDate
): ForecastTotals | null {
  if (!model.forecast.available) return null;
  const from = maxDate(start, model.forecastStart);
  const to = minDate(endExclusive, model.forecastEndLimit);
  if (from >= to) return null;

  let recurringIncome = 0;
  let recurringSpending = 0;
  for (const occurrence of model.scheduled) {
    if (occurrence.date < from || occurrence.date >= to) continue;
    if (occurrence.flow === 'income') recurringIncome += occurrence.amount;
    else recurringSpending += occurrence.amount;
  }
  const days = daysBetween(from, to);
  const typicalIncome = model.typical.dailyIncome * days;
  const typicalSpending = model.typical.dailySpending * days;
  const planned = plannedTotals(model, from, to);

  const components: ForecastComponents = {
    recurringIncome: roundCents(recurringIncome),
    typicalIncome: roundCents(typicalIncome),
    plannedIncome: roundCents(planned.income),
    recurringSpending: roundCents(recurringSpending),
    typicalSpending: roundCents(typicalSpending),
    plannedSpending: roundCents(planned.spending),
  };
  return {
    ...totals(
      components.recurringIncome + components.typicalIncome + components.plannedIncome,
      components.recurringSpending + components.typicalSpending + components.plannedSpending
    ),
    components,
  };
}

function withoutPlanned(forecast: ForecastTotals): CashFlowTotals {
  const { components } = forecast;
  return totals(
    components.recurringIncome + components.typicalIncome,
    components.recurringSpending + components.typicalSpending
  );
}

export interface CashFlowPeriod {
  key: string;
  start: CalendarDate;
  endExclusive: CalendarDate;
  clipped: boolean;
  phase: 'past' | 'current' | 'future';
  /** How much of the period's observed part has history behind it. */
  coverage: 'full' | 'partial' | 'none';
  actual: CashFlowTotals | null;
  forecast: ForecastTotals | null;
  total: CashFlowTotals | null;
}

function combine(actual: CashFlowTotals | null, forecast: CashFlowTotals | null): CashFlowTotals | null {
  if (actual && forecast) return addTotals(actual, forecast);
  // Rebuild rather than pass through, so a forecast's breakdown never rides along.
  const only = actual ?? forecast;
  return only ? totals(only.income, only.spending) : null;
}

export function buildPeriod(
  model: CashFlowModel,
  bounds: { key: string; start: CalendarDate; endExclusive: CalendarDate; clipped: boolean }
): CashFlowPeriod {
  const phase = bounds.endExclusive <= model.forecastStart
    ? 'past'
    : bounds.start >= model.forecastStart ? 'future' : 'current';
  const actual = phase === 'future' ? null : actualTotals(model, bounds.start, bounds.endExclusive);
  const forecast = phase === 'past' ? null : forecastTotals(model, bounds.start, bounds.endExclusive);
  return {
    ...bounds,
    phase,
    coverage: phase === 'future' ? 'none' : actualCoverage(model, bounds.start, bounds.endExclusive),
    actual,
    forecast,
    total: combine(actual, forecast),
  };
}

export const CASH_FLOW_HIGHLIGHT_KEYS = [
  'this_month',
  'next_month',
  'this_quarter',
  'next_quarter',
  'this_year',
  'next_3_months',
  'next_6_months',
  'next_12_months',
] as const;
export type CashFlowHighlightKey = (typeof CASH_FLOW_HIGHLIGHT_KEYS)[number];

export interface CashFlowHighlight {
  key: CashFlowHighlightKey;
  start: CalendarDate;
  endExclusive: CalendarDate;
  /** Observed so far; null for windows that start in the future. */
  actualToDate: CashFlowTotals | null;
  actualCoverage: 'full' | 'partial' | 'none' | null;
  /** Forecast for the rest of the window. */
  remaining: ForecastTotals | null;
  /**
   * Observed plus forecast, when both halves are whole: null when history
   * does not reach the window's start or the forecast is unavailable.
   */
  projected: CashFlowTotals | null;
  /** Planned events alone, inside the forecast part. */
  planned: CashFlowTotals;
  /** `projected` without the planned events; null whenever `projected` is. */
  projectedWithoutPlanned: CashFlowTotals | null;
}

function highlightWindows(model: CashFlowModel): Array<{ key: CashFlowHighlightKey; start: CalendarDate; endExclusive: CalendarDate }> {
  const monthStart = startOfMonth(model.today);
  const quarterStart = periodStart(model.today, 'quarter');
  const yearStart = periodStart(model.today, 'year');
  const nextQuarterStart = nextPeriodStart(quarterStart, 'quarter');
  return [
    { key: 'this_month', start: monthStart, endExclusive: addMonths(monthStart, 1, 1) },
    { key: 'next_month', start: addMonths(monthStart, 1, 1), endExclusive: addMonths(monthStart, 2, 1) },
    { key: 'this_quarter', start: quarterStart, endExclusive: nextQuarterStart },
    { key: 'next_quarter', start: nextQuarterStart, endExclusive: nextPeriodStart(nextQuarterStart, 'quarter') },
    { key: 'this_year', start: yearStart, endExclusive: nextPeriodStart(yearStart, 'year') },
    { key: 'next_3_months', start: model.forecastStart, endExclusive: addMonths(model.forecastStart, 3) },
    { key: 'next_6_months', start: model.forecastStart, endExclusive: addMonths(model.forecastStart, 6) },
    { key: 'next_12_months', start: model.forecastStart, endExclusive: addMonths(model.forecastStart, 12) },
  ];
}

export function buildCashFlowHighlights(model: CashFlowModel): CashFlowHighlight[] {
  return highlightWindows(model).map(({ key, start, endExclusive }) => {
    const startsObserved = start < model.forecastStart;
    const actualToDate = startsObserved ? actualTotals(model, start, endExclusive) ?? totals(0, 0) : null;
    const coverage = startsObserved ? actualCoverage(model, start, endExclusive) : null;
    const remaining = forecastTotals(model, start, endExclusive);
    const wholeHistory = !startsObserved || coverage === 'full';
    const projected = remaining && wholeHistory ? combine(actualToDate, remaining) : null;
    const plannedOnly = remaining
      ? totals(remaining.components.plannedIncome, remaining.components.plannedSpending)
      : totals(0, 0);
    return {
      key,
      start,
      endExclusive,
      actualToDate,
      actualCoverage: coverage,
      remaining,
      projected,
      planned: plannedOnly,
      projectedWithoutPlanned: projected && remaining ? combine(actualToDate, withoutPlanned(remaining)) : null,
    };
  });
}

export interface CashFlowReportRequest {
  granularity: CashFlowGranularity;
  /** Months after the current one to forecast; the last period is completed. */
  horizonMonths: number;
  /** Optional custom range, inclusive on both ends. */
  from?: CalendarDate;
  to?: CalendarDate;
}

export interface CashFlowRecurringSummary {
  id: string;
  label: string;
  flow: CashFlowDirection;
  cadence: RecurringCadence;
  amount: number;
  monthlyAmount: number;
  occurrences: number;
  lastDate: CalendarDate;
  nextDate: CalendarDate | null;
  status: 'active' | 'lapsed';
  category: string;
  /** The user's monthly override replaces this side of the forecast. */
  replacedByOverride: boolean;
}

export interface CashFlowPlannedEventSummary extends PlannedCashFlowEvent {
  nextDate: CalendarDate | null;
  occurrencesInRange: number;
}

export interface CashFlowReport {
  version: number;
  currency: string;
  today: CalendarDate;
  dataThrough: CalendarDate;
  forecastStart: CalendarDate;
  granularity: CashFlowGranularity;
  range: { from: CalendarDate; toExclusive: CalendarDate };
  coverageStart: CalendarDate | null;
  forecast: CashFlowModel['forecast'];
  periods: CashFlowPeriod[];
  totals: { actual: CashFlowTotals | null; forecast: CashFlowTotals | null; total: CashFlowTotals | null };
  highlights: CashFlowHighlight[];
  baseline: {
    typicalBasisStart: CalendarDate | null;
    typicalBasisDays: number;
    typicalMonthlyIncome: number;
    typicalMonthlySpending: number;
    incomeSource: FlowSource;
    spendingSource: FlowSource;
    monthlyIncomeOverride: number | null;
    monthlyExpenseOverride: number | null;
  };
  recurring: CashFlowRecurringSummary[];
  oneOffs: Array<{ id: string; date: CalendarDate; label: string; flow: CashFlowDirection; amount: number }>;
  plannedEvents: CashFlowPlannedEventSummary[];
  accounts: CashFlowAccount[];
  excluded: CashFlowLedger['excluded'];
}

const DEFAULT_LOOKBACK_MONTHS: Record<CashFlowGranularity, number> = {
  week: 3,
  month: 12,
  quarter: 12,
  year: 24,
};

/** The default range: recent history through the requested horizon, on period boundaries. */
export function defaultReportRange(
  model: CashFlowModel,
  granularity: CashFlowGranularity,
  horizonMonths: number
): { from: CalendarDate; toExclusive: CalendarDate } {
  const lookbackStart = addMonths(model.today, -DEFAULT_LOOKBACK_MONTHS[granularity]);
  const historyStart = model.coverageStart ? maxDate(model.coverageStart, lookbackStart) : model.forecastStart;
  const horizonEnd = minDate(
    addMonths(startOfMonth(model.forecastStart), horizonMonths + 1, 1),
    model.forecastEndLimit
  );
  // Finish the period the horizon lands in, so the last bar is never a stub.
  const toExclusive = minDate(periodEndExclusive(addDays(horizonEnd, -1), granularity), model.forecastEndLimit);
  return { from: periodStart(minDate(historyStart, model.forecastStart), granularity), toExclusive };
}

export function buildCashFlowReport(model: CashFlowModel, request: CashFlowReportRequest): CashFlowReport {
  const range = request.from && request.to
    ? { from: request.from, toExclusive: minDate(addDays(request.to, 1), model.forecastEndLimit) }
    : defaultReportRange(model, request.granularity, request.horizonMonths);
  const periods = enumeratePeriods(range.from, range.toExclusive, request.granularity)
    .map(bounds => buildPeriod(model, bounds));
  const actual = actualTotals(model, range.from, range.toExclusive);
  const forecast = forecastTotals(model, range.from, range.toExclusive);

  const scheduledByStream = new Map<string, CalendarDate>();
  for (const occurrence of model.scheduled) {
    const existing = scheduledByStream.get(occurrence.streamId);
    if (!existing || occurrence.date < existing) scheduledByStream.set(occurrence.streamId, occurrence.date);
  }

  return {
    version: CASH_FLOW_ENGINE_VERSION,
    currency: 'USD',
    today: model.today,
    dataThrough: model.dataThrough,
    forecastStart: model.forecastStart,
    granularity: request.granularity,
    range,
    coverageStart: model.coverageStart,
    forecast: model.forecast,
    periods,
    totals: {
      actual,
      forecast: forecast ? totals(forecast.income, forecast.spending) : null,
      total: combine(actual, forecast),
    },
    highlights: buildCashFlowHighlights(model),
    baseline: {
      typicalBasisStart: model.typical.basisStart,
      typicalBasisDays: model.typical.basisDays,
      typicalMonthlyIncome: roundCents(model.typical.dailyIncome * DAYS_PER_MONTH),
      typicalMonthlySpending: roundCents(model.typical.dailySpending * DAYS_PER_MONTH),
      incomeSource: model.typical.incomeSource,
      spendingSource: model.typical.spendingSource,
      monthlyIncomeOverride: model.typical.monthlyIncomeOverride,
      monthlyExpenseOverride: model.typical.monthlyExpenseOverride,
    },
    recurring: model.streams.map(stream => ({
      id: stream.id,
      label: stream.label,
      flow: stream.flow,
      cadence: stream.cadence,
      amount: roundCents(stream.amount),
      monthlyAmount: roundCents(streamMonthlyAmount(stream)),
      occurrences: stream.occurrences,
      lastDate: stream.lastDate,
      nextDate: scheduledByStream.get(stream.id) ?? null,
      status: stream.status,
      category: stream.category,
      replacedByOverride: (stream.flow === 'income' ? model.typical.incomeSource : model.typical.spendingSource) === 'override',
    })),
    oneOffs: model.oneOffs.slice(0, 10).map(entry => ({
      id: entry.id,
      date: entry.date,
      label: entry.label,
      flow: entry.flow,
      amount: roundCents(entry.amount),
    })),
    plannedEvents: model.plannedEvents.map(event => {
      const upcoming = expandPlannedEvent(event, model.forecastStart, model.forecastEndLimit);
      return {
        ...event,
        nextDate: upcoming[0] ?? null,
        occurrencesInRange: expandPlannedEvent(
          event,
          maxDate(range.from, model.forecastStart),
          range.toExclusive
        ).length,
      };
    }),
    accounts: model.ledger.accounts,
    excluded: model.ledger.excluded,
  };
}
