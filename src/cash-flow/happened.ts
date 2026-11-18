import { addDays, isCalendarDate, type CalendarDate } from './calendar';

/**
 * Upcoming items the user says have already happened: a paycheck that is
 * pending at the bank, a bill paid early, a planned transfer already made.
 *
 * The forecast starts from the balance the provider last reported, and
 * Plaid's reported balance for a checking or savings account leaves pending
 * transactions out, as the ledger does. So an item that has happened since
 * that balance -- or is still pending -- is neither in the balance nor in the
 * history, and the forecast still expects it on its date. A mark moves it to
 * the first forecast day instead: it has happened, and the balance the
 * forecast starts from does not have it yet.
 *
 * Once the data shows the item posted, the balance has it, and the mark only
 * keeps it from being counted again. A regular item or transfer that posts
 * also ends its own cycle, so its mark then names nothing and does nothing.
 *
 * A mark changes when cash moves, never what is earned or spent: savings still
 * count a marked paycheck in the period it was expected.
 *
 * A mark keeps the amount the item had when it was marked, and the position
 * counts and reconciles that amount rather than whatever the item is projected
 * at now. A card paid early is the case that needs it: once the payment posts,
 * the card's lower balance projects a smaller payment for the same day, which
 * is not the payment that happened.
 *
 * An item is named by what produces it and the day it was expected:
 *
 *   stream   -- a regular income or bill, by stream id and the due date of
 *               its cycle (which stays the same if it is late);
 *   transfer -- a recurring transfer, likewise;
 *   card     -- everything a card is paid on one day, by the card's account id;
 *   planned  -- one occurrence of a planned event, by the event's id.
 */
export const HAPPENED_SOURCES = ['stream', 'transfer', 'card', 'planned'] as const;
export type HappenedSource = (typeof HAPPENED_SOURCES)[number];

export interface OccurrenceRef {
  source: HappenedSource;
  /** A regular item's or transfer's stream id, a card's account id, or a planned event's id. */
  sourceId: string;
  /** The day the item was expected. */
  date: CalendarDate;
}

export interface HappenedMark extends OccurrenceRef {
  id: string;
  /** What the item was called when the user marked it. */
  label: string;
  /**
   * How much it moved when the user marked it, as a positive amount; for a
   * planned transfer, the amount it moves between the two accounts. This is
   * what happened, so it is what the position counts and what a posted
   * transaction must match: a projection can change once the data refreshes,
   * as a card paid early is projected a smaller payment for that day.
   */
  amount: number;
  /** The user's calendar date when they marked it. */
  markedOn: CalendarDate;
}

export const HAPPENED_MARKS_PER_USER_LIMIT = 100;

/**
 * Marks for days longer ago than this name nothing the forecast can still
 * expect -- the longest grace a late regular item gets is ten days -- and are
 * removed when the user saves another.
 */
export const HAPPENED_MARK_RETENTION_DAYS = 45;

/**
 * How long before the mark a posted transaction can be dated and still be the
 * item: a bank posts a few days after the money moves, and the user may mark
 * it a day or two after seeing it.
 */
export const POSTED_LOOKBACK_DAYS = 3;

/**
 * How far a posted amount may be from the expected one and still be the item.
 * A planned expense is an estimate, and a card paid in full is paid the
 * statement, not the balance the forecast started from.
 */
export const POSTED_AMOUNT_TOLERANCE = 0.1;

const SOURCE_ID_MAX_LENGTH = 300;

export type OccurrenceRefValidation =
  | { ok: true; value: OccurrenceRef }
  | { ok: false; error: string };

export function validateOccurrenceRef(raw: unknown): OccurrenceRefValidation {
  const invalid = { ok: false as const, error: 'Choose an item that’s coming up' };
  if (!raw || typeof raw !== 'object') return invalid;
  const body = raw as Record<string, unknown>;
  if (typeof body.source !== 'string' || !(HAPPENED_SOURCES as readonly string[]).includes(body.source)) return invalid;
  const sourceId = typeof body.sourceId === 'string' ? body.sourceId.trim() : '';
  if (!sourceId || sourceId.length > SOURCE_ID_MAX_LENGTH) return invalid;
  if (typeof body.date !== 'string' || !isCalendarDate(body.date)) return invalid;
  return { ok: true, value: { source: body.source as HappenedSource, sourceId, date: body.date } };
}

/** One key per item, the way a mark names it. */
export function occurrenceKey(ref: OccurrenceRef): string {
  return `${ref.source}|${ref.sourceId}|${ref.date}`;
}

/** The earliest a posted transaction can be dated and still be the item the user marked. */
export function postedSince(mark: Pick<HappenedMark, 'markedOn'>): CalendarDate {
  return addDays(mark.markedOn, -POSTED_LOOKBACK_DAYS);
}

/** Whether a posted amount is close enough to the expected one to be the item. */
export function amountMatches(posted: number, expected: number): boolean {
  if (Math.sign(posted) !== Math.sign(expected)) return false;
  return Math.abs(posted - expected) <= Math.max(1, Math.abs(expected) * POSTED_AMOUNT_TOLERANCE);
}

/** The day before which a mark can be removed: it names nothing the forecast can still expect. */
export function happenedMarkCutoff(today: CalendarDate): CalendarDate {
  return addDays(today, -HAPPENED_MARK_RETENTION_DAYS);
}
