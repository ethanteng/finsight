import { addDays, addMonths } from '../../cash-flow/calendar';
import {
  canProjectCard,
  cardBaseline,
  cardTermsFromAccount,
  projectCard,
  purchasesBetween,
  type CardBaseline,
  type CardHistory,
  type CardProjectionInput,
  type CardPurchases,
  type CardTerms,
} from '../../cash-flow/cards';
import type { PlannedCashFlowEvent } from '../../cash-flow/planned-events';

const terms = (overrides: Partial<CardTerms> = {}): CardTerms => ({
  accountId: 'card', name: 'Rewards Card', mask: '9876', institution: 'Card Co',
  balance: 4000, apr: 24, minimumPayment: 80, paymentDay: 15,
  ...overrides,
});

const history = (overrides: Partial<CardHistory> = {}): CardHistory => ({
  paymentsReceived: 3000, paymentCount: 3, pairedPaymentCount: 3, interestCharged: 180, basisDays: 90, lastPaymentDate: '2026-09-15',
  ...overrides,
});

/** $800 of purchases on the 1st of every month for two years from November 2026. */
const steadyPurchases: CardPurchases = {
  dailyRate: 0,
  dated: Array.from({ length: 25 }, (_, index) => ({ date: addMonths('2026-11-01', index, 1), amount: 800 })),
};

function project(
  baseline: CardBaseline,
  plans: PlannedCashFlowEvent[] = [],
  overrides: Partial<CardTerms> = {},
  input: Partial<CardProjectionInput> = {}
) {
  return projectCard({
    terms: terms(overrides),
    baseline,
    purchases: steadyPurchases,
    plans,
    forecastStart: '2026-11-01',
    forecastEndLimit: '2028-11-01',
    ...input,
  })!;
}

const plan = (overrides: Partial<PlannedCashFlowEvent>): PlannedCashFlowEvent => ({
  id: 'plan', label: 'Card plan', kind: 'card_payment', amount: 0, startDate: '2026-11-20', recurrence: 'once', endDate: null,
  repeatEvery: null, repeatUnit: null, accountId: 'card', toAccountId: null, paymentMode: 'full',
  ...overrides,
});

const carrying: CardBaseline = { behavior: 'average_payment', monthlyPayment: 1000 };

describe('cardTermsFromAccount', () => {
  it('reads the balance, purchase APR, minimum and due day from the provider', () => {
    expect(cardTermsFromAccount({
      account_id: 'card', name: 'Rewards Card', mask: '9876', institution: 'Card Co', balance: { current: 4000 },
      liabilityDetails: [{
        kind: 'credit',
        aprs: [{ type: 'cash_apr', percentage: 29.99 }, { type: 'purchase_apr', percentage: 24.24 }],
        minimumPaymentAmount: 80,
        nextPaymentDueDate: '2026-10-21',
      }],
    })).toEqual({
      accountId: 'card', name: 'Rewards Card', mask: '9876', institution: 'Card Co',
      balance: 4000, apr: 24.24, minimumPayment: 80, paymentDay: 21,
    });
  });

  it('leaves what the provider does not share unknown', () => {
    expect(cardTermsFromAccount({ account_id: 'card', name: 'Store Card', balance: { current: null } }, '2026-09-09'))
      .toMatchObject({ balance: null, apr: null, minimumPayment: null, paymentDay: 9 });
    expect(cardTermsFromAccount({ account_id: 'card', balance: { current: 10 } }).paymentDay).toBe(28);
  });
});

describe('cardBaseline', () => {
  it('reads a card paid with no interest as paid in full', () => {
    expect(cardBaseline(terms(), history({ interestCharged: 0 }))).toEqual({ behavior: 'pays_in_full', monthlyPayment: null });
  });

  it('reads a card that charged interest as carrying a balance at its average payment', () => {
    expect(cardBaseline(terms(), history())).toEqual({ behavior: 'average_payment', monthlyPayment: 1013.89 });
  });

  it('never paces below the minimum payment', () => {
    expect(cardBaseline(terms({ minimumPayment: 1500 }), history()).monthlyPayment).toBe(1500);
  });

  it('falls back to the minimum, and otherwise has nothing to project from', () => {
    const none = history({ paymentsReceived: 0, paymentCount: 0, interestCharged: 0 });
    expect(cardBaseline(terms(), none)).toEqual({ behavior: 'minimum_payment', monthlyPayment: 80 });
    expect(cardBaseline(terms({ minimumPayment: null }), none)).toEqual({ behavior: 'unknown', monthlyPayment: null });
    expect(cardBaseline(terms({ balance: 0, minimumPayment: null }), none).behavior).toBe('pays_in_full');
  });
});

describe('projectCard', () => {
  it('charges no interest on a card paid in full each month', () => {
    const projection = project({ behavior: 'pays_in_full', monthlyPayment: null });
    expect(projection.months[0]).toMatchObject({ statement: 4000, payment: 4000, carried: 0, interest: 0, endBalance: 800 });
    expect(projection.months[1]).toMatchObject({ statement: 800, payment: 800, endBalance: 800 });
    expect(projection.interestTwelveMonths).toBe(0);
    expect(projection.carryingBalanceNow).toBe(false);
    expect(projection.paidOffBy).toBe('2026-11');
  });

  it('charges interest on the unpaid statement at the usual pace', () => {
    const projection = project(carrying);
    // 4,000 statement, 1,000 paid: 3,000 carried at 24% is 60.
    expect(projection.months[0]).toMatchObject({ statement: 4000, payment: 1000, carried: 3000, interest: 60, endBalance: 3860 });
    expect(projection.months[1]).toMatchObject({ statement: 3860, carried: 2860, interest: 57.2 });
    expect(projection.carryingBalanceNow).toBe(true);
    expect(projection.interestTwelveMonths).toBeGreaterThan(500);
    expect(projection.payments[0]).toEqual({ date: '2026-11-15', amount: 1000 });
    expect(projection.interestPostings[0]).toEqual({ date: '2026-11-30', amount: 60 });
  });

  it('pays a set amount every month in place of the usual payment, never more than the statement', () => {
    const projection = project(carrying, [plan({ paymentMode: 'fixed', amount: 2000, recurrence: 'monthly', startDate: '2026-11-15' })]);
    expect(projection.months.slice(0, 4).map(month => [month.payment, month.carried, month.interest])).toEqual([
      [2000, 2000, 40],
      [2000, 840, 16.8],
      [1656.8, 0, 0],
      [800, 0, 0],
    ]);
    expect(projection.paidOffBy).toBe('2027-01');
    expect(projection.months[3].endBalance).toBe(800);
  });

  it('clears the whole balance with a one-time payoff, then returns to the usual pace', () => {
    const projection = project(carrying, [plan({ startDate: '2026-12-20' })]);
    expect(projection.months[1]).toMatchObject({ month: '2026-12', carried: 0, interest: 0, endBalance: 0 });
    // Nothing is left of January's statement to pay; February's, January's
    // purchases, is paid in full at the usual pace.
    expect(projection.months[2]).toMatchObject({ payment: 0, carried: 0, endBalance: 800 });
    expect(projection.months[3]).toMatchObject({ payment: 800, carried: 0, endBalance: 800 });
    expect(projection.paidOffBy).toBe('2026-12');
    expect(projection.payments.filter(payment => payment.date.startsWith('2026-12'))).toEqual([
      { date: '2026-12-15', amount: 1000 },
      { date: '2026-12-20', amount: 3660 },
    ]);
  });

  it('pays off what the card owes that day, and the rest of the month accrues', () => {
    const projection = project(carrying, [plan({ startDate: '2026-12-20' })], {}, { purchases: { dailyRate: 30, dated: [] } });
    // December: a 3,960 statement, 1,000 on the 15th, then 3,960 + 20 days of
    // purchases - 1,000 cleared on the 20th. The 11 days after it stay owed.
    expect(projection.payments.filter(payment => payment.date.startsWith('2026-12'))).toEqual([
      { date: '2026-12-15', amount: 1000 },
      { date: '2026-12-20', amount: 3560 },
    ]);
    expect(projection.months[1]).toMatchObject({ statement: 3960, carried: 0, endBalance: 330 });
    expect(projection.months[2]).toMatchObject({ payment: 330, carried: 0 });
  });

  it('leaves the usual payment nothing to pay after an earlier payoff that month', () => {
    const projection = project(carrying, [plan({ startDate: '2026-12-05' })], {}, { purchases: { dailyRate: 30, dated: [] } });
    expect(projection.payments.filter(payment => payment.date.startsWith('2026-12'))).toEqual([
      { date: '2026-12-05', amount: 4110 },
    ]);
    expect(projection.months[1]).toMatchObject({ carried: 0, endBalance: 780 });
  });

  it('keeps every payoff in a month, each clearing what the card owes on its day', () => {
    const projection = project(carrying, [
      plan({ id: 'first', startDate: '2026-12-05' }),
      plan({ id: 'second', startDate: '2026-12-20' }),
    ], {}, { purchases: { dailyRate: 30, dated: [] } });
    // The usual payment on the 15th has nothing left of the statement to pay.
    expect(projection.payments.filter(payment => payment.date.startsWith('2026-12'))).toEqual([
      { date: '2026-12-05', amount: 4110 },
      { date: '2026-12-20', amount: 450 },
    ]);
    expect(projection.months[1]).toMatchObject({ carried: 0, endBalance: 330 });
  });

  it('never pays more than the card owes on the day', () => {
    const plans = [
      plan({ startDate: '2026-11-05' }),
      plan({ id: 'extra', paymentMode: 'fixed', amount: 5000, startDate: '2027-02-03' }),
      plan({ id: 'monthly', paymentMode: 'fixed', amount: 3000, recurrence: 'monthly', startDate: '2027-04-02' }),
    ];
    const projection = project(carrying, plans, {}, { purchases: { dailyRate: 30, dated: [] } });
    let balance = 4000;
    for (let date = '2026-11-01'; date < '2028-11-01'; date = addDays(date, 1)) {
      balance += 30;
      for (const payment of projection.payments.filter(item => item.date === date)) balance -= payment.amount;
      for (const posting of projection.interestPostings.filter(item => item.date === date)) balance += posting.amount;
      expect(balance).toBeGreaterThan(-1e-6);
    }
  });

  it('accounts the month the window ends in, so a paid-down card is not left carrying', () => {
    // The window ends on the 10th; the last due day, the 15th, is after it.
    const projection = project(carrying, [plan({ startDate: '2026-11-20' })], {}, {
      forecastStart: '2026-11-10',
      forecastEndLimit: '2028-11-10',
    });
    expect(projection.months).toHaveLength(25);
    expect(projection.months[24]).toMatchObject({ month: '2028-11', carried: 0 });
    expect(projection.paidOffBy).toBe('2026-11');
    expect(projection.payments.every(payment => payment.date < '2028-11-10')).toBe(true);
    expect(projection.interestPostings.every(posting => posting.date < '2028-11-10')).toBe(true);
  });

  it('adds a one-time extra payment on top of the usual one', () => {
    const projection = project(carrying, [plan({ paymentMode: 'fixed', amount: 1500, startDate: '2026-11-25' })]);
    expect(projection.months[0]).toMatchObject({ payment: 2500, carried: 1500, interest: 30 });
  });

  it('pays every statement in full from a monthly plan', () => {
    const projection = project(carrying, [plan({ recurrence: 'monthly', startDate: '2027-01-05' })]);
    expect(projection.months[2]).toMatchObject({ month: '2027-01', carried: 0, interest: 0 });
    expect(projection.months.slice(2).every(month => month.carried === 0)).toBe(true);
    expect(projection.paidOffBy).toBe('2027-01');
  });

  it('projects balances but reports interest as unknown without an APR', () => {
    const projection = project(carrying, [], { apr: null });
    expect(projection.months[0]).toMatchObject({ carried: 3000, interest: null, endBalance: 3800 });
    expect(projection.interestTwelveMonths).toBeNull();
    expect(projection.interestPostings).toEqual([]);
  });

  it('skips a due day that passed before the forecast began', () => {
    const projection = project({ behavior: 'pays_in_full', monthlyPayment: null }, [], { paymentDay: 5 }, {
      forecastStart: '2026-11-10',
      forecastEndLimit: '2028-11-10',
    });
    expect(projection.months[0]).toMatchObject({ payment: 0, carried: 0, interest: 0 });
    expect(projection.payments[0].date).toBe('2026-12-05');
  });

  it('charges no interest on a card paid in full when a plan pays some of what it reported', () => {
    const projection = project({ behavior: 'pays_in_full', monthlyPayment: null }, [
      plan({ paymentMode: 'fixed', amount: 200, startDate: '2026-11-20' }),
    ], { paymentDay: 5 }, { forecastStart: '2026-11-10', forecastEndLimit: '2028-11-10' });
    expect(projection.months[0]).toMatchObject({ payment: 200, carried: 0, interest: 0 });
  });

  it('projects a card with no usual pace under a monthly plan, counting only planned payments', () => {
    const unknown: CardBaseline = { behavior: 'unknown', monthlyPayment: null };
    const projection = project(unknown, [plan({ paymentMode: 'fixed', amount: 1500, recurrence: 'monthly', startDate: '2026-12-15' })]);
    // November has no plan payment and no usual one to assume.
    expect(projection.months[0]).toMatchObject({ month: '2026-11', payment: 0, carried: 4000, interest: 80 });
    expect(projection.months[1]).toMatchObject({ month: '2026-12', payment: 1500 });
    expect(projection.payments[0]).toEqual({ date: '2026-12-15', amount: 1500 });
  });

  it('projects nothing for a card with no usual pace and only one-time plans', () => {
    expect(projectCard({
      terms: terms(), baseline: { behavior: 'unknown', monthlyPayment: null }, purchases: steadyPurchases,
      plans: [plan({ startDate: '2026-11-20' })], forecastStart: '2026-11-01', forecastEndLimit: '2028-11-01',
    })).toBeNull();
  });

  it('projects nothing without a balance, or without a pace or a monthly plan', () => {
    expect(projectCard({
      terms: terms({ balance: null }), baseline: carrying, purchases: steadyPurchases, plans: [],
      forecastStart: '2026-11-01', forecastEndLimit: '2028-11-01',
    })).toBeNull();
    expect(projectCard({
      terms: terms(), baseline: { behavior: 'unknown', monthlyPayment: null }, purchases: steadyPurchases, plans: [],
      forecastStart: '2026-11-01', forecastEndLimit: '2028-11-01',
    })).toBeNull();
  });

  it('projects from a monthly plan alone when there is no usual pace', () => {
    const projection = project(
      { behavior: 'unknown', monthlyPayment: null },
      [plan({ recurrence: 'monthly', startDate: '2026-11-05' })],
    );
    // The plan pays every statement in full from the first month, so nothing is carried.
    expect(projection.months[0]).toMatchObject({ month: '2026-11', payment: 4000, carried: 0, interest: 0 });
    expect(projection.months.slice(0).every(month => month.carried === 0)).toBe(true);
    expect(projection.paidOffBy).toBe('2026-11');
    expect(projection.payments[0]).toEqual({ date: '2026-11-05', amount: 4000 });
  });
});

describe('canProjectCard', () => {
  const unknown: CardBaseline = { behavior: 'unknown', monthlyPayment: null };
  const can = (baseline: CardBaseline, plans: PlannedCashFlowEvent[], overrides: Partial<CardTerms> = {}) => canProjectCard({
    terms: terms(overrides), baseline, plans, forecastStart: '2026-11-01', forecastEndLimit: '2028-11-01',
  });

  it('needs a balance, and a usual pace or a monthly plan that pays inside the window', () => {
    expect(can(carrying, [])).toBe(true);
    expect(can(carrying, [], { balance: null })).toBe(false);
    expect(can(unknown, [])).toBe(false);
    expect(can(unknown, [plan({ startDate: '2026-11-20' })])).toBe(false);
    expect(can(unknown, [plan({ recurrence: 'monthly', startDate: '2026-11-20' })])).toBe(true);
    // A monthly plan that ended before the forecast, or starts after it, pays nothing in it.
    expect(can(unknown, [plan({ recurrence: 'monthly', startDate: '2026-03-20', endDate: '2026-08-20' })])).toBe(false);
    expect(can(unknown, [plan({ recurrence: 'monthly', startDate: '2029-01-20' })])).toBe(false);
  });

  it('agrees with whether projectCard projects', () => {
    const cases: Array<[CardBaseline, PlannedCashFlowEvent[]]> = [
      [carrying, []],
      [unknown, []],
      [unknown, [plan({ recurrence: 'monthly', startDate: '2026-11-20' })]],
      [unknown, [plan({ recurrence: 'monthly', startDate: '2026-03-20', endDate: '2026-08-20' })]],
    ];
    for (const [baseline, plans] of cases) {
      expect(can(baseline, plans)).toBe(project(baseline, plans) !== null);
    }
  });
});

describe('purchasesBetween', () => {
  const purchases: CardPurchases = {
    dailyRate: 10,
    dated: [{ date: '2026-11-12', amount: 7 }, { date: '2026-11-25', amount: 15.49 }, { date: '2026-12-01', amount: 99 }],
  };

  it('adds a daily rate over the days and the purchases dated in them, from the forecast start', () => {
    // Nov 21-30 at 10 a day and the Nov 25 purchase; Nov 12 is before the forecast.
    expect(purchasesBetween(purchases, '2026-11-21', '2026-11-01', '2026-12-01')).toBeCloseTo(10 * 10 + 15.49, 6);
    expect(purchasesBetween(purchases, '2026-11-21', '2026-12-01', '2026-12-02')).toBe(109);
  });

  it('counts nothing for days before the forecast start', () => {
    expect(purchasesBetween(purchases, '2026-11-21', '2026-11-01', '2026-11-21')).toBe(0);
  });
});
