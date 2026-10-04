import { describe, expect, it, jest } from '@jest/globals';
import {
  describeStatedRetirementPlanExecution,
  parseStatedRetirementPlan,
  runStatedRetirementPlan,
  statedRetirementPlanApplies,
  statedRetirementPlanCanonicalFacts,
  type CompletedStatedRetirementPlanExecution,
  type QuickPlanRunner,
} from '../../scenarios/stated-retirement-plan-scenario';
import {
  QuickPlanValidationError,
  type RetirementQuickPlanRequest,
  type RetirementQuickPlanResult,
} from '../../services/retirement-quickplan';
import { validateCanonicalFactPack } from '../../openai/canonical-facts';

const NUMERIC = [
  'currentAge',
  'retirementAge',
  'investableAssets',
  'annualSpending',
  'annualContributions',
  'socialSecurityAnnual',
  'socialSecurityStartAge',
  'lifeExpectancy',
] as const;

type Values = Partial<Record<(typeof NUMERIC)[number], number>> & { allocation?: string };

/** A strict-schema variant: every field present, null where unstated. */
function variant(values: Values) {
  return {
    overrides: {
      ...Object.fromEntries(NUMERIC.map((field) => [field, values[field] ?? null])),
      allocation: values.allocation ?? 'unspecified',
      sources: {
        ...Object.fromEntries(NUMERIC.map((field) => [
          field,
          values[field] !== undefined ? `stated ${field}` : null,
        ])),
        allocation: values.allocation ? 'the balanced preset' : null,
      },
    },
  };
}

function plan(primary: Values, comparison: Values = {}) {
  const parsed = parseStatedRetirementPlan({
    requested: true,
    primary: variant(primary),
    comparison: variant(comparison),
  });
  if (!parsed) throw new Error('plan did not parse');
  return parsed;
}

/** What the retirement calculator's first decision states back. */
const LEAD = {
  currentAge: 45,
  retirementAge: 60,
  investableAssets: 800_000,
  annualSpending: 70_000,
  annualContributions: 20_000,
  socialSecurityAnnual: 30_000,
  socialSecurityStartAge: 67,
  allocation: 'balanced',
};

/** A brand-new account from the calculator: nothing linked, nothing remembered. */
const NO_HOLDINGS = { investments: { holdings: [], securities: [] } } as any;

/** A quick-plan result shaped like the engine's, with a survival rate per retirement age. */
function fakeRunner(survivalByAge: Record<number, number> = {}) {
  return jest.fn(async (request: RetirementQuickPlanRequest): Promise<RetirementQuickPlanResult> => {
    const survival = survivalByAge[request.retirementAge] ?? 0.9;
    const scenario = (retirementAge: number, annualSpending: number, rate: number) => ({
      id: `retire-at-${retirementAge}`,
      label: `Retire at ${retirementAge}`,
      change: null,
      retirementAge,
      annualSpending,
      survivalRate: rate,
      sequencesTested: 600,
      sequencesSurvived: Math.round(rate * 600),
      projectedPortfolioAtRetirement: 1_900_000,
      firstYearPortfolioWithdrawal: annualSpending,
      firstYearWithdrawalRate: annualSpending / 1_900_000,
      depletionYears: rate < 1 ? { p10: 22, p25: 27, p50: null } : null,
      primaryObservation: '',
      characteristics: {} as any,
      tradeoffs: {} as any,
    });
    return {
      version: 1,
      computedAt: '2026-10-04T00:00:00.000Z',
      durationMs: 1,
      cached: false,
      mode: 'plan',
      assumed: [],
      missing: [],
      inputs: { ...request, allocation: request.allocation ?? 'balanced' } as any,
      allocation: {} as any,
      history: {
        firstMonth: '1926-07',
        lastMonth: '2025-12',
        sequencesTested: 600,
        horizonYears: (request.lifeExpectancy ?? 95) - request.currentAge,
        firstStartMonth: '1926-07',
        lastStartMonth: '1976-06',
      },
      primary: scenario(request.retirementAge, request.annualSpending, survival),
      alternatives: [
        scenario(request.retirementAge + 2, request.annualSpending, Math.min(1, survival + 0.04)),
        { ...scenario(request.retirementAge, 63_000, Math.min(1, survival + 0.03)), id: 'spend-10-less' },
      ],
      sustainableSpending: { p10: 78_000, p25: 90_000, p50: 120_000, p75: 140_000, p90: 160_000, solverFloorRate: 0.02, solverCeilingRate: 0.08 },
      sustainableSpendingRates: {} as any,
      assumptions: [],
      limitations: [],
    };
  });
}

describe('retirement plan from stated figures', () => {
  it('stands in only while no holdings are linked', () => {
    expect(statedRetirementPlanApplies(NO_HOLDINGS)).toBe(true);
    expect(statedRetirementPlanApplies({} as any)).toBe(true);
    expect(statedRetirementPlanApplies({ investments: { holdings: [{ id: 'h1' }] } } as any)).toBe(false);
  });

  it('answers "what if I retire at 62 instead?" for a calculator lead with nothing linked', async () => {
    const runner = fakeRunner({ 60: 0.88, 62: 0.93 });
    const execution = await runStatedRetirementPlan(
      NO_HOLDINGS,
      plan(LEAD, { retirementAge: 62 }),
      runner as QuickPlanRunner
    ) as CompletedStatedRetirementPlanExecution;

    expect(execution.status).toBe('completed');
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner.mock.calls[1][0]).toMatchObject({ ...LEAD, retirementAge: 62, lifeExpectancy: 95 });
    expect(execution.scenarios.map((scenario) => [scenario.label, scenario.outcome.survivalRate])).toEqual([
      ['Retiring at 60', 0.88],
      ['Retiring at 62', 0.93],
    ]);
    // The engine's levers come with the primary case only, so the pack stays bounded.
    expect(execution.scenarios[0].alternatives?.map((alternative) => alternative.label)).toEqual([
      'Retiring at 62',
      'Spending $63,000 a year',
    ]);
    expect(execution.scenarios[1].alternatives).toBeUndefined();
  });

  it('asks for the figures it needs, offering the link as the alternative', async () => {
    const runner = fakeRunner();
    const execution = await runStatedRetirementPlan(NO_HOLDINGS, plan({ retirementAge: 60 }), runner as QuickPlanRunner);

    expect(runner).not.toHaveBeenCalled();
    expect(execution).toMatchObject({
      status: 'unavailable',
      missingInputs: [
        'roughly how much you have invested today',
        'what you expect to spend a year in retirement, in today\'s dollars',
        'your current age',
      ],
    });
    const ask = describeStatedRetirementPlanExecution(execution)!;
    expect(ask).toContain('before any accounts are linked');
    expect(ask).toContain('Or link your investment accounts');
  });

  it('never defaults the portfolio, spending, or ages, but does default the horizon and mix', async () => {
    const runner = fakeRunner();
    const execution = await runStatedRetirementPlan(NO_HOLDINGS, plan({
      currentAge: 45,
      retirementAge: 60,
      investableAssets: 800_000,
      annualSpending: 70_000,
    }), runner as QuickPlanRunner);

    expect(runner.mock.calls[0][0]).toEqual({
      currentAge: 45,
      retirementAge: 60,
      investableAssets: 800_000,
      annualSpending: 70_000,
      annualContributions: 0,
      socialSecurityAnnual: 0,
      socialSecurityStartAge: 67,
      lifeExpectancy: 95,
      allocation: 'balanced',
    });
    const disclosure = describeStatedRetirementPlanExecution(execution)!;
    expect(disclosure).toContain('no investment holdings are linked, so this ran the Balanced preset');
    expect(disclosure).toContain('You did not name a mix, so I used the Balanced preset.');
    expect(disclosure).toContain('since you did not give a horizon');
    expect(disclosure).toContain('No Social Security is included');
  });

  it('reports a figure the engine refuses rather than substituting one', async () => {
    const runner = jest.fn(async () => {
      throw new QuickPlanValidationError('retirementAge', 'Retirement age cannot be earlier than your current age.');
    });
    const execution = await runStatedRetirementPlan(NO_HOLDINGS, plan(LEAD), runner as unknown as QuickPlanRunner);

    expect(execution).toMatchObject({ status: 'unavailable', reason: expect.stringMatching(/Retirement age/) });
    expect(describeStatedRetirementPlanExecution(execution)).toMatch(/^I could not run your plan against market history/);
  });

  it('promotes the verdict, the inputs, and the levers as citeable facts', async () => {
    const execution = await runStatedRetirementPlan(NO_HOLDINGS, plan(LEAD), fakeRunner({ 60: 0.88 }) as QuickPlanRunner);
    const facts = statedRetirementPlanCanonicalFacts(execution);
    const byEnding = (suffix: string) => facts.find((fact) => fact.id.endsWith(suffix));

    expect(byEnding('_historical_survival_rate')).toMatchObject({ value: 88, unit: 'percent' });
    expect(byEnding('_historical_sequences_survived')).toMatchObject({ value: 528, unit: 'count' });
    expect(byEnding('_investable_assets')).toMatchObject({ value: 800_000, provenance: { kind: 'scenario_input' } });
    expect(byEnding('_us_stock_share')).toMatchObject({ value: 60, unit: 'percent' });
    expect(byEnding('_alternative_spend_10_less_annual_spending')).toMatchObject({ value: 63_000 });
    expect(facts.some((fact) => fact.label.startsWith('Retiring at 62 instead, everything else as in your plan'))).toBe(true);
    expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);
  });

  it('runs the real historical engine on the preset mix', async () => {
    const execution = await runStatedRetirementPlan(NO_HOLDINGS, plan(LEAD));

    expect(execution.status).toBe('completed');
    const [scenario] = (execution as CompletedStatedRetirementPlanExecution).scenarios;
    expect(scenario.allocation).toMatchObject({ id: 'balanced', usEquityPercent: 60, bondsPercent: 35, cashPercent: 5 });
    expect(scenario.outcome.sequencesTested).toBeGreaterThan(100);
    expect(scenario.outcome.survivalRate).toBeGreaterThan(0);
    expect(scenario.outcome.survivalRate).toBeLessThanOrEqual(1);
    expect(scenario.outcome.projectedPortfolioAtRetirement).toBeGreaterThan(LEAD.investableAssets);
  }, 120_000);
});
