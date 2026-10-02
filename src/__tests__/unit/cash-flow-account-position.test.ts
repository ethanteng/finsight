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
  accountId: null, paymentMode: null,
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

  it('spreads an override over the accounts the way the history did', () => {
    expectSumsToWhole(model({ overrides: { monthlyIncome: 9000, monthlyExpense: 7000 } }));
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

  it('ignores ids that are not cash accounts', () => {
    const report = buildCashFlowReport(model(), { ...request, accountIds: ['card', 'nope'] });
    expect(report.position.available).toBe(true);
    expect(report.position.accountIds).toEqual(['checking', 'savings']);
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
