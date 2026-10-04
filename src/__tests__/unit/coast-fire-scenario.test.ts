import { describe, expect, it, jest } from '@jest/globals';
import {
  coastFireContributionPath,
  coastFireScenarioCanonicalFacts,
  describeCoastFireScenarioExecution,
  parseCoastFireScenarioPlan,
  runCoastFireScenario as runWithEngine,
  type CompletedCoastFireScenarioExecution,
  type QuickPlanRunner,
} from '../../scenarios/coast-fire-scenario';
import { calculateCoastFire } from '../../services/coast-fire';
import { validateCanonicalFactPack } from '../../openai/canonical-facts';
import type { RetirementQuickPlanRequest, RetirementQuickPlanResult } from '../../services/retirement-quickplan';

/** The historical engine's answer, shaped like the quick plan's, at a fixed survival rate. */
function fakeRunner(survivalRate = 0.02) {
  return jest.fn(async (request: RetirementQuickPlanRequest): Promise<RetirementQuickPlanResult> => ({
    version: 1,
    computedAt: '2026-10-04T00:00:00.000Z',
    durationMs: 1,
    cached: false,
    mode: 'plan',
    assumed: [],
    missing: [],
    inputs: { ...request, lifeExpectancy: 95, allocation: request.allocation ?? 'balanced' } as any,
    allocation: {} as any,
    history: {
      firstMonth: '1926-07',
      lastMonth: '2025-12',
      sequencesTested: 517,
      horizonYears: 95 - request.currentAge,
      firstStartMonth: '1926-07',
      lastStartMonth: '1969-07',
    },
    primary: {
      id: 'as-entered',
      label: '',
      change: null,
      retirementAge: request.retirementAge,
      annualSpending: request.annualSpending,
      survivalRate,
      sequencesTested: 517,
      sequencesSurvived: Math.round(survivalRate * 517),
      projectedPortfolioAtRetirement: 1_045_454,
      firstYearPortfolioWithdrawal: request.annualSpending,
      firstYearWithdrawalRate: 0.08,
      depletionYears: null,
      primaryObservation: '',
      characteristics: {} as any,
      tradeoffs: {} as any,
    },
    alternatives: [],
    sustainableSpending: null,
    sustainableSpendingRates: {} as any,
    assumptions: [],
    limitations: [],
  }));
}

/** Most cases are about the straight line; a stub engine keeps them fast and exact. */
function runCoastFireScenario(snapshot: any, plan: any, runner: QuickPlanRunner = fakeRunner() as QuickPlanRunner) {
  return runWithEngine(snapshot, plan, runner);
}

const FIELDS = [
  'currentAge',
  'retirementAge',
  'currentSavings',
  'annualRetirementSpending',
  'annualRetirementIncome',
  'realReturnRatePercent',
  'withdrawalRatePercent',
  'annualContribution',
] as const;

type Field = (typeof FIELDS)[number];

/** A strict-schema variant: every field present, null where unstated. */
function variant(values: Partial<Record<Field, number>> & { allocation?: string }, sources: Partial<Record<Field, string>> = {}) {
  return {
    overrides: {
      ...Object.fromEntries(FIELDS.map((field) => [field, values[field] ?? null])),
      allocation: values.allocation ?? 'unspecified',
      sources: {
        ...Object.fromEntries(FIELDS.map((field) => [
          field,
          sources[field] ?? (values[field] !== undefined ? `stated ${field}` : null),
        ])),
        allocation: values.allocation ? 'a growth mix' : null,
      },
    },
  };
}

/** The question in the screenshots that used to end on "link an account". */
const STATED = {
  currentAge: 38,
  retirementAge: 55,
  currentSavings: 500_000,
  annualRetirementSpending: 80_000,
  realReturnRatePercent: 5,
  withdrawalRatePercent: 4,
};

function plan(
  primary: Partial<Record<Field, number>> & { allocation?: string },
  comparison?: Partial<Record<Field, number>> & { allocation?: string }
) {
  const parsed = parseCoastFireScenarioPlan({
    requested: true,
    primary: variant(primary),
    comparison: variant(comparison ?? {}),
  });
  if (!parsed) throw new Error('plan did not parse');
  return parsed;
}

/** No holdings, nothing remembered: a brand-new account from the calculator. */
const EMPTY_SNAPSHOT = {} as any;

describe('Coast FIRE calculator', () => {
  it('answers the calculator follow-up from stated figures, with nothing linked', async () => {
    const execution = await runCoastFireScenario(EMPTY_SNAPSHOT, plan(STATED));

    expect(execution.status).toBe('completed');
    const [scenario] = (execution as CompletedCoastFireScenarioExecution).scenarios;
    // The same figures the first decision stated, so the follow-up agrees with it.
    expect(scenario.metrics.coastFireNumber).toBeCloseTo(872_593, 0);
    expect(scenario.metrics.retirementTarget).toBe(2_000_000);
    expect(scenario.metrics.projectedSavingsAtRetirement).toBeCloseTo(1_146_009, 0);
    expect(scenario.metrics.hasReachedCoastFire).toBe(false);
    expect(scenario.contributionPath).toBeUndefined();
  });

  it('works out when contributions get savings to the point they can coast', async () => {
    // "I currently invest roughly $74,000 to $83,000 per year": low end in
    // primary, high end in comparison.
    const execution = await runCoastFireScenario(
      EMPTY_SNAPSHOT,
      plan({ ...STATED, annualContribution: 74_000 }, { annualContribution: 83_000 })
    ) as CompletedCoastFireScenarioExecution;

    expect(execution.scenarios.map((scenario) => scenario.label)).toEqual([
      'Investing $74,000 a year',
      'Investing $83,000 a year',
    ]);
    for (const scenario of execution.scenarios) {
      expect(scenario.contributionPath).toMatchObject({
        reachedBeforeRetirement: true,
        yearsUntilCoastFire: 6,
        ageAtCoastFire: 44,
      });
      // At 44 the number has risen with five fewer years left to compound.
      expect(scenario.contributionPath!.coastFireNumberAtThatAge).toBeCloseTo(1_169_359, 0);
      expect(scenario.contributionPath!.savingsAtCoastFire)
        .toBeGreaterThanOrEqual(scenario.contributionPath!.coastFireNumberAtThatAge!);
    }
    // A year earlier, $83,000 a year is still short of that year's number.
    expect(execution.scenarios[1].contributionPath!.savingsAtCoastFire).toBeCloseTo(1_234_607, 0);
  });

  it('does not call contributing all the way to retirement "coasting"', () => {
    const metrics = calculateCoastFire({
      currentAge: 50,
      retirementAge: 55,
      currentSavings: 0,
      annualRetirementSpending: 80_000,
      annualRetirementIncome: 0,
      realReturnRate: 5,
      withdrawalRate: 4,
    });
    const path = coastFireContributionPath(metrics, 10_000);

    expect(path.reachedBeforeRetirement).toBe(false);
    expect(path.ageAtCoastFire).toBeUndefined();
    expect(path.projectedSavingsAtRetirementWithContributions).toBeCloseTo(55_256, 0);
  });

  it('asks for the figures it needs instead of refusing, and never defaults them', async () => {
    const execution = await runCoastFireScenario(EMPTY_SNAPSHOT, plan({ retirementAge: 55 }));

    expect(execution).toMatchObject({
      status: 'unavailable',
      missingInputs: [
        'your current age',
        'how much you have invested for retirement today',
        'roughly how much you expect to spend a year once you stop working, in today\'s dollars',
      ],
    });
    const ask = describeCoastFireScenarioExecution(execution)!;
    expect(ask).toContain('To work out your Coast FIRE number I need your current age');
    expect(ask).toContain('no linked accounts needed');
  });

  it('fills age and savings from what Linc already holds, and says so', async () => {
    const snapshot = {
      userProfileValues: { age: 38 },
      financialSummary: { financialOverview: { totalInvestments: 650_000 } },
    } as any;
    const execution = await runCoastFireScenario(snapshot, plan({
      retirementAge: 55,
      annualRetirementSpending: 80_000,
    })) as CompletedCoastFireScenarioExecution;

    const [scenario] = execution.scenarios;
    expect(scenario.metrics.currentSavings).toBe(650_000);
    expect(scenario.metrics.currentAge).toBe(38);
    const disclosure = describeCoastFireScenarioExecution(execution)!;
    expect(disclosure).toContain('connected investment total of $650,000');
    expect(disclosure).toContain('Your age, 38, is the one you told me earlier.');
    // Neither rate was stated, so both defaults are named.
    expect(disclosure).toContain('You did not give a growth rate, so I used 5%, or a withdrawal rate, so I used 4%.');
  });

  it('drops a real return that is a decimal fraction in disguise', () => {
    const parsed = parseCoastFireScenarioPlan({
      requested: true,
      primary: variant({ ...STATED, realReturnRatePercent: 0.05 }),
      comparison: variant({}),
    });

    expect(parsed?.primary.overrides?.realReturnRatePercent).toBeUndefined();
    expect(parsed?.primary.overrides?.currentAge).toBe(38);
  });

  it('accepts a request with nothing stated yet, so the runner can ask', () => {
    expect(parseCoastFireScenarioPlan({
      requested: true,
      primary: variant({}),
      comparison: variant({}),
    })).toEqual({ requested: true, primary: {} });
    expect(parseCoastFireScenarioPlan({ requested: false, primary: variant(STATED) })).toBeUndefined();
  });

  it('promotes every figure an answer could quote, with formulas that check', async () => {
    const execution = await runCoastFireScenario(
      EMPTY_SNAPSHOT,
      plan({ ...STATED, annualContribution: 74_000 })
    );
    const facts = coastFireScenarioCanonicalFacts(execution);
    const byEnding = (suffix: string) => facts.find((fact) => fact.id.endsWith(suffix));

    expect(byEnding('_coast_fire_number')).toMatchObject({ value: 872_593.38, unit: 'usd' });
    expect(byEnding('_savings_versus_coast_fire_number')).toMatchObject({
      value: 372_593.38,
      label: expect.stringContaining('fall short'),
    });
    expect(byEnding('_share_of_coast_fire_number')?.value).toBeCloseTo(57.3, 1);
    expect(byEnding('_age_at_coast_fire')).toMatchObject({ value: 44, unit: 'age' });
    expect(byEnding('_current_savings')).toMatchObject({ value: 500_000, provenance: { kind: 'scenario_input' } });
    expect(facts.every((fact) => fact.provenance.calculatorId === 'coast_fire')).toBe(true);
    expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);
  });

  it('reports a figure the user typed that the formula cannot use', async () => {
    const execution = await runCoastFireScenario(EMPTY_SNAPSHOT, plan({ ...STATED, retirementAge: 38 }));
    expect(execution).toMatchObject({ status: 'unavailable', reason: expect.stringMatching(/retirement age/i) });
    expect(describeCoastFireScenarioExecution(execution)).toMatch(/^I could not run the Coast FIRE calculation/);
  });

  it('discloses the straight-line limit on every completed answer', async () => {
    const execution = await runCoastFireScenario(EMPTY_SNAPSHOT, plan(STATED));
    const disclosure = describeCoastFireScenarioExecution(execution)!;

    expect(disclosure).toContain('5% a year after inflation, a 4% withdrawal rate, and no retirement income counted');
    expect(disclosure).toContain('single straight line');
    expect(disclosure).not.toContain('You did not give a growth rate');
  });

  describe('market-history test while nothing is linked', () => {
    it('runs today\'s savings, left alone, through history on a preset mix', async () => {
      const runner = fakeRunner(0.0193);
      const execution = await runCoastFireScenario(
        EMPTY_SNAPSHOT,
        plan({ ...STATED, annualContribution: 74_000 }, { annualContribution: 83_000 }),
        runner as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;

      // Coasting means no more contributions, so the range is one test, not two.
      expect(runner).toHaveBeenCalledTimes(1);
      expect(runner.mock.calls[0][0]).toEqual({
        currentAge: 38,
        retirementAge: 55,
        investableAssets: 500_000,
        annualSpending: 80_000,
        annualContributions: 0,
        socialSecurityAnnual: 0,
        socialSecurityStartAge: 67,
        allocation: 'balanced',
      });
      expect(execution.scenarios[0].historicalTest).toMatchObject({
        allocation: { id: 'balanced', origin: 'default', usEquityPercent: 60 },
        sequencesTested: 517,
        sequencesSurvived: 10,
        lifeExpectancy: 95,
      });
      expect(execution.scenarios[1].historicalTest).toBeUndefined();

      const facts = coastFireScenarioCanonicalFacts(execution);
      expect(facts.find((fact) => fact.id.endsWith('_history_survival_rate'))).toMatchObject({
        value: 1.93,
        unit: 'percent',
        label: expect.stringContaining('Balanced preset, coasting from today'),
      });
      expect(facts.find((fact) => fact.id.endsWith('_history_sequences_survived'))?.value).toBe(10);
      expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);

      const disclosure = describeCoastFireScenarioExecution(execution)!;
      expect(disclosure).toContain('The market-history test ran the Balanced preset (60% US stocks / 35% bonds / 5% cash), not what you hold');
      expect(disclosure).toContain('$500,000 left alone from 38 to 55, then paying $80,000 a year through age 95');
      expect(disclosure).toContain('You did not name a mix, so I used the Balanced preset.');
    });

    it('counts retirement income from the retirement date and uses a named mix', async () => {
      const runner = fakeRunner();
      await runCoastFireScenario(
        EMPTY_SNAPSHOT,
        plan({ ...STATED, annualRetirementIncome: 20_000, allocation: 'growth' }),
        runner as QuickPlanRunner
      );

      expect(runner.mock.calls[0][0]).toMatchObject({
        socialSecurityAnnual: 20_000,
        socialSecurityStartAge: 55,
        allocation: 'growth',
      });
    });

    it('leaves the history to the holdings-based projection once holdings are linked', async () => {
      const runner = fakeRunner();
      const execution = await runCoastFireScenario(
        { investments: { holdings: [{ id: 'h1' }] } },
        plan(STATED),
        runner as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;

      expect(runner).not.toHaveBeenCalled();
      expect(execution.scenarios[0].historicalTest).toBeUndefined();
    });

    it('skips an income the engine cannot start that early, rather than bending it', async () => {
      const runner = fakeRunner();
      await runCoastFireScenario(
        EMPTY_SNAPSHOT,
        plan({ ...STATED, retirementAge: 45, annualRetirementIncome: 20_000 }),
        runner as QuickPlanRunner
      );
      expect(runner).not.toHaveBeenCalled();
    });

    it('never costs the user the straight-line answer when the engine fails', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const runner = jest.fn(async () => {
        throw new Error('engine down');
      });
      const execution = await runCoastFireScenario(EMPTY_SNAPSHOT, plan(STATED), runner as unknown as QuickPlanRunner);

      expect(execution.status).toBe('completed');
      expect((execution as CompletedCoastFireScenarioExecution).scenarios[0].historicalTest).toBeUndefined();
      expect(describeCoastFireScenarioExecution(execution)).toContain('It is a single straight line');
      warn.mockRestore();
    });

    it('runs on the real historical engine', async () => {
      const execution = await runWithEngine(EMPTY_SNAPSHOT, plan(STATED)) as CompletedCoastFireScenarioExecution;
      const test = execution.scenarios[0].historicalTest!;

      expect(test.sequencesTested).toBeGreaterThan(100);
      expect(test.sequencesSurvived).toBeLessThanOrEqual(test.sequencesTested);
      expect(test.survivalRate).toBeGreaterThanOrEqual(0);
      expect(test.survivalRate).toBeLessThanOrEqual(1);
      expect(test.projectedPortfolioAtRetirement).toBeGreaterThan(0);
    }, 120_000);
  });
});
