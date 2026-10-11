import { describe, expect, it, jest } from '@jest/globals';
import {
  coastFireContributionPath,
  coastFireInputRequest,
  coastFireSavableFigures,
  coastFireScenarioCanonicalFacts,
  describeCoastFireScenarioExecution,
  parseCoastFireScenarioPlan,
  runCoastFireScenario as runWithEngine,
  type CompletedCoastFireScenarioExecution,
  type QuickPlanRunner,
} from '../../scenarios/coast-fire-scenario';
import { calculateCoastFire } from '../../services/coast-fire';
import { validateCanonicalFactPack } from '../../openai/canonical-facts';
import { parseInputRequest } from '../../openai/input-request';
import { NOTHING_LINKED } from '../../openai/linked-data';
import {
  quickPlanIncomeStreams,
  type QuickPlanFlexibility,
  type QuickPlanHousehold,
  type RetirementQuickPlanRequest,
  type RetirementQuickPlanResult,
} from '../../services/retirement-quickplan';
import { householdIncomeStreams, householdTimeline } from '../../services/household';
import { buildSaveOffer } from '../../openai/save-offer';

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
  'retirementIncomeStartAge',
  'socialSecurityAnnual',
  'socialSecurityStartAge',
  'socialSecurityAmountAge',
  'realReturnRatePercent',
  'withdrawalRatePercent',
  'annualContribution',
  'lifeExpectancy',
] as const;

type Field = (typeof FIELDS)[number];
type Values = Partial<Record<Field, number>> & { allocation?: string; retirementIncomeInflation?: string };

/** A strict-schema variant: every field present, null where unstated. */
function variant(values: Values, sources: Partial<Record<Field, string>> = {}) {
  return {
    overrides: {
      ...Object.fromEntries(FIELDS.map((field) => [field, values[field] ?? null])),
      allocation: values.allocation ?? 'unspecified',
      retirementIncomeInflation: values.retirementIncomeInflation ?? 'unspecified',
      sources: {
        ...Object.fromEntries(FIELDS.map((field) => [
          field,
          sources[field] ?? (values[field] !== undefined ? `stated ${field}` : null),
        ])),
        allocation: values.allocation ? 'a growth mix' : null,
        retirementIncomeInflation: values.retirementIncomeInflation ? 'stated pension inflation' : null,
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

function plan(primary: Values, comparison?: Values) {
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

    expect(disclosure).toContain('5% a year after inflation and a 4% withdrawal rate. No Social Security or pension is counted');
    expect(disclosure).toContain('single straight line');
    expect(disclosure).not.toContain('You did not give a growth rate');
  });

  describe('Social Security and a pension, each on its own schedule', () => {
    it('sets aside the years before Social Security starts, and names them', async () => {
      const execution = await runCoastFireScenario(
        EMPTY_SNAPSHOT,
        plan({ ...STATED, socialSecurityAnnual: 30_000 })
      ) as CompletedCoastFireScenarioExecution;
      const [scenario] = execution.scenarios;

      expect(scenario.metrics.incomes).toEqual([
        expect.objectContaining({ kind: 'social_security', startAge: 67, levelAmount: 30_000, gapYears: 12 }),
      ]);
      expect(scenario.metrics.bridgeReserve).toBeGreaterThan(0);
      const disclosure = describeCoastFireScenarioExecution(execution)!;
      expect(disclosure).toContain(
        'Social Security of $30,000 a year in today\'s dollars starts at 67 (you did not say when it starts, so I used 67).'
      );
      expect(disclosure).toMatch(/The target includes \$[\d,]+ set aside at 55 to pay Social Security's share for the 12 years before it starts\./);
      const facts = coastFireScenarioCanonicalFacts(execution);
      expect(facts.find((fact) => fact.id.endsWith('_bridge_reserve'))?.value).toBeCloseTo(scenario.metrics.bridgeReserve!, 2);
      expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);
    });

    it('counts a fixed pension at what it is worth over retirement, and says how', async () => {
      const execution = await runCoastFireScenario(
        EMPTY_SNAPSHOT,
        plan({ ...STATED, annualRetirementIncome: 24_000 })
      ) as CompletedCoastFireScenarioExecution;
      const [scenario] = execution.scenarios;
      const pension = scenario.metrics.incomes![0];

      expect(pension).toMatchObject({ kind: 'pension', startAge: 55, inflationAdjusted: false });
      expect(pension.levelAmount).toBeLessThan(24_000);
      const disclosure = describeCoastFireScenarioExecution(execution)!;
      expect(disclosure).toContain('A pension of $24,000 a year starts at 55 as a fixed amount.');
      expect(disclosure).toContain('its average worth through age 95 if prices rise 2.5% a year.');
      expect(disclosure).toContain('I assumed it starts when you retire.');
      expect(disclosure).toContain('You did not say whether it rises with inflation, so I assumed it does not');
      const facts = coastFireScenarioCanonicalFacts(execution);
      expect(facts.find((fact) => fact.id.endsWith('_annual_retirement_income'))?.label).toContain('a fixed dollar amount');
      expect(facts.find((fact) => fact.id.endsWith('_assumed_inflation'))?.value).toBe(2.5);
      expect(facts.find((fact) => fact.id.endsWith('_pension_counted_value'))?.value).toBeCloseTo(pension.levelAmount, 2);
      expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);
    });

    it('reads Social Security and the pension terms saved in Your numbers', async () => {
      const execution = await runCoastFireScenario(
        {
          statedFigures: {
            socialSecurityAnnual: { value: 28_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
            socialSecurityStartAge: { value: 70, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
            retirementIncome: { value: 18_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
            retirementIncomeStartAge: { value: 60, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
            retirementIncomeInflation: { value: 'rises_with_inflation', savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
          },
        },
        plan(STATED)
      ) as CompletedCoastFireScenarioExecution;
      const [scenario] = execution.scenarios;

      expect(scenario.metrics.incomes).toEqual([
        expect.objectContaining({ kind: 'social_security', annualAmount: 28_000, startAge: 70 }),
        expect.objectContaining({ kind: 'pension', annualAmount: 18_000, startAge: 60, inflationAdjusted: true, levelAmount: 18_000 }),
      ]);
      const disclosure = describeCoastFireScenarioExecution(execution)!;
      expect(disclosure).toContain('A pension of $18,000 a year in today\'s dollars starts at 60 and rises with inflation.');
      expect(disclosure).toContain(
        'From Your numbers: a pension of $18,000 a year, the pension from 60, $28,000 a year of Social Security, ' +
        'Social Security from 70, and the pension rising with inflation, saved Sep 14, 2026.'
      );
      expect(disclosure).not.toContain('I assumed it');
    });

    it('offers the income terms the user stated for Your numbers', async () => {
      const execution = await runCoastFireScenario(
        EMPTY_SNAPSHOT,
        plan({
          ...STATED,
          annualRetirementIncome: 24_000,
          retirementIncomeStartAge: 60,
          retirementIncomeInflation: 'rises_with_inflation',
          socialSecurityAnnual: 30_000,
          socialSecurityStartAge: 67,
        })
      );

      expect(coastFireSavableFigures(execution)).toEqual(expect.arrayContaining([
        { key: 'retirementIncome', value: 24_000 },
        { key: 'retirementIncomeStartAge', value: 60 },
        { key: 'retirementIncomeInflation', value: 'rises_with_inflation' },
        { key: 'socialSecurityAnnual', value: 30_000 },
        { key: 'socialSecurityStartAge', value: 67 },
      ]));
    });
  });

  describe('claiming Social Security at another age', () => {
    it('claims the same benefit later by Social Security\'s rules, in the target and the history', async () => {
      const runner = fakeRunner();
      const execution = await runCoastFireScenario(
        EMPTY_SNAPSHOT,
        plan({ ...STATED, socialSecurityAnnual: 30_000, socialSecurityStartAge: 67 }, { socialSecurityStartAge: 70 }),
        runner as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;

      expect(execution.scenarios.map((scenario) => scenario.label))
        .toEqual(['Claiming Social Security at 67', 'Claiming Social Security at 70']);
      expect(execution.scenarios.map((scenario) => scenario.metrics.incomes?.[0]))
        .toEqual([
          expect.objectContaining({ kind: 'social_security', annualAmount: 30_000, startAge: 67 }),
          expect.objectContaining({ kind: 'social_security', annualAmount: 37_200, startAge: 70 }),
        ]);
      // The market-history test runs each case on the benefit it counts.
      expect(runner.mock.calls.map(([request]) => [request.socialSecurityAnnual, request.socialSecurityStartAge]))
        .toEqual([[30_000, 67], [37_200, 70]]);

      const disclosure = describeCoastFireScenarioExecution(execution)!;
      expect(disclosure).toContain(
        'Claimed at 70 instead of 67, Social Security of $30,000 a year becomes $37,200 by Social Security\'s own rules'
      );
      expect(disclosure).toContain('I compared claiming Social Security at 67 with claiming Social Security at 70.');
      const facts = coastFireScenarioCanonicalFacts(execution);
      const comparisonFacts = facts.filter((fact) => fact.provenance.scenarioId === execution.scenarios[1].id);
      expect(comparisonFacts.find((fact) => fact.id.endsWith('_social_security_at_claiming_age'))?.value).toBe(37_200);
      expect(comparisonFacts.find((fact) => fact.id.endsWith('_social_security_claiming_change'))?.value).toBe(24);
      expect(comparisonFacts.find((fact) => fact.id.endsWith('_social_security_annual'))?.label)
        .toContain('as given, for claiming at 67');
      expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);
    });

    it('moves a saved benefit from its saved start age, and saves it as paid at the new one', async () => {
      const execution = await runCoastFireScenario(
        {
          statedFigures: {
            socialSecurityAnnual: { value: 28_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
            socialSecurityStartAge: { value: 70, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
          },
        },
        plan({ ...STATED, socialSecurityStartAge: 62 })
      ) as CompletedCoastFireScenarioExecution;

      const benefit = Math.round(28_000 * 0.7 / 1.24);
      expect(execution.scenarios[0].metrics.incomes?.[0]).toMatchObject({ annualAmount: benefit, startAge: 62 });
      expect(coastFireSavableFigures(execution)).toEqual(expect.arrayContaining([
        { key: 'socialSecurityAnnual', value: benefit },
        { key: 'socialSecurityStartAge', value: 62 },
      ]));
    });
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
        pensionAnnual: 0,
        pensionStartAge: 55,
        pensionInflationAdjusted: false,
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

    it('runs each income on the schedule the straight line counted it on, with a named mix', async () => {
      const runner = fakeRunner();
      await runCoastFireScenario(
        EMPTY_SNAPSHOT,
        plan({
          ...STATED,
          annualRetirementIncome: 20_000,
          socialSecurityAnnual: 30_000,
          socialSecurityStartAge: 67,
          allocation: 'growth',
        }),
        runner as QuickPlanRunner
      );

      expect(runner.mock.calls[0][0]).toMatchObject({
        socialSecurityAnnual: 30_000,
        socialSecurityStartAge: 67,
        pensionAnnual: 20_000,
        pensionStartAge: 55,
        pensionInflationAdjusted: false,
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

    it('tests a pension that starts with an early retirement, now that it is not run as Social Security', async () => {
      const runner = fakeRunner();
      await runCoastFireScenario(
        EMPTY_SNAPSHOT,
        plan({ ...STATED, retirementAge: 45, annualRetirementIncome: 20_000 }),
        runner as QuickPlanRunner
      );
      expect(runner.mock.calls[0][0]).toMatchObject({ pensionAnnual: 20_000, pensionStartAge: 45, socialSecurityAnnual: 0 });
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

  it('plans through the age the user names, and compares another', async () => {
    const runner = fakeRunner();
    const execution = await runCoastFireScenario(
      { statedFigures: { planThroughAge: { value: 90, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' } } },
      plan({ ...STATED, annualRetirementIncome: 12_000, lifeExpectancy: 92 }, { lifeExpectancy: 100 }),
      runner as QuickPlanRunner
    ) as CompletedCoastFireScenarioExecution;

    // What the user said outranks what they saved.
    expect(execution.scenarios.map((scenario) => scenario.metrics.planThroughAge)).toEqual([92, 100]);
    expect(runner.mock.calls.map(([request]) => request.lifeExpectancy)).toEqual([92, 100]);
    expect(execution.scenarios.map((scenario) => scenario.label)).toEqual(['Planning through 92', 'Planning through 100']);
    expect(execution.scenarios[0].assumptions).toContainEqual(expect.objectContaining({
      key: 'lifeExpectancy', value: 92, origin: 'user', unit: 'age',
    }));
    const facts = coastFireScenarioCanonicalFacts(execution);
    expect(facts.find((fact) => fact.id.endsWith('_life_expectancy'))).toMatchObject({ value: 92, unit: 'age' });
    expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);
    expect(coastFireSavableFigures(execution)).toContainEqual({ key: 'planThroughAge', value: 92 });
  });

  it('labels a comparison against the disclosed default horizon, not zero', async () => {
    const execution = await runCoastFireScenario(
      EMPTY_SNAPSHOT,
      plan(STATED, { lifeExpectancy: 100 })
    ) as CompletedCoastFireScenarioExecution;

    expect(execution.scenarios.map((scenario) => scenario.label)).toEqual([
      'Planning through 95',
      'Planning through 100',
    ]);
    expect(execution.scenarios[0].assumptions).toContainEqual(expect.objectContaining({
      key: 'lifeExpectancy', value: 95, origin: 'default',
    }));
  });

  it('reports a planning age the retirement would already run past instead of moving it', async () => {
    const execution = await runCoastFireScenario(EMPTY_SNAPSHOT, plan({ ...STATED, lifeExpectancy: 60, retirementAge: 62 }));
    expect(execution).toMatchObject({ status: 'unavailable', reason: 'The age to plan through must be after the retirement age.' });
  });

  it('asks for a planning age in its form, showing the one saved', async () => {
    const execution = await runCoastFireScenario(
      { statedFigures: { planThroughAge: { value: 92, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' } } },
      plan({ retirementAge: 55 })
    );
    const field = coastFireInputRequest(execution)!.fields.find((item) => item.id === 'lifeExpectancy');
    expect(field).toMatchObject({
      label: 'Plan through age',
      minimum: 60,
      maximum: 110,
      value: 92,
      valueNote: 'From Your numbers',
      sentence: 'Plan through age {value}.',
    });
  });

  it('values incomes and runs the history through the planning age saved in Your numbers', async () => {
    const runner = fakeRunner();
    const savedAt = '2026-09-14T10:00:00.000Z';
    const execution = await runCoastFireScenario(
      { statedFigures: { planThroughAge: { value: 90, savedAt, source: 'page' } } },
      plan({ ...STATED, annualRetirementIncome: 12_000 }),
      runner as QuickPlanRunner
    ) as CompletedCoastFireScenarioExecution;

    expect(execution.scenarios[0].metrics.planThroughAge).toBe(90);
    expect(runner.mock.calls[0][0]).toMatchObject({ lifeExpectancy: 90 });
    expect(describeCoastFireScenarioExecution(execution)).toContain('planning through age 90');
    expect(describeCoastFireScenarioExecution(execution)).toContain('saved Sep 14, 2026');

    // A saved age the retirement would already run past is no plan.
    const past = await runCoastFireScenario(
      { statedFigures: { planThroughAge: { value: 60, savedAt, source: 'page' } } },
      plan({ ...STATED, retirementAge: 62 }),
      fakeRunner() as QuickPlanRunner
    ) as CompletedCoastFireScenarioExecution;
    expect(past.scenarios[0].metrics.planThroughAge).toBe(95);
    expect(describeCoastFireScenarioExecution(past)).not.toContain('planning through age 60');
  });

  describe('spending flexibility in the market-history test', () => {
    /** The fake engine, reporting a cut whenever one is asked for. */
    function flexibleRunner(survivalRate = 0.8) {
      const base = fakeRunner(survivalRate);
      const outcome = (cutShare: number, rate: number) => ({
        cutShare,
        triggerDrawdown: 0.2,
        survivalRate: rate,
        sequencesTested: 517,
        sequencesSurvived: Math.round(rate * 517),
        sequencesWithCuts: 207,
        medianYearsCut: 9,
        mostYearsCut: 24,
      });
      return jest.fn(async (
        request: RetirementQuickPlanRequest,
        _household?: QuickPlanHousehold,
        flexibility?: QuickPlanFlexibility
      ): Promise<RetirementQuickPlanResult> => ({
        ...await base(request),
        ...(flexibility?.spendingFlexibility && {
          spendingFlexibility: outcome(flexibility.spendingFlexibility.cutShare, survivalRate),
        }),
        ...(flexibility?.spendingFlexibilityComparison && {
          spendingFlexibilityComparison: outcome(flexibility.spendingFlexibilityComparison.cutShare, 0.93),
        }),
      }));
    }

    it('runs a 20% cut beside fixed spending when nobody has said, for the main case only', async () => {
      const runner = flexibleRunner();
      const execution = await runCoastFireScenario(
        EMPTY_SNAPSHOT,
        plan(STATED, { annualRetirementSpending: 60_000 }),
        runner as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;

      expect(runner.mock.calls.map((call) => call[2])).toEqual([
        { spendingFlexibilityComparison: { cutShare: 0.2 } },
        undefined,
      ]);
      expect(execution.scenarios[0].historicalTest?.spendingFlexibility).toMatchObject({
        resolution: { kind: 'comparison', cutShare: 0.2, annualCut: 16_000 },
        comparison: { survivalRate: 0.93 },
      });
      expect(execution.scenarios[1].historicalTest?.spendingFlexibility).toBeUndefined();

      const disclosure = describeCoastFireScenarioExecution(execution)!;
      expect(disclosure).toContain(
        'If you cut spending 20% ($16,000 a year) in any year that started with your portfolio more than 20% below ' +
        'its inflation-adjusted value when withdrawals began, and spent in full again once it recovered, the plan would ' +
        'last in 93% of historical sequences instead of 80%'
      );
      expect(disclosure).toContain('Tell me how much of your spending you could cut in a bad market');
      expect(disclosure).not.toContain('full spending every year');

      const facts = coastFireScenarioCanonicalFacts(execution);
      expect(facts.find((fact) => fact.id.endsWith('_history_flexible_comparison_survival_rate'))).toMatchObject({
        value: 93,
        label: expect.stringContaining('coasting from today: a comparison the user has not chosen'),
      });
      expect(facts.find((fact) => fact.id.endsWith('_history_survival_rate'))?.label).not.toContain('cutting spending');
      expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);
      // Nothing the user said, so nothing to save.
      expect(coastFireSavableFigures(execution).map((figure) => figure.key)).not.toContain('spendingCutPercent');
    });

    it('runs the user\'s own cut in every case\'s test, and says the number itself does not cut', async () => {
      const runner = flexibleRunner(0.88);
      const execution = await runCoastFireScenario(
        { statedSpendingCut: { percent: 25 } },
        plan(STATED, { annualRetirementSpending: 60_000 }),
        runner as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;

      expect(runner.mock.calls.map((call) => call[2])).toEqual([
        { spendingFlexibility: { cutShare: 0.25 } },
        { spendingFlexibility: { cutShare: 0.25 } },
      ]);
      const disclosure = describeCoastFireScenarioExecution(execution)!;
      expect(disclosure).toContain(
        'It plans on cutting spending 25% ($20,000 a year) in any year that starts with your portfolio more than 20% ' +
        'below its inflation-adjusted value when withdrawals began, and spending in full again once it recovers.'
      );
      expect(disclosure).toContain('It plans on cutting spending 25% ($15,000 a year)');
      expect(disclosure).toContain(
        'With your 25% cut, spending was cut in 40% of the 517 historical sequences, for a median of 9 years and at most 24 years.'
      );
      expect(disclosure).toContain('The Coast FIRE number itself is a single straight line — the same return every year, and full spending every year.');
      expect(disclosure).not.toContain('If you cut spending 20%');
      // The straight line is the same with or without a cut.
      expect(execution.scenarios[0].metrics.coastFireNumber)
        .toBe((await runCoastFireScenario(EMPTY_SNAPSHOT, plan(STATED)) as CompletedCoastFireScenarioExecution)
          .scenarios[0].metrics.coastFireNumber);

      const facts = coastFireScenarioCanonicalFacts(execution);
      const primaryFacts = facts.filter((fact) => fact.provenance.scenarioId === execution.scenarios[0].id);
      expect(primaryFacts.find((fact) => fact.id.endsWith('_history_spending_cut_percent'))).toMatchObject({
        value: 25,
        provenance: expect.objectContaining({ kind: 'scenario_input' }),
      });
      expect(primaryFacts.find((fact) => fact.id.endsWith('_history_spending_cut_annual'))?.value).toBe(20_000);
      expect(primaryFacts.find((fact) => fact.id.endsWith('_history_survival_rate'))?.label)
        .toContain('cutting spending 25% in a bad market');
      expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);

      expect(coastFireSavableFigures(execution)).toContainEqual({ key: 'spendingCutPercent', value: 25 });
      expect(buildSaveOffer('coast_fire', coastFireSavableFigures(execution), {})?.items)
        .toContainEqual(expect.objectContaining({ key: 'spendingCutPercent', display: '25%' }));
    });

    it('gives a case with a cut its own id, so a cached answer is never reused across cuts', async () => {
      const without = await runCoastFireScenario(
        { statedSpendingCut: { percent: 0 } },
        plan(STATED),
        flexibleRunner() as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;
      const unstated = await runCoastFireScenario(EMPTY_SNAPSHOT, plan(STATED)) as CompletedCoastFireScenarioExecution;
      const withCut = await runCoastFireScenario(
        { statedSpendingCut: { percent: 25 } },
        plan(STATED),
        flexibleRunner() as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;

      expect(without.scenarios[0].id).toBe(unstated.scenarios[0].id);
      expect(withCut.scenarios[0].id).not.toBe(unstated.scenarios[0].id);
    });

    it('says when the user could not cut, and runs no comparison', async () => {
      const runner = flexibleRunner();
      const execution = await runCoastFireScenario(
        { statedSpendingCut: { percent: 0 } },
        plan(STATED),
        runner as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;

      expect(runner.mock.calls[0][2]).toBeUndefined();
      const disclosure = describeCoastFireScenarioExecution(execution)!;
      expect(disclosure).toContain('It plans on no spending cuts in a bad market, since you said you could not cut.');
      expect(disclosure).not.toContain('If you cut spending');
      expect(coastFireSavableFigures(execution)).toContainEqual({ key: 'spendingCutPercent', value: 0 });
    });

    it('names a stated cut it could not use, and runs the comparison instead', async () => {
      const runner = flexibleRunner();
      const execution = await runCoastFireScenario(
        { statedSpendingCut: { percent: 90 } },
        plan(STATED),
        runner as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;

      expect(runner.mock.calls[0][2]).toEqual({ spendingFlexibilityComparison: { cutShare: 0.2 } });
      const disclosure = describeCoastFireScenarioExecution(execution)!;
      expect(disclosure).toContain(
        'I did not use the spending cut you described: it comes to more than 75% of the plan\'s spending, which I took as a misreading.'
      );
      expect(disclosure).toContain('If you cut spending 20% ($16,000 a year)');
      expect(coastFireSavableFigures(execution).map((figure) => figure.key)).not.toContain('spendingCutPercent');
    });
  });

  describe('with a partner', () => {
    /** The fake engine, planning for a partner the way the quick plan does. */
    function householdRunner() {
      const base = fakeRunner();
      return jest.fn(async (request: RetirementQuickPlanRequest, household?: QuickPlanHousehold) => {
        const result = await base(request);
        if (!household) return result;
        const timeline = householdTimeline({ currentAge: request.currentAge, userPlanThroughAge: 95, partner: household.partner });
        const { streams, socialSecurity } = householdIncomeStreams(quickPlanIncomeStreams(result.inputs), {
          plan: household.partner,
          ...(household.origins && { origins: household.origins }),
          ...(household.married && { married: household.married }),
          timeline,
        }, {
          currentAge: request.currentAge,
          ...(household.userSocialSecurity && { userSocialSecurity: household.userSocialSecurity }),
        });
        return {
          ...result,
          history: { ...result.history, horizonYears: timeline.horizonAge - request.currentAge },
          household: { timeline, incomeStreams: streams, socialSecurity },
        };
      });
    }

    const PARTNER = { statedPartner: { age: 35, socialSecurityAnnual: 20_000, pensionAnnual: 12_000, married: true } };

    it('counts their incomes on the user\'s ages, through the younger one\'s planning age', async () => {
      const runner = householdRunner();
      const execution = await runCoastFireScenario(
        PARTNER,
        plan({ ...STATED, socialSecurityAnnual: 30_000 }),
        runner as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;
      const [scenario] = execution.scenarios;
      const m = scenario.metrics;

      expect(m.planThroughAge).toBe(98);
      expect(m.incomes?.map(({ owner, kind, annualAmount, startAge, endAge, inflationAdjusted }) =>
        ({ owner, kind, annualAmount, startAge, endAge, inflationAdjusted })
      )).toEqual([
        // The user's own stops when the first of them, the user, reaches 95.
        { owner: 'user', kind: 'social_security', annualAmount: 30_000, startAge: 67, endAge: 95, inflationAdjusted: true },
        { owner: 'partner', kind: 'social_security', annualAmount: 20_000, startAge: 70, endAge: undefined, inflationAdjusted: true },
        // Married, the partner is then paid the user's $30,000: $10,000 above their own.
        { owner: 'partner', kind: 'survivor', annualAmount: 10_000, startAge: 95, endAge: undefined, inflationAdjusted: true },
        // A pension starts at the household's retirement: the partner's 52 is the user's 55.
        { owner: 'partner', kind: 'pension', annualAmount: 12_000, startAge: 55, endAge: undefined, inflationAdjusted: false },
      ]);
      const userBenefit = m.incomes![0];
      expect(userBenefit.levelAmount).toBeGreaterThan(0);
      expect(userBenefit.levelAmount).toBeLessThan(30_000);
      // Paid only for the last three years, spread over all of retirement, with nothing to bridge.
      const survivorBenefit = m.incomes![2];
      expect(survivorBenefit.levelAmount).toBeGreaterThan(0);
      expect(survivorBenefit.levelAmount).toBeLessThan(10_000);
      expect(survivorBenefit.gapYears).toBe(0);

      // The history runs the user's own incomes; the quick plan adds the partner's.
      expect(runner.mock.calls[0][0]).toMatchObject({ socialSecurityAnnual: 30_000, pensionAnnual: 0 });
      expect(runner.mock.calls[0][1]).toMatchObject({
        partner: { age: 35, planThroughAge: 95 },
        married: { value: true, origin: 'stated' },
        userSocialSecurity: { claimAge: 67, known: true },
      });
      expect(scenario.historicalTest?.lifeExpectancy).toBe(98);

      const disclosure = describeCoastFireScenarioExecution(execution)!;
      expect(disclosure).toContain(
        'Your Social Security of $30,000 a year in today\'s dollars starts at 67 (you did not say when it starts, so I used 67), ' +
        'until you reach your planning age. Since it stops then, ' +
        `I counted it as $${Math.round(userBenefit.levelAmount).toLocaleString('en-US')} a year: its average worth through age 98.`
      );
      expect(disclosure).toContain(
        'Your partner\'s Social Security of $20,000 a year in today\'s dollars from their 67 (your 70), an age I assumed.'
      );
      expect(disclosure).toContain(
        'From when you reach 95, your partner\'s Social Security becomes $30,000 a year, the survivor benefit on your record'
      );
      expect(disclosure).toContain(
        `Since the survivor benefit is paid only after the first death, I counted it as $${Math.round(survivorBenefit.levelAmount).toLocaleString('en-US')} ` +
        'a year: its average worth over retirement through age 98.'
      );
      expect(disclosure).not.toContain('survivor benefit\'s share');
      expect(disclosure).toContain('your partner\'s survivor benefit from their 92 (your 95)');
      expect(disclosure).toContain('Your partner\'s pension of $12,000 a year from their 52 (your 55), a fixed amount');
      expect(disclosure).toContain('Planning for you and your partner, 35 today; the plan runs until your partner reaches 95, an age I assumed, when you would be 98.');
      expect(disclosure).toContain('then paying $80,000 a year, part of it from your Social Security from 67, your partner\'s Social Security from their 67 (your 70)');
      expect(disclosure).toContain('through your age 98');

      const facts = coastFireScenarioCanonicalFacts(execution);
      const byEnding = (suffix: string) => facts.find((fact) => fact.id.endsWith(suffix));
      expect(byEnding('_social_security_counted_value')).toMatchObject({ value: Number(userBenefit.levelAmount.toFixed(2)) });
      expect(byEnding('_partner_social_security_counted_value')).toBeUndefined();
      expect(byEnding('_partner_survivor_counted_value')).toMatchObject({ value: Number(survivorBenefit.levelAmount.toFixed(2)) });
      expect(byEnding('_partner_survivor_benefit_annual')).toMatchObject({ value: 30_000, unit: 'usd' });
      expect(byEnding('_partner_pension_counted_value')).toBeDefined();
      expect(byEnding('_partner_age')).toMatchObject({ value: 35, unit: 'age' });
      expect(byEnding('_plan_end_age')).toMatchObject({ value: 98, unit: 'age' });
      expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);

      const offer = buildSaveOffer('coast_fire', coastFireSavableFigures(execution), {});
      expect(offer?.items.map((item) => item.key)).toEqual(expect.arrayContaining([
        'partnerAge',
        'partnerSocialSecurityAnnual',
        'partnerRetirementIncome',
        'partnerMarried',
      ]));
      expect(coastFireInputRequest(execution)).toBeNull();
    });

    it('counts a survivor benefit when married, without a reserve to bridge to it, and asks when it does not know', async () => {
      const unknown = await runCoastFireScenario(
        { statedPartner: { ...PARTNER.statedPartner, married: undefined } },
        plan({ ...STATED, socialSecurityAnnual: 30_000 }),
        householdRunner() as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;
      const married = await runCoastFireScenario(
        PARTNER,
        plan({ ...STATED, socialSecurityAnnual: 30_000 }),
        householdRunner() as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;
      const before = unknown.scenarios[0].metrics;
      const after = married.scenarios[0].metrics;

      expect(before.incomes?.some((income) => income.kind === 'survivor')).toBe(false);
      expect(after.retirementTarget).toBeLessThan(before.retirementTarget);
      // A survivor benefit replaces a benefit that stops; it is not an income to bridge to.
      expect(after.bridgeReserve).toBeCloseTo(before.bridgeReserve ?? 0, 6);

      expect(describeCoastFireScenarioExecution(unknown)).toContain(
        'No spousal or survivor Social Security benefits, since I don\'t know whether you\'re married (tell me if you are and I will count them).'
      );
      expect(coastFireInputRequest(unknown)).toMatchObject({
        calculatorId: 'coast_fire',
        title: 'Spousal and survivor benefits',
        fields: [{ id: 'partnerMarried', required: true }],
      });
    });

    it('knows the couple is married from the household status Linc remembers', async () => {
      const execution = await runCoastFireScenario(
        { statedPartner: { age: 35, socialSecurityAnnual: 20_000 }, userProfileValues: { householdStatus: 'married' } },
        plan({ ...STATED, socialSecurityAnnual: 30_000 }),
        householdRunner() as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;
      expect(execution.scenarios[0].metrics.incomes?.some((income) => income.kind === 'survivor')).toBe(true);
      expect(describeCoastFireScenarioExecution(execution)).toContain('Planning for you and your partner (married, as you told me before), 35 today');
    });

    it('counts what one survivor spends as the level spending with the same value', async () => {
      const single = await runCoastFireScenario(EMPTY_SNAPSHOT, plan(STATED)) as CompletedCoastFireScenarioExecution;
      const couple = await runCoastFireScenario(
        { statedPartner: { age: 35, survivorAnnualSpending: 50_000 } },
        plan(STATED),
        householdRunner() as QuickPlanRunner
      ) as CompletedCoastFireScenarioExecution;
      const m = couple.scenarios[0].metrics;

      expect(m.spendingChange).toEqual({ fromAge: 95, annualAmount: 50_000 });
      expect(m.levelSpending).toBeGreaterThan(50_000);
      expect(m.levelSpending).toBeLessThan(80_000);
      expect(m.retirementTarget).toBeLessThan(single.scenarios[0].metrics.retirementTarget);
      expect(describeCoastFireScenarioExecution(couple)).toContain(
        `I counted spending as $${Math.round(m.levelSpending!).toLocaleString('en-US')} a year: the level amount with the same ` +
        'value over retirement as $80,000 a year until your 95 and $50,000 after.'
      );
    });

    it('leaves a partner\'s incomes out until it knows their age, and asks for it in a form', async () => {
      const execution = await runCoastFireScenario({ statedPartner: { socialSecurityAnnual: 20_000 } }, plan(STATED));
      expect((execution as CompletedCoastFireScenarioExecution).scenarios[0].metrics.planThroughAge).toBe(95);
      expect(describeCoastFireScenarioExecution(execution)).toContain('I did not plan for your partner, since I need their age');
      expect(coastFireInputRequest(execution)).toMatchObject({
        calculatorId: 'coast_fire',
        title: 'Include your partner',
        submitLabel: 'Include my partner',
        fields: [{ id: 'partnerAge', required: true, minimum: 18, maximum: 90, sentence: 'My partner is {value} years old.' }],
      });
    });

    it('adds the partner\'s age to the form that asks for the user\'s own figures', async () => {
      const execution = await runCoastFireScenario(
        { statedFigures: { partnerPlanThroughAge: { value: 92, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' } } },
        plan({ retirementAge: 55 })
      );

      expect(execution).toMatchObject({ status: 'unavailable', partnerAgeMissing: true });
      expect(describeCoastFireScenarioExecution(execution)).toContain('Tell me your partner\'s age too and I will include them.');
      const request = coastFireInputRequest(execution)!;
      expect(request.fields.find((field) => field.id === 'partnerAge')).toMatchObject({
        required: false,
        defaultNote: 'If left blank, I plan without your partner',
      });
      // The calculator's thirteen fields and the partner's age.
      expect(request.fields).toHaveLength(14);
      expect(parseInputRequest(JSON.parse(JSON.stringify(request)))).toEqual(request);
    });
  });
});

