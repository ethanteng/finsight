export const DEFAULT_TIME_ZONE = 'UTC';

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).format();
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(value: unknown, fallback = DEFAULT_TIME_ZONE): string {
  return isValidTimeZone(value) ? value.trim() : fallback;
}

export function calendarDateInTimeZone(date: Date, timeZone: string): string {
  if (Number.isNaN(date.getTime())) throw new Error('History observation date is invalid');
  const zone = normalizeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = new Map(parts.map(part => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

export function observationDateForCalendarDate(calendarDate: string): Date {
  return new Date(`${calendarDate}T00:00:00.000Z`);
}

/**
 * Resolve local midnight for a calendar date to an instant, including DST.
 * Intl exposes the wall clock rather than its offset, so two short correction
 * passes converge on the instant whose formatted parts equal 00:00 locally.
 */
export function instantAtStartOfCalendarDate(calendarDate: string, timeZone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) throw new Error('Calendar date must use YYYY-MM-DD');
  const zone = normalizeTimeZone(timeZone);
  const [year, month, day] = calendarDate.split('-').map(Number);
  const desiredWallTime = Date.UTC(year, month - 1, day);
  let instant = new Date(desiredWallTime);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Map(formatter.formatToParts(instant).map(part => [part.type, part.value]));
    const wallTime = Date.UTC(
      Number(parts.get('year')),
      Number(parts.get('month')) - 1,
      Number(parts.get('day')),
      Number(parts.get('hour')),
      Number(parts.get('minute')),
      Number(parts.get('second')),
    );
    instant = new Date(instant.getTime() + desiredWallTime - wallTime);
  }
  return instant;
}
