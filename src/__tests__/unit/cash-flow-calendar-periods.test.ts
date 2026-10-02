import {
  addDays,
  addMonths,
  calendarDateFrom,
  daysBetween,
  isCalendarDate,
  startOfWeek,
} from '../../cash-flow/calendar';
import { enumeratePeriods, periodKey } from '../../cash-flow/periods';

describe('cash-flow calendar', () => {
  it('clamps month steps to the target month instead of overflowing', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-10-31', -1)).toBe('2026-09-30');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15');
  });

  it('lands on an explicit anchor day, clamped', () => {
    expect(addMonths('2026-01-15', 1, 31)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', 2, 31)).toBe('2026-03-31');
    expect(addMonths('2026-01-15', 0, 1)).toBe('2026-01-01');
  });

  it('counts whole days across month and year boundaries', () => {
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-10-01')).toBe('2026-09-28'); // Thursday
    expect(startOfWeek('2026-09-28')).toBe('2026-09-28'); // Monday
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28'); // Sunday
  });

  it('reads provider dates as the truth contract requires', () => {
    expect(calendarDateFrom('2026-05-10')).toBe('2026-05-10');
    expect(calendarDateFrom('2026-05-10T23:30:00Z')).toBe('2026-05-10');
    expect(calendarDateFrom('2026-05-10T20:00:00-07:00')).toBe('2026-05-11');
    expect(calendarDateFrom('2026-05-10T12:00:00')).toBeNull();
    expect(calendarDateFrom('not a date')).toBeNull();
    expect(calendarDateFrom(new Date('2026-05-10T00:00:00Z'))).toBe('2026-05-10');
  });

  it('rejects impossible calendar dates', () => {
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('2026-1-01')).toBe(false);
  });
});

describe('cash-flow periods', () => {
  it('enumerates calendar months and clips a custom range', () => {
    const periods = enumeratePeriods('2026-08-15', '2026-11-10', 'month');
    expect(periods.map(period => [period.key, period.start, period.endExclusive, period.clipped])).toEqual([
      ['2026-08', '2026-08-15', '2026-09-01', true],
      ['2026-09', '2026-09-01', '2026-10-01', false],
      ['2026-10', '2026-10-01', '2026-11-01', false],
      ['2026-11', '2026-11-01', '2026-11-10', true],
    ]);
  });

  it('keys quarters and years by calendar position', () => {
    expect(enumeratePeriods('2026-01-01', '2027-01-01', 'quarter').map(period => period.key))
      .toEqual(['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']);
    expect(enumeratePeriods('2025-06-01', '2027-01-01', 'year').map(period => period.key))
      .toEqual(['2025', '2026']);
    expect(periodKey('2026-10-01', 'quarter')).toBe('2026-Q4');
  });

  it('enumerates Monday-start weeks keyed by their Monday', () => {
    const weeks = enumeratePeriods('2026-09-28', '2026-10-12', 'week');
    expect(weeks.map(week => week.key)).toEqual(['2026-09-28', '2026-10-05']);
    expect(weeks.every(week => !week.clipped)).toBe(true);
  });
});
