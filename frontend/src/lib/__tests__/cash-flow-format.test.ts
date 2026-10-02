import {
  describeSchedule,
  formatCalendarDate,
  formatCompactMoney,
  formatMoney,
  formatSignedMoney,
  lastIncludedDay,
  periodLabel,
  shortPeriodLabel,
} from '../cash-flow-format';

const period = (key: string, start: string, endExclusive: string, clipped = false) => ({ key, start, endExclusive, clipped });

describe('cash flow formatting', () => {
  it('formats calendar dates without shifting them across time zones', () => {
    expect(formatCalendarDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatCalendarDate('2026-12-31', false)).toBe('Dec 31');
    expect(lastIncludedDay('2026-03-01')).toBe('2026-02-28');
    expect(lastIncludedDay('2027-01-01')).toBe('2026-12-31');
  });

  it('names periods by granularity, and by their dates when clipped', () => {
    expect(periodLabel(period('2026-10', '2026-10-01', '2026-11-01'), 'month')).toBe('Oct 2026');
    expect(periodLabel(period('2026-Q4', '2026-10-01', '2027-01-01'), 'quarter')).toBe('Q4 2026');
    expect(periodLabel(period('2026', '2026-01-01', '2027-01-01'), 'year')).toBe('2026');
    expect(periodLabel(period('2026-09-28', '2026-09-28', '2026-10-05'), 'week')).toBe('Week of Sep 28, 2026');
    expect(periodLabel(period('2026-08', '2026-08-15', '2026-09-01', true), 'month')).toBe('Aug 15 – Aug 31, 2026');
    expect(periodLabel(period('2026', '2026-12-15', '2027-01-03', true), 'year')).toBe('Dec 15, 2026 – Jan 2, 2027');
  });

  it('keeps axis labels short but marks a new year', () => {
    expect(shortPeriodLabel({ start: '2026-10-01' }, 'month')).toBe('Oct');
    expect(shortPeriodLabel({ start: '2027-01-01' }, 'month')).toBe("Jan '27");
    expect(shortPeriodLabel({ start: '2026-10-01' }, 'quarter')).toBe("Q4 '26");
    expect(shortPeriodLabel({ start: '2026-09-28' }, 'week')).toBe('9/28');
  });

  it('formats money with a true minus sign and an explicit plus for gains', () => {
    expect(formatMoney(1234.5)).toBe('$1,235');
    expect(formatMoney(1234.5, true)).toBe('$1,234.50');
    expect(formatMoney(-320)).toBe('−$320');
    expect(formatSignedMoney(1240.4)).toBe('+$1,240');
    expect(formatSignedMoney(-320)).toBe('−$320');
    expect(formatSignedMoney(0.4)).toBe('$0');
    expect(formatCompactMoney(1250)).toBe('$1.3K');
    expect(formatCompactMoney(15000)).toBe('$15K');
    expect(formatCompactMoney(-2000000)).toBe('−$2M');
    expect(formatCompactMoney(800)).toBe('$800');
  });

  it('describes when a planned event happens', () => {
    expect(describeSchedule({ recurrence: 'once', startDate: '2026-12-15', endDate: null })).toBe('Once on Dec 15, 2026');
    expect(describeSchedule({ recurrence: 'monthly', startDate: '2027-01-01', endDate: '2027-06-01' }))
      .toBe('Every month from Jan 1, 2027 until Jun 1, 2027');
    expect(describeSchedule({ recurrence: 'biweekly', startDate: '2026-10-02', endDate: null })).toBe('Every 2 weeks from Oct 2, 2026');
  });
});
