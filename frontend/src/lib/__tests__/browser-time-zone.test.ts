import {
  calendarDateInTimeZone,
  clearStoredUserTimeZone,
  getEffectiveUserTimeZone,
  getStoredUserTimeZone,
  observationDateForCalendarDate,
  setStoredUserTimeZone,
  syncStoredUserTimeZoneFromAuthUser,
  USER_TIME_ZONE_KEY,
} from '../browser-time-zone';

describe('browser time-zone helpers', () => {
  it('derives the same user calendar day used by backend history keys', () => {
    const instant = new Date('2026-08-15T06:30:00.000Z');

    expect(calendarDateInTimeZone(instant, 'America/Los_Angeles')).toBe('2026-08-14');
    expect(calendarDateInTimeZone(instant, 'Asia/Tokyo')).toBe('2026-08-15');
  });

  it('serializes a calendar date without shifting it', () => {
    expect(observationDateForCalendarDate('2026-08-14')).toBe('2026-08-14T00:00:00.000Z');
  });

  it('persists the authenticated user time zone for chart deduplication', () => {
    setStoredUserTimeZone(' America/New_York ');
    expect(getStoredUserTimeZone()).toBe('America/New_York');
    expect(getEffectiveUserTimeZone()).toBe('America/New_York');
    clearStoredUserTimeZone();
    expect(localStorage.getItem(USER_TIME_ZONE_KEY)).toBeNull();
  });

  it('hydrates stored time zone from auth verify payloads', () => {
    syncStoredUserTimeZoneFromAuthUser({ timeZone: 'America/Chicago' });
    expect(getStoredUserTimeZone()).toBe('America/Chicago');
    clearStoredUserTimeZone();
  });
});
