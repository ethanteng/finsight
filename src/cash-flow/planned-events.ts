import { addDays, addMonths, isCalendarDate, type CalendarDate } from './calendar';

/**
 * Money the user expects to come in or go out that their history cannot show:
 * a bonus, a tuition bill, a planned purchase. Stored events are part of the
 * user's own forecast; hypothetical "what if" amounts asked about in chat are
 * not, and are never written here.
 *
 * `kind` decides the effect. Income adds to cash in and expense to cash out.
 * Card payments will join as their own kind with the cash-position view: they
 * move money between the user's accounts, so they change balances but never
 * savings.
 */
export const PLANNED_EVENT_KINDS = ['income', 'expense'] as const;
export type PlannedEventKind = (typeof PLANNED_EVENT_KINDS)[number];

export const PLANNED_EVENT_RECURRENCES = ['once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually'] as const;
export type PlannedEventRecurrence = (typeof PLANNED_EVENT_RECURRENCES)[number];

export const PLANNED_EVENT_LABEL_MAX_LENGTH = 80;
export const PLANNED_EVENT_MAX_AMOUNT = 100_000_000;
export const PLANNED_EVENTS_PER_USER_LIMIT = 100;

export interface PlannedCashFlowEvent {
  id: string;
  label: string;
  kind: PlannedEventKind;
  /** Positive magnitude in the reporting currency. */
  amount: number;
  startDate: CalendarDate;
  recurrence: PlannedEventRecurrence;
  /** Last day a recurring event can occur, inclusive. Always null for `once`. */
  endDate: CalendarDate | null;
}

export type PlannedEventInput = Omit<PlannedCashFlowEvent, 'id'>;

export type PlannedEventValidation =
  | { ok: true; value: PlannedEventInput }
  | { ok: false; error: string };

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function validatePlannedEventInput(raw: unknown): PlannedEventValidation {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Event details are required' };
  const body = raw as Record<string, unknown>;

  const label = typeof body.label === 'string' ? body.label.replace(/\s+/g, ' ').trim() : '';
  if (!label) return { ok: false, error: 'Give the event a name' };
  if (label.length > PLANNED_EVENT_LABEL_MAX_LENGTH) {
    return { ok: false, error: `Keep the name under ${PLANNED_EVENT_LABEL_MAX_LENGTH} characters` };
  }

  if (!isOneOf(PLANNED_EVENT_KINDS, body.kind)) {
    return { ok: false, error: 'Choose whether the event is money in or money out' };
  }

  const amount = typeof body.amount === 'number' ? body.amount : Number.NaN;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Enter an amount greater than zero' };
  if (amount > PLANNED_EVENT_MAX_AMOUNT) return { ok: false, error: 'That amount is too large' };

  if (!isCalendarDate(body.startDate)) return { ok: false, error: 'Enter a valid date' };

  const recurrence = body.recurrence ?? 'once';
  if (!isOneOf(PLANNED_EVENT_RECURRENCES, recurrence)) return { ok: false, error: 'Choose how often it happens' };

  let endDate: CalendarDate | null = null;
  if (recurrence !== 'once' && body.endDate !== undefined && body.endDate !== null && body.endDate !== '') {
    if (!isCalendarDate(body.endDate)) return { ok: false, error: 'Enter a valid end date' };
    if (body.endDate < body.startDate) return { ok: false, error: 'The end date must be on or after the start date' };
    endDate = body.endDate;
  }

  return {
    ok: true,
    value: {
      label,
      kind: body.kind,
      amount: Math.round(amount * 100) / 100,
      startDate: body.startDate,
      recurrence,
      endDate,
    },
  };
}

function occurrenceAt(event: PlannedCashFlowEvent, index: number): CalendarDate {
  switch (event.recurrence) {
    case 'once': return event.startDate;
    case 'weekly': return addDays(event.startDate, 7 * index);
    case 'biweekly': return addDays(event.startDate, 14 * index);
    // Months step from the start date each time, so a 31st recurs on the last
    // day of shorter months and returns to the 31st afterwards.
    case 'monthly': return addMonths(event.startDate, index);
    case 'quarterly': return addMonths(event.startDate, 3 * index);
    case 'annually': return addMonths(event.startDate, 12 * index);
  }
}

/** The event's occurrences in `[from, toExclusive)`, oldest first. */
export function expandPlannedEvent(
  event: PlannedCashFlowEvent,
  from: CalendarDate,
  toExclusive: CalendarDate
): CalendarDate[] {
  const dates: CalendarDate[] = [];
  for (let index = 0; ; index += 1) {
    const date = occurrenceAt(event, index);
    if (date >= toExclusive || (event.endDate && date > event.endDate)) break;
    if (date >= from) dates.push(date);
    if (event.recurrence === 'once') break;
  }
  return dates;
}

/** Signed effect on net cash flow: income adds, expenses subtract. */
export function plannedEventNetEffect(event: Pick<PlannedCashFlowEvent, 'kind' | 'amount'>): number {
  return event.kind === 'income' ? event.amount : -event.amount;
}
