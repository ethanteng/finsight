import type { ForecastAdjustment } from '../../cash-flow/adjustments';
import { addMonths, daysBetween } from '../../cash-flow/calendar';
import {
  buildCashFlowModel,
  buildCashFlowReport,
  CARD_INTEREST_CATEGORY,
  expectedMonthly,
  expectedSpendingByCategory,
  forecastTotals,
  type CashFlowModelInput,
} from '../../cash-flow/forecast';
import type { PlannedCashFlowEvent } from '../../cash-flow/planned-events';
import {
  ACCOUNTS,
  accountsWithCardTerms,
  householdTransactions,
  interestCharges,
  tx,
} from './factories/cash-flow.factory';

const FROM = '2026-06-03';
const THROUGH = '2026-09-30';
const PAYCHECKS_A_MONTH = 26 / 12;

/** A gym membership paid monthly until June, so it reads as stopped by October. */
const oldGym = ['2026-02-05', '2026-03-05', '2026-04-05', '2026-05-05', '2026-06-05']
  .map(date => tx('checking', date, 'expense', 40, 'Harbor Bay Club', { merchant_name: 'Harbor Bay Club' }));
const history = [...householdTransactions(FROM, THROUGH), ...oldGym];

function model(overrides: Partial<CashFlowModelInput> = {}) {
  return buildCashFlowModel({
    transactions: history,
    accounts: ACCOUNTS,
    plannedEvents: [],
    dataThrough: THROUGH,
    today: '2026-10-01',
    ...overrides,
  });
}

const adjustment = (overrides: Partial<ForecastAdjustment>): ForecastAdjustment => ({
  id: 'adjustment', kind: 'exclude_payee', flow: 'spending', key: '', label: 'Item',
  ...overrides,
});

describe('expectedMonthly', () => {
  it('is every running regular item at its monthly rate plus the typical rates', () => {
    const built = model();
    const report = buildCashFlowReport(built, { granularity: 'month', horizonMonths: 6 });
    const expected = expectedMonthly(built);

    expect(expected.incomeSource).toBe('transactions');
    expect(expected.spendingSource).toBe('transactions');
    // Biweekly pay is 26 paychecks a year, not two a month.
    expect(expected.income).toBeCloseTo(2500 * PAYCHECKS_A_MONTH + report.baseline.typicalMonthlyIncome, 1);
    // Rent and the streaming charge on their cadence, groceries at the typical
    // rate; the one-off airline ticket and the stopped gym are not expected.
    // The report rounds the typical rate to cents, so sums are good to the dime.
    expect(expected.spending).toBeCloseTo(2000 + 15.49 + report.baseline.typicalMonthlySpending, 1);
  });

  it('is the forecast’s own average month, before planned events', () => {
    const built = model({
      plannedEvents: [{
        id: 'trip', label: 'Trip', kind: 'expense', amount: 3000, startDate: '2026-12-01',
        recurrence: 'once', endDate: null, accountId: null, paymentMode: null,
      }],
    });
    const end = addMonths(built.forecastStart, 12);
    const year = forecastTotals(built, built.forecastStart, end, { includePlans: false })!;
    const months = daysBetween(built.forecastStart, end) / (365 / 12);
    const expected = expectedMonthly(built);
    // Month lengths and paycheck counts differ, so a year's average is close, not exact.
    expect(Math.abs(expected.income! - year.income / months) / expected.income!).toBeLessThan(0.04);
    expect(Math.abs(expected.spending! - year.spending / months) / expected.spending!).toBeLessThan(0.04);
    // The planned trip is in the forecast, but not in a typical month.
    expect(expected).toEqual(expectedMonthly(model()));
  });

  it('follows what the user left out and what they kept', () => {
    const rentLeftOut = expectedMonthly(model({
      adjustments: [adjustment({ key: 'oak street apartments', label: 'Oak Street Apartments' })],
    }));
    expect(rentLeftOut.spending).toBeCloseTo(expectedMonthly(model()).spending! - 2000, 2);

    const gym = model().streams.find(stream => stream.label === 'Harbor Bay Club')!;
    expect(gym.status).toBe('lapsed');
    const gymKept = expectedMonthly(model({
      adjustments: [adjustment({ kind: 'continue_stream', key: gym.counterpartyKey, label: 'Harbor Bay Club' })],
    }));
    expect(gymKept.spending).toBeCloseTo(expectedMonthly(model()).spending! + 40, 2);
  });

  it('is exactly the override on a side that has one', () => {
    const expected = expectedMonthly(model({ overrides: { monthlyIncome: 8000, monthlyExpense: 6123.45 } }));
    expect(expected).toEqual({ income: 8000, spending: 6123.45, incomeSource: 'override', spendingSource: 'override' });

    const incomeOnly = expectedMonthly(model({ overrides: { monthlyIncome: 8000 } }));
    expect(incomeOnly.income).toBe(8000);
    expect(incomeOnly.spending).toBe(expectedMonthly(model()).spending);
  });

  it('counts the interest a carried card balance runs up at the usual pace', () => {
    const carrying = model({
      transactions: [...history, ...interestCharges(FROM, THROUGH)],
      accounts: accountsWithCardTerms(),
    });
    const card = carrying.cards[0];
    expect(card.modelsInterest).toBe(true);
    const end = addMonths(carrying.forecastStart, 12);
    const interest = card.currentPace!.interestPostings
      .filter(posting => posting.date < end)
      .reduce((sum, posting) => sum + posting.amount, 0);
    expect(interest).toBeGreaterThan(0);
    const report = buildCashFlowReport(carrying, { granularity: 'month', horizonMonths: 6 });
    // The report rounds the typical rate to cents, so the sum is good to the dime.
    expect(expectedMonthly(carrying).spending).toBeCloseTo(2000 + 15.49 + report.baseline.typicalMonthlySpending + interest / 12, 1);

    // A payoff plan changes the forecast, not the usual month.
    const payoff: PlannedCashFlowEvent = {
      id: 'payoff', label: 'Pay off the card', kind: 'card_payment', amount: 0, startDate: '2026-10-25',
      recurrence: 'once', endDate: null, accountId: 'card', paymentMode: 'full',
    };
    const planned = model({
      transactions: [...history, ...interestCharges(FROM, THROUGH)],
      accounts: accountsWithCardTerms(),
      plannedEvents: [payoff],
    });
    expect(expectedMonthly(planned)).toEqual(expectedMonthly(carrying));

    // An override already includes card interest, so none is added to it.
    const overridden = model({
      transactions: [...history, ...interestCharges(FROM, THROUGH)],
      accounts: accountsWithCardTerms(),
      overrides: { monthlyExpense: 5000 },
    });
    expect(expectedMonthly(overridden).spending).toBe(5000);
  });

  it('has no learned figure while the forecast is unavailable, but keeps an override', () => {
    const short = model({ transactions: householdTransactions('2026-09-20', THROUGH) });
    expect(short.forecast).toEqual({ available: false, reason: 'insufficient_history' });
    expect(expectedMonthly(short)).toMatchObject({ income: null, spending: null });

    const withIncome = model({ transactions: householdTransactions('2026-09-20', THROUGH), overrides: { monthlyIncome: 7000 } });
    expect(expectedMonthly(withIncome)).toMatchObject({ income: 7000, spending: null, incomeSource: 'override' });
  });
});

describe('expectedSpendingByCategory', () => {
  /** The household's history with the categories a bank would give it. */
  const CATEGORIES: Record<string, { primary: string; detailed: string }> = {
    'Oak Street Apartments': { primary: 'RENT_AND_UTILITIES', detailed: 'RENT_AND_UTILITIES_RENT' },
    'NETFLIX.COM': { primary: 'ENTERTAINMENT', detailed: 'ENTERTAINMENT_TV_AND_MOVIES' },
    'UNITED AIRLINES': { primary: 'TRAVEL', detailed: 'TRAVEL_FLIGHTS' },
    'Trader Joes': { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_GROCERIES' },
    Safeway: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_GROCERIES' },
    'Whole Foods': { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_GROCERIES' },
    // A corner market sells coffee as well as groceries.
    'Corner Market': { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' },
  };
  const categorized = history.map(transaction => {
    const category = CATEGORIES[String(transaction.name)];
    return category ? { ...transaction, personal_finance_category: category } : transaction;
  });
  const sum = (categories: ReadonlyArray<{ monthly: number }>) => categories.reduce((total, category) => total + category.monthly, 0);

  it('splits the expected month by category, largest first, and adds up to it', () => {
    const built = model({ transactions: categorized });
    const categories = expectedSpendingByCategory(built)!;
    const report = buildCashFlowReport(built, { granularity: 'month', horizonMonths: 6 });

    expect(categories.map(category => category.label)).toEqual(['Rent', 'Groceries', 'Coffee', 'Tv And Movies']);
    expect(categories.find(category => category.label === 'Rent')!.monthly).toBe(2000);
    expect(categories.find(category => category.label === 'Tv And Movies')!.monthly).toBe(15.49);
    // Groceries and coffee are the typical rate between them; the one-off flight
    // and the stopped gym are not part of a usual month.
    expect(categories.find(category => category.label === 'Groceries')!.monthly
      + categories.find(category => category.label === 'Coffee')!.monthly).toBeCloseTo(report.baseline.typicalMonthlySpending, 1);
    // Rounded together, the categories add up to the expected month to the cent.
    expect(sum(categories)).toBe(expectedMonthly(built).spending);
    expect(report.usualSpending).toEqual({ monthly: expectedMonthly(built).spending, categories });
  });

  it('follows what the user left out and what they kept', () => {
    const rentLeftOut = expectedSpendingByCategory(model({
      transactions: categorized,
      adjustments: [adjustment({ key: 'oak street apartments', label: 'Oak Street Apartments' })],
    }))!;
    expect(rentLeftOut.map(category => category.label)).not.toContain('Rent');

    const gym = model().streams.find(stream => stream.label === 'Harbor Bay Club')!;
    const gymKept = expectedSpendingByCategory(model({
      transactions: categorized,
      adjustments: [adjustment({ kind: 'continue_stream', key: gym.counterpartyKey, label: 'Harbor Bay Club' })],
    }))!;
    // The gym has no category from the bank.
    expect(gymKept.find(category => category.label === 'Uncategorized')!.monthly).toBe(40);
  });

  it('puts every card’s interest in one category, projected or carried forward', () => {
    const charges = interestCharges(FROM, THROUGH);

    // A card with known terms posts interest from its APR at the usual pace.
    const projected = model({ transactions: [...categorized, ...charges], accounts: accountsWithCardTerms() });
    expect(projected.cards[0].modelsInterest).toBe(true);
    const projectedCategories = expectedSpendingByCategory(projected)!;
    const end = addMonths(projected.forecastStart, 12);
    const interest = projected.cards[0].currentPace!.interestPostings
      .filter(posting => posting.date < end)
      .reduce((total, posting) => total + posting.amount, 0);
    expect(projectedCategories.find(category => category.label === CARD_INTEREST_CATEGORY)!.monthly).toBeCloseTo(interest / 12, 2);
    expect(sum(projectedCategories)).toBe(expectedMonthly(projected).spending);

    // Without terms, the charges themselves carry forward, under the same name
    // rather than the bank's category for them.
    const carried = model({ transactions: [...categorized, ...charges] });
    expect(carried.cards[0]?.modelsInterest ?? false).toBe(false);
    const carriedCategories = expectedSpendingByCategory(carried)!;
    expect(carriedCategories.find(category => category.label === CARD_INTEREST_CATEGORY)!.monthly).toBeCloseTo(60, 0);
    expect(carriedCategories.map(category => category.label)).not.toContain('Interest Charge');
  });

  it('has no breakdown when an override sets spending, or while the forecast is unavailable', () => {
    const overridden = model({ transactions: categorized, overrides: { monthlyExpense: 5000 } });
    expect(expectedSpendingByCategory(overridden)).toBeNull();
    expect(buildCashFlowReport(overridden, { granularity: 'month', horizonMonths: 6 }).usualSpending).toBeNull();
    // An income override leaves spending learned from transactions.
    expect(expectedSpendingByCategory(model({ transactions: categorized, overrides: { monthlyIncome: 9000 } }))).toEqual(
      expectedSpendingByCategory(model({ transactions: categorized }))
    );

    expect(expectedSpendingByCategory(model({ transactions: householdTransactions('2026-09-20', THROUGH) }))).toBeNull();
  });
});
