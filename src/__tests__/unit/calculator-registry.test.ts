import {
  ScenarioCalculatorRegistry,
  scenarioCalculatorRegistry,
  type ScenarioCalculatorDefinition,
  type ScenarioExecutionBase,
} from '../../scenarios/calculator-registry';
import {
  RETIREMENT_CALCULATOR_ID,
  retirementScenarioCalculator,
  type RetirementScenarioPlan,
} from '../../scenarios/retirement-scenario';
import { HOME_AFFORDABILITY_CALCULATOR_ID } from '../../scenarios/home-affordability-scenario';

describe('scenario calculator registry', () => {
  const fakeCalculator: ScenarioCalculatorDefinition<
    { value: number },
    ScenarioExecutionBase & { value: number },
    ScenarioExecutionBase & { value: number }
  > = {
    id: 'fake',
    version: 1,
    label: 'Fake scenarios',
    description: 'Test calculator',
    requiredPacks: ['monthly_cash_flow'],
    supportedOverrides: [],
    defaults: [],
    outputs: [],
    planner: {
      jsonSchema: { type: 'object' },
      instructions: 'Read a fake scenario.',
      parsePlan: (value) => {
        const numeric = (value as { value?: unknown } | undefined)?.value;
        return typeof numeric === 'number' ? { value: numeric } : undefined;
      },
    },
    execution: { progressMessage: 'Running fake scenarios', failureMessage: 'Fake failed.' },
    execute: async (_snapshot, plan) => ({
      version: 1,
      calculator: 'fake',
      status: 'completed',
      computedAt: '2026-08-17T00:00:00.000Z',
      durationMs: 3,
      value: plan.value,
    }),
    unavailable: (startedAt, reason) => ({
      version: 1,
      calculator: 'fake',
      status: 'unavailable',
      computedAt: new Date(startedAt).toISOString(),
      durationMs: 0,
      value: 0,
      reason,
    } as ScenarioExecutionBase & { value: number }),
    compactEvidence: (execution) => ({ ...execution }),
    canonicalFacts: (execution) => execution.status === 'completed' ? [{
      id: 'fake_value',
      label: 'Fake value',
      value: execution.value,
      unit: 'count',
      provenance: {
        kind: 'scenario_calculation',
        source: 'scenario.fake',
        calculatorId: 'fake',
        calculatorVersion: 1,
      },
    }] : [],
    describeAssumptions: (execution) => `Fake assumption: ${execution.value}.`,
  };

  it('publishes the retirement calculator contract from one declaration', () => {
    expect(scenarioCalculatorRegistry.ids()).toEqual([
      RETIREMENT_CALCULATOR_ID,
      HOME_AFFORDABILITY_CALCULATOR_ID,
    ]);
    expect(scenarioCalculatorRegistry.manifests()).toContainEqual(expect.objectContaining({
      id: 'retirement',
      version: 2,
      requiredPacks: ['retirement_analysis'],
      supportedOverrides: expect.arrayContaining([
        expect.objectContaining({ id: 'withdrawal_policy' }),
        expect.objectContaining({ id: 'annual_contribution_amount' }),
        expect.objectContaining({ id: 'retirement_age' }),
        expect.objectContaining({ id: 'life_expectancy' }),
      ]),
      defaults: expect.arrayContaining([
        expect.objectContaining({ id: 'annual_contribution_amount', value: 0 }),
        expect.objectContaining({ id: 'annual_withdrawal_growth_rate', value: 0.03 }),
      ]),
      outputs: expect.arrayContaining([
        expect.objectContaining({ id: 'survival_rate', unit: 'percent' }),
        expect.objectContaining({ id: 'projected_portfolio_at_withdrawal_start', unit: 'usd' }),
      ]),
    }));
  });

  it('publishes the home-affordability contract from one declaration', () => {
    expect(scenarioCalculatorRegistry.manifests()).toContainEqual(expect.objectContaining({
      id: 'home_affordability',
      version: 1,
      requiredPacks: ['market_context'],
      supportedOverrides: expect.arrayContaining([
        expect.objectContaining({ id: 'home_price' }),
        expect.objectContaining({ id: 'down_payment_percent' }),
        expect.objectContaining({ id: 'property_tax_annual' }),
        expect.objectContaining({ id: 'current_housing_cost_monthly' }),
      ]),
      defaults: expect.arrayContaining([
        expect.objectContaining({ id: 'down_payment_percent', value: 20 }),
        expect.objectContaining({ id: 'loan_term_years', value: 30 }),
        expect.objectContaining({ id: 'emergency_fund_months', value: 6 }),
      ]),
      outputs: expect.arrayContaining([
        expect.objectContaining({ id: 'all_in_housing_monthly', unit: 'usd' }),
        expect.objectContaining({ id: 'cash_remaining', unit: 'usd' }),
        expect.objectContaining({ id: 'reserve_months', unit: 'months' }),
      ]),
    }));
  });

  it('uses the registered parser instead of accepting arbitrary override values', () => {
    const plan = scenarioCalculatorRegistry.parsePlan<RetirementScenarioPlan>('retirement', {
      requested: true,
      primary: {
        type: 'historical_cpi',
        annualRate: null,
        source: 'retire at 65 and keep contributing $12,000',
        overrides: {
          annualWithdrawalAmount: null,
          annualContributionAmount: 12_000,
          retirementAge: 65,
          withdrawalStartAge: null,
          lifeExpectancy: 100,
          sources: {
            annualWithdrawalAmount: null,
            annualContributionAmount: 'keep contributing $12,000',
            retirementAge: 'retire at 65',
            withdrawalStartAge: null,
            lifeExpectancy: 'plan through age 100',
          },
        },
      },
      comparison: { type: 'none', annualRate: null, source: null, overrides: null },
    });

    expect(plan?.primary.overrides).toMatchObject({
      annualContributionAmount: 12_000,
      retirementAge: 65,
      withdrawalStartAge: 65,
      lifeExpectancy: 100,
    });
  });

  it('rejects duplicate calculator ids at registry construction', () => {
    expect(() => new ScenarioCalculatorRegistry([
      retirementScenarioCalculator,
      retirementScenarioCalculator,
    ])).toThrow('Duplicate scenario calculator id: retirement');
  });

  it('drives planning, packs, execution, facts, disclosure, and evidence by calculator id', async () => {
    const registry = new ScenarioCalculatorRegistry([fakeCalculator]);
    expect(registry.plannerJsonSchema()).toMatchObject({
      required: ['fake'],
      properties: { fake: { type: 'object' } },
    });
    expect(registry.plannerInstructions()).toContain('Fake scenarios (key: fake)');
    const plans = registry.parsePlans({ fake: { value: 7 } });
    expect(plans).toEqual({ fake: { value: 7 } });
    expect(registry.requiredPacksForPlans(plans)).toEqual(['monthly_cash_flow']);

    const executions = await registry.executePlans({} as any, plans);
    expect(executions.fake).toMatchObject({ calculator: 'fake', value: 7 });
    expect(registry.compactEvidenceRecord(executions)).toMatchObject({ fake: { calculator: 'fake', value: 7 } });
    expect(registry.canonicalFacts(executions)).toContainEqual(expect.objectContaining({ id: 'fake_value', value: 7 }));
    expect(registry.assumptionDisclosures(executions)).toEqual(['Fake assumption: 7.']);
  });

  it('isolates a calculator failure and returns its declared unavailable result', async () => {
    const failingCalculator = {
      ...fakeCalculator,
      id: 'failing',
      execute: async () => {
        throw new Error('boom');
      },
    };
    const registry = new ScenarioCalculatorRegistry([fakeCalculator, failingCalculator]);
    const executions = await registry.executePlans({} as any, {
      fake: { value: 7 },
      failing: { value: 9 },
    });
    expect(executions.fake.status).toBe('completed');
    expect(executions.failing.status).toBe('unavailable');
  });

  it('ignores unknown calculator keys instead of throwing during pack and evidence projection', () => {
    const registry = new ScenarioCalculatorRegistry([fakeCalculator]);
    const plans = {
      fake: { value: 3 },
      not_registered: { value: 9 },
    };
    expect(registry.requiredPacksForPlans(plans)).toEqual(['monthly_cash_flow']);
    expect(registry.compactEvidenceRecord({
      fake: {
        version: 1,
        calculator: 'fake',
        status: 'completed',
        computedAt: '2026-08-17T00:00:00.000Z',
        durationMs: 1,
        value: 3,
      } as any,
      not_registered: {
        version: 1,
        calculator: 'not_registered',
        status: 'completed',
        computedAt: '2026-08-17T00:00:00.000Z',
        durationMs: 1,
      },
    })).toEqual({
      fake: expect.objectContaining({ calculator: 'fake', value: 3 }),
    });
    expect(registry.canonicalFacts({
      fake: {
        version: 1,
        calculator: 'fake',
        status: 'completed',
        computedAt: '2026-08-17T00:00:00.000Z',
        durationMs: 1,
        value: 3,
      } as any,
      not_registered: {
        version: 1,
        calculator: 'not_registered',
        status: 'completed',
        computedAt: '2026-08-17T00:00:00.000Z',
        durationMs: 1,
      },
    })).toEqual([expect.objectContaining({ id: 'fake_value', value: 3 })]);
  });
});
