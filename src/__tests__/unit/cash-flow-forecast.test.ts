import { addDays } from '../../cash-flow/calendar';
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
  accountId: null, paymentMode: null,
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

  it('leaves out a sum moved in pieces a few days apart as one occasion', () => {
    const toBrokerage = { personal_finance_category: { primary: 'TRANSFER_OUT', detailed: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS' } };
    const moved = [
      // $80,000 to a brokerage in four pieces over a week, as a transfer limit splits it.
      ...['2026-08-11', '2026-08-13', '2026-08-14', '2026-08-17'].map((date, index) =>
        tx('checking', date, 'transfer_out', 20000, `BROKERAGE DES:ACH ID:XX${index}114`, toBrokerage)),
      // Cash taken out of the brokerage in two pieces eight days apart: one small, one large.
      tx('checking', '2026-07-22', 'income', 943.92, 'BROKERAGE CASH OUT ID:XX9045'),
      tx('checking', '2026-07-30', 'income', 5000, 'BROKERAGE CASH OUT ID:XX2420'),
      // A large payee seen on two occasions weeks apart is how the user lives.
      tx('checking', '2026-07-10', 'expense', 3000, 'ACME ROOFING'),
      tx('checking', '2026-08-20', 'expense', 3000, 'ACME ROOFING'),
    ];
    const before = model();
    const built = model({ transactions: [...transactions, ...moved] });

    expect(built.oneOffs.map(entry => [entry.label, entry.amount])).toEqual(expect.arrayContaining([
      ['BROKERAGE CASH OUT', 5000], ['BROKERAGE CASH OUT', 943.92],
    ]));
    expect(built.typical.dailyIncome).toBe(0);
    expect(built.transfers.oneOffs.map(entry => entry.amount)).toEqual([20000, 20000, 20000, 20000]);
    expect(built.transfers.dailyByAccount.get('checking')?.out ?? 0).toBeCloseTo(before.transfers.dailyByAccount.get('checking')?.out ?? 0, 6);
    expect(built.typical.dailySpending).toBeCloseTo(before.typical.dailySpending + 6000 / 90, 6);
  });

  it('leaves out a lump to a payee the user also pays regularly', () => {
    const toBrokerage = { personal_finance_category: { primary: 'TRANSFER_OUT', detailed: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS' } };
    const toBroker = (date: string, amount: number, id: string) => tx('checking', date, 'transfer_out', amount, `BROKERAGE DES:ACH ID:XX${id}`, toBrokerage);
    const lump = ['2026-08-11', '2026-08-13', '2026-08-14', '2026-08-17'].map((date, index) => toBroker(date, 20000, `${index}114`));
    // A monthly contribution, one of them a few days before the lump...
    const monthly = ['2026-06-05', '2026-07-06', '2026-08-05', '2026-09-08'].map((date, index) => toBroker(date, 500, `${index}500`));
    // ...or small ones now and then.
    const nowAndThen = [['2026-07-02', 200], ['2026-07-29', 350], ['2026-09-15', 275]] as const;
    const irregular = nowAndThen.map(([date, amount], index) => toBroker(date, amount, `${index}900`));

    for (const regular of [monthly, irregular]) {
      const built = model({ transactions: [...transactions, ...regular, ...lump] });
      expect(built.transfers.oneOffs.filter(entry => entry.amount === 20000)).toHaveLength(4);
      // What stays in the rate is the small amounts, not the lump: about $500 a month, not $900 a day.
      expect(built.transfers.dailyByAccount.get('checking')?.out ?? 0).toBeLessThan(20);
    }
  });

  it('keeps a payee paid every few days in the rate, however large each payment', () => {
    // Every three or eleven days, about $700: never a schedule, never a lump.
    const dates: string[] = [];
    for (let date = '2026-07-04', step = 3; date <= '2026-09-30'; date = addDays(date, step), step = step === 3 ? 11 : 3) dates.push(date);
    const sitter = dates.map((date, index) => tx('checking', date, 'expense', 650 + (index % 3) * 50, 'SITTER CO'));
    const built = model({ transactions: [...transactions, ...sitter] });
    expect(built.oneOffs.some(entry => entry.counterpartyKey === 'sitter')).toBe(false);
    expect(built.streams.some(stream => stream.counterpartyKey === 'sitter')).toBe(false);
    const total = sitter.filter(item => String(item.date) >= '2026-07-03').reduce((sum, item) => sum + Number(item.amount), 0);
    expect(built.typicalPayees.find(payee => payee.counterpartyKey === 'sitter')?.daily).toBeCloseTo(total / 90, 6);
  });

  it('does not let refunds make repeating large purchases look like one-offs', () => {
    // Three $3,000 purchases on an irregular cadence (not a monthly stream) are
    // how the user lives. Two $3,000 refunds outside those windows must not net
    // the rest to near zero and make each purchase stand out on its own.
    const store = [
      tx('card', '2026-07-08', 'expense', 3000, 'ACME STORE', { merchant_name: 'Acme Store' }),
      tx('card', '2026-07-29', 'expense', 3000, 'ACME STORE', { merchant_name: 'Acme Store' }),
      tx('card', '2026-09-12', 'expense', 3000, 'ACME STORE', { merchant_name: 'Acme Store' }),
      tx('card', '2026-08-10', 'refund', 3000, 'ACME STORE', { merchant_name: 'Acme Store' }),
      tx('card', '2026-08-25', 'refund', 3000, 'ACME STORE', { merchant_name: 'Acme Store' }),
    ];
    const before = model();
    const built = model({ transactions: [...transactions, ...store] });
    expect(built.streams.some(stream => stream.counterpartyKey === 'acme store')).toBe(false);
    expect(built.oneOffs.some(entry => entry.counterpartyKey === 'acme store')).toBe(false);
    // Net +$3,000 over the basis stays in the rate; refunds must not drive it to zero.
    expect(built.typical.dailySpending).toBeCloseTo(before.typical.dailySpending + 3000 / 90, 6);
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
      cardInterest: 0, // the card has no APR, so its interest is not modeled
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

  it('keeps a past-only custom range intact when there is no history', () => {
    const report = buildCashFlowReport(model({
      transactions: [],
      overrides: { monthlyIncome: 6000, monthlyExpense: 4000 },
      dataThrough: '2026-10-14',
      today: '2026-10-15',
    }), { granularity: 'month', horizonMonths: 3, from: '2026-10-01', to: '2026-10-10' });
    expect(report.range).toEqual({ from: '2026-10-01', toExclusive: '2026-10-11' });
    expect(report.periods).toHaveLength(1);
    expect(report.periods[0]).toMatchObject({ start: '2026-10-01', endExclusive: '2026-10-11', coverage: 'none', total: null });
  });

  it('never produces a period that ends before it starts', () => {
    // From after the 24-month forecast limit: the end is capped below the start.
    const report = buildCashFlowReport(model(), { granularity: 'month', horizonMonths: 3, from: '2028-10-20', to: '2028-12-31' });
    expect(report.periods.every(period => period.start < period.endExclusive)).toBe(true);
    expect(report.range.from <= report.range.toExclusive).toBe(true);
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
