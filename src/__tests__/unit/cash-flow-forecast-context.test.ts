import { buildCashFlowModel } from '../../cash-flow/forecast';
import type { ForecastAdjustment } from '../../cash-flow/adjustments';
import type { PlannedCashFlowEvent } from '../../cash-flow/planned-events';
import {
  buildCashFlowForecastContext,
  cashFlowForecastFacts,
  compactCashFlowForecastDetails,
  type CashFlowForecastContext,
} from '../../openai/cash-flow-forecast-context';
import {
  buildCanonicalFactPack,
  validateCanonicalFactPack,
  type CanonicalFact,
} from '../../openai/canonical-facts';
import { buildQuestionContextPack } from '../../openai/context-pack';
import { questionNeedsFromPacks } from '../../openai/context-packs';
import { buildSnapshotSummaryForValidation } from '../../openai/response-validator';
import { validateResponseFacts } from '../../openai/response-facts';
import type { FinancialContextSnapshot } from '../../openai/types';
import { ACCOUNTS, CARD_TERMS, accountsWithCardTerms, householdTransactions, interestCharges } from './factories/cash-flow.factory';

const bonus: PlannedCashFlowEvent = {
  id: 'bonus', label: 'Year-end bonus', kind: 'income', amount: 10000, startDate: '2026-12-15', recurrence: 'once', endDate: null,
  accountId: null, paymentMode: null,
};

function context(
  overrides: { transactionsFrom?: string; plannedEvents?: PlannedCashFlowEvent[]; adjustments?: ForecastAdjustment[] } = {}
): CashFlowForecastContext {
  return buildCashFlowForecastContext(buildCashFlowModel({
    transactions: householdTransactions(overrides.transactionsFrom ?? '2026-06-03', '2026-10-14'),
    accounts: ACCOUNTS,
    plannedEvents: overrides.plannedEvents ?? [bonus],
    dataThrough: '2026-10-14',
    today: '2026-10-15',
    adjustments: overrides.adjustments,
  }));
}

function byId(facts: CanonicalFact[]): Map<string, CanonicalFact> {
  return new Map(facts.map(fact => [fact.id, fact]));
}

function snapshot(cashFlowForecast?: CashFlowForecastContext): FinancialContextSnapshot {
  return {
    accounts: [],
    bankingTransactions: [],
    metadata: {} as any,
    tierContext: {} as any,
    ...(cashFlowForecast && { cashFlowForecast }),
  };
}

describe('cash flow forecast facts', () => {
  const facts = byId(cashFlowForecastFacts(context()));

  it('separates what has happened this month from what is still expected and the projected total', () => {
    const soFar = facts.get('cash_flow_this_month_so_far_net')!;
    const stillExpected = facts.get('cash_flow_this_month_still_expected_net')!;
    const projected = facts.get('cash_flow_this_month_projected_net')!;

    expect(soFar.provenance.kind).toBe('snapshot');
    expect(soFar.label).toContain('through 2026-10-14');
    expect(stillExpected.provenance.kind).toBe('forecast');
    expect(projected.provenance).toMatchObject({
      kind: 'forecast',
      formula: 'sum(inputs)',
      inputFactIds: ['cash_flow_this_month_so_far_net', 'cash_flow_this_month_still_expected_net'],
    });
    expect(projected.value).toBeCloseTo(soFar.value + stillExpected.value, 6);
  });

  it('passes the deterministic formula check for every window', () => {
    expect(validateCanonicalFactPack({ version: 1, facts: Array.from(facts.values()) })).toEqual([]);
  });

  it('caveats every projection so it cannot be quoted as observed', () => {
    const projections = Array.from(facts.values()).filter(fact => fact.provenance.kind === 'forecast');
    expect(projections.length).toBeGreaterThan(20);
    for (const fact of projections) expect(fact.caveat).toMatch(/^Projection, not an observed amount/);
  });

  it('gives future windows a single forecast, not a split', () => {
    expect(facts.get('cash_flow_next_month_projected_net')!.provenance.formula).toBeUndefined();
    expect(facts.has('cash_flow_next_month_so_far_net')).toBe(false);
    expect(facts.has('cash_flow_next_12_months_projected_income')).toBe(true);
  });

  it('reports planned events apart from the baseline, only where they fall', () => {
    expect(facts.get('cash_flow_this_quarter_planned_events_net')!.value).toBe(10000);
    expect(facts.get('cash_flow_this_quarter_without_planned_events_net')!.value)
      .toBeCloseTo(facts.get('cash_flow_this_quarter_projected_net')!.value - 10000, 6);
    expect(facts.has('cash_flow_next_month_planned_events_net')).toBe(false);
    expect(facts.get('cash_flow_planned_event_1_amount')).toMatchObject({
      value: 10000,
      provenance: { kind: 'user_input' },
    });
    expect(facts.get('cash_flow_planned_event_1_amount')!.label).toContain('Year-end bonus');
  });

  it('does not total a window that its history does not reach the start of', () => {
    expect(facts.has('cash_flow_this_year_projected_net')).toBe(false);
    expect(facts.get('cash_flow_this_year_so_far_net')!.label).toContain('history starts 2026-06-03');
    expect(facts.has('cash_flow_this_year_still_expected_net')).toBe(true);
  });

  it('names the recurring items and the typical rate behind the forecast', () => {
    const labels = Array.from(facts.values()).map(fact => fact.label);
    expect(labels.some(label => label.includes('Oak Street Apartments'))).toBe(true);
    expect(facts.has('cash_flow_typical_monthly_other_spending')).toBe(true);
  });

  it('publishes no observed figures at all when there is no history', () => {
    const empty = cashFlowForecastFacts(buildCashFlowForecastContext(buildCashFlowModel({
      transactions: [], accounts: ACCOUNTS, plannedEvents: [], dataThrough: '2026-10-14', today: '2026-10-15',
    })));
    expect(empty.some(fact => fact.id.includes('_so_far_'))).toBe(false);
    expect(empty.every(fact => fact.value !== 0 || fact.provenance.kind !== 'snapshot')).toBe(true);
  });

  it('publishes still_expected for in-progress windows when both overrides replace missing history', () => {
    const overrideOnly = cashFlowForecastFacts(buildCashFlowForecastContext(buildCashFlowModel({
      transactions: [],
      accounts: ACCOUNTS,
      plannedEvents: [],
      dataThrough: '2026-10-14',
      today: '2026-10-15',
      overrides: { monthlyIncome: 6000, monthlyExpense: 4000 },
    })));
    const byFact = byId(overrideOnly);
    expect(byFact.has('cash_flow_this_month_so_far_net')).toBe(false);
    expect(byFact.has('cash_flow_this_month_projected_net')).toBe(false);
    expect(byFact.get('cash_flow_this_month_still_expected_net')!.provenance.kind).toBe('forecast');
    expect(byFact.get('cash_flow_this_quarter_still_expected_net')).toBeDefined();
    expect(byFact.get('cash_flow_this_year_still_expected_net')).toBeDefined();
    // Future windows keep a single projected fact, not a still_expected split.
    expect(byFact.has('cash_flow_next_month_still_expected_net')).toBe(false);
    expect(byFact.get('cash_flow_next_month_projected_net')).toBeDefined();
  });

  it('publishes only observed figures when there is too little history to forecast', () => {
    const short = cashFlowForecastFacts(context({ transactionsFrom: '2026-10-01' }));
    expect(short.length).toBeGreaterThan(0);
    expect(short.every(fact => fact.provenance.kind !== 'forecast')).toBe(true);
  });
});

describe('the user’s adjustments in the pack', () => {
  it('names what the user moved in or out, and the figures already reflect it', () => {
    const leftOut: ForecastAdjustment = {
      id: 'rent', kind: 'exclude_payee', flow: 'spending', key: 'oak street apartments', label: 'Oak Street Apartments',
    };
    const adjusted = context({ adjustments: [leftOut] });
    expect(adjusted.recurring!.some(item => item.label === 'Oak Street Apartments')).toBe(false);
    const details = compactCashFlowForecastDetails(adjusted) as any;
    expect(details.userAdjustments).toEqual({
      note: expect.stringContaining('already reflects these choices'),
      changes: [{ item: 'Oak Street Apartments', change: 'left out of the forecast: not projected as spending' }],
    });
    expect(compactCashFlowForecastDetails(context()) as any).not.toHaveProperty('userAdjustments');
  });
});

describe('cash flow forecast pack wiring', () => {
  it('maps the pack to its question need', () => {
    expect(questionNeedsFromPacks(['cash_flow_forecast'], false).needsCashFlowForecast).toBe(true);
    expect(questionNeedsFromPacks(['monthly_cash_flow'], false).needsCashFlowForecast).toBe(false);
  });

  it('adds forecast facts only when the forecast was gathered', () => {
    const needs = questionNeedsFromPacks(['cash_flow_forecast'], false);
    const withForecast = buildCanonicalFactPack(snapshot(context()), 'How much will I save this month?', needs);
    const without = buildCanonicalFactPack(snapshot(), 'How much will I save this month?', needs);
    expect(withForecast.facts.some(fact => fact.id === 'cash_flow_this_month_projected_net')).toBe(true);
    expect(without.facts.some(fact => fact.id.startsWith('cash_flow_'))).toBe(false);
  });

  it('gives the model structure that points at facts instead of repeating amounts', () => {
    const forecast = context();
    const details = compactCashFlowForecastDetails(forecast) as any;
    const factIds = new Set(cashFlowForecastFacts(forecast).map(fact => fact.id));

    expect(details.transactionsThrough).toBe('2026-10-14');
    for (const item of [...details.recurring, ...details.plannedEvents, ...details.oneOffsLeftOut]) {
      expect(factIds.has(item.amountFactId)).toBe(true);
      expect(item).not.toHaveProperty('amount');
    }

    const needs = questionNeedsFromPacks(['cash_flow_forecast'], false);
    const pack = buildQuestionContextPack(snapshot(forecast), needs, { version: 1, facts: [] });
    expect(pack.details.cashFlowForecast).toEqual(details);
    const notSelected = buildQuestionContextPack(snapshot(forecast), questionNeedsFromPacks([], false), { version: 1, facts: [] });
    expect(notSelected.details.cashFlowForecast).toBeUndefined();
  });

  it('tells the model when the forecast is unavailable', () => {
    expect(compactCashFlowForecastDetails({ status: 'unavailable', reason: 'no_snapshot' }))
      .toEqual({ status: 'unavailable', reason: 'no_snapshot' });
    expect(cashFlowForecastFacts({ status: 'unavailable', reason: 'error' })).toEqual([]);
  });

  it('shows the reviewer the same figures, marked as projections', () => {
    const summary = buildSnapshotSummaryForValidation(snapshot(context()));
    expect(summary).toContain('Cash flow forecast facts:');
    expect(summary).toMatch(/Projected total net cash flow .* for this month .*\(projection\)/);
  });
});

describe('grounding answers about the forecast', () => {
  const forecast = context();
  const pack = buildCanonicalFactPack(
    snapshot(forecast),
    'How much can I expect to save this month?',
    questionNeedsFromPacks(['cash_flow_forecast'], false)
  );
  const projected = pack.facts.find(fact => fact.id === 'cash_flow_this_month_projected_net')!;
  const money = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;

  it('accepts an answer that quotes the projected surplus', () => {
    const result = validateResponseFacts(
      { summary: `You're on track to save about ${money(projected.value)} this month.`, insights: [], suggested_actions: [] } as any,
      pack
    );
    expect(result.valid).toBe(true);
  });

  it('rejects an answer that adds two forecast figures together itself', () => {
    const quarter = pack.facts.find(fact => fact.id === 'cash_flow_this_quarter_projected_net')!;
    const result = validateResponseFacts(
      { summary: `Together that is ${money(projected.value + quarter.value + 1234)}.`, insights: [], suggested_actions: [] } as any,
      pack
    );
    expect(result.valid).toBe(false);
  });
});

describe('credit cards and cash position in the pack', () => {
  const payoff: PlannedCashFlowEvent = {
    id: 'payoff', label: 'Pay off Rewards Card', kind: 'card_payment', amount: 0, startDate: '2026-10-25', recurrence: 'once',
    endDate: null, accountId: 'card', paymentMode: 'full',
  };
  const extra: PlannedCashFlowEvent = { ...payoff, id: 'extra', label: 'Extra card payment', paymentMode: 'fixed', amount: 500, startDate: '2026-11-25' };
  const carrying = [...householdTransactions('2026-06-03', '2026-10-14'), ...interestCharges('2026-06-03', '2026-10-14')];
  const cardContext = (
    plannedEvents: PlannedCashFlowEvent[] = [],
    overrides: { accounts?: Array<Record<string, unknown>>; transactions?: Array<Record<string, unknown>> } = {}
  ) => buildCashFlowForecastContext(buildCashFlowModel({
    transactions: overrides.transactions ?? carrying,
    accounts: overrides.accounts ?? accountsWithCardTerms(),
    plannedEvents,
    dataThrough: '2026-10-14',
    today: '2026-10-15',
  }));

  it('publishes each card’s terms and its outlook at the usual pace', () => {
    const facts = byId(cashFlowForecastFacts(cardContext()));
    expect(facts.get('cash_flow_card_1_balance')).toMatchObject({ value: 4000, unit: 'usd', provenance: { kind: 'snapshot' } });
    expect(facts.get('cash_flow_card_1_apr')).toMatchObject({ value: 24, unit: 'percent' });
    expect(facts.get('cash_flow_card_1_usual_payment')!.label).toContain('averaged over the last');
    expect(facts.get('cash_flow_card_1_current_pace_interest_12_months')!.provenance.kind).toBe('forecast');
    expect(facts.get('cash_flow_card_1_current_pace_months_to_payoff')).toMatchObject({ unit: 'months' });
    expect(facts.get('cash_flow_card_1_current_pace_interest_12_months')!.caveat).toContain('Card interest is estimated monthly');
  });

  it('publishes what a plan saves, checked against the two interest figures', () => {
    const allFacts = cashFlowForecastFacts(cardContext([payoff]));
    const facts = byId(allFacts);
    const saved = facts.get('cash_flow_card_1_interest_saved_12_months')!;
    expect(saved.provenance).toMatchObject({
      formula: 'abs(input[0] - input[1])',
      inputFactIds: ['cash_flow_card_1_current_pace_interest_12_months', 'cash_flow_card_1_with_plans_interest_12_months'],
    });
    expect(saved.value).toBeGreaterThan(0);
    expect(validateCanonicalFactPack({ version: 1, facts: allFacts })).toEqual([]);
  });

  it('states a set card payment’s amount but not a full payoff’s', () => {
    const context = cardContext([payoff, extra]);
    const facts = byId(cashFlowForecastFacts(context));
    expect(facts.has('cash_flow_planned_event_1_amount')).toBe(false);
    expect(facts.get('cash_flow_planned_event_2_amount')).toMatchObject({ value: 500 });
    expect(facts.get('cash_flow_planned_event_2_amount')!.label).toContain('payment to credit card “Rewards Card”');
    const details = compactCashFlowForecastDetails(context) as any;
    expect(details.plannedEvents[0]).toMatchObject({ paysCardInFull: true });
    expect(details.plannedEvents[0]).not.toHaveProperty('amountFactId');
  });

  it('publishes cash now, at fixed points ahead, and at its lowest', () => {
    const facts = byId(cashFlowForecastFacts(cardContext()));
    expect(facts.get('cash_flow_cash_now')).toMatchObject({ value: 5200, provenance: { kind: 'snapshot' } });
    for (const key of ['end_of_this_month', 'end_of_next_month', 'in_3_months', 'in_6_months', 'in_12_months']) {
      expect(facts.get(`cash_flow_cash_${key}`)!.provenance.kind).toBe('forecast');
    }
    expect(facts.get('cash_flow_cash_low_point_next_12_months')!.label).toMatch(/Lowest projected cash in the next 12 months, on \d{4}-\d{2}-\d{2}/);
  });

  it('describes the cards and the cash position by fact id', () => {
    const details = compactCashFlowForecastDetails(cardContext([payoff])) as any;
    expect(details.creditCards[0]).toMatchObject({
      card: 'credit card “Rewards Card”',
      factIdPrefix: 'cash_flow_card_1_',
      currentPace: { carryingBalanceNow: true },
      withPlans: { stopsCarryingABalance: '2026-10' },
      plans: [expect.objectContaining({ paysInFull: true, startDate: '2026-10-25' })],
    });
    expect(details.cashPosition).toMatchObject({ factIdPrefix: 'cash_flow_cash_' });
    expect(details.cashPosition).not.toHaveProperty('cardDebtLeavesOut');
  });

  it('labels card debt as covering only the cards the forecast projects', () => {
    const facts = byId(cashFlowForecastFacts(cardContext()));
    expect(facts.get('cash_flow_card_debt_now')!.label).toContain('the credit cards the forecast covers');
    expect(facts.get('cash_flow_card_debt_in_3_months')!.label).toContain('the credit cards the forecast covers');
  });

  it('names the cards card debt leaves out, and publishes no card debt when it covers none', () => {
    const noBalance = accountsWithCardTerms().map(account => account.account_id === 'card' ? { ...account, balance: { current: null } } : account);
    const context = cardContext([], { accounts: noBalance });
    const facts = byId(cashFlowForecastFacts(context));
    expect(facts.has('cash_flow_cash_now')).toBe(true);
    expect(facts.has('cash_flow_card_debt_now')).toBe(false);
    expect(facts.has('cash_flow_card_debt_in_3_months')).toBe(false);
    const details = compactCashFlowForecastDetails(context) as any;
    expect(details.cashPosition.cardDebtLeavesOut).toEqual([{ card: 'credit card “Rewards Card”', reason: 'no balance reported' }]);
    expect(details.creditCards[0]).toMatchObject({ notProjected: 'no balance reported' });
  });

  it('says a card with no usual pace is projected from the planned payments alone', () => {
    const noPayments = carrying.filter(item => item.name !== 'CARD CO AUTOPAY' && item.name !== 'PAYMENT THANK YOU');
    const noMinimum = accountsWithCardTerms().map(account => account.account_id === 'card'
      ? { ...account, liabilityDetails: [{ ...CARD_TERMS, minimumPaymentAmount: null }] }
      : account);
    const monthly: PlannedCashFlowEvent = { ...payoff, id: 'monthly', paymentMode: 'fixed', amount: 1500, recurrence: 'monthly' };
    const context = cardContext([monthly], { accounts: noMinimum, transactions: noPayments });
    const details = compactCashFlowForecastDetails(context) as any;
    expect(details.creditCards[0].usualPaceUnknown).toContain('counts only the payments the user planned');
    expect(details.creditCards[0]).not.toHaveProperty('notProjected');
    expect(details.creditCards[0].withPlans).toMatchObject({ carryingBalanceNow: true });
    const facts = byId(cashFlowForecastFacts(context));
    expect(facts.has('cash_flow_card_1_with_plans_interest_12_months')).toBe(true);
    expect(facts.has('cash_flow_card_1_current_pace_interest_12_months')).toBe(false);
    expect(facts.has('cash_flow_card_1_interest_saved_12_months')).toBe(false);
    expect(facts.has('cash_flow_card_debt_now')).toBe(true);
  });
});


describe('each cash account in the pack', () => {
  const SAVINGS = {
    account_id: 'savings', name: 'High Yield Savings', type: 'depository', subtype: 'savings',
    balance: { current: 10000 }, institution: 'First Bank', mask: '5678',
  };
  const withSavings = (plannedEvents: PlannedCashFlowEvent[] = []) => buildCashFlowForecastContext(buildCashFlowModel({
    transactions: householdTransactions('2026-06-03', '2026-10-14'),
    accounts: [...ACCOUNTS, SAVINGS],
    plannedEvents,
    dataThrough: '2026-10-14',
    today: '2026-10-15',
  }));

  it('publishes what each account holds now and ahead, primary account first', () => {
    const pack = withSavings([{ ...bonus, accountId: 'savings' }]);
    const facts = byId(cashFlowForecastFacts(pack));
    expect(facts.get('cash_flow_account_1_cash_now')).toMatchObject({
      value: 5200,
      label: 'Cash in account “Everyday Checking ending 1234” now, as last reported',
      provenance: { kind: 'snapshot' },
    });
    expect(facts.get('cash_flow_account_2_cash_now')).toMatchObject({ value: 10000 });
    // The accounts add up to the whole at every milestone.
    for (const key of ['end_of_this_month', 'in_3_months', 'in_12_months']) {
      const whole = facts.get(`cash_flow_cash_${key}`)!.value;
      const parts = facts.get(`cash_flow_account_1_cash_${key}`)!.value + facts.get(`cash_flow_account_2_cash_${key}`)!.value;
      expect(parts).toBeCloseTo(whole, 1);
      expect(facts.get(`cash_flow_account_2_cash_${key}`)!.provenance.kind).toBe('forecast');
    }
    // The bonus planned into savings lands there, not in checking.
    expect(facts.get('cash_flow_account_2_cash_in_12_months')!.value).toBeGreaterThanOrEqual(20000);
    expect(facts.has('cash_flow_account_1_cash_low_point_next_12_months')).toBe(true);
    expect(validateCanonicalFactPack({ version: 1, facts: [...facts.values()] })).toEqual([]);

    const details = compactCashFlowForecastDetails(pack) as any;
    expect(details.cashPosition.accounts).toEqual([
      expect.objectContaining({ account: 'account “Everyday Checking ending 1234”', factIdPrefix: 'cash_flow_account_1_', primary: expect.any(String) }),
      expect.objectContaining({ account: 'account “High Yield Savings ending 5678”', factIdPrefix: 'cash_flow_account_2_' }),
    ]);
    expect(details.cashPosition.accounts[1]).not.toHaveProperty('primary');
  });

  it('lists every cash account, however many there are', () => {
    const more = Array.from({ length: 4 }, (_, index) => ({
      ...SAVINGS, account_id: `savings-${index}`, name: `Savings ${index}`, mask: `90${index}0`, balance: { current: 1000 * (index + 1) },
    }));
    const pack = buildCashFlowForecastContext(buildCashFlowModel({
      transactions: householdTransactions('2026-06-03', '2026-10-14'),
      accounts: [...ACCOUNTS, SAVINGS, ...more],
      plannedEvents: [],
      dataThrough: '2026-10-14',
      today: '2026-10-15',
    }));
    // Six cash accounts, all listed: the primary first, then the largest.
    expect(pack.position!.accounts!.map(account => account.name)).toEqual([
      'Everyday Checking', 'High Yield Savings', 'Savings 3', 'Savings 2', 'Savings 1', 'Savings 0',
    ]);
    const facts = byId(cashFlowForecastFacts(pack));
    const listed = Array.from({ length: 6 }, (_, index) => facts.get(`cash_flow_account_${index + 1}_cash_in_3_months`)!.value);
    expect(listed.reduce((sum, value) => sum + value, 0)).toBeCloseTo(facts.get('cash_flow_cash_in_3_months')!.value, 1);
    const details = compactCashFlowForecastDetails(pack) as any;
    expect(details.cashPosition.accounts).toHaveLength(6);
    expect(details.cashPosition.accountsNote).toContain('the cash figures above are their sum');
  });

  it('adds nothing when there is only one account, which the whole already is', () => {
    const facts = byId(cashFlowForecastFacts(context()));
    expect([...facts.keys()].some(id => id.startsWith('cash_flow_account_'))).toBe(false);
  });
});
