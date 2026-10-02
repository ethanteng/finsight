/**
 * Calendar-date arithmetic on `YYYY-MM-DD` strings.
 *
 * Provider transaction dates are calendar dates, and the truth contract reads a
 * date-only value as UTC midnight. Working on the dates themselves keeps period
 * boundaries free of time-zone and DST drift, and string order is date order.
 * Month steps go through a year*12+month key and clamp the day, so the 31st
 * never overflows into the following month.
 */
export type CalendarDate = string;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parts(date: CalendarDate): [number, number, number] {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new Error(`Calendar date must use YYYY-MM-DD: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function format(year: number, month: number, day: number): CalendarDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(Number(match[1]), month);
}

/**
 * Read a provider date as a calendar date. Date-only strings are taken as-is;
 * timestamps and Date objects resolve to their UTC date, as the truth contract
 * requires. Anything else is unreadable.
 */
export function calendarDateFrom(value: unknown): CalendarDate | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (isCalendarDate(trimmed)) return trimmed;
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

export function toDayNumber(date: CalendarDate): number {
  const [year, month, day] = parts(date);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function fromDayNumber(dayNumber: number): CalendarDate {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Whole days from `start` up to, but not including, `endExclusive`. */
export function daysBetween(start: CalendarDate, endExclusive: CalendarDate): number {
  return toDayNumber(endExclusive) - toDayNumber(start);
}

export function dayOfMonth(date: CalendarDate): number {
  return parts(date)[2];
}

/**
 * Step by whole months, landing on `anchorDay` (default: the date's own day)
 * clamped to the target month's length. Jan 31 + 1 month is Feb 28 or 29.
 */
export function addMonths(date: CalendarDate, months: number, anchorDay?: number): CalendarDate {
  const [year, month, day] = parts(date);
  const key = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(key / 12);
  const targetMonth = (key % 12) + 1;
  const wanted = anchorDay ?? day;
  return format(targetYear, targetMonth, Math.min(Math.max(wanted, 1), daysInMonth(targetYear, targetMonth)));
}

export function startOfMonth(date: CalendarDate): CalendarDate {
  const [year, month] = parts(date);
  return format(year, month, 1);
}

export function startOfQuarter(date: CalendarDate): CalendarDate {
  const [year, month] = parts(date);
  return format(year, Math.floor((month - 1) / 3) * 3 + 1, 1);
}

export function startOfYear(date: CalendarDate): CalendarDate {
  return format(parts(date)[0], 1, 1);
}

/** Weeks start on Monday. */
export function startOfWeek(date: CalendarDate): CalendarDate {
  const dayNumber = toDayNumber(date);
  // Day 0 (1970-01-01) was a Thursday; shift so Monday is 0.
  const weekday = (((dayNumber + 3) % 7) + 7) % 7;
  return fromDayNumber(dayNumber - weekday);
}

export function minDate(left: CalendarDate, right: CalendarDate): CalendarDate {
  return left <= right ? left : right;
}

export function maxDate(left: CalendarDate, right: CalendarDate): CalendarDate {
  return left >= right ? left : right;
}
