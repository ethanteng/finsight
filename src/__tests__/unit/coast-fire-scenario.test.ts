import { describe, expect, it, jest } from '@jest/globals';
import {
  coastFireContributionPath,
  coastFireInputRequest,
  coastFireScenarioCanonicalFacts,
  describeCoastFireScenarioExecution,
  parseCoastFireScenarioPlan,
  runCoastFireScenario as runWithEngine,
  type CompletedCoastFireScenarioExecution,
  type QuickPlanRunner,
} from '../../scenarios/coast-fire-scenario';
import { calculateCoastFire } from '../../services/coast-fire';
import { validateCanonicalFactPack } from '../../openai/canonical-facts';
import { NOTHING_LINKED } from '../../openai/linked-data';
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

  it('hands the client a form for the missing figures, showing what it already holds', async () => {
    const execution = await runCoastFireScenario({
      linkedData: { ...NOTHING_LINKED, entered: { accounts: 1, cash: 0, credit: 0, loans: 0, investments: 1 } },
      financialSummary: { financialOverview: { totalInvestments: 500_000 } },
    }, plan({ retirementAge: 55 }));

    expect(execution).toMatchObject({
      status: 'unavailable',
      missingFields: ['currentAge', 'annualRetirementSpending'],
      knownInputs: [
        { key: 'retirementAge', value: 55, origin: 'user' },
        { key: 'currentSavings', value: 500_000, origin: 'snapshot', basis: 'entered' },
      ],
    });
    const request = coastFireInputRequest(execution)!;
    const field = (id: string) => request.fields.find((item) => item.id === id)!;

    expect(request).toMatchObject({ calculatorId: 'coast_fire', question: 'What is my Coast FIRE number?' });
    expect(request.fields.filter((item) => item.required).map((item) => item.id))
      .toEqual(['currentAge', 'annualRetirementSpending']);
    expect(field('retirementAge')).toMatchObject({ value: 55, valueNote: 'From what you said earlier' });
    expect(field('currentSavings')).toMatchObject({ value: 500_000, valueNote: 'From what you entered on the Finances page' });
    // A default is named as what a blank means, never shown as a figure the user gave.
    expect(field('realReturnRatePercent')).toMatchObject({ defaultNote: '5% if left blank' });
    expect(field('realReturnRatePercent')).not.toHaveProperty('value');
    // Each sentence carries the wording the planner is told to read.
    expect(field('annualRetirementSpending').sentence)
      .toBe('I expect to spend {value} a year once I stop working, in today\'s dollars.');
  });

  it('does not insist on a retirement age while the age itself is unknown', async () => {
    const execution = await runCoastFireScenario(EMPTY_SNAPSHOT, plan({}));
    const request = coastFireInputRequest(execution)!;

    expect((execution as any).missingFields).toContain('retirementAge');
    // Blank only means 65 under that age; past it the field becomes needed.
    expect(request.fields.find((item) => item.id === 'retirementAge')).toMatchObject({
      required: false,
      defaultNote: '65 if you are under 65',
      requireWhen: { fieldId: 'currentAge', minimum: 65 },
    });
  });

  it('has no form for a run that completed', async () => {
    expect(coastFireInputRequest(await runCoastFireScenario(EMPTY_SNAPSHOT, plan(STATED)))).toBeNull();
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

  it('calls an investment balance the user entered theirs, not a connected total', async () => {
    const enteredOnly = await runCoastFireScenario({
      linkedData: { ...NOTHING_LINKED, entered: { accounts: 1, cash: 0, credit: 0, loans: 0, investments: 1 } },
      financialSummary: { financialOverview: { totalInvestments: 500_000 } },
    }, plan({ currentAge: 38, retirementAge: 55, annualRetirementSpending: 80_000 })) as CompletedCoastFireScenarioExecution;

    expect(enteredOnly.scenarios[0].metrics.currentSavings).toBe(500_000);
    expect(enteredOnly.scenarios[0].assumptions.find((item) => item.key === 'currentSavings'))
      .toMatchObject({ origin: 'snapshot', basis: 'entered' });
    const disclosure = describeCoastFireScenarioExecution(enteredOnly)!;
    expect(disclosure).toContain('Your savings figure is the $500,000 of investments you entered');
    expect(disclosure).not.toMatch(/connected|linked investment account/);

    const both = await runCoastFireScenario({
      linkedData: {
        ...NOTHING_LINKED,
        accounts: 1,
        investments: 1,
        entered: { accounts: 1, cash: 0, credit: 0, loans: 0, investments: 1 },
      },
      financialSummary: { financialOverview: { totalInvestments: 650_000 } },
    }, plan({ currentAge: 38, retirementAge: 55, annualRetirementSpending: 80_000 })) as CompletedCoastFireScenarioExecution;
    expect(describeCoastFireScenarioExecution(both))
      .toContain('your investment total of $650,000: every linked investment account plus the investment balances you entered');
  });

  describe('with a plan saved in Your numbers', () => {
    const savedPlan = {
      statedFigures: {
        retirementAge: { value: 58, savedAt: '2026-09-14T10:00:00.000Z', source: 'answer' },
        annualRetirementSpending: { value: 70_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'answer' },
        annualContribution: { value: 12_000, savedAt: '2026-10-01T10:00:00.000Z', source: 'page' },
      },
    };

    it('plans with the saved figures the question did not state, and says where they came from', async () => {
      const execution = await runCoastFireScenario(
        savedPlan,
        plan({ currentAge: 38, currentSavings: 500_000 })
      ) as CompletedCoastFireScenarioExecution;

      const [scenario] = execution.scenarios;
      expect(scenario.metrics).toMatchObject({ retirementAge: 58, annualRetirementSpending: 70_000 });
      expect(scenario.contributionPath?.annualContribution).toBe(12_000);
      expect(scenario.assumptions.find((item) => item.key === 'retirementAge'))
        .toMatchObject({ origin: 'saved', savedAt: '2026-09-14T10:00:00.000Z' });
      expect(describeCoastFireScenarioExecution(execution)).toContain(
        'From Your numbers: retiring at 58, spending $70,000 a year in retirement, and investing $12,000 a year now, ' +
        'last saved Oct 1, 2026.'
      );
    });

    it('lets what the user says now outrank what they saved', async () => {
      const execution = await runCoastFireScenario(
        savedPlan,
        plan({ currentAge: 38, currentSavings: 500_000, retirementAge: 55 })
      ) as CompletedCoastFireScenarioExecution;
      expect(execution.scenarios[0].metrics.retirementAge).toBe(55);
    });

    it('does not plan with a saved retirement age the user has already reached', async () => {
      const execution = await runCoastFireScenario(
        savedPlan,
        plan({ currentAge: 60, currentSavings: 500_000 })
      ) as CompletedCoastFireScenarioExecution;
      expect(execution.scenarios[0].metrics.retirementAge).toBe(65);
    });

    it('shows a saved figure in the form as coming from Your numbers', async () => {
      const execution = await runCoastFireScenario(savedPlan, plan({}));
      const request = coastFireInputRequest(execution)!;
      expect(request.fields.find((item) => item.id === 'annualRetirementSpending'))
        .toMatchObject({ required: false, value: 70_000, valueNote: 'From Your numbers' });
    });
  });

  it('calls a spending figure the user set on the Finances page theirs, not linked', async () => {
    const execution = await runCoastFireScenario(
      { expectedMonthly: { spending: 6_000, income: null, incomeSource: 'transactions', spendingSource: 'override' } },
      plan({ currentAge: 38, currentSavings: 500_000 })
    ) as CompletedCoastFireScenarioExecution;

    const disclosure = describeCoastFireScenarioExecution(execution)!;
    expect(disclosure).toContain('Retirement spending is the monthly spending you set on the Finances page, $72,000 a year');
    expect(disclosure).not.toContain('according to your linked accounts');
  });

  it('assumes the conventional retirement age and current spending, and says so', async () => {
    const execution = await runCoastFireScenario(
      { expectedMonthly: { spending: 6_000, income: 10_000 } },
      plan({ currentAge: 38, currentSavings: 500_000 })
    ) as CompletedCoastFireScenarioExecution;

    const [scenario] = execution.scenarios;
    expect(scenario.metrics.retirementAge).toBe(65);
    expect(scenario.metrics.annualRetirementSpending).toBe(72_000);
    const disclosure = describeCoastFireScenarioExecution(execution)!;
    expect(disclosure).toContain('You did not name a retirement age, so I used 65.');
    expect(disclosure).toContain('Retirement spending is what you spend now according to your linked accounts, $72,000 a year');
  });

  it('still asks for spending when nothing linked says what the user spends', async () => {
    const execution = await runCoastFireScenario(EMPTY_SNAPSHOT, plan({ currentAge: 38, currentSavings: 500_000 }));
    expect(execution).toMatchObject({
      status: 'unavailable',
      missingInputs: ['roughly how much you expect to spend a year once you stop working, in today\'s dollars'],
    });
  });

  describe('percentage points sent as decimal fractions', () => {
    const parse = (realReturnRatePercent: number, source: string, withdrawal?: [number, string]) =>
      parseCoastFireScenarioPlan({
        requested: true,
        primary: variant(
          { ...STATED, realReturnRatePercent, ...(withdrawal && { withdrawalRatePercent: withdrawal[0] }) },
          { realReturnRatePercent: source, ...(withdrawal && { withdrawalRatePercent: withdrawal[1] }) }
        ),
        comparison: variant({}),
      })?.primary.overrides;

    it('scales a fraction back to the percentage the user wrote', () => {
      expect(parse(0.05, 'I assumed 5% growth a year after inflation')?.realReturnRatePercent).toBe(5);
      // Out of the withdrawal range as sent, so it used to fall to the default
      // while the disclosure said no rate was given.
      expect(parse(5, '5% growth', [0.035, 'a 3.5 percent withdrawal rate'])?.withdrawalRatePercent).toBe(3.5);
    });

    it('keeps a low real return the user actually stated', () => {
      expect(parse(0.1, 'assume 0.1% growth after inflation')?.realReturnRatePercent).toBe(0.1);
      expect(parse(0, 'no growth after inflation')?.realReturnRatePercent).toBe(0);
    });

    it('drops a small value the wording does not support, leaving the disclosed default', () => {
      const overrides = parse(0.05, 'a typical return');
      expect(overrides?.realReturnRatePercent).toBeUndefined();
      expect(overrides?.currentAge).toBe(38);
    });
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

    it('also stands in for linked holdings none of which can be simulated', async () => {
      const runner = fakeRunner();
      const execution = await runCoastFireScenario(
        {
          investments: { holdings: [{ id: 'btc' }] },
          retirementAnalysisNeedsInfo: { missingParams: [], detectedParams: {}, unavailableCode: 'no_supported_simulation' },
        },
        plan(STATED),
        runner as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;

      expect(runner).toHaveBeenCalledTimes(1);
      expect(execution.scenarios[0].historicalTest).toBeDefined();
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
