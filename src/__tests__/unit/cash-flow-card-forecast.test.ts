import {
  buildCashFlowHighlights,
  buildCashFlowModel,
  buildCashFlowReport,
  forecastTotals,
  type CashFlowModelInput,
} from '../../cash-flow/forecast';
import { addMonths } from '../../cash-flow/calendar';
import type { PlannedCashFlowEvent } from '../../cash-flow/planned-events';
import {
  ACCOUNTS,
  CARD_PAYMENT_CATEGORY,
  CARD_TERMS,
  INTEREST_CHARGE_CATEGORY,
  accountsWithCardTerms,
  householdTransactions,
  interestCharges,
  tx,
} from './factories/cash-flow.factory';

const FROM = '2026-06-03';
const THROUGH = '2026-09-30';
const household = householdTransactions(FROM, THROUGH);
const carrying = [...household, ...interestCharges(FROM, THROUGH)];

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

const payoff: PlannedCashFlowEvent = {
  id: 'payoff', label: 'Pay off Rewards Card', kind: 'card_payment', amount: 0, startDate: '2026-10-25', recurrence: 'once',
  endDate: null, accountId: 'card', paymentMode: 'full',
};

const NEXT_12 = ['2026-10-01', addMonths('2026-10-01', 12)] as const;

describe('cards in the forecast', () => {
  it('projects interest from the card terms instead of learning it from history', () => {
    const built = model();
    const card = built.cards[0];
    expect(card).toMatchObject({ modelsInterest: true, paymentSource: 'connected' });
    expect(card.baseline).toEqual({ behavior: 'average_payment', monthlyPayment: expect.any(Number) });
    // Learned from the history without the interest charges, exactly as if they were never there.
    const withoutCharges = model({ transactions: household });
    expect(built.typical.dailySpending).toBeCloseTo(withoutCharges.typical.dailySpending, 6);
    expect(built.streams.some(stream => stream.label.includes('INTEREST'))).toBe(false);
    expect(forecastTotals(built, ...NEXT_12)!.components.cardInterest).toBeGreaterThan(0);
  });

  it('keeps learning interest from history when the APR is unknown', () => {
    const built = model({ accounts: ACCOUNTS });
    expect(built.cards[0].modelsInterest).toBe(false);
    expect(built.streams.some(stream => stream.label.includes('INTEREST'))).toBe(true);
    expect(forecastTotals(built, ...NEXT_12)!.components.cardInterest).toBe(0);
  });

  it('lets a payoff plan cut the projected interest, and reports the change as the plan’s effect', () => {
    const built = model({ plannedEvents: [payoff] });
    const withPlan = forecastTotals(built, ...NEXT_12)!;
    const usualPace = forecastTotals(built, ...NEXT_12, { includePlans: false })!;
    expect(withPlan.components.cardInterest).toBeLessThan(usualPace.components.cardInterest);

    const next12 = buildCashFlowHighlights(built).find(item => item.key === 'next_12_months')!;
    const interestSaved = usualPace.components.cardInterest - withPlan.components.cardInterest;
    expect(next12.planned.net).toBeCloseTo(interestSaved, 2);
    expect(next12.projectedWithoutPlanned!.net).toBeCloseTo(next12.projected!.net - next12.planned.net, 2);
  });

  it('never counts a card payment as income or spending', () => {
    const fixed: PlannedCashFlowEvent = { ...payoff, id: 'fixed', paymentMode: 'fixed', amount: 2000, recurrence: 'monthly' };
    const built = model({ plannedEvents: [fixed] });
    const totals = forecastTotals(built, ...NEXT_12)!;
    expect(totals.components.plannedIncome).toBe(0);
    expect(totals.components.plannedSpending).toBe(0);
  });
});

describe('transfers in the forecast', () => {
  const brokerage = (date: string) => tx('checking', date, 'transfer_out', 500, 'VANGUARD BUY TRANSFER');
  const storeCard = (date: string) => tx('checking', date, 'transfer_out', 200, 'STORE CARD PAYMENT', { personal_finance_category: CARD_PAYMENT_CATEGORY });
  const monthly = (make: (date: string) => Record<string, unknown>, day: number) =>
    ['2026-06', '2026-07', '2026-08', '2026-09'].map(month => make(`${month}-${String(day).padStart(2, '0')}`));

  it('leaves payments to a projected card to the card, and keeps every other outflow', () => {
    const built = model({ transactions: [...carrying, ...monthly(brokerage, 5), ...monthly(storeCard, 8)] });
    const labels = built.transfers.streams.map(stream => stream.label);
    expect(labels).toEqual(expect.arrayContaining(['VANGUARD BUY TRANSFER', 'STORE CARD PAYMENT']));
    expect(labels).not.toContain('CARD CO AUTOPAY');
    const october = built.transfers.scheduled.filter(item => item.date.startsWith('2026-10'));
    expect(october.map(item => item.amount).sort()).toEqual([-500, -200].sort());
  });

  it('marks a card paid from somewhere not connected', () => {
    const paidElsewhere = carrying.filter(item => item.name !== 'CARD CO AUTOPAY');
    expect(model({ transactions: paidElsewhere }).cards[0].paymentSource).toBe('other');
  });

  it('spreads a spending override across the cards in the proportion history spent on them', () => {
    const built = model({ overrides: { monthlyIncome: null, monthlyExpense: 6000 } });
    const cardShare = built.cardDailySpending.get('card')! / built.typical.dailySpending;
    expect(cardShare).toBeGreaterThan(0);
    expect(cardShare).toBeLessThan(1);
  });

  it('does not stack projected card interest on top of a spending override', () => {
    const built = model({ overrides: { monthlyIncome: null, monthlyExpense: 6000 } });
    const totals = forecastTotals(built, ...NEXT_12)!;
    expect(built.cards[0].modelsInterest).toBe(true);
    expect(totals.components.cardInterest).toBe(0);
    expect(totals.spending).toBe(72000);
  });

  it('lets a payoff plan project a card that has no usual pace', () => {
    const noPaceAccounts = ACCOUNTS.map(account => account.account_id === 'card'
      ? {
          ...account,
          balance: { current: 2500 },
          liabilityDetails: [{
            kind: 'credit',
            aprs: [{ type: 'purchase_apr', percentage: 22 }],
            minimumPaymentAmount: null,
            nextPaymentDueDate: '2026-10-20',
          }],
        }
      : account);
    const noPayments = household.filter(item => item.name !== 'CARD CO AUTOPAY' && item.name !== 'PAYMENT THANK YOU');
    const monthlyFull: PlannedCashFlowEvent = {
      ...payoff, id: 'monthly-full', recurrence: 'monthly', startDate: '2026-10-25',
    };
    const built = model({
      transactions: noPayments,
      accounts: noPaceAccounts,
      plannedEvents: [monthlyFull],
    });
    expect(built.cards[0].baseline.behavior).toBe('unknown');
    expect(built.cards[0].currentPace).toBeNull();
    expect(built.cards[0].projection).not.toBeNull();
    expect(built.cards[0].projection!.paidOffBy).toBe('2026-10');
    expect(built.cards[0].projection!.payments.some(payment => payment.date === '2026-10-25')).toBe(true);
  });
});

describe('the report’s cards and cash position', () => {
  it('summarises each card at its usual pace and with its plans', () => {
    const usual = buildCashFlowReport(model(), { granularity: 'month', horizonMonths: 6 }).cards[0];
    expect(usual).toMatchObject({
      accountId: 'card', name: 'Rewards Card', balance: 4000, apr: 24, paymentDay: 20,
      behavior: 'average_payment', paymentSource: 'connected', withPlans: null, interestSaved: null, planIds: [],
    });
    expect(usual.currentPace!.carryingBalanceNow).toBe(true);
    expect(usual.currentPace!.interestTwelveMonths).toBeGreaterThan(0);
    expect(usual.currentPace!.months).toHaveLength(24); // Oct 2026 to Sep 2028

    const planned = buildCashFlowReport(model({ plannedEvents: [payoff] }), { granularity: 'month', horizonMonths: 6 }).cards[0];
    expect(planned.withPlans!.paidOffBy).toBe('2026-10');
    expect(planned.interestSaved!.twelveMonths).toBeCloseTo(
      planned.currentPace!.interestTwelveMonths! - planned.withPlans!.interestTwelveMonths!, 2
    );
    expect(planned.interestSaved!.twelveMonths).toBeGreaterThan(0);
    expect(planned.planIds).toEqual(['payoff']);
  });

  it('reports cash and card balances at each period end from the forecast on', () => {
    const report = buildCashFlowReport(model(), { granularity: 'month', horizonMonths: 3 });
    const { position } = report;
    expect(position).toMatchObject({ available: true, startingCash: 5200, startingCardDebt: 4000 });
    expect(position.periods.map(period => period.key)).toEqual(report.periods.map(period => period.key));
    const past = position.periods.find(period => period.key === '2026-09')!;
    expect(past).toEqual({ key: '2026-09', cash: null, cardDebt: null });
    const october = position.periods.find(period => period.key === '2026-10')!;
    expect(october.cash).toBe(position.milestones[0].cash);
    expect(position.lowPoint).not.toBeNull();
    expect(position.milestones.map(point => point.key)).toEqual([
      'end_of_this_month', 'end_of_next_month', 'in_3_months', 'in_6_months', 'in_12_months',
    ]);
  });

  it('discloses the transfers the cash position assumes', () => {
    const withBrokerage = [...carrying, ...['2026-06', '2026-07', '2026-08', '2026-09'].map(month =>
      tx('checking', `${month}-05`, 'transfer_out', 500, 'VANGUARD BUY TRANSFER'))];
    const { position } = buildCashFlowReport(model({ transactions: withBrokerage }), { granularity: 'month', horizonMonths: 3 });
    expect(position.transfers.recurring).toEqual([
      expect.objectContaining({ label: 'VANGUARD BUY TRANSFER', cadence: 'monthly', amount: 500, direction: 'out', nextDate: '2026-10-05' }),
    ]);
  });

  describe('a card with no usual pace', () => {
    // No payments seen and no minimum from the provider.
    const noPayments = carrying.filter(item => item.name !== 'CARD CO AUTOPAY' && item.name !== 'PAYMENT THANK YOU');
    const noMinimum = accountsWithCardTerms().map(account => account.account_id === 'card'
      ? { ...account, liabilityDetails: [{ ...CARD_TERMS, minimumPaymentAmount: null }] }
      : account);
    const monthly: PlannedCashFlowEvent = {
      ...payoff, id: 'monthly', label: 'Rewards Card payment', paymentMode: 'fixed', amount: 1500, recurrence: 'monthly', startDate: '2026-10-20',
    };

    it('is projected under a monthly plan, which supplies the pace', () => {
      const built = model({ transactions: noPayments, accounts: noMinimum, plannedEvents: [monthly] });
      expect(built.cards[0].baseline.behavior).toBe('unknown');
      expect(built.cards[0].projection!.payments.slice(0, 2)).toEqual([
        { date: '2026-10-20', amount: 1500 },
        { date: '2026-11-20', amount: 1500 },
      ]);
      const report = buildCashFlowReport(built, { granularity: 'month', horizonMonths: 3 });
      expect(report.cards[0]).toMatchObject({ currentPace: null, interestSaved: null, withPlans: { carryingBalanceNow: true } });
      expect(report.position.cardsLeftOut).toEqual([]);
      expect(report.position.startingCardDebt).toBe(4000);
      // Its interest stays learned from history; the plan's is not added on top.
      expect(built.cards[0].modelsInterest).toBe(false);
      expect(forecastTotals(built, ...NEXT_12)!.components.cardInterest).toBe(0);
      // And saving a plan leaves the forecast without plans exactly as it was.
      const withoutPlan = model({ transactions: noPayments, accounts: noMinimum });
      expect(forecastTotals(built, ...NEXT_12, { includePlans: false })!.spending)
        .toBeCloseTo(forecastTotals(withoutPlan, ...NEXT_12)!.spending, 2);
    });

    it('does not feed learned interest charges into an APR card projection', () => {
      // Savings still learns the $60/mo INTEREST stream (modelsInterest is false),
      // but the card posts APR interest itself — the two must not stack.
      const built = model({ transactions: noPayments, accounts: noMinimum, plannedEvents: [monthly] });
      const withoutCharges = model({
        transactions: noPayments.filter(item => !String(item.name).includes('INTEREST')),
        accounts: noMinimum,
        plannedEvents: [monthly],
      });
      expect(built.streams.some(stream => stream.label.includes('INTEREST'))).toBe(true);
      expect(built.scheduled.some(item => item.interest && item.accountId === 'card')).toBe(true);
      expect(built.cards[0].projection!.interestTwelveMonths)
        .toBeCloseTo(withoutCharges.cards[0].projection!.interestTwelveMonths!, 2);
      expect(built.cards[0].projection!.months[0].endBalance)
        .toBeCloseTo(withoutCharges.cards[0].projection!.months[0].endBalance, 2);
    });

    it('keeps irregular interest charges out of an APR card projection, not only a regular one', () => {
      // Charges with no steady cadence are not a stream: they land in the card's typical daily rate.
      const charge = (date: string, amount: number) =>
        tx('card', date, 'fee', amount, 'INTEREST CHARGE ON PURCHASES', { personal_finance_category: INTEREST_CHARGE_CATEGORY });
      const base = noPayments.filter(item => !String(item.name).includes('INTEREST'));
      const built = model({
        transactions: [...base, charge('2026-07-03', 23.5), charge('2026-08-19', 81.25), charge('2026-09-08', 47.1)],
        accounts: noMinimum,
        plannedEvents: [monthly],
      });
      const without = model({ transactions: base, accounts: noMinimum, plannedEvents: [monthly] });
      expect(built.streams.some(stream => stream.label.includes('INTEREST'))).toBe(false);
      // The savings forecast keeps them, as the card's interest is not modelled...
      expect(built.cardDailySpending.get('card')!).toBeGreaterThan(without.cardDailySpending.get('card')!);
      // ...but the card, which posts APR interest itself, is not charged them again.
      expect(built.cards[0].purchases.dailyRate).toBeCloseTo(without.cards[0].purchases.dailyRate, 6);
      expect(built.cards[0].projection!.months[11].endBalance).toBeCloseTo(without.cards[0].projection!.months[11].endBalance, 2);
    });

    it('does not let interest inflate an APR card’s share of a spending override', () => {
      // The override includes the interest history charged ($151.85 over the
      // 90-day basis); that comes out first, and the card's share of the rest
      // is its share of the spending that was not interest.
      const charge = (date: string, amount: number) =>
        tx('card', date, 'fee', amount, 'INTEREST CHARGE ON PURCHASES', { personal_finance_category: INTEREST_CHARGE_CATEGORY });
      const base = noPayments.filter(item => !String(item.name).includes('INTEREST'));
      const overrides = { monthlyIncome: null as number | null, monthlyExpense: 6000 };
      const built = model({
        transactions: [...base, charge('2026-07-03', 23.5), charge('2026-08-19', 81.25), charge('2026-09-08', 47.1)],
        accounts: noMinimum,
        plannedEvents: [monthly],
        overrides,
      });
      const without = model({ transactions: base, accounts: noMinimum, plannedEvents: [monthly], overrides });
      expect(built.typical.spendingSource).toBe('override');
      const interestDaily = 151.85 / 90;
      // The card keeps the interest out of cash but is not charged it: its APR interest replaces it.
      expect(built.cardDailySpending.get('card')! - built.cards[0].purchases.dailyRate).toBeCloseTo(interestDaily, 6);
      const share = (dailyRate: number, spread: number) => dailyRate / spread;
      expect(share(built.cards[0].purchases.dailyRate, built.typical.dailySpending - interestDaily))
        .toBeCloseTo(share(without.cards[0].purchases.dailyRate, without.typical.dailySpending), 6);
    });

    it('is left out with only a one-time plan, and the position says so', () => {
      const report = buildCashFlowReport(
        model({ transactions: noPayments, accounts: noMinimum, plannedEvents: [payoff] }),
        { granularity: 'month', horizonMonths: 3 }
      );
      expect(report.cards[0]).toMatchObject({ currentPace: null, withPlans: null });
      expect(report.position.cardsLeftOut).toEqual([{ accountId: 'card', name: 'Rewards Card', reason: 'no_pace' }]);
      expect(report.position.startingCardDebt).toBe(0);
    });
  });

  it('says why there is no cash position', () => {
    const { position } = buildCashFlowReport(model({ transactions: householdTransactions('2026-09-20', THROUGH) }), { granularity: 'month', horizonMonths: 3 });
    expect(position).toMatchObject({ available: false, reason: 'forecast_unavailable', milestones: [] });
  });
});

