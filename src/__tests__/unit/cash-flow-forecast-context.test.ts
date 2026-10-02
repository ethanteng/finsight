import { buildCashFlowModel } from '../../cash-flow/forecast';
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
import { ACCOUNTS, householdTransactions } from './factories/cash-flow.factory';

const bonus: PlannedCashFlowEvent = {
  id: 'bonus', label: 'Year-end bonus', kind: 'income', amount: 10000, startDate: '2026-12-15', recurrence: 'once', endDate: null,
};

function context(overrides: { transactionsFrom?: string; plannedEvents?: PlannedCashFlowEvent[] } = {}): CashFlowForecastContext {
  return buildCashFlowForecastContext(buildCashFlowModel({
    transactions: householdTransactions(overrides.transactionsFrom ?? '2026-06-03', '2026-10-14'),
    accounts: ACCOUNTS,
    plannedEvents: overrides.plannedEvents ?? [bonus],
    dataThrough: '2026-10-14',
    today: '2026-10-15',
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

  it('publishes only observed figures when there is too little history to forecast', () => {
    const short = cashFlowForecastFacts(context({ transactionsFrom: '2026-10-01' }));
    expect(short.length).toBeGreaterThan(0);
    expect(short.every(fact => fact.provenance.kind !== 'forecast')).toBe(true);
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
