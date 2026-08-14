import {
  calendarDateInTimeZone,
  isValidTimeZone,
  normalizeTimeZone,
  observationDateForCalendarDate,
} from '../../domain/time-zone';

describe('history time-zone helpers', () => {
  it('uses the user calendar date across UTC boundaries', () => {
    const instant = new Date('2026-08-15T06:30:00.000Z');

    expect(calendarDateInTimeZone(instant, 'America/Los_Angeles')).toBe('2026-08-14');
    expect(calendarDateInTimeZone(instant, 'Asia/Tokyo')).toBe('2026-08-15');
  });

  it('validates IANA zones and falls back to UTC', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('not/a-zone')).toBe(false);
    expect(normalizeTimeZone('not/a-zone')).toBe('UTC');
  });

  it('stores a calendar date without applying the server time zone', () => {
    expect(observationDateForCalendarDate('2026-08-14').toISOString()).toBe(
      '2026-08-14T00:00:00.000Z'
    );
  });
});
