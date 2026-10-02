import { addDays } from '../../cash-flow/calendar';
import { buildCashFlowModel, type CashFlowModelInput } from '../../cash-flow/forecast';
import { buildCashPosition, cashMilestones, type CashPosition } from '../../cash-flow/position';
import type { PlannedCashFlowEvent } from '../../cash-flow/planned-events';
import {
  ACCOUNTS,
  accountsWithCardTerms,
  householdTransactions,
  interestCharges,
} from './factories/cash-flow.factory';

const FROM = '2026-06-03';
const THROUGH = '2026-09-30';
const carrying = [...householdTransactions(FROM, THROUGH), ...interestCharges(FROM, THROUGH)];

function model(overrides: Partial<CashFlowModelInput> = {}) {
  return buildCashFlowModel({
    transactions: carrying,
    accounts: accountsWithCardTerms(),
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
  id: 'event', label: 'Event', kind: 'expense', amount: 0, startDate: '2026-10-25', recurrence: 'once', endDate: null,
  accountId: null, paymentMode: null,
  ...overrides,
});

describe('buildCashPosition', () => {
  it('starts from the reported balances and moves cash on the day money moves', () => {
    const built = model();
    const position = available(buildCashPosition(built));
    expect(position.startingCash).toBe(5200);
    expect(position.startingCardDebt).toBe(4000);
    expect(position.cashBefore('2026-10-01')).toBe(5200);
    // Rent leaves checking on the 1st; everyday spending is on the card.
    expect(position.cashBefore('2026-10-02')).toBe(3200);
    // The card's usual payment goes out of cash on its due day, the 20th.
    const usual = built.cards[0].baseline.monthlyPayment!;
    expect(position.cashBefore('2026-10-21') - position.cashBefore('2026-10-20')).toBeCloseTo(-usual, 2);
  });

  it('keeps card balances in step with the card model', () => {
    const built = model();
    const position = available(buildCashPosition(built));
    const october = built.cards[0].projection!.months[0];
    expect(position.cardDebtBefore('2026-11-01')).toBeCloseTo(october.endBalance, 2);
  });

  it('takes a payoff plan out of cash and off the card', () => {
    const payoff = event({ kind: 'card_payment', accountId: 'card', paymentMode: 'full' });
    const built = model({ plannedEvents: [payoff] });
    const position = available(buildCashPosition(built));
    const payment = built.cards[0].projection!.payments.find(item => item.date === '2026-10-25')!.amount;
    expect(payment).toBeGreaterThan(3000);
    expect(position.cashBefore('2026-10-25') - position.cashBefore('2026-10-26')).toBeCloseTo(payment, 2);
    // The card also takes that day's purchases.
    const dayOfPurchases = built.cardDailySpending.get('card')!;
    expect(position.cardDebtBefore('2026-10-25') - position.cardDebtBefore('2026-10-26')).toBeCloseTo(payment - dayOfPurchases, 2);
  });

  it('clears the card on the payoff day and never shows a credit', () => {
    const payoff = event({ kind: 'card_payment', accountId: 'card', paymentMode: 'full' });
    const built = model({ plannedEvents: [payoff] });
    const position = available(buildCashPosition(built));
    expect(position.cardDebtBefore('2026-10-26')).toBe(0);
    for (let date = built.forecastStart; date <= built.forecastEndLimit; date = addDays(date, 1)) {
      expect(Object.is(position.cardDebtBefore(date), -0)).toBe(false);
      expect(position.cardDebtBefore(date)).toBeGreaterThanOrEqual(0);
    }
  });

  it('pays off and never shows a credit when the forecast starts mid-month', () => {
    const through = '2026-10-14';
    const built = model({
      transactions: [...householdTransactions(FROM, through), ...interestCharges(FROM, through)],
      dataThrough: through,
      today: '2026-10-15',
      plannedEvents: [event({ kind: 'card_payment', accountId: 'card', paymentMode: 'full', startDate: '2026-11-03' })],
    });
    expect(built.forecastStart).toBe('2026-10-15');
    expect(built.cards[0].currentPace!.carryingBalanceNow).toBe(true);
    expect(built.cards[0].projection!.paidOffBy).toBe('2026-11');
    const position = available(buildCashPosition(built));
    for (let date = built.forecastStart; date <= built.forecastEndLimit; date = addDays(date, 1)) {
      expect(position.cardDebtBefore(date)).toBeGreaterThanOrEqual(0);
    }
  });

  it('moves cash for planned income and expenses on their dates', () => {
    const position = available(buildCashPosition(model({ plannedEvents: [event({ amount: 3000 })] })));
    const baseline = available(buildCashPosition(model()));
    expect(position.cashBefore('2026-10-26') - baseline.cashBefore('2026-10-26')).toBe(-3000);
    expect(position.cashBefore('2026-10-25')).toBe(baseline.cashBefore('2026-10-25'));
  });

  it('does not take payments out of connected cash for a card paid from elsewhere', () => {
    const paidElsewhere = carrying.filter(item => item.name !== 'CARD CO AUTOPAY');
    const position = available(buildCashPosition(model({ transactions: paidElsewhere })));
    expect(position.cashBefore('2026-10-21')).toBe(position.cashBefore('2026-10-20'));
  });

  it('finds the lowest point, which no day in the window is below', () => {
    const position = available(buildCashPosition(model()));
    const low = position.lowPoint('2026-10-01', '2027-10-01')!;
    for (const date of ['2026-10-15', '2027-01-01', '2027-06-30', '2027-09-30']) {
      expect(low.cash).toBeLessThanOrEqual(position.cashBefore(date));
    }
  });

  it('reports why there is no position instead of guessing', () => {
    expect(buildCashPosition(model({ transactions: householdTransactions('2026-09-20', THROUGH) })))
      .toEqual({ available: false, reason: 'forecast_unavailable' });
    expect(buildCashPosition(model({ accounts: accountsWithCardTerms().filter(account => account.account_id !== 'checking') })))
      .toEqual({ available: false, reason: 'no_cash_accounts' });
    expect(buildCashPosition(model({
      accounts: accountsWithCardTerms().map(account => account.account_id === 'checking' ? { ...account, balance: { current: null } } : account),
    }))).toEqual({ available: false, reason: 'unknown_balance' });
  });

  it('leaves out a card it cannot project, and says why', () => {
    const position = available(buildCashPosition(model({
      accounts: ACCOUNTS.map(account => account.account_id === 'card' ? { ...account, balance: { current: null } } : account),
    })));
    expect(position.cardsLeftOut).toEqual([{ accountId: 'card', name: 'Rewards Card', reason: 'no_balance' }]);
    expect(position.startingCardDebt).toBe(0);
  });
});

describe('cashMilestones', () => {
  it('reports month ends and spans from the forecast start', () => {
    const built = model();
    const position = available(buildCashPosition(built));
    const milestones = cashMilestones(built, position);
    expect(milestones.points.map(point => [point.key, point.date])).toEqual([
      ['end_of_this_month', '2026-10-31'],
      ['end_of_next_month', '2026-11-30'],
      ['in_3_months', '2026-12-31'],
      ['in_6_months', '2027-03-31'],
      ['in_12_months', '2027-09-30'],
    ]);
    expect(milestones.points[0].cash).toBe(position.cashBefore('2026-11-01'));
    expect(milestones.lowNext12Months).not.toBeNull();
  });
});
