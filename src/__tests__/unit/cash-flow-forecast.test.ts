import {
  buildCashFlowHighlights,
  buildCashFlowModel,
  buildCashFlowReport,
  forecastTotals,
  roundCents,
  type CashFlowHighlight,
  type CashFlowModelInput,
} from '../../cash-flow/forecast';
import type { PlannedCashFlowEvent } from '../../cash-flow/planned-events';
import { ACCOUNTS, householdTransactions, tx } from './factories/cash-flow.factory';

const transactions = householdTransactions('2026-06-03', '2026-09-30');

function model(overrides: Partial<CashFlowModelInput> = {}) {
  return buildCashFlowModel({
    transactions,
    accounts: ACCOUNTS,
    plannedEvents: [],
    dataThrough: '2026-09-30',
    today: '2026-10-01',
    ...overrides,
  });
}

function highlight(highlights: CashFlowHighlight[], key: CashFlowHighlight['key']): CashFlowHighlight {
  const match = highlights.find(item => item.key === key);
  if (!match) throw new Error(`missing ${key}`);
  return match;
}

const DAYS_PER_MONTH = 365 / 12;

/** Grocery spending in [from, to), which is everything typical spending should be built from. */
function grocerySpending(from: string, to: string): number {
  return transactions
    .filter(item => ['Trader Joes', 'Safeway', 'Corner Market', 'Whole Foods'].includes(String(item.merchant_name)))
    .filter(item => String(item.date) >= from && String(item.date) < to)
    .reduce((total, item) => total + Number(item.amount), 0);
}

const bonus: PlannedCashFlowEvent = {
  id: 'bonus', label: 'Year-end bonus', kind: 'income', amount: 10000, startDate: '2026-12-15', recurrence: 'once', endDate: null,
};

describe('buildCashFlowModel', () => {
  it('builds typical spending from non-recurring activity over the last 90 days, without one-offs', () => {
    const built = model();
    expect(built.forecast).toEqual({ available: true });
    expect(built.forecastStart).toBe('2026-10-01');
    expect(built.typical.basisStart).toBe('2026-07-03');
    expect(built.typical.basisDays).toBe(90);
    expect(built.typical.dailySpending).toBeCloseTo(grocerySpending('2026-07-03', '2026-10-01') / 90, 6);
    expect(built.typical.dailyIncome).toBe(0);
    expect(built.oneOffs.map(entry => [entry.label, entry.amount])).toEqual([['United Airlines', 2400]]);
  });

  it('forecasts recurring items on their dates plus typical spending by the day', () => {
    const built = model();
    const october = forecastTotals(built, '2026-10-01', '2026-11-01')!;
    expect(october.components).toEqual({
      recurringIncome: 5000, // paydays Oct 9 and Oct 23
      typicalIncome: 0,
      plannedIncome: 0,
      recurringSpending: 2015.49, // rent Oct 1, streaming Oct 12
      typicalSpending: roundCents(built.typical.dailySpending * 31),
      plannedSpending: 0,
    });
    expect(october.income).toBe(5000);
    expect(october.net).toBe(roundCents(october.income - october.spending));
  });

  it('is unavailable with too little history, and says why', () => {
    const short = model({ transactions: householdTransactions('2026-09-15', '2026-09-30') });
    expect(short.forecast).toEqual({ available: false, reason: 'insufficient_history' });
    expect(forecastTotals(short, '2026-10-01', '2026-11-01')).toBeNull();
  });

  it('is unavailable without everyday accounts', () => {
    expect(model({ accounts: [ACCOUNTS[2]] }).forecast).toEqual({ available: false, reason: 'no_accounts' });
  });

  it('needs no history at all when both sides are overridden', () => {
    const built = model({
      transactions: [],
      plannedEvents: [bonus],
      overrides: { monthlyIncome: 6000, monthlyExpense: 4000 },
    });
    expect(built.forecast).toEqual({ available: true });
    const december = forecastTotals(built, '2026-12-01', '2027-01-01')!;
    expect(december.components.typicalIncome).toBe(roundCents((6000 / DAYS_PER_MONTH) * 31));
    expect(december.components.typicalSpending).toBe(roundCents((4000 / DAYS_PER_MONTH) * 31));
    expect(december.components.plannedIncome).toBe(10000);
  });

  it('still needs history for a side that is not overridden', () => {
    expect(model({ transactions: [], overrides: { monthlyIncome: 6000, monthlyExpense: null } }).forecast)
      .toEqual({ available: false, reason: 'no_history' });
  });

  it('lets a monthly override replace detected income', () => {
    const built = model({ overrides: { monthlyIncome: 6000, monthlyExpense: null } });
    expect(built.typical.incomeSource).toBe('override');
    const october = forecastTotals(built, '2026-10-01', '2026-11-01')!;
    expect(october.components.recurringIncome).toBe(0);
    expect(october.components.typicalIncome).toBe(roundCents((6000 / DAYS_PER_MONTH) * 31));
    expect(october.components.recurringSpending).toBe(2015.49);
  });
});

describe('buildCashFlowHighlights', () => {
  it('splits the current month into what happened and what is expected', () => {
    // Snapshot through Oct 14: rent and the Oct 9 paycheck have posted.
    const midMonth = model({
      transactions: [
        ...householdTransactions('2026-06-03', '2026-10-14'),
      ],
      dataThrough: '2026-10-14',
      today: '2026-10-15',
    });
    const thisMonth = highlight(buildCashFlowHighlights(midMonth), 'this_month');
    expect(thisMonth.actualCoverage).toBe('full');
    expect(thisMonth.actualToDate!.income).toBe(2500);
    expect(thisMonth.remaining!.components.recurringIncome).toBe(2500); // Oct 23
    expect(thisMonth.remaining!.components.recurringSpending).toBe(0); // rent and streaming already posted
    expect(thisMonth.projected!.net).toBe(roundCents(thisMonth.actualToDate!.net + thisMonth.remaining!.net));
  });

  it('separates planned events so the forecast can be read with and without them', () => {
    const highlights = buildCashFlowHighlights(model({ plannedEvents: [bonus] }));
    const quarter = highlight(highlights, 'this_quarter');
    expect(quarter.planned).toEqual({ income: 10000, spending: 0, net: 10000 });
    expect(quarter.projectedWithoutPlanned!.net).toBe(roundCents(quarter.projected!.net - 10000));
    expect(highlight(highlights, 'next_month').planned.net).toBe(0);
  });

  it('reports nothing observed, rather than an observed zero, when there is no history', () => {
    const year = highlight(buildCashFlowHighlights(model({ transactions: [] })), 'this_year');
    expect(year.actualCoverage).toBe('none');
    expect(year.actualToDate).toBeNull();
    expect(year.projected).toBeNull();
  });

  it('withholds a whole-year projection when history does not reach the start of the year', () => {
    const year = highlight(buildCashFlowHighlights(model()), 'this_year');
    expect(year.actualCoverage).toBe('partial');
    expect(year.projected).toBeNull();
    expect(year.remaining).not.toBeNull();
  });

  it('forecasts rolling windows from the first unobserved day', () => {
    const highlights = buildCashFlowHighlights(model());
    const next3 = highlight(highlights, 'next_3_months');
    expect([next3.start, next3.endExclusive]).toEqual(['2026-10-01', '2027-01-01']);
    expect(next3.actualToDate).toBeNull();
    expect(next3.projected).toEqual({ income: next3.remaining!.income, spending: next3.remaining!.spending, net: next3.remaining!.net });
  });
});

describe('buildCashFlowReport', () => {
  it('shows recent history through the horizon, starting where the history does', () => {
    const report = buildCashFlowReport(model(), { granularity: 'month', horizonMonths: 3 });
    expect(report.range).toEqual({ from: '2026-06-03', toExclusive: '2027-02-01' });
    expect(report.periods[0]).toMatchObject({ key: '2026-06', start: '2026-06-03', clipped: true });
    expect(report.totals.coverage).toBe('full');
    expect(report.totals.total).not.toBeNull();
    expect(report.periods.map(period => [period.key, period.phase, period.coverage])).toEqual([
      ['2026-06', 'past', 'full'],
      ['2026-07', 'past', 'full'],
      ['2026-08', 'past', 'full'],
      ['2026-09', 'past', 'full'],
      ['2026-10', 'future', 'none'],
      ['2026-11', 'future', 'none'],
      ['2026-12', 'future', 'none'],
      ['2027-01', 'future', 'none'],
    ]);
    const september = report.periods[3];
    expect(september.actual!.income).toBe(5000); // Sep 11 and Sep 25
    expect(september.forecast).toBeNull();
    expect(september.total).toEqual(september.actual);
  });

  it('forecasts the days a stale snapshot has not seen', () => {
    const stale = model({ dataThrough: '2026-09-25', today: '2026-10-01' });
    const report = buildCashFlowReport(stale, { granularity: 'month', horizonMonths: 1 });
    const september = report.periods.find(period => period.key === '2026-09')!;
    expect(september.phase).toBe('current');
    expect(september.actual).not.toBeNull();
    expect(september.forecast!.components.typicalSpending).toBe(roundCents(stale.typical.dailySpending * 5));
    expect(september.total!.net).toBe(roundCents(september.actual!.net + september.forecast!.net));
  });

  it('reports the recurring items, one-offs and planned events behind the forecast', () => {
    const report = buildCashFlowReport(model({ plannedEvents: [bonus] }), { granularity: 'quarter', horizonMonths: 6 });
    const paycheck = report.recurring.find(item => item.flow === 'income')!;
    expect(paycheck).toMatchObject({ cadence: 'biweekly', amount: 2500, nextDate: '2026-10-09', replacedByOverride: false });
    expect(paycheck.monthlyAmount).toBe(roundCents((2500 * 26) / 12));
    expect(report.oneOffs).toEqual([expect.objectContaining({ label: 'United Airlines', amount: 2400 })]);
    expect(report.plannedEvents).toEqual([expect.objectContaining({ id: 'bonus', nextDate: '2026-12-15', occurrencesInRange: 1 })]);
    expect(report.baseline.typicalBasisDays).toBe(90);
  });

  it('honours a custom range', () => {
    const report = buildCashFlowReport(model(), { granularity: 'week', horizonMonths: 1, from: '2026-09-21', to: '2026-10-11' });
    expect(report.periods.map(period => [period.key, period.phase])).toEqual([
      ['2026-09-21', 'past'],
      ['2026-09-28', 'current'],
      ['2026-10-05', 'future'],
    ]);
    expect(report.range).toEqual({ from: '2026-09-21', toExclusive: '2026-10-12' });
  });

  it('withholds totals for a custom range that reaches back before the history', () => {
    const report = buildCashFlowReport(model(), { granularity: 'month', horizonMonths: 1, from: '2026-05-01', to: '2026-09-30' });
    expect(report.totals).toMatchObject({ coverage: 'partial', actual: null, total: null });
    expect(report.periods[1]).toMatchObject({ key: '2026-06', coverage: 'partial' });
  });

  it('keeps whole first periods when the history reaches back past the lookback', () => {
    // History from June 2025; on Oct 15 the twelve-month and three-month
    // lookbacks land mid-period, and the history covers the whole period.
    const longHistory = model({
      transactions: householdTransactions('2025-06-01', '2026-10-14'),
      dataThrough: '2026-10-14',
      today: '2026-10-15',
    });
    const monthly = buildCashFlowReport(longHistory, { granularity: 'month', horizonMonths: 3 });
    expect(monthly.range.from).toBe('2025-10-01');
    expect(monthly.periods[0]).toMatchObject({ key: '2025-10', clipped: false, coverage: 'full' });

    const weekly = buildCashFlowReport(longHistory, { granularity: 'week', horizonMonths: 1 });
    expect(weekly.range.from).toBe('2026-07-13'); // the Monday of the week holding Jul 15
    expect(weekly.periods[0]).toMatchObject({ clipped: false, coverage: 'full' });
  });

  it('clips the default range to forecastStart when there is no history', () => {
    const report = buildCashFlowReport(model({
      transactions: [],
      overrides: { monthlyIncome: 6000, monthlyExpense: 4000 },
      dataThrough: '2026-10-14',
      today: '2026-10-15',
    }), { granularity: 'month', horizonMonths: 3 });
    expect(report.range.from).toBe('2026-10-15');
    expect(report.periods[0]).toMatchObject({ key: '2026-10', start: '2026-10-15', clipped: true });
    expect(report.periods[0].forecast).not.toBeNull();
  });

  it('clips a custom range to forecastStart when there is no history', () => {
    const report = buildCashFlowReport(model({
      transactions: [],
      overrides: { monthlyIncome: 6000, monthlyExpense: 4000 },
      dataThrough: '2026-10-14',
      today: '2026-10-15',
    }), { granularity: 'month', horizonMonths: 3, from: '2026-10-01', to: '2026-12-31' });
    expect(report.range.from).toBe('2026-10-15');
    expect(report.periods[0]).toMatchObject({ key: '2026-10', start: '2026-10-15', clipped: true });
    // A full-month override would be $6,000; the clipped stub must not be
    // labelled as Oct 1–31 (clipped: false) while showing only Oct 15–31.
    expect(report.periods[0].total!.income).toBeLessThan(6000);
  });

  it('keeps unknown months unknown rather than zero', () => {
    const report = buildCashFlowReport(model(), { granularity: 'month', horizonMonths: 1, from: '2026-03-01', to: '2026-05-31' });
    expect(report.periods.every(period => period.coverage === 'none' && period.actual === null && period.total === null)).toBe(true);
  });

  it('ignores activity in investment accounts', () => {
    const withDividend = model({ transactions: [...transactions, tx('brokerage', '2026-09-15', 'income', 5000, 'Dividend')] });
    const report = buildCashFlowReport(withDividend, { granularity: 'month', horizonMonths: 1 });
    expect(report.periods.find(period => period.key === '2026-09')!.actual!.income).toBe(5000);
  });
});
