/**
 * Items the user marked as already happened: a paycheck pending at the bank,
 * a bill paid early, a planned transfer already made. The forecast starts from
 * the reported balance, which leaves pending transactions out, so a marked
 * item moves to the first forecast day -- and once the data shows it posted,
 * the reported balance has it and it is never counted twice.
 */

import { addDays, addMonths } from '../../cash-flow/calendar';
import {
  buildCashFlowModel,
  buildCashFlowReport,
  forecastTotals,
  type CashFlowModelInput,
} from '../../cash-flow/forecast';
import {
  occurrenceKey,
  validateOccurrenceRef,
  type HappenedMark,
  type OccurrenceRef,
} from '../../cash-flow/happened';
import { buildCashPosition, happenedTarget, type CashPosition } from '../../cash-flow/position';
import type { PlannedCashFlowEvent } from '../../cash-flow/planned-events';
import { ACCOUNTS, CARD_PAYMENT_CATEGORY, householdTransactions, tx } from './factories/cash-flow.factory';

const FROM = '2026-06-03';
const THROUGH = '2026-09-30';
const START = '2026-10-01';
const SAVINGS = {
  account_id: 'savings', name: 'High Yield Savings', type: 'depository', subtype: 'savings',
  balance: { current: 10000 }, institution: 'First Bank', mask: '5678',
};
const PAYROLL = 'income:gusto-payroll-smith';

function model(overrides: Partial<CashFlowModelInput> = {}, extra: Array<Record<string, unknown>> = []) {
  return buildCashFlowModel({
    transactions: [...householdTransactions(FROM, THROUGH), ...extra],
    accounts: [...ACCOUNTS, SAVINGS],
    plannedEvents: [],
    dataThrough: THROUGH,
    today: START,
    ...overrides,
  });
}

function available(position: CashPosition) {
  if (!position.available) throw new Error(`position unavailable: ${position.reason}`);
  return position;
}

/** A mark, with the amount the item moved when the user marked it. */
const mark = (ref: OccurrenceRef, amount: number, overrides: Partial<HappenedMark> = {}): HappenedMark => ({
  id: 'mark', label: 'Marked', amount, markedOn: START, ...ref, ...overrides,
});

const event = (overrides: Partial<PlannedCashFlowEvent>): PlannedCashFlowEvent => ({
  id: 'event', label: 'Car repair', kind: 'expense', amount: 800, startDate: '2026-10-15', recurrence: 'once', endDate: null,
  repeatEvery: null, repeatUnit: null, accountId: null, toAccountId: null, paymentMode: null,
  ...overrides,
});

const listed = (position: Extract<CashPosition, { available: true }>, ref: OccurrenceRef) =>
  position.itemsBetween(START, addMonths(START, 12)).filter(item => occurrenceKey(item.ref) === occurrenceKey(ref));

const DATES = ['2026-10-02', '2026-10-10', '2026-10-16', '2026-10-21', '2026-11-01', '2027-03-01'];

describe('items marked as already happened', () => {
  describe('a regular paycheck', () => {
    const paycheck: OccurrenceRef = { source: 'stream', sourceId: PAYROLL, date: '2026-10-09' };

    it('counts on the first forecast day instead of its own, once', () => {
      const plain = available(buildCashPosition(model()));
      const marked = available(buildCashPosition(model({ happened: [mark(paycheck, 2500)] })));
      // The reported balance is still where the position starts.
      expect(marked.startingCash).toBe(plain.startingCash);
      // From the first day, cash has the paycheck...
      expect(marked.cashBefore('2026-10-02') - plain.cashBefore('2026-10-02')).toBeCloseTo(2500, 2);
      expect(marked.cashBefore('2026-10-09') - plain.cashBefore('2026-10-09')).toBeCloseTo(2500, 2);
      // ...and from its own day on, nothing differs: it is counted once.
      expect(marked.cashBefore('2026-10-10')).toBeCloseTo(plain.cashBefore('2026-10-10'), 2);
      expect(marked.cashBefore('2027-03-01')).toBeCloseTo(plain.cashBefore('2027-03-01'), 2);
      expect(marked.moneyInBetween(START, '2026-11-01')).toBeCloseTo(plain.moneyInBetween(START, '2026-11-01'), 2);
    });

    it('leaves the coming-up list for the list of what happened', () => {
      const marked = available(buildCashPosition(model({ happened: [mark(paycheck, 2500)] })));
      expect(listed(marked, paycheck)).toEqual([]);
      expect(listed(available(buildCashPosition(model())), paycheck)).toHaveLength(1);
      expect(marked.happened).toEqual([{
        markId: 'mark',
        ref: paycheck,
        label: 'GUSTO PAYROLL SMITH',
        kind: 'income',
        amount: 2500,
        counted: 2500,
        inBalance: false,
      }]);
      // The next paycheck is still coming up on its day.
      expect(listed(marked, { ...paycheck, date: '2026-10-23' })).toHaveLength(1);
    });

    it('changes when cash moves, never what is earned', () => {
      const plain = model();
      const marked = model({ happened: [mark(paycheck, 2500)] });
      expect(forecastTotals(marked, START, '2026-11-01')).toEqual(forecastTotals(plain, START, '2026-11-01'));
    });

    it('names a late paycheck by the day it was due', () => {
      // The Sep 25 paycheck is pending: the data runs through the 26th without
      // it, so the forecast still expects it, on its first day.
      const through = '2026-09-26';
      const transactions = householdTransactions(FROM, through)
        .filter(item => !(item.date === '2026-09-25' && String(item.name).includes('GUSTO')));
      const late: OccurrenceRef = { source: 'stream', sourceId: PAYROLL, date: '2026-09-25' };
      const build = (happened: HappenedMark[]) => buildCashFlowModel({
        transactions, accounts: [...ACCOUNTS, SAVINGS], plannedEvents: [], dataThrough: through, today: '2026-09-27', happened,
      });
      const plain = available(buildCashPosition(build([])));
      expect(plain.itemsBetween('2026-09-27', '2026-09-28')).toEqual([
        expect.objectContaining({ kind: 'income', amount: 2500, ref: late }),
      ]);
      const marked = available(buildCashPosition(build([mark(late, 2500, { markedOn: '2026-09-27' })])));
      expect(marked.happened).toEqual([expect.objectContaining({ ref: late, counted: 2500 })]);
      expect(marked.cashBefore('2026-09-28')).toBeCloseTo(plain.cashBefore('2026-09-28'), 2);
    });

    it('names nothing once the paycheck has posted', () => {
      // Sep 25's paycheck is in the data, so its cycle is over and the
      // reported balance has it.
      const posted: OccurrenceRef = { source: 'stream', sourceId: PAYROLL, date: '2026-09-25' };
      const plain = available(buildCashPosition(model()));
      const marked = available(buildCashPosition(model({ happened: [mark(posted, 2500)] })));
      expect(marked.happened).toEqual([]);
      for (const date of DATES) expect(marked.cashBefore(date)).toBeCloseTo(plain.cashBefore(date), 2);
    });
  });

  describe('a planned expense', () => {
    const repair = event({});
    const occurrence: OccurrenceRef = { source: 'planned', sourceId: 'event', date: '2026-10-15' };

    it('leaves cash on the first day', () => {
      const plain = available(buildCashPosition(model({ plannedEvents: [repair] })));
      const marked = available(buildCashPosition(model({ plannedEvents: [repair], happened: [mark(occurrence, 800)] })));
      expect(marked.cashBefore('2026-10-02') - plain.cashBefore('2026-10-02')).toBeCloseTo(-800, 2);
      expect(marked.cashBefore('2026-10-16')).toBeCloseTo(plain.cashBefore('2026-10-16'), 2);
      expect(marked.happened).toEqual([expect.objectContaining({ kind: 'planned_expense', amount: -800, counted: -800, inBalance: false })]);
    });

    it('is not counted again once the data shows it posted, at about the amount planned', () => {
      // Paid on the 29th for a little more than planned, and in the data.
      const paid = [tx('checking', '2026-09-29', 'expense', 812, 'MIDAS AUTO', { merchant_name: 'Midas' })];
      const plain = available(buildCashPosition(model({ plannedEvents: [repair] }, paid)));
      const marked = available(buildCashPosition(model({ plannedEvents: [repair], happened: [mark(occurrence, 800, { markedOn: '2026-09-30' })] }, paid)));
      expect(marked.happened).toEqual([expect.objectContaining({ amount: -800, counted: 0, inBalance: true })]);
      // Nothing on the first day, and nothing on the 15th either.
      expect(marked.cashBefore('2026-10-02')).toBeCloseTo(plain.cashBefore('2026-10-02'), 2);
      expect(marked.cashBefore('2026-10-16') - plain.cashBefore('2026-10-16')).toBeCloseTo(800, 2);
    });

    it('does not take an older or different payment for it', () => {
      const older = [tx('checking', '2026-09-20', 'expense', 800, 'MIDAS AUTO', { merchant_name: 'Midas' })];
      const other = [tx('checking', '2026-09-30', 'expense', 450, 'MIDAS AUTO', { merchant_name: 'Midas' })];
      for (const extra of [older, other]) {
        const marked = available(buildCashPosition(model({ plannedEvents: [repair], happened: [mark(occurrence, 800)] }, extra)));
        expect(marked.happened).toEqual([expect.objectContaining({ counted: -800, inBalance: false })]);
      }
    });
  });

  describe('a planned transfer between two accounts', () => {
    const move = event({ label: 'Savings', kind: 'transfer', amount: 3000, startDate: '2026-10-15', accountId: 'checking', toAccountId: 'savings' });
    const occurrence: OccurrenceRef = { source: 'planned', sourceId: 'event', date: '2026-10-15' };

    it('moves each leg to the first day, leaving their total as it was', () => {
      const plain = model({ plannedEvents: [move] });
      const marked = model({ plannedEvents: [move], happened: [mark(occurrence, 3000)] });
      const whole = available(buildCashPosition(marked));
      expect(whole.happened).toEqual([expect.objectContaining({ kind: 'planned_transfer', amount: 0, counted: 0, inBalance: false })]);
      for (const date of DATES) expect(whole.cashBefore(date)).toBeCloseTo(available(buildCashPosition(plain)).cashBefore(date), 2);

      const checking = available(buildCashPosition(marked, ['checking']));
      const savings = available(buildCashPosition(marked, ['savings']));
      expect(checking.cashBefore('2026-10-02') - available(buildCashPosition(plain, ['checking'])).cashBefore('2026-10-02')).toBeCloseTo(-3000, 2);
      expect(savings.cashBefore('2026-10-02') - available(buildCashPosition(plain, ['savings'])).cashBefore('2026-10-02')).toBeCloseTo(3000, 2);
      expect(checking.happened).toEqual([expect.objectContaining({ kind: 'planned_transfer_out', amount: -3000, counted: -3000 })]);
      for (const date of DATES) {
        expect(checking.cashBefore(date) + savings.cashBefore(date)).toBeCloseTo(whole.cashBefore(date), 1);
      }
    });

    it('counts only the leg the data does not show yet', () => {
      // The money has left checking, and savings hasn't reported it arriving.
      const left = [tx('checking', '2026-09-30', 'transfer_out', 3000, 'ONLINE TRANSFER TO SAV 5678')];
      const plain = available(buildCashPosition(model({ plannedEvents: [move] }, left)));
      const whole = available(buildCashPosition(model({ plannedEvents: [move], happened: [mark(occurrence, 3000)] }, left)));
      expect(whole.happened).toEqual([expect.objectContaining({ amount: 0, counted: 3000, inBalance: false })]);
      expect(whole.cashBefore('2026-10-02') - plain.cashBefore('2026-10-02')).toBeCloseTo(3000, 2);
      expect(whole.cashBefore('2026-10-16') - plain.cashBefore('2026-10-16')).toBeCloseTo(3000, 2);
    });
  });

  describe('a card payment', () => {
    const payment: OccurrenceRef = { source: 'card', sourceId: 'card', date: '2026-10-20' };

    it('leaves cash and comes off the card on the first day', () => {
      const plain = available(buildCashPosition(model()));
      const marked = available(buildCashPosition(model({ happened: [mark(payment, 1800)] })));
      expect(marked.cashBefore('2026-10-02') - plain.cashBefore('2026-10-02')).toBeCloseTo(-1800, 2);
      expect(marked.cardDebtBefore('2026-10-02') - plain.cardDebtBefore('2026-10-02')).toBeCloseTo(-1800, 2);
      expect(marked.cardPaymentsBetween(START, '2026-10-02')).toBeCloseTo(1800, 2);
      for (const date of ['2026-10-21', '2026-11-01', '2027-03-01']) {
        expect(marked.cashBefore(date)).toBeCloseTo(plain.cashBefore(date), 2);
        expect(marked.cardDebtBefore(date)).toBeCloseTo(plain.cardDebtBefore(date), 2);
      }
      expect(marked.happened).toEqual([expect.objectContaining({ label: 'Rewards Card', kind: 'card_payment', amount: -1800, counted: -1800 })]);
      expect(listed(marked, payment)).toEqual([]);
    });

    it('keeps each side where its own data has it', () => {
      // The card shows the payment; the checking account hasn't posted it yet.
      // The provider's due date keeps the payment on the 20th; without one, the
      // card's last payment would set its day.
      const received = [tx('card', '2026-09-30', 'transfer_out', -1800, 'PAYMENT THANK YOU', { personal_finance_category: CARD_PAYMENT_CATEGORY })];
      const accounts = [...ACCOUNTS, SAVINGS].map(account => account.account_id === 'card'
        ? { ...account, liabilityDetails: [{ kind: 'credit', nextPaymentDueDate: '2026-10-20' }] }
        : account);
      const plain = available(buildCashPosition(model({ accounts }, received)));
      const marked = available(buildCashPosition(model({ accounts, happened: [mark(payment, 1800)] }, received)));
      expect(marked.cardDebtBefore('2026-10-02')).toBeCloseTo(plain.cardDebtBefore('2026-10-02'), 2);
      expect(marked.cashBefore('2026-10-02') - plain.cashBefore('2026-10-02')).toBeCloseTo(-1800, 2);
      expect(marked.happened).toEqual([expect.objectContaining({ counted: -1800, inBalance: false })]);
    });

    it('reconciles the payment the user marked, not the smaller one projected after it posts', () => {
      // Marked on Oct 1, paid in full on Oct 2. The refreshed card owes only
      // what was bought since, so it projects $300 for the 20th: that is not
      // the payment that happened, and must not be counted as one.
      const through = '2026-10-03';
      const paid = [
        tx('checking', '2026-10-02', 'transfer_out', 1800, 'CARD CO AUTOPAY', { personal_finance_category: CARD_PAYMENT_CATEGORY }),
        tx('card', '2026-10-02', 'transfer_out', -1800, 'PAYMENT THANK YOU', { personal_finance_category: CARD_PAYMENT_CATEGORY }),
      ];
      const accounts = [...ACCOUNTS, SAVINGS].map(account => account.account_id === 'card'
        ? { ...account, balance: { current: 300 }, liabilityDetails: [{ kind: 'credit', nextPaymentDueDate: '2026-10-20' }] }
        : account);
      const build = (happened: HappenedMark[]) => buildCashFlowModel({
        transactions: [...householdTransactions(FROM, through), ...paid],
        accounts,
        plannedEvents: [],
        dataThrough: through,
        today: '2026-10-04',
        happened,
      });
      const refreshed = build([]);
      expect(refreshed.cards[0].projection!.payments[0]).toEqual({ date: '2026-10-20', amount: 300 });

      const plain = available(buildCashPosition(refreshed));
      const marked = available(buildCashPosition(build([mark(payment, 1800)])));
      expect(marked.happened).toEqual([expect.objectContaining({ amount: -1800, counted: 0, inBalance: true })]);
      // Nothing more leaves on the first day: both balances already have the payment.
      expect(marked.cashBefore('2026-10-05')).toBeCloseTo(plain.cashBefore('2026-10-05'), 2);
      expect(marked.cardDebtBefore('2026-10-05')).toBeCloseTo(plain.cardDebtBefore('2026-10-05'), 2);
      // This month's payment is the one that happened, so the $300 is not paid again on the 20th.
      expect(marked.cashBefore('2026-10-21') - plain.cashBefore('2026-10-21')).toBeCloseTo(300, 2);
    });

    it('counts the amount marked while the payment is still pending', () => {
      // New purchases since the mark raise what the card is projected to be paid.
      const accounts = [...ACCOUNTS, SAVINGS].map(account => account.account_id === 'card'
        ? { ...account, balance: { current: 2100 } }
        : account);
      const plain = available(buildCashPosition(model({ accounts })));
      const marked = available(buildCashPosition(model({ accounts, happened: [mark(payment, 1800)] })));
      expect(marked.happened).toEqual([expect.objectContaining({ amount: -1800, counted: -1800, inBalance: false })]);
      expect(marked.cashBefore('2026-10-02') - plain.cashBefore('2026-10-02')).toBeCloseTo(-1800, 2);
    });
  });

  it('keeps the accounts adding up to the whole', () => {
    const move = event({ label: 'Savings', kind: 'transfer', amount: 3000, accountId: 'checking', toAccountId: 'savings' });
    const built = model({
      plannedEvents: [move, event({ id: 'bonus', label: 'Bonus', kind: 'income', amount: 1200, startDate: '2026-10-18', accountId: 'savings' })],
      happened: [
        mark({ source: 'stream', sourceId: PAYROLL, date: '2026-10-09' }, 2500, { id: 'a' }),
        mark({ source: 'planned', sourceId: 'event', date: '2026-10-15' }, 3000, { id: 'b' }),
        mark({ source: 'planned', sourceId: 'bonus', date: '2026-10-18' }, 1200, { id: 'c' }),
        mark({ source: 'card', sourceId: 'card', date: '2026-10-20' }, 1800, { id: 'd' }),
      ],
    });
    const whole = available(buildCashPosition(built));
    const checking = available(buildCashPosition(built, ['checking']));
    const savings = available(buildCashPosition(built, ['savings']));
    for (const date of DATES) {
      expect(checking.cashBefore(date) + savings.cashBefore(date)).toBeCloseTo(whole.cashBefore(date), 1);
    }
    expect(checking.moneyInBetween(START, '2026-11-01') + savings.moneyInBetween(START, '2026-11-01'))
      .toBeCloseTo(whole.moneyInBetween(START, '2026-11-01'), 1);
    expect(whole.happened.map(item => item.markId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('reports what happened beside what is coming up', () => {
    const paycheck: OccurrenceRef = { source: 'stream', sourceId: PAYROLL, date: '2026-10-09' };
    const report = buildCashFlowReport(model({ happened: [mark(paycheck, 2500)] }), { granularity: 'month', horizonMonths: 6 });
    expect(report.position.happened).toEqual([expect.objectContaining({ ref: paycheck, counted: 2500 })]);
    expect(report.position.upcoming.some(item => occurrenceKey(item.ref) === occurrenceKey(paycheck))).toBe(false);
    expect(report.position.upcoming.find(item => item.kind === 'card_payment')?.ref).toEqual({ source: 'card', sourceId: 'card', date: '2026-10-20' });
  });
});

describe('happenedTarget', () => {
  it('finds an item the cash position lists, labelled from the data', () => {
    const built = model();
    expect(happenedTarget(built, { source: 'stream', sourceId: PAYROLL, date: '2026-10-23' })).toEqual({ label: 'GUSTO PAYROLL SMITH', amount: 2500 });
    expect(happenedTarget(built, { source: 'card', sourceId: 'card', date: '2026-10-20' })).toEqual({ label: 'Rewards Card', amount: 1800 });
    // A planned transfer between two accounts in view moves its amount, though it leaves their total as it was.
    const move = event({ label: 'Savings', kind: 'transfer', amount: 3000, accountId: 'checking', toAccountId: 'savings' });
    expect(happenedTarget(model({ plannedEvents: [move] }), { source: 'planned', sourceId: 'event', date: '2026-10-15' }))
      .toEqual({ label: 'Savings', amount: 3000 });
  });

  it('finds one already marked, so marking it again can return that mark', () => {
    const ref: OccurrenceRef = { source: 'stream', sourceId: PAYROLL, date: '2026-10-09' };
    expect(happenedTarget(model({ happened: [mark(ref, 2500)] }), ref)).toEqual({ label: 'GUSTO PAYROLL SMITH', amount: 2500 });
  });

  it('refuses what the forecast does not expect', () => {
    const built = model();
    expect(happenedTarget(built, { source: 'stream', sourceId: PAYROLL, date: '2026-10-10' })).toBeNull();
    expect(happenedTarget(built, { source: 'stream', sourceId: PAYROLL, date: '2026-09-25' })).toBeNull();
    expect(happenedTarget(built, { source: 'planned', sourceId: 'someone-elses', date: '2026-10-15' })).toBeNull();
    // A card bill is charged on the card; the list has only the payment from cash.
    expect(happenedTarget(built, { source: 'stream', sourceId: 'spending:netflix', date: '2026-10-12' })).toBeNull();
  });

  it('looks account by account when the whole can’t be added up', () => {
    const unknown = { ...SAVINGS, balance: { current: null } };
    const built = buildCashFlowModel({
      transactions: householdTransactions(FROM, THROUGH),
      accounts: [...ACCOUNTS, unknown],
      plannedEvents: [],
      dataThrough: THROUGH,
      today: START,
    });
    expect(buildCashPosition(built).available).toBe(false);
    expect(happenedTarget(built, { source: 'stream', sourceId: PAYROLL, date: '2026-10-09' })).toEqual({ label: 'GUSTO PAYROLL SMITH', amount: 2500 });
  });
});

describe('validateOccurrenceRef', () => {
  it('accepts an item and a calendar date', () => {
    expect(validateOccurrenceRef({ source: 'planned', sourceId: ' event-1 ', date: '2026-10-15' }))
      .toEqual({ ok: true, value: { source: 'planned', sourceId: 'event-1', date: '2026-10-15' } });
  });

  it.each([
    null,
    {},
    { source: 'payee', sourceId: 'x', date: '2026-10-15' },
    { source: 'stream', sourceId: '', date: '2026-10-15' },
    { source: 'stream', sourceId: 'x'.repeat(301), date: '2026-10-15' },
    { source: 'stream', sourceId: 'x', date: '2026-02-30' },
    { source: 'stream', sourceId: 'x', date: 'tomorrow' },
  ])('refuses %o', raw => {
    expect(validateOccurrenceRef(raw)).toEqual({ ok: false, error: 'Choose an item that’s coming up' });
  });
});

describe('ending a cycle', () => {
  it('drops a mark for a day the forecast has passed', () => {
    const occurrence: OccurrenceRef = { source: 'planned', sourceId: 'event', date: '2026-10-15' };
    const later = buildCashFlowModel({
      transactions: householdTransactions(FROM, '2026-10-20'),
      accounts: [...ACCOUNTS, SAVINGS],
      plannedEvents: [event({})],
      dataThrough: '2026-10-20',
      today: '2026-10-21',
      happened: [mark(occurrence, 800)],
    });
    const position = available(buildCashPosition(later));
    expect(position.happened).toEqual([]);
    expect(position.cashBefore(addDays('2026-10-21', 1))).toBeCloseTo(
      available(buildCashPosition({ ...later, happened: [] })).cashBefore('2026-10-22'), 2);
  });
});
