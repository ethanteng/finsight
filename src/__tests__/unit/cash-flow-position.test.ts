import { addDays, daysBetween } from '../../cash-flow/calendar';
import { buildCashFlowModel, type CashFlowModelInput } from '../../cash-flow/forecast';
import { buildCashPosition, cashMilestones, type CashPosition } from '../../cash-flow/position';
import type { PlannedCashFlowEvent } from '../../cash-flow/planned-events';
import {
  ACCOUNTS,
  CARD_TERMS,
  INTEREST_CHARGE_CATEGORY,
  accountsWithCardTerms,
  householdTransactions,
  interestCharges,
  tx,
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

  it('counts card interest once under a spending override, which already includes it', () => {
    // With both overrides nothing is scheduled: income and spending are flat daily rates.
    const built = model({ overrides: { monthlyIncome: 8000, monthlyExpense: 6000 } });
    const card = built.cards[0];
    expect(card.modelsInterest).toBe(true);
    // History charged $60 on Jul 28, Aug 28 and Sep 28: $2 a day over the 90-day basis.
    // It stays on the card, out of cash, and the card's APR interest replaces it.
    expect(built.cardDailySpending.get('card')! - card.purchases.dailyRate).toBeCloseTo(2, 6);

    const position = available(buildCashPosition(built));
    const end = '2027-10-01';
    const days = daysBetween(built.forecastStart, end);
    const aprInterest = card.projection!.interestPostings
      .filter(posting => posting.date < end)
      .reduce((sum, posting) => sum + posting.amount, 0);
    const transfers = days * built.transfers.dailyNet + built.transfers.scheduled
      .filter(item => item.date < end)
      .reduce((sum, item) => sum + item.amount, 0);
    const net = (date: string) => position.cashBefore(date) - position.cardDebtBefore(date);
    const expected = days * (built.typical.dailyIncome - (built.typical.dailySpending - 2)) - aprInterest + transfers;
    expect(aprInterest).toBeGreaterThan(0);
    expect(net(end) - net(built.forecastStart)).toBeCloseTo(expected, 1);
  });

  it('never takes more interest out of an override than the override itself', () => {
    const built = model({ overrides: { monthlyIncome: null, monthlyExpense: 30 } });
    expect(built.cardDailySpending.get('card')!).toBeCloseTo(30 / (365 / 12), 6);
    expect(built.cards[0].purchases.dailyRate).toBeCloseTo(0, 6);
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

  it('does not stack learned interest charges on APR interest for a plan-only card', () => {
    // Unknown pace + monthly plan: savings keeps the INTEREST stream, but the
    // card posts APR interest. Card debt must match a history without charges.
    const noPayments = carrying.filter(item => item.name !== 'CARD CO AUTOPAY' && item.name !== 'PAYMENT THANK YOU');
    const noMinimum = accountsWithCardTerms().map(account => account.account_id === 'card'
      ? { ...account, liabilityDetails: [{ ...CARD_TERMS, minimumPaymentAmount: null }] }
      : account);
    const monthly = event({
      id: 'monthly', kind: 'card_payment', accountId: 'card', paymentMode: 'fixed', amount: 1500,
      recurrence: 'monthly', startDate: '2026-10-20', label: 'Rewards Card payment',
    });
    const withCharges = model({ transactions: noPayments, accounts: noMinimum, plannedEvents: [monthly] });
    const withoutCharges = model({
      transactions: noPayments.filter(item => !String(item.name).includes('INTEREST')),
      accounts: noMinimum,
      plannedEvents: [monthly],
    });
    expect(withCharges.cards[0].modelsInterest).toBe(false);
    expect(withCharges.cards[0].projection).not.toBeNull();
    const debtWith = available(buildCashPosition(withCharges)).cardDebtBefore('2027-10-01');
    const debtWithout = available(buildCashPosition(withoutCharges)).cardDebtBefore('2027-10-01');
    expect(debtWith).toBeCloseTo(debtWithout, 2);
  });

  it('charges a card exactly what its projection was given, irregular interest included', () => {
    const charge = (date: string, amount: number) =>
      tx('card', date, 'fee', amount, 'INTEREST CHARGE ON PURCHASES', { personal_finance_category: INTEREST_CHARGE_CATEGORY });
    const base = carrying.filter(item => !['CARD CO AUTOPAY', 'PAYMENT THANK YOU'].includes(String(item.name)) && !String(item.name).includes('INTEREST'));
    const noMinimum = accountsWithCardTerms().map(account => account.account_id === 'card'
      ? { ...account, liabilityDetails: [{ ...CARD_TERMS, minimumPaymentAmount: null }] }
      : account);
    const monthly = event({
      id: 'monthly', kind: 'card_payment', accountId: 'card', paymentMode: 'fixed', amount: 1500,
      recurrence: 'monthly', startDate: '2026-10-20', label: 'Rewards Card payment',
    });
    const built = model({
      transactions: [...base, charge('2026-07-03', 23.5), charge('2026-08-19', 81.25), charge('2026-09-08', 47.1)],
      accounts: noMinimum,
      plannedEvents: [monthly],
    });
    const position = available(buildCashPosition(built));
    for (const month of built.cards[0].projection!.months.slice(0, 12)) {
      const nextMonth = addDays(`${month.month}-28`, 7).slice(0, 7);
      expect(position.cardDebtBefore(`${nextMonth}-01`)).toBeCloseTo(month.endBalance, 2);
    }
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
