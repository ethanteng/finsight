import {
  CASH_FLOW_HIGHLIGHT_KEYS,
  buildCashFlowHighlights,
  type CashFlowHighlight,
  type CashFlowHighlightKey,
  type CashFlowModel,
  type CashFlowTotals,
  type ForecastUnavailableReason,
} from '../cash-flow/forecast';
import { addDays } from '../cash-flow/calendar';
import { expandPlannedEvent } from '../cash-flow/planned-events';
import { streamMonthlyAmount } from '../cash-flow/recurring';
import type { CanonicalFact } from './canonical-facts';

/**
 * The `cash_flow_forecast` data pack: the same engine and the same figures the
 * Cash flow page shows, projected onto fixed windows a question can name.
 *
 * Grounding checks every number an answer states against the fact pack by
 * value, and the model may not add or net facts. So every figure an answer
 * could need is computed here -- observed so far, still expected, projected
 * total, and the same without the user's planned events -- and published as
 * its own fact. The pack's details carry dates, cadences and names, and point
 * at fact ids instead of repeating amounts.
 */
export type CashFlowForecastUnavailableReason = ForecastUnavailableReason | 'no_snapshot' | 'error';

export interface CashFlowForecastContext {
  status: 'available' | 'unavailable';
  reason?: CashFlowForecastUnavailableReason;
  today?: string;
  dataThrough?: string;
  forecastStart?: string;
  coverageStart?: string | null;
  highlights?: CashFlowHighlight[];
  baseline?: {
    typicalBasisDays: number;
    typicalMonthlyIncome: number;
    typicalMonthlySpending: number;
    incomeSource: 'transactions' | 'override';
    spendingSource: 'transactions' | 'override';
  };
  recurring?: Array<{
    id: string;
    label: string;
    flow: 'income' | 'spending';
    cadence: string;
    amount: number;
    monthlyAmount: number;
    nextDate: string | null;
  }>;
  plannedEvents?: Array<{
    id: string;
    label: string;
    kind: 'income' | 'expense';
    amount: number;
    startDate: string;
    recurrence: string;
    endDate: string | null;
    nextDate: string | null;
  }>;
  oneOffs?: Array<{ label: string; date: string; flow: 'income' | 'spending'; amount: number }>;
}

/** The pack names at most this many recurring items, largest monthly weight first. */
const MAX_RECURRING_ITEMS = 12;
const MAX_ONE_OFFS = 5;
const MAX_PLANNED_EVENTS = 25;
const DAYS_PER_MONTH = 365 / 12;

export function buildCashFlowForecastContext(model: CashFlowModel): CashFlowForecastContext {
  const scheduledNext = new Map<string, string>();
  for (const occurrence of model.scheduled) {
    const existing = scheduledNext.get(occurrence.streamId);
    if (!existing || occurrence.date < existing) scheduledNext.set(occurrence.streamId, occurrence.date);
  }
  const recurring = model.streams
    .filter(stream => scheduledNext.has(stream.id))
    .map(stream => ({
      id: stream.id,
      label: stream.label,
      flow: stream.flow,
      cadence: stream.cadence,
      amount: Math.round(stream.amount * 100) / 100,
      monthlyAmount: Math.round(streamMonthlyAmount(stream) * 100) / 100,
      nextDate: scheduledNext.get(stream.id) ?? null,
    }))
    .sort((left, right) => right.monthlyAmount - left.monthlyAmount)
    .slice(0, MAX_RECURRING_ITEMS);

  return {
    status: model.forecast.available ? 'available' : 'unavailable',
    ...(!model.forecast.available && { reason: model.forecast.reason }),
    today: model.today,
    dataThrough: model.dataThrough,
    forecastStart: model.forecastStart,
    coverageStart: model.coverageStart,
    highlights: buildCashFlowHighlights(model),
    baseline: {
      typicalBasisDays: model.typical.basisDays,
      typicalMonthlyIncome: Math.round(model.typical.dailyIncome * DAYS_PER_MONTH * 100) / 100,
      typicalMonthlySpending: Math.round(model.typical.dailySpending * DAYS_PER_MONTH * 100) / 100,
      incomeSource: model.typical.incomeSource,
      spendingSource: model.typical.spendingSource,
    },
    recurring,
    plannedEvents: model.plannedEvents.slice(0, MAX_PLANNED_EVENTS).map(event => ({
      id: event.id,
      label: event.label,
      kind: event.kind,
      amount: event.amount,
      startDate: event.startDate,
      recurrence: event.recurrence,
      endDate: event.endDate,
      nextDate: expandPlannedEvent(event, model.forecastStart, model.forecastEndLimit)[0] ?? null,
    })),
    oneOffs: model.oneOffs.slice(0, MAX_ONE_OFFS).map(entry => ({
      label: entry.label,
      date: entry.date,
      flow: entry.flow,
      amount: Math.round(entry.amount * 100) / 100,
    })),
  };
}

const WINDOW_NAMES: Record<CashFlowHighlightKey, string> = {
  this_month: 'this month',
  next_month: 'next month',
  this_quarter: 'this quarter',
  next_quarter: 'next quarter',
  this_year: 'this calendar year',
  next_3_months: 'the next 3 months',
  next_6_months: 'the next 6 months',
  next_12_months: 'the next 12 months',
};

const FLOW_WORDS: Record<keyof CashFlowTotals, string> = {
  income: 'income (cash in)',
  spending: 'spending (cash out)',
  net: 'net cash flow (income minus spending; positive is a surplus, negative a shortfall)',
};

export function cashFlowWindowLabel(highlight: Pick<CashFlowHighlight, 'key' | 'start' | 'endExclusive'>): string {
  return `${WINDOW_NAMES[highlight.key]} (${highlight.start} to ${addDays(highlight.endExclusive, -1)})`;
}

export function cashFlowFactId(key: CashFlowHighlightKey, part: string, measure: keyof CashFlowTotals): string {
  return `cash_flow_${key}_${part}_${measure}`;
}

/**
 * Canonical facts for the forecast pack. Observed amounts are snapshot facts;
 * everything projected carries `forecast` provenance and a caveat that says
 * what it is built from, so it cannot be quoted as an observed result.
 */
export function cashFlowForecastFacts(context: CashFlowForecastContext | undefined): CanonicalFact[] {
  if (!context?.highlights) return [];
  const facts = new Map<string, CanonicalFact>();
  const asOf = context.dataThrough;
  const basisDays = context.baseline?.typicalBasisDays ?? 0;
  const method = [
    'recurring income and bills found in the user’s transaction history, on their schedule',
    context.baseline?.incomeSource === 'override' || context.baseline?.spendingSource === 'override'
      ? 'the user’s own monthly income or spending figure where they set one'
      : null,
    basisDays > 0 ? `typical other spending over the last ${basisDays} days` : null,
    'the user’s saved planned events',
  ].filter(Boolean).join(', ');
  // One caveat is shared by every projection, so an answer can state it once.
  const caveat =
    `Projection, not an observed amount and not a guarantee. Built from ${method}; ` +
    'large one-off amounts in the history are not assumed to repeat.';

  const add = (fact: CanonicalFact) => {
    if (Number.isFinite(fact.value)) facts.set(fact.id, fact);
  };
  const observed = (id: string, label: string, value: number, source: string) => add({
    id, label, value, unit: 'usd', provenance: { kind: 'snapshot', source, ...(asOf && { asOf }) },
  });
  const forecast = (id: string, label: string, value: number, source: string, inputFactIds?: string[]) => add({
    id,
    label,
    value,
    unit: 'usd',
    caveat,
    provenance: {
      kind: 'forecast',
      source,
      ...(asOf && { asOf }),
      ...(inputFactIds && inputFactIds.every(inputId => facts.has(inputId)) && {
        formula: 'sum(inputs)',
        inputFactIds,
      }),
    },
  });

  const measures: Array<keyof CashFlowTotals> = ['income', 'spending', 'net'];
  for (const highlight of context.highlights) {
    if (!(CASH_FLOW_HIGHLIGHT_KEYS as readonly string[]).includes(highlight.key)) continue;
    const window = cashFlowWindowLabel(highlight);
    const source = `cashFlowForecast.highlights.${highlight.key}`;
    // In-progress windows start before the forecast; "still expected" is for
    // those even when history is missing (actualToDate null) so an override-only
    // forecast can still ground "how much can I expect this month?".
    const forecastStart = context.forecastStart;
    const windowInProgress = typeof forecastStart === 'string' && highlight.start < forecastStart;
    const hasObserved = highlight.actualToDate !== null;
    const partial = highlight.actualCoverage === 'partial';

    for (const measure of measures) {
      if (highlight.actualToDate) {
        observed(
          cashFlowFactId(highlight.key, 'so_far', measure),
          `Observed ${FLOW_WORDS[measure]} so far in ${window}, through ${asOf}` +
            (partial ? `; history starts ${context.coverageStart}, so this covers only part of the window` : ''),
          highlight.actualToDate[measure],
          `${source}.actualToDate.${measure}`
        );
      }
      if (highlight.remaining && windowInProgress) {
        forecast(
          cashFlowFactId(highlight.key, 'still_expected', measure),
          `Forecast ${FLOW_WORDS[measure]} still expected for the rest of ${window}, from ${context.forecastStart}`,
          highlight.remaining[measure],
          `${source}.remaining.${measure}`
        );
      }
      if (highlight.projected) {
        forecast(
          cashFlowFactId(highlight.key, 'projected', measure),
          hasObserved
            ? `Projected total ${FLOW_WORDS[measure]} for ${window}: observed so far plus forecast for the rest`
            : `Forecast ${FLOW_WORDS[measure]} for ${window}`,
          highlight.projected[measure],
          `${source}.projected.${measure}`,
          hasObserved
            ? [cashFlowFactId(highlight.key, 'so_far', measure), cashFlowFactId(highlight.key, 'still_expected', measure)]
            : undefined
        );
      }
    }

    // Planned events are reported apart from the baseline so an answer can say
    // what the user's own plans add or take away. Only windows they touch.
    if (Math.round(highlight.planned.net * 100) !== 0 || Math.round(highlight.planned.spending * 100) !== 0) {
      forecast(
        cashFlowFactId(highlight.key, 'planned_events', 'net'),
        `Net effect of the user’s saved planned events in ${window} (included in the forecast above)`,
        highlight.planned.net,
        `${source}.planned.net`
      );
      if (highlight.projectedWithoutPlanned) {
        forecast(
          cashFlowFactId(highlight.key, 'without_planned_events', 'net'),
          `Projected net cash flow for ${window} if none of the user’s planned events happened`,
          highlight.projectedWithoutPlanned.net,
          `${source}.projectedWithoutPlanned.net`
        );
      }
    }
  }

  if (context.status === 'available' && context.baseline) {
    if (context.baseline.spendingSource === 'transactions') {
      forecast(
        'cash_flow_typical_monthly_other_spending',
        `Typical monthly spending outside recurring bills, from the last ${basisDays} days, as the forecast spreads it`,
        context.baseline.typicalMonthlySpending,
        'cashFlowForecast.baseline.typicalMonthlySpending'
      );
    }
    if (context.baseline.incomeSource === 'transactions' && context.baseline.typicalMonthlyIncome >= 1) {
      forecast(
        'cash_flow_typical_monthly_other_income',
        `Typical monthly income outside recurring paychecks, from the last ${basisDays} days, as the forecast spreads it`,
        context.baseline.typicalMonthlyIncome,
        'cashFlowForecast.baseline.typicalMonthlyIncome'
      );
    }
  }

  (context.recurring ?? []).forEach((item, index) => {
    forecast(
      `cash_flow_recurring_${index + 1}_amount`,
      `Typical amount of recurring ${item.flow === 'income' ? 'income' : 'bill'} “${item.label}” each time (${item.cadence})`,
      item.amount,
      `cashFlowForecast.recurring.${index}.amount`
    );
  });

  (context.plannedEvents ?? []).forEach((event, index) => {
    add({
      id: `cash_flow_planned_event_${index + 1}_amount`,
      label: `User-entered planned ${event.kind === 'income' ? 'income (money in)' : 'expense (money out)'} “${event.label}”, ` +
        (event.recurrence === 'once' ? `once on ${event.startDate}` : `${event.recurrence} from ${event.startDate}`),
      value: event.amount,
      unit: 'usd',
      provenance: { kind: 'user_input', source: `cashFlowForecast.plannedEvents.${index}.amount` },
    });
  });

  (context.oneOffs ?? []).forEach((item, index) => {
    observed(
      `cash_flow_one_off_${index + 1}_amount`,
      `One-off ${item.flow === 'income' ? 'income' : 'spending'} “${item.label}” on ${item.date}, left out of the forecast as non-recurring`,
      item.amount,
      `cashFlowForecast.oneOffs.${index}.amount`
    );
  });

  return Array.from(facts.values());
}

/**
 * The pack's details: what the forecast is built from and when things happen.
 * Amounts are given as the ids of the facts that hold them.
 */
export function compactCashFlowForecastDetails(context: CashFlowForecastContext): Record<string, unknown> {
  if (context.status === 'unavailable' && !context.highlights) {
    return { status: context.status, reason: context.reason };
  }
  return {
    status: context.status,
    ...(context.reason && { reason: context.reason }),
    today: context.today,
    transactionsThrough: context.dataThrough,
    forecastFrom: context.forecastStart,
    historyStarts: context.coverageStart,
    scope: 'Checking, savings and credit card accounts. Investment accounts and loans are excluded.',
    windows: (context.highlights ?? []).map(highlight => ({
      window: cashFlowWindowLabel(highlight),
      factIdPrefix: `cash_flow_${highlight.key}_`,
      ...(highlight.actualCoverage === 'partial' && { historyCoversOnlyPartOfWindow: true }),
    })),
    recurring: (context.recurring ?? []).map((item, index) => ({
      label: item.label,
      kind: item.flow === 'income' ? 'income' : 'bill',
      cadence: item.cadence,
      nextDate: item.nextDate,
      amountFactId: `cash_flow_recurring_${index + 1}_amount`,
    })),
    plannedEvents: (context.plannedEvents ?? []).map((event, index) => ({
      label: event.label,
      kind: event.kind,
      recurrence: event.recurrence,
      startDate: event.startDate,
      endDate: event.endDate,
      nextDate: event.nextDate,
      amountFactId: `cash_flow_planned_event_${index + 1}_amount`,
    })),
    oneOffsLeftOut: (context.oneOffs ?? []).map((item, index) => ({
      label: item.label,
      date: item.date,
      amountFactId: `cash_flow_one_off_${index + 1}_amount`,
    })),
  };
}
