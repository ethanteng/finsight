import { addDays, isCalendarDate, type CalendarDate } from './calendar';

/**
 * Upcoming items the user says have already happened: a paycheck already in
 * the balance while the bank still shows it pending, a bill paid early, a
 * planned transfer already made.
 *
 * A mark skips the item. The user is saying their live balance already has
 * it, so the forecast counts it nowhere: not on its date, and not on the first
 * forecast day either. Counting it again would count it twice. Only the user
 * can say this -- whether a provider's reported balance includes pending
 * transactions varies by bank -- so the forecast takes their word for it.
 *
 * A regular item or transfer that posts ends its own cycle, so its mark then
 * names nothing and does nothing. A mark for a planned event or a card's
 * payment day keeps skipping that one occurrence until its date has passed.
 *
 * A mark changes when cash moves, never what is earned or spent: savings still
 * count a marked paycheck in the period it was expected.
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
   * planned transfer, the amount it moves between the two accounts. The list
   * of skipped items shows it, since what the item is projected at can change
   * once the data refreshes.
   */
  amount: number;
}

export const HAPPENED_MARKS_PER_USER_LIMIT = 100;

/**
 * Marks for days longer ago than this name nothing the forecast can still
 * expect -- the longest grace a late regular item gets is ten days -- and are
 * removed when the user saves another.
 */
export const HAPPENED_MARK_RETENTION_DAYS = 45;

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

/** The day before which a mark can be removed: it names nothing the forecast can still expect. */
export function happenedMarkCutoff(today: CalendarDate): CalendarDate {
  return addDays(today, -HAPPENED_MARK_RETENTION_DAYS);
}
