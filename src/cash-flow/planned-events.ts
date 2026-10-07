import { addDays, addMonths, isCalendarDate, type CalendarDate } from './calendar';

/**
 * Money the user expects to come in or go out that their history cannot show:
 * a bonus, a tuition bill, a planned purchase. Stored events are part of the
 * user's own forecast; hypothetical "what if" amounts asked about in chat are
 * not, and are never written here.
 *
 * `kind` decides the effect. Income adds to cash in and expense to cash out.
 * A transfer moves money from one of the user's cash accounts to another, say
 * checking to savings: it changes what each account holds, never what the user
 * saves. A card payment moves money from the user's cash to one of their
 * credit cards, so it changes balances and the interest the card charges, but
 * it is never income or spending itself.
 */
export const PLANNED_EVENT_KINDS = ['income', 'expense', 'transfer', 'card_payment'] as const;
export type PlannedEventKind = (typeof PLANNED_EVENT_KINDS)[number];

/**
 * How a card payment is sized. `full` pays what the card is owed: once, it
 * clears the whole balance; every month, it pays each statement in full.
 * `fixed` pays the event's amount: once, on top of the usual payment; every
 * month, in place of it.
 */
export const CARD_PAYMENT_MODES = ['full', 'fixed'] as const;
export type CardPaymentMode = (typeof CARD_PAYMENT_MODES)[number];

/** A card plan is a single payment or a monthly one; other cadences do not match a card's cycle. */
export const CARD_PAYMENT_RECURRENCES = ['once', 'monthly'] as const;

export const PLANNED_EVENT_RECURRENCES = [
  'once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannually', 'annually', 'custom',
] as const;
export type PlannedEventRecurrence = (typeof PLANNED_EVENT_RECURRENCES)[number];

/** The unit of a custom recurrence: "every 3 weeks", "every 10 days". */
export const REPEAT_UNITS = ['day', 'week', 'month', 'year'] as const;
export type RepeatUnit = (typeof REPEAT_UNITS)[number];
export const REPEAT_EVERY_MAX = 99;

export const PLANNED_EVENT_LABEL_MAX_LENGTH = 80;
const ACCOUNT_ID_MAX_LENGTH = 200;
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
  /** For a custom recurrence, how many units apart occurrences fall; null for every other recurrence. */
  repeatEvery: number | null;
  repeatUnit: RepeatUnit | null;
  /**
   * For a card payment, the credit card it pays. For a transfer, the cash
   * account it leaves. For income or an expense, the cash account it lands in,
   * or null to leave it to the primary account.
   */
  accountId: string | null;
  /** For a transfer, the cash account it goes to; null for every other kind. */
  toAccountId: string | null;
  /** How a card payment is sized; null for every other kind. */
  paymentMode: CardPaymentMode | null;
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
    return { ok: false, error: 'Choose whether the event is money in, money out, a transfer or a card payment' };
  }
  const kind = body.kind;

  let accountId: string | null = null;
  let toAccountId: string | null = null;
  let paymentMode: CardPaymentMode | null = null;
  if ((kind === 'income' || kind === 'expense') && body.accountId !== undefined && body.accountId !== null && body.accountId !== '') {
    accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
    if (!accountId || accountId.length > ACCOUNT_ID_MAX_LENGTH) return { ok: false, error: 'Choose one of your accounts' };
  }
  if (kind === 'transfer') {
    accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
    if (!accountId || accountId.length > ACCOUNT_ID_MAX_LENGTH) return { ok: false, error: 'Choose the account the money leaves' };
    toAccountId = typeof body.toAccountId === 'string' ? body.toAccountId.trim() : '';
    if (!toAccountId || toAccountId.length > ACCOUNT_ID_MAX_LENGTH) return { ok: false, error: 'Choose the account the money goes to' };
    if (toAccountId === accountId) return { ok: false, error: 'Choose two different accounts' };
  }
  if (kind === 'card_payment') {
    accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
    if (!accountId || accountId.length > ACCOUNT_ID_MAX_LENGTH) return { ok: false, error: 'Choose a credit card to pay' };
    if (!isOneOf(CARD_PAYMENT_MODES, body.paymentMode)) {
      return { ok: false, error: 'Choose whether to pay the card in full or a set amount' };
    }
    paymentMode = body.paymentMode;
  }

  // Paying a card in full is sized by the balance, not by the event.
  let amount = 0;
  if (paymentMode !== 'full') {
    amount = typeof body.amount === 'number' ? body.amount : Number.NaN;
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Enter an amount greater than zero' };
    if (amount > PLANNED_EVENT_MAX_AMOUNT) return { ok: false, error: 'That amount is too large' };
  }

  if (!isCalendarDate(body.startDate)) return { ok: false, error: 'Enter a valid date' };

  const recurrence = body.recurrence ?? 'once';
  if (!isOneOf(PLANNED_EVENT_RECURRENCES, recurrence)) return { ok: false, error: 'Choose how often it happens' };
  if (kind === 'card_payment' && !isOneOf(CARD_PAYMENT_RECURRENCES, recurrence)) {
    return { ok: false, error: 'A card payment happens once or every month' };
  }

  let repeatEvery: number | null = null;
  let repeatUnit: RepeatUnit | null = null;
  if (recurrence === 'custom') {
    if (!Number.isInteger(body.repeatEvery) || (body.repeatEvery as number) < 1 || (body.repeatEvery as number) > REPEAT_EVERY_MAX) {
      return { ok: false, error: `Repeat every 1 to ${REPEAT_EVERY_MAX} days, weeks, months or years` };
    }
    if (!isOneOf(REPEAT_UNITS, body.repeatUnit)) return { ok: false, error: 'Choose days, weeks, months or years' };
    repeatEvery = body.repeatEvery as number;
    repeatUnit = body.repeatUnit;
  }

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
      kind,
      amount: Math.round(amount * 100) / 100,
      startDate: body.startDate,
      recurrence,
      endDate,
      repeatEvery,
      repeatUnit,
      accountId,
      toAccountId,
      paymentMode,
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
    case 'semiannually': return addMonths(event.startDate, 6 * index);
    case 'annually': return addMonths(event.startDate, 12 * index);
    case 'custom': {
      // Saved without its interval only by a bug; once is the safe reading.
      const every = event.repeatEvery ?? 0;
      switch (event.repeatUnit) {
        case 'day': return addDays(event.startDate, every * index);
        case 'week': return addDays(event.startDate, 7 * every * index);
        case 'month': return addMonths(event.startDate, every * index);
        case 'year': return addMonths(event.startDate, 12 * every * index);
        default: return event.startDate;
      }
    }
  }
}

/** True when the event can occur more than once. */
function repeats(event: PlannedCashFlowEvent): boolean {
  if (event.recurrence === 'custom') return Boolean(event.repeatEvery && event.repeatUnit);
  return event.recurrence !== 'once';
}

/**
 * The recurrence in words, for the model and for anything else that reads it
 * as text: "monthly", "semiannually", "every 3 weeks".
 */
export function describeRecurrence(event: Pick<PlannedCashFlowEvent, 'recurrence' | 'repeatEvery' | 'repeatUnit'>): string {
  if (event.recurrence !== 'custom') return event.recurrence;
  // Without its interval it is expanded as happening once, so it is described that way too.
  if (!event.repeatEvery || !event.repeatUnit) return 'once';
  return event.repeatEvery === 1 ? `every ${event.repeatUnit}` : `every ${event.repeatEvery} ${event.repeatUnit}s`;
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
    if (!repeats(event)) break;
  }
  return dates;
}

/**
 * Signed effect on net cash flow: income adds, expenses subtract. A transfer
 * or a card payment moves money between the user's own accounts, so it has
 * none; what a card payment changes is the card's balance and the interest
 * charged on it.
 */
export function plannedEventNetEffect(event: Pick<PlannedCashFlowEvent, 'kind' | 'amount'>): number {
  if (event.kind === 'card_payment' || event.kind === 'transfer') return 0;
  return event.kind === 'income' ? event.amount : -event.amount;
}
