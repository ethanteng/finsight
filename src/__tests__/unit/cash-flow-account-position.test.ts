import { addDays, addMonths } from '../../cash-flow/calendar';
import { buildCashFlowModel, buildCashFlowReport, type CashFlowModelInput } from '../../cash-flow/forecast';
import { buildCashPosition, type CashPosition } from '../../cash-flow/position';
import type { PlannedCashFlowEvent } from '../../cash-flow/planned-events';
import { ACCOUNTS, householdTransactions, tx } from './factories/cash-flow.factory';

const FROM = '2026-06-03';
const THROUGH = '2026-09-30';
const SAVINGS = {
  account_id: 'savings', name: 'High Yield Savings', type: 'depository', subtype: 'savings',
  balance: { current: 10000 }, institution: 'First Bank', mask: '5678',
};

/** $500 moves from checking to savings on the 5th, and savings earns a little interest. */
function savingsTransactions(): Array<Record<string, unknown>> {
  const transactions: Array<Record<string, unknown>> = [];
  for (let month = '2026-06-05'; month <= THROUGH; month = addMonths(month, 1)) {
    transactions.push(tx('checking', month, 'transfer_out', 500, 'TRANSFER TO SAVINGS 5678'));
    transactions.push(tx('savings', month, 'transfer_in', -500, 'TRANSFER FROM CHECKING 1234'));
  }
  for (let month = '2026-06-30'; month <= THROUGH; month = addMonths(month, 1, 30)) {
    transactions.push(tx('savings', month, 'income', 12.5, 'INTEREST PAYMENT', { merchant_name: 'First Bank Interest' }));
  }
  return transactions;
}

function model(overrides: Partial<CashFlowModelInput> = {}) {
  return buildCashFlowModel({
    transactions: [...householdTransactions(FROM, THROUGH), ...savingsTransactions()],
    accounts: [...ACCOUNTS, SAVINGS],
    plannedEvents: [],
    dataThrough: THROUGH,
    today: '2026-10-01',
    ...overrides,
  });
}

function available(position: CashPosition) {
  if (!position.available) throw new Error(`position unavailable: ${position.reason}`);
  return position;
}

const event = (overrides: Partial<PlannedCashFlowEvent>): PlannedCashFlowEvent => ({
  id: 'event', label: 'Event', kind: 'income', amount: 1000, startDate: '2026-10-15', recurrence: 'once', endDate: null,
  accountId: null, toAccountId: null, paymentMode: null,
  ...overrides,
});

const DATES = ['2026-10-02', '2026-10-21', '2026-11-01', '2027-01-01', '2027-06-15', addDays(addMonths('2026-10-01', 12), -1)];

function expectSumsToWhole(built: ReturnType<typeof model>) {
  const whole = available(buildCashPosition(built));
  const checking = available(buildCashPosition(built, ['checking']));
  const savings = available(buildCashPosition(built, ['savings']));
  expect(checking.startingCash + savings.startingCash).toBeCloseTo(whole.startingCash, 2);
  for (const date of DATES) {
    expect(checking.cashBefore(date) + savings.cashBefore(date)).toBeCloseTo(whole.cashBefore(date), 1);
  }
  const [from, to] = ['2026-10-01', '2027-04-01'];
  expect(checking.moneyInBetween(from, to) + savings.moneyInBetween(from, to)).toBeCloseTo(whole.moneyInBetween(from, to), 1);
  expect(checking.moneyOutBetween(from, to) + savings.moneyOutBetween(from, to)).toBeCloseTo(whole.moneyOutBetween(from, to), 1);
  expect(checking.cardPaymentsBetween(from, to) + savings.cardPaymentsBetween(from, to))
    .toBeCloseTo(whole.cardPaymentsBetween(from, to), 1);
  return { whole, checking, savings };
}

describe('the cash position, account by account', () => {
  it('finds the account money usually lands in, and the one that pays the card', () => {
    const built = model();
    expect(built.primaryAccountId).toBe('checking');
    expect(built.cards[0].paidFrom).toBe('checking');
  });

  it('adds up, account by account, to the whole', () => {
    expectSumsToWhole(model());
  });

  it('keeps each flow in the account it moves through', () => {
    const { checking, savings } = expectSumsToWhole(model());
    const firstMonth = (position: Extract<CashPosition, { available: true }>) =>
      position.itemsBetween('2026-10-01', '2026-11-01').map(item => `${item.date} ${item.kind} ${item.amount}`);

    // Pay lands in checking, rent and the card payment leave it, and so does the move to savings.
    const inChecking = firstMonth(checking);
    expect(inChecking).toEqual(expect.arrayContaining([
      expect.stringMatching(/^2026-10-\d\d income 2500$/),
      '2026-10-01 bill -2000',
      expect.stringMatching(/^2026-10-05 transfer_out -500$/),
      expect.stringMatching(/^2026-10-20 card_payment -/),
    ]));
    // Savings sees the move in, and its own interest.
    expect(firstMonth(savings)).toEqual(['2026-10-05 transfer_in 500', '2026-10-31 income 12.5']);
    expect(savings.cardIds).toEqual([]);
    expect(checking.cardIds).toEqual(['card']);
    expect(savings.cardPaymentsBetween('2026-10-01', '2027-10-01')).toBe(0);
  });

  it('puts each part of a split paycheck in the account it is paid into', () => {
    // The payroll that pays $2,500 into checking also sends $1,000 to savings
    // on the same days; the savings bank describes it its own way.
    const toSavings: Array<Record<string, unknown>> = [];
    for (let pay = '2025-01-03'; pay <= THROUGH; pay = addDays(pay, 14)) {
      if (pay >= FROM) toSavings.push(tx('savings', pay, 'income', 1000, `GUSTO PAYROLL ${pay.replace(/-/g, '')} SMITH`));
    }
    const built = model({ transactions: [...householdTransactions(FROM, THROUGH), ...savingsTransactions(), ...toSavings] });
    const { checking, savings, whole } = expectSumsToWhole(built);
    const paydays = (position: Extract<CashPosition, { available: true }>) => position.itemsBetween('2026-10-01', '2026-11-01')
      .filter(item => item.kind === 'income' && item.label.startsWith('GUSTO'))
      .map(item => `${item.date} ${item.amount}`);
    expect(paydays(checking)).toEqual(['2026-10-09 2500', '2026-10-23 2500']);
    expect(paydays(savings)).toEqual(['2026-10-09 1000', '2026-10-23 1000']);
    expect(paydays(whole)).toEqual(['2026-10-09 2500', '2026-10-09 1000', '2026-10-23 2500', '2026-10-23 1000']);
  });

  it('says what moves the balance each day without being listed, so the list adds up', () => {
    // Everyday spending from checking, at irregular amounts, runs as a rate.
    const cafe = ['2026-07-08', '2026-07-11', '2026-07-25', '2026-08-01', '2026-08-19', '2026-08-23', '2026-09-09', '2026-09-12', '2026-09-27']
      .map((date, index) => tx('checking', date, 'expense', [42, 18, 77, 35, 64, 23, 51, 90, 29][index], 'CORNER CAFE'));
    const built = model({ transactions: [...householdTransactions(FROM, THROUGH), ...savingsTransactions(), ...cafe] });
    const checking = available(buildCashPosition(built, ['checking']));
    expect(checking.spreadPerDay.out).toBeGreaterThan(0);

    const listed = new Set(checking.itemsBetween('2026-10-01', '2026-11-01').map(item => item.date));
    const quiet = Array.from({ length: 30 }, (_, index) => addDays('2026-10-01', index)).find(date => !listed.has(date))!;
    expect(checking.cashBefore(addDays(quiet, 1)) - checking.cashBefore(quiet))
      .toBeCloseTo(checking.spreadPerDay.in - checking.spreadPerDay.out, 1);

    const report = buildCashFlowReport(built, { granularity: 'month', horizonMonths: 3, accountIds: ['checking'] });
    expect(report.position.spreadPerDay).toEqual(checking.spreadPerDay);
  });

  it('lists each item with the balance at the end of its day', () => {
    const checking = available(buildCashPosition(model(), ['checking']));
    for (const item of checking.itemsBetween('2026-10-01', '2026-11-01')) {
      expect(item.balanceAfter).toBe(checking.cashBefore(addDays(item.date, 1)));
    }
  });

  it('puts planned income and expenses in the account chosen for them, or the primary one', () => {
    const toSavings = event({ id: 'gift', label: 'Gift', accountId: 'savings' });
    const unplaced = event({ id: 'bonus', label: 'Bonus', amount: 3000 });
    const { checking, savings } = expectSumsToWhole(model({ plannedEvents: [toSavings, unplaced] }));
    expect(savings.itemsBetween('2026-10-15', '2026-10-16')).toEqual([
      expect.objectContaining({ label: 'Gift', kind: 'planned_income', amount: 1000 }),
    ]);
    expect(checking.itemsBetween('2026-10-15', '2026-10-16')).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Bonus', kind: 'planned_income', amount: 3000 }),
    ]));
    // A planned account that is not a cash account leaves the event with the primary one.
    const onCard = model({ plannedEvents: [event({ id: 'odd', label: 'Odd', accountId: 'card' })] });
    expect(available(buildCashPosition(onCard, ['checking'])).itemsBetween('2026-10-15', '2026-10-16'))
      .toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Odd' })]));
  });

  it('moves a planned transfer out of one account and into the other, leaving the whole unchanged', () => {
    const transfer = event({
      id: 'move', label: 'Move to savings', kind: 'transfer', amount: 750, accountId: 'checking', toAccountId: 'savings',
      startDate: '2026-10-15', recurrence: 'monthly',
    });
    const without = expectSumsToWhole(model());
    const withTransfer = expectSumsToWhole(model({ plannedEvents: [transfer] }));

    expect(withTransfer.checking.itemsBetween('2026-10-15', '2026-10-16')).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Move to savings', kind: 'planned_transfer_out', amount: -750 }),
    ]));
    expect(withTransfer.savings.itemsBetween('2026-10-15', '2026-10-16')).toEqual([
      expect.objectContaining({ label: 'Move to savings', kind: 'planned_transfer_in', amount: 750 }),
    ]);
    // Three transfers by the start of January: checking holds $2,250 less, savings $2,250 more.
    expect(withTransfer.checking.cashBefore('2027-01-01')).toBeCloseTo(without.checking.cashBefore('2027-01-01') - 2250, 2);
    expect(withTransfer.savings.cashBefore('2027-01-01')).toBeCloseTo(without.savings.cashBefore('2027-01-01') + 2250, 2);
    expect(withTransfer.whole.cashBefore('2027-01-01')).toBeCloseTo(without.whole.cashBefore('2027-01-01'), 2);
  });

  it('moves nothing when a planned transfer would leave and land in the same account', () => {
    // The account it left is no longer connected, so it falls to checking, where it was going.
    const stale = event({ id: 'stale', kind: 'transfer', amount: 750, accountId: 'closed', toAccountId: 'checking' });
    const built = model({ plannedEvents: [stale] });
    const checking = available(buildCashPosition(built, ['checking']));
    expect(checking.itemsBetween('2026-10-15', '2026-10-16').filter(item => item.label === 'Event')).toEqual([]);
    expect(checking.cashBefore('2027-01-01')).toBe(available(buildCashPosition(model(), ['checking'])).cashBefore('2027-01-01'));
  });

  it('spreads an override over the accounts the way the history did', () => {
    // Residual side income on savings alone must not claim the whole income
    // override: paychecks lived on checking as a stream, and streams are off
    // under an override, so weights come from every counted basis income.
    const irregularSavingsIncome = [
      tx('savings', '2026-06-15', 'income', 80, 'SIDE GIG A'),
      tx('savings', '2026-07-22', 'income', 95, 'SIDE GIG B'),
      tx('savings', '2026-08-10', 'income', 70, 'SIDE GIG C'),
      tx('savings', '2026-09-18', 'income', 110, 'SIDE GIG D'),
    ];
    const { checking, savings, whole } = expectSumsToWhole(model({
      transactions: [...householdTransactions(FROM, THROUGH), ...savingsTransactions(), ...irregularSavingsIncome],
      overrides: { monthlyIncome: 9000, monthlyExpense: 7000 },
    }));
    const [from, to] = ['2026-10-01', '2027-04-01'];
    const checkingIn = checking.moneyInBetween(from, to);
    const savingsIn = savings.moneyInBetween(from, to);
    expect(checkingIn).toBeGreaterThan(savingsIn);
    expect(checkingIn + savingsIn).toBeCloseTo(whole.moneyInBetween(from, to), 1);
  });

  it('covers a chosen account even when another one has no balance', () => {
    const accounts = [...ACCOUNTS, { ...SAVINGS, balance: { current: null } }];
    const built = model({ accounts });
    expect(buildCashPosition(built)).toEqual({ available: false, reason: 'unknown_balance' });
    expect(buildCashPosition(built, ['savings'])).toEqual({ available: false, reason: 'unknown_balance' });
    expect(available(buildCashPosition(built, ['checking'])).startingCash).toBe(5200);
  });
});

describe('the report’s cash position for chosen accounts', () => {
  const request = { granularity: 'month' as const, horizonMonths: 3 };

  it('lists the cash accounts and covers all of them unless some are chosen', () => {
    const report = buildCashFlowReport(model(), request);
    expect(report.position.accounts.map(account => [account.id, account.primary])).toEqual([['checking', true], ['savings', false]]);
    expect(report.position.accountIds).toEqual(['checking', 'savings']);
    expect(report.position.startingCash).toBe(15200);

    const checking = buildCashFlowReport(model(), { ...request, accountIds: ['checking'] });
    expect(checking.position.accountIds).toEqual(['checking']);
    expect(checking.position.startingCash).toBe(5200);
    expect(checking.position.cardIds).toEqual(['card']);
  });

  it('says which account each recurring item is expected in', () => {
    const report = buildCashFlowReport(model(), request);
    const accountOf = (label: string) => report.recurring.find(item => item.label === label)?.accountId;
    expect(accountOf('Oak Street Apartments')).toBe('checking');
    expect(accountOf('Netflix')).toBe('card');
    expect(accountOf('First Bank Interest')).toBe('savings');
    const transfers = report.position.available ? report.position.transfers.recurring : [];
    expect(transfers.map(item => [item.direction, item.accountId])).toEqual(expect.arrayContaining([['out', 'checking'], ['in', 'savings']]));
  });

  it('ignores ids that are not cash accounts', () => {
    const report = buildCashFlowReport(model(), { ...request, accountIds: ['card', 'nope'] });
    expect(report.position.available).toBe(true);
    expect(report.position.accountIds).toEqual(['checking', 'savings']);
  });

  it('lists everything coming up in the month, however much there is', () => {
    // Twelve weekly plans: some sixty items in the month, all of which the page offers to show.
    const weekly = Array.from({ length: 12 }, (_, index) =>
      event({ id: `weekly-${index}`, label: `Weekly ${index}`, kind: 'expense', amount: 10, startDate: '2026-10-01', recurrence: 'weekly' }));
    const built = model({ plannedEvents: weekly });
    const report = buildCashFlowReport(built, { ...request, accountIds: ['checking'] });
    const inMonth = available(buildCashPosition(built, ['checking'])).itemsBetween(built.forecastStart, addDays(built.forecastStart, 31));
    expect(report.position.upcoming.length).toBeGreaterThan(40);
    expect(report.position.upcoming).toEqual(inMonth);
  });

  it('reports what arrives and leaves in each period, and what is coming up', () => {
    const report = buildCashFlowReport(model(), { ...request, accountIds: ['savings'] });
    const october = report.position.periods.find(period => period.key === '2026-10')!;
    expect(october.moneyIn).toBeGreaterThan(500);
    expect(october.moneyOut).toBe(0);
    expect(october.cardPayments).toBe(0);
    expect(october.cash).toBeCloseTo(10000 + october.moneyIn!, 2);
    expect(report.position.upcoming).toEqual([
      expect.objectContaining({ date: '2026-10-05', kind: 'transfer_in', amount: 500, balanceAfter: 10500 }),
      expect.objectContaining({ date: '2026-10-31', kind: 'income', label: 'First Bank Interest', amount: 12.5, balanceAfter: 10512.5 }),
    ]);
  });
});
