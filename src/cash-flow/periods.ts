import {
  addDays,
  addMonths,
  maxDate,
  minDate,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  type CalendarDate,
} from './calendar';

export const CASH_FLOW_GRANULARITIES = ['week', 'month', 'quarter', 'year'] as const;
export type CashFlowGranularity = (typeof CASH_FLOW_GRANULARITIES)[number];

export function isCashFlowGranularity(value: unknown): value is CashFlowGranularity {
  return typeof value === 'string' && (CASH_FLOW_GRANULARITIES as readonly string[]).includes(value);
}

export interface PeriodBounds {
  /** Stable identifier: the week's Monday, `YYYY-MM`, `YYYY-Qn`, or `YYYY`. */
  key: string;
  /** Inclusive. */
  start: CalendarDate;
  /** Exclusive. */
  endExclusive: CalendarDate;
  /** True when a requested range cut the calendar period short. */
  clipped: boolean;
}

export function periodStart(date: CalendarDate, granularity: CashFlowGranularity): CalendarDate {
  switch (granularity) {
    case 'week': return startOfWeek(date);
    case 'month': return startOfMonth(date);
    case 'quarter': return startOfQuarter(date);
    case 'year': return startOfYear(date);
  }
}

export function nextPeriodStart(start: CalendarDate, granularity: CashFlowGranularity): CalendarDate {
  switch (granularity) {
    case 'week': return addDays(start, 7);
    case 'month': return addMonths(start, 1, 1);
    case 'quarter': return addMonths(start, 3, 1);
    case 'year': return addMonths(start, 12, 1);
  }
}

export function periodKey(start: CalendarDate, granularity: CashFlowGranularity): string {
  switch (granularity) {
    case 'week': return start;
    case 'month': return start.slice(0, 7);
    case 'quarter': return `${start.slice(0, 4)}-Q${Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1}`;
    case 'year': return start.slice(0, 4);
  }
}

/** The first day after the calendar period that contains `date`. */
export function periodEndExclusive(date: CalendarDate, granularity: CashFlowGranularity): CalendarDate {
  return nextPeriodStart(periodStart(date, granularity), granularity);
}

/**
 * Every calendar period overlapping `[from, toExclusive)`, clipped to it. Only
 * the first and last can be clipped; a range on period boundaries clips none.
 */
export function enumeratePeriods(
  from: CalendarDate,
  toExclusive: CalendarDate,
  granularity: CashFlowGranularity
): PeriodBounds[] {
  const periods: PeriodBounds[] = [];
  let cursor = periodStart(from, granularity);
  while (cursor < toExclusive) {
    const next = nextPeriodStart(cursor, granularity);
    const start = maxDate(cursor, from);
    const endExclusive = minDate(next, toExclusive);
    periods.push({
      key: periodKey(cursor, granularity),
      start,
      endExclusive,
      clipped: start !== cursor || endExclusive !== next,
    });
    cursor = next;
  }
  return periods;
}
