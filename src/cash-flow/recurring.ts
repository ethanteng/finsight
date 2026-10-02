import {
  addDays,
  addMonths,
  dayOfMonth,
  daysBetween,
  startOfMonth,
  type CalendarDate,
} from './calendar';
import type { CashFlowDirection, CashFlowEntry } from './ledger';

/**
 * Recurring income and bills, recognized from the user's own history.
 *
 * Plaid sells this as a separate add-on; doing it here keeps the forecast
 * deterministic and explainable, and every stream it finds is shown to the user
 * with its cadence and amount. Annual charges are not recognized: a year of
 * history shows them once, which is no pattern at all, so they fall into
 * typical spending as a daily rate instead.
 */
export const RECURRING_CADENCES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly'] as const;
export type RecurringCadence = (typeof RECURRING_CADENCES)[number];

interface CadenceRule {
  /** Typical spacing in days. */
  nominalDays: number;
  /** Gaps inside this range (inclusive) count as on schedule. */
  band: readonly [number, number];
  /** Repeats needed when amounts vary; consistent amounts need only two. */
  minOccurrences: number;
  /** How late an occurrence may be and still be expected. */
  graceDays: number;
}

const CADENCE_RULES: Record<RecurringCadence, CadenceRule> = {
  weekly: { nominalDays: 7, band: [5, 9], minOccurrences: 4, graceDays: 3 },
  biweekly: { nominalDays: 14, band: [12, 16], minOccurrences: 3, graceDays: 4 },
  semimonthly: { nominalDays: 15, band: [10, 20], minOccurrences: 4, graceDays: 4 },
  monthly: { nominalDays: 30, band: [25, 36], minOccurrences: 3, graceDays: 6 },
  quarterly: { nominalDays: 91, band: [80, 102], minOccurrences: 3, graceDays: 10 },
};

/** Amounts within this ratio of each other read as one fixed charge. */
const CONSISTENT_AMOUNT_RATIO = 1.1;
/** Above this coefficient of variation a series is too erratic to schedule. */
const MAX_AMOUNT_VARIATION = 0.75;
/** A day-of-month at or past this is treated as "the last day of the month". */
const MONTH_END_DAY = 29;

export interface RecurringStream {
  /** Stable for a payee and direction, so the UI can key on it. */
  id: string;
  label: string;
  flow: CashFlowDirection;
  cadence: RecurringCadence;
  /** Typical amount per occurrence: the median of the latest three. */
  amount: number;
  occurrences: number;
  firstDate: CalendarDate;
  lastDate: CalendarDate;
  /** Day-of-month anchors for date-based cadences; 31 means the last day. */
  anchorDays: number[];
  category: string;
  /** Lapsed streams stopped before the data ends and are not projected. */
  status: 'active' | 'lapsed';
  entryIds: string[];
  /** Where the latest occurrence posted, which is where the next is expected. */
  accountId: string;
}

interface Occurrence {
  date: CalendarDate;
  amount: number;
  entryIds: string[];
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function coefficientOfVariation(values: readonly number[]): number {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  if (mean === 0) return Infinity;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function normalizedDayOfMonth(date: CalendarDate): number {
  const day = dayOfMonth(date);
  return day >= MONTH_END_DAY ? 31 : day;
}

/** Two tight day-of-month clusters about half a month apart: the 1st and 15th, the 15th and last. */
function semimonthlyAnchors(occurrences: readonly Occurrence[]): number[] | null {
  if (occurrences.length < 4) return null;
  const days = occurrences.map(occurrence => normalizedDayOfMonth(occurrence.date)).sort((a, b) => a - b);
  for (let split = 2; split <= days.length - 2; split += 1) {
    const low = days.slice(0, split);
    const high = days.slice(split);
    const spread = (cluster: number[]) => cluster[cluster.length - 1] - cluster[0];
    if (spread(low) > 6 || spread(high) > 6) continue;
    const anchors = [Math.round(median(low)), Math.round(median(high))];
    const separation = anchors[1] - anchors[0];
    if (separation >= 10 && separation <= 20) return anchors;
  }
  return null;
}

function classifyCadence(occurrences: readonly Occurrence[], gaps: readonly number[]): {
  cadence: RecurringCadence;
  anchorDays: number[];
} | null {
  const typicalGap = median(gaps);
  const days = occurrences.map(occurrence => normalizedDayOfMonth(occurrence.date));
  const inBand = (cadence: RecurringCadence) =>
    typicalGap >= CADENCE_RULES[cadence].band[0] && typicalGap <= CADENCE_RULES[cadence].band[1];

  if (inBand('weekly')) return { cadence: 'weekly', anchorDays: [] };
  if (inBand('semimonthly')) {
    // A biweekly paycheck lands two weeks apart and drifts through the month;
    // a semimonthly one returns to the same two days. Only the second has
    // anchors, so it is checked first.
    const anchors = semimonthlyAnchors(occurrences);
    if (anchors) return { cadence: 'semimonthly', anchorDays: anchors };
    if (inBand('biweekly')) return { cadence: 'biweekly', anchorDays: [] };
    return null;
  }
  if (inBand('monthly')) return { cadence: 'monthly', anchorDays: [Math.round(median(days))] };
  if (inBand('quarterly')) return { cadence: 'quarterly', anchorDays: [Math.round(median(days))] };
  return null;
}

function streamId(flow: CashFlowDirection, key: string): string {
  return `${flow}:${key.replace(/\s+/g, '-')}`;
}

function evaluateGroup(
  flow: CashFlowDirection,
  key: string,
  entries: readonly CashFlowEntry[],
  dataThrough: CalendarDate
): RecurringStream | null {
  // One payee can post twice on one day (a split direct deposit); that is one occurrence.
  const byDate = new Map<CalendarDate, Occurrence>();
  for (const entry of entries) {
    const existing = byDate.get(entry.date);
    if (existing) {
      existing.amount += entry.amount;
      existing.entryIds.push(entry.id);
    } else {
      byDate.set(entry.date, { date: entry.date, amount: entry.amount, entryIds: [entry.id] });
    }
  }
  const occurrences = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  if (occurrences.length < 2) return null;

  const gaps = occurrences.slice(1).map((occurrence, index) => daysBetween(occurrences[index].date, occurrence.date));
  const classified = classifyCadence(occurrences, gaps);
  if (!classified) return null;
  const rule = CADENCE_RULES[classified.cadence];

  const offSchedule = gaps.filter(gap => gap < rule.band[0] || gap > rule.band[1]).length;
  if (offSchedule > Math.floor(gaps.length / 4)) return null;

  const amounts = occurrences.map(occurrence => occurrence.amount);
  if (coefficientOfVariation(amounts) > MAX_AMOUNT_VARIATION) return null;
  const consistentAmounts = Math.max(...amounts) <= Math.min(...amounts) * CONSISTENT_AMOUNT_RATIO;
  if (occurrences.length < rule.minOccurrences && !(consistentAmounts && offSchedule === 0)) return null;

  const latest = occurrences[occurrences.length - 1];
  const lapsedAfter = Math.ceil(rule.nominalDays * 1.5) + rule.graceDays;
  const first = entries[0];
  return {
    id: streamId(flow, key),
    label: entries[entries.length - 1].label,
    flow,
    cadence: classified.cadence,
    amount: median(amounts.slice(-3)),
    occurrences: occurrences.length,
    firstDate: occurrences[0].date,
    lastDate: latest.date,
    anchorDays: classified.anchorDays,
    category: first.category,
    status: daysBetween(latest.date, dataThrough) > lapsedAfter ? 'lapsed' : 'active',
    entryIds: occurrences.flatMap(occurrence => occurrence.entryIds),
    accountId: entries[entries.length - 1].accountId,
  };
}

/**
 * Find recurring streams among entries dated on or before `dataThrough`.
 * Refunds and other negative entries never form a stream.
 */
export function detectRecurringStreams(
  entries: readonly CashFlowEntry[],
  dataThrough: CalendarDate
): RecurringStream[] {
  const groups = new Map<string, { flow: CashFlowDirection; key: string; entries: CashFlowEntry[] }>();
  for (const entry of entries) {
    if (entry.amount <= 0 || !entry.counterpartyKey || entry.date > dataThrough) continue;
    const groupKey = `${entry.flow}|${entry.counterpartyKey}`;
    const group = groups.get(groupKey) ?? { flow: entry.flow, key: entry.counterpartyKey, entries: [] };
    group.entries.push(entry);
    groups.set(groupKey, group);
  }

  const streams: RecurringStream[] = [];
  for (const group of groups.values()) {
    group.entries.sort((left, right) => left.date.localeCompare(right.date));
    const stream = evaluateGroup(group.flow, group.key, group.entries, dataThrough);
    if (stream) streams.push(stream);
  }
  return streams.sort((left, right) => right.amount - left.amount || left.id.localeCompare(right.id));
}

function anchorDate(monthStart: CalendarDate, anchorDay: number): CalendarDate {
  return addMonths(monthStart, 0, anchorDay);
}

/** Every `stepDays` after the last occurrence. */
function* intervalDates(lastDate: CalendarDate, stepDays: number): Generator<CalendarDate> {
  for (let date = addDays(lastDate, stepDays); ; date = addDays(date, stepDays)) yield date;
}

/**
 * The stream's anchor days, every `stepMonths` months. A date-based payment
 * that lands early or late still belongs to its own cycle, so the next one is
 * the first anchor at least half a cycle after the previous occurrence.
 */
function* anchoredDates(stream: RecurringStream, stepMonths: number, minimumSpacing: number): Generator<CalendarDate> {
  let previous = stream.lastDate;
  for (let monthStart = startOfMonth(stream.lastDate); ; monthStart = addMonths(monthStart, stepMonths, 1)) {
    for (const day of stream.anchorDays) {
      const date = anchorDate(monthStart, day);
      if (daysBetween(previous, date) >= minimumSpacing) {
        previous = date;
        yield date;
      }
    }
  }
}

/** Expected dates after the last occurrence, in order and without end. */
function expectedDates(stream: RecurringStream): Generator<CalendarDate> {
  const { nominalDays } = CADENCE_RULES[stream.cadence];
  switch (stream.cadence) {
    case 'weekly':
    case 'biweekly':
      return intervalDates(stream.lastDate, nominalDays);
    case 'semimonthly':
    case 'monthly':
      return anchoredDates(stream, 1, Math.ceil(nominalDays / 2));
    case 'quarterly':
      return anchoredDates(stream, 3, Math.ceil(nominalDays / 2));
  }
}

/**
 * Occurrences of an active stream in `[forecastStart, endExclusive)`. One that
 * was due shortly before the forecast starts and has not posted yet is still
 * expected, so it lands on the first forecast day; one overdue by more than
 * the cadence's grace is treated as missed rather than piled onto that day.
 */
export function scheduleStream(
  stream: RecurringStream,
  forecastStart: CalendarDate,
  endExclusive: CalendarDate
): Array<{ date: CalendarDate; amount: number }> {
  if (stream.status !== 'active' || forecastStart >= endExclusive) return [];
  const { graceDays } = CADENCE_RULES[stream.cadence];
  const scheduled: Array<{ date: CalendarDate; amount: number }> = [];
  for (const expected of expectedDates(stream)) {
    if (expected >= endExclusive) break;
    if (expected < forecastStart) {
      if (daysBetween(expected, forecastStart) <= graceDays) {
        scheduled.push({ date: forecastStart, amount: stream.amount });
      }
      continue;
    }
    scheduled.push({ date: expected, amount: stream.amount });
  }
  return scheduled;
}

/** Average amount per month, from the cadence: biweekly is 26 a year, not 24. */
export function streamMonthlyAmount(stream: RecurringStream): number {
  const perYear: Record<RecurringCadence, number> = {
    weekly: 52,
    biweekly: 26,
    semimonthly: 24,
    monthly: 12,
    quarterly: 4,
  };
  return (stream.amount * perYear[stream.cadence]) / 12;
}
