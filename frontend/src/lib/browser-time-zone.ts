export const USER_TIME_ZONE_KEY = 'user_time_zone';

export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getStoredUserTimeZone(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(USER_TIME_ZONE_KEY);
  return stored?.trim() ? stored : null;
}

export function setStoredUserTimeZone(timeZone: string): void {
  if (typeof window === 'undefined') return;
  if (timeZone?.trim()) {
    localStorage.setItem(USER_TIME_ZONE_KEY, timeZone.trim());
  }
}

export function syncStoredUserTimeZoneFromAuthUser(
  user: { timeZone?: string | null } | null | undefined
): void {
  if (user?.timeZone?.trim()) {
    setStoredUserTimeZone(user.timeZone);
  }
}

export function clearStoredUserTimeZone(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_TIME_ZONE_KEY);
}

export function getEffectiveUserTimeZone(): string {
  return getStoredUserTimeZone() ?? getBrowserTimeZone();
}

export function calendarDateInTimeZone(date: Date, timeZone: string): string {
  const zone = timeZone?.trim() || 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = new Map(parts.map(part => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

export function observationDateForCalendarDate(calendarDate: string): string {
  return `${calendarDate}T00:00:00.000Z`;
}
