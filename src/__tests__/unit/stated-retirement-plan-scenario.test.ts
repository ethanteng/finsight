import { describe, expect, it, jest } from '@jest/globals';
import {
  describeStatedRetirementPlanExecution,
  parseStatedRetirementPlan,
  runStatedRetirementPlan,
  statedRetirementPlanApplies,
  statedRetirementPlanCanonicalFacts,
  statedRetirementPlanInputRequest,
  statedRetirementPlanSavableFigures,
  type CompletedStatedRetirementPlanExecution,
  type QuickPlanRunner,
} from '../../scenarios/stated-retirement-plan-scenario';
import {
  QuickPlanValidationError,
  type RetirementQuickPlanRequest,
  type RetirementQuickPlanResult,
} from '../../services/retirement-quickplan';
import { validateCanonicalFactPack } from '../../openai/canonical-facts';
import { NOTHING_LINKED } from '../../openai/linked-data';

const NUMERIC = [
  'currentAge',
  'retirementAge',
  'investableAssets',
  'annualSpending',
  'annualContributions',
  'socialSecurityAnnual',
  'socialSecurityStartAge',
  'socialSecurityAmountAge',
  'pensionAnnual',
  'pensionStartAge',
  'lifeExpectancy',
] as const;

type Values = Partial<Record<(typeof NUMERIC)[number], number>> & { allocation?: string; pensionInflation?: string };

/** A strict-schema variant: every field present, null where unstated. */
function variant(values: Values) {
  return {
    overrides: {
      ...Object.fromEntries(NUMERIC.map((field) => [field, values[field] ?? null])),
      allocation: values.allocation ?? 'unspecified',
      pensionInflation: values.pensionInflation ?? 'unspecified',
      sources: {
        ...Object.fromEntries(NUMERIC.map((field) => [
          field,
          values[field] !== undefined ? `stated ${field}` : null,
        ])),
        allocation: values.allocation ? 'the balanced preset' : null,
        pensionInflation: values.pensionInflation ? 'stated pension inflation' : null,
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

/** Linked, but nothing the historical engine can simulate (an all-crypto account, say). */
const UNSUPPORTED_HOLDINGS = {
  investments: { holdings: [{ id: 'btc' }], securities: [] },
  retirementAnalysisNeedsInfo: { missingParams: [], detectedParams: {}, unavailableCode: 'no_supported_simulation' },
} as any;

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
    const rates = request.annualSpending === undefined;
    return {
      version: 1,
      computedAt: '2026-10-04T00:00:00.000Z',
      durationMs: 1,
      cached: false,
      mode: rates ? 'rates' : 'plan',
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
      primary: rates ? null : scenario(request.retirementAge, request.annualSpending, survival),
      alternatives: rates ? [] : [
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
  it('stands in only where the holdings-based projection cannot run', () => {
    expect(statedRetirementPlanApplies(NO_HOLDINGS)).toBe(true);
    expect(statedRetirementPlanApplies({} as any)).toBe(true);
    expect(statedRetirementPlanApplies({ investments: { holdings: [{ id: 'h1' }] } } as any)).toBe(false);
    expect(statedRetirementPlanApplies(UNSUPPORTED_HOLDINGS)).toBe(true);
  });

  it('says the preset stood in for holdings it could not simulate, without offering a link', async () => {
    const execution = await runStatedRetirementPlan(UNSUPPORTED_HOLDINGS, plan(LEAD), fakeRunner() as QuickPlanRunner);
    expect(execution).toMatchObject({ status: 'completed', standInFor: 'unsupported_holdings' });

    const disclosure = describeStatedRetirementPlanExecution(execution)!;
    expect(disclosure).toContain('none of your linked holdings map to a return series I can simulate, so this ran the Balanced preset');
    expect(disclosure).not.toContain('no investment holdings are linked');

    const missing = await runStatedRetirementPlan(UNSUPPORTED_HOLDINGS, plan({ retirementAge: 60 }), fakeRunner() as QuickPlanRunner);
    const ask = describeStatedRetirementPlanExecution(missing)!;
    expect(ask).toContain('on a preset mix in place of your holdings');
    expect(ask).not.toContain('link');
  });

  it('answers "what if I retire at 62 instead?" for a calculator lead with nothing linked', async () => {
    const runner = fakeRunner({ 60: 0.88, 62: 0.93 });
    const execution = await runStatedRetirementPlan(
      NO_HOLDINGS,
      plan(LEAD, { retirementAge: 62 }),
      runner as QuickPlanRunner
    ) as CompletedStatedRetirementPlanExecution;

    expect(execution.status).toBe('completed');
    expect(execution.standInFor).toBe('no_holdings');
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner.mock.calls[1][0]).toMatchObject({ ...LEAD, retirementAge: 62, lifeExpectancy: 95 });
    expect(execution.scenarios.map((scenario) => [scenario.label, scenario.outcome!.survivalRate])).toEqual([
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

  it('asks only for the two figures nothing can stand in for, offering the link as the alternative', async () => {
    const runner = fakeRunner();
    const execution = await runStatedRetirementPlan(NO_HOLDINGS, plan({ retirementAge: 60 }), runner as QuickPlanRunner);

    expect(runner).not.toHaveBeenCalled();
    expect(execution).toMatchObject({
      status: 'unavailable',
      missingInputs: [
        'roughly how much you have invested today',
        'your current age',
      ],
    });
    const ask = describeStatedRetirementPlanExecution(execution)!;
    expect(ask).toContain('before any accounts are linked');
    expect(ask).toContain('Or link your investment accounts');
  });

  it('hands the client a form for the two figures, keeping everything else the user stated', async () => {
    const execution = await runStatedRetirementPlan(
      { ...NO_HOLDINGS, expectedMonthly: { spending: 5_500, income: 9_000, incomeSource: 'transactions', spendingSource: 'transactions' } },
      plan({ retirementAge: 60, socialSecurityAnnual: 30_000, allocation: 'growth' }),
      fakeRunner() as QuickPlanRunner
    );
    const request = statedRetirementPlanInputRequest(execution)!;
    const field = (id: string) => request.fields.find((item) => item.id === id)!;

    expect(request).toMatchObject({ calculatorId: 'stated_retirement_plan', question: 'Can I retire on this plan?' });
    expect(request.fields.filter((item) => item.required).map((item) => item.id)).toEqual(['currentAge', 'investableAssets']);
    expect(field('retirementAge')).toMatchObject({ value: 60, valueNote: 'From what you said earlier' });
    expect(field('socialSecurityAnnual')).toMatchObject({ value: 30_000 });
    expect(field('allocation')).toMatchObject({ value: 'growth', options: expect.arrayContaining([{ value: 'growth', label: 'Growth' }]) });
    expect(field('annualSpending')).toMatchObject({ value: 66_000, valueNote: 'From your linked accounts' });
    expect(field('lifeExpectancy')).toMatchObject({ defaultNote: '95 if left blank' });
  });

  it('names retiring now when the known age is already past 65', async () => {
    const execution = await runStatedRetirementPlan(
      {
        ...NO_HOLDINGS,
        userProfileValues: { age: 70 },
      },
      plan({}),
      fakeRunner() as QuickPlanRunner
    );
    const retirementAge = statedRetirementPlanInputRequest(execution)!
      .fields.find((field) => field.id === 'retirementAge')!;

    expect(retirementAge).toMatchObject({
      required: false,
      defaultNote: '70 if left blank (retiring now)',
    });
  });

  it('does not prefill the form with a saved retirement age the user has already reached', async () => {
    const execution = await runStatedRetirementPlan(
      {
        ...NO_HOLDINGS,
        userProfileValues: { age: 60 },
        statedFigures: {
          retirementAge: { value: 55, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
          annualRetirementSpending: { value: 70_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
          socialSecurityStartAge: { value: 67, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
        },
      },
      plan({}),
      fakeRunner() as QuickPlanRunner
    );
    const request = statedRetirementPlanInputRequest(execution)!;
    const field = (id: string) => request.fields.find((item) => item.id === id);

    expect(field('retirementAge')?.value).toBeUndefined();
    expect(field('retirementAge')?.valueNote).toBeUndefined();
    expect(field('annualSpending')).toMatchObject({ value: 70_000, valueNote: 'From Your numbers' });
    // Claiming age alone is not a benefit; the completed path would ignore it too.
    expect(field('socialSecurityStartAge')?.value).toBeUndefined();
  });

  it('assumes the conventional retirement age and says so', async () => {
    const runner = fakeRunner();
    const execution = await runStatedRetirementPlan(NO_HOLDINGS, plan({
      currentAge: 45,
      investableAssets: 800_000,
      annualSpending: 70_000,
    }), runner as QuickPlanRunner);

    expect(runner.mock.calls[0][0]).toMatchObject({ retirementAge: 65 });
    expect(describeStatedRetirementPlanExecution(execution)).toContain('You did not name a retirement age, so I used 65.');

    const pastIt = await runStatedRetirementPlan(NO_HOLDINGS, plan({
      currentAge: 70,
      investableAssets: 800_000,
      annualSpending: 70_000,
    }), runner as QuickPlanRunner);
    expect(runner.mock.calls[1][0]).toMatchObject({ retirementAge: 70 });
    expect(describeStatedRetirementPlanExecution(pastIt)).toContain('so I modeled retiring now');
  });

  it('assumes retirement costs what the user spends now, when linked accounts say', async () => {
    const runner = fakeRunner();
    const execution = await runStatedRetirementPlan(
      { ...NO_HOLDINGS, expectedMonthly: { spending: 5_500, income: 9_000 } },
      plan({ currentAge: 45, retirementAge: 60, investableAssets: 800_000 }),
      runner as QuickPlanRunner
    );

    expect(runner.mock.calls[0][0]).toMatchObject({ annualSpending: 66_000 });
    expect(describeStatedRetirementPlanExecution(execution))
      .toContain('The spending level is what you spend now according to your linked accounts, $66,000 a year; I assumed retirement costs the same.');
  });

  it('calls the user\'s own entered balance and spending figure theirs, not linked', async () => {
    const runner = fakeRunner();
    const execution = await runStatedRetirementPlan(
      {
        ...NO_HOLDINGS,
        linkedData: { ...NOTHING_LINKED, entered: { accounts: 1, cash: 0, credit: 0, loans: 0, investments: 1 } },
        financialSummary: { financialOverview: { totalInvestments: 800_000 } },
        expectedMonthly: { spending: 5_500, income: null, incomeSource: 'transactions', spendingSource: 'override' },
      },
      plan({ currentAge: 45, retirementAge: 60 }),
      runner as QuickPlanRunner
    ) as CompletedStatedRetirementPlanExecution;

    expect(runner.mock.calls[0][0]).toMatchObject({ investableAssets: 800_000, annualSpending: 66_000 });
    expect(execution.scenarios[0].assumptions.find((item) => item.key === 'investableAssets'))
      .toMatchObject({ origin: 'snapshot', basis: 'entered' });
    const disclosure = describeStatedRetirementPlanExecution(execution)!;
    expect(disclosure).toContain('The amount invested is the $800,000 of investments you entered');
    expect(disclosure).toContain('The spending level is the monthly spending you set on the Finances page, $66,000 a year');
    expect(disclosure).not.toMatch(/connected investment total|according to your linked accounts/);

    const linkedOnly = await runStatedRetirementPlan(
      {
        ...NO_HOLDINGS,
        linkedData: { ...NOTHING_LINKED, accounts: 1, investments: 1 },
        financialSummary: { financialOverview: { totalInvestments: 800_000 } },
      },
      plan({ currentAge: 45, retirementAge: 60, annualSpending: 70_000 }),
      runner as QuickPlanRunner
    );
    expect(describeStatedRetirementPlanExecution(linkedOnly)).toContain(
      'The amount invested is your connected investment total of $800,000; its holdings are not itemized, so they cannot be modeled directly.'
    );
  });

  it('plans with the figures saved in Your numbers, and says so', async () => {
    const runner = fakeRunner();
    const execution = await runStatedRetirementPlan(
      {
        ...NO_HOLDINGS,
        statedFigures: {
          retirementAge: { value: 62, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
          annualRetirementSpending: { value: 60_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
          socialSecurityAnnual: { value: 28_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
          allocation: { value: 'growth', savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
        },
      },
      plan({ currentAge: 45, investableAssets: 800_000 }),
      runner as QuickPlanRunner
    );

    expect(runner.mock.calls[0][0]).toMatchObject({
      retirementAge: 62,
      annualSpending: 60_000,
      socialSecurityAnnual: 28_000,
      allocation: 'growth',
    });
    const disclosure = describeStatedRetirementPlanExecution(execution)!;
    expect(disclosure).toContain(
      'From Your numbers: retiring at 62, spending $60,000 a year in retirement, $28,000 a year of Social Security, ' +
      'and the Growth preset, saved Sep 14, 2026.'
    );
    expect(disclosure).not.toContain('You did not name a mix');
    expect(disclosure).not.toContain('You did not name a retirement age');
  });

  it('counts a saved pension beside Social Security, assumed fixed from retirement, and says so', async () => {
    const runner = fakeRunner();
    const execution = await runStatedRetirementPlan(
      {
        ...NO_HOLDINGS,
        statedFigures: {
          retirementAge: { value: 62, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
          retirementIncome: { value: 24_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
          socialSecurityAnnual: { value: 28_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
        },
      },
      plan({ currentAge: 45, investableAssets: 800_000, annualSpending: 70_000 }),
      runner as QuickPlanRunner
    );

    expect(runner.mock.calls[0][0]).toMatchObject({
      socialSecurityAnnual: 28_000,
      socialSecurityStartAge: 67,
      pensionAnnual: 24_000,
      pensionStartAge: 62,
      pensionInflationAdjusted: false,
    });
    const disclosure = describeStatedRetirementPlanExecution(execution)!;
    expect(disclosure).toContain(
      'A pension of $24,000 a year starts at 62 as a fixed amount, so it buys less each year prices rise. ' +
      'I assumed it starts when you retire. You did not say whether it rises with inflation, so I assumed it does not'
    );
    expect(disclosure).toContain('The portfolio covers Social Security\'s share for the 5 years before it starts at 67.');
    expect(disclosure).toContain('a pension of $24,000 a year');
    const facts = statedRetirementPlanCanonicalFacts(execution);
    expect(facts.find((fact) => fact.id.endsWith('_pension_annual'))?.label).toContain(
      'a fixed dollar amount that does not rise with inflation'
    );
  });

  it('takes the pension terms the user states, and offers to save them', async () => {
    const runner = fakeRunner();
    const execution = await runStatedRetirementPlan(
      NO_HOLDINGS,
      plan({
        currentAge: 50,
        investableAssets: 600_000,
        annualSpending: 65_000,
        retirementAge: 60,
        pensionAnnual: 30_000,
        pensionStartAge: 65,
        pensionInflation: 'rises_with_inflation',
      }),
      runner as QuickPlanRunner
    );

    expect(runner.mock.calls[0][0]).toMatchObject({
      pensionAnnual: 30_000,
      pensionStartAge: 65,
      pensionInflationAdjusted: true,
    });
    const disclosure = describeStatedRetirementPlanExecution(execution)!;
    expect(disclosure).toContain('A pension of $30,000 a year in today\'s dollars starts at 65 and rises with inflation.');
    expect(disclosure).toContain('The portfolio covers the pension\'s share for the 5 years before it starts at 65.');
    expect(disclosure).not.toContain('I assumed it');
    expect(statedRetirementPlanSavableFigures(execution)).toEqual(expect.arrayContaining([
      { key: 'retirementIncome', value: 30_000 },
      { key: 'retirementIncomeStartAge', value: 65 },
      { key: 'retirementIncomeInflation', value: 'rises_with_inflation' },
    ]));
  });

  it('opens the form on a saved pension, but not on a start age with no pension behind it', async () => {
    const withPension = await runStatedRetirementPlan(
      {
        ...NO_HOLDINGS,
        statedFigures: {
          retirementIncome: { value: 24_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
          retirementIncomeInflation: { value: 'rises_with_inflation', savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
        },
      },
      plan({}),
      fakeRunner() as QuickPlanRunner
    );
    const fields = statedRetirementPlanInputRequest(withPension)!.fields;
    expect(fields.find((field) => field.id === 'pensionAnnual')).toMatchObject({ value: 24_000, valueNote: 'From Your numbers' });
    expect(fields.find((field) => field.id === 'pensionInflation')).toMatchObject({ value: 'rises_with_inflation' });

    const startOnly = await runStatedRetirementPlan(
      {
        ...NO_HOLDINGS,
        statedFigures: {
          retirementIncomeStartAge: { value: 63, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
        },
      },
      plan({}),
      fakeRunner() as QuickPlanRunner
    );
    const startOnlyFields = statedRetirementPlanInputRequest(startOnly)!.fields;
    expect(startOnlyFields.find((field) => field.id === 'pensionStartAge')?.value).toBeUndefined();
  });

  it('answers with what the mix sustained when nobody knows the spending level', async () => {
    const runner = fakeRunner();
    const execution = await runStatedRetirementPlan(
      NO_HOLDINGS,
      plan({ currentAge: 45, retirementAge: 60, investableAssets: 800_000 }),
      runner as QuickPlanRunner
    ) as CompletedStatedRetirementPlanExecution;

    expect(runner.mock.calls[0][0].annualSpending).toBeUndefined();
    const [scenario] = execution.scenarios;
    expect(scenario.mode).toBe('rates');
    expect(scenario.outcome).toBeUndefined();

    const facts = statedRetirementPlanCanonicalFacts(execution);
    expect(facts.some((fact) => fact.id.endsWith('_historical_survival_rate'))).toBe(false);
    expect(facts.find((fact) => fact.id.endsWith('_sustainable_spending_p10'))?.value).toBe(78_000);
    expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);
    expect(describeStatedRetirementPlanExecution(execution)).toContain('instead of a verdict this shows what the mix sustained');
  });

  it('runs the real engine without a spending level', async () => {
    const execution = await runStatedRetirementPlan(
      NO_HOLDINGS,
      plan({ currentAge: 45, retirementAge: 60, investableAssets: 800_000 })
    ) as CompletedStatedRetirementPlanExecution;
    const [scenario] = execution.scenarios;

    expect(scenario.mode).toBe('rates');
    expect(scenario.sustainableSpending!.p10).toBeGreaterThan(0);
    expect(scenario.sustainableSpending!.p50).toBeGreaterThanOrEqual(scenario.sustainableSpending!.p10);
  }, 120_000);

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
      pensionAnnual: 0,
      pensionStartAge: 60,
      pensionInflationAdjusted: false,
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

  it('claims the same benefit later by Social Security\'s rules, not the same amount started later', async () => {
    const runner = fakeRunner();
    const execution = await runStatedRetirementPlan(
      NO_HOLDINGS,
      plan(LEAD, { socialSecurityStartAge: 70 }),
      runner as QuickPlanRunner
    );

    expect(runner.mock.calls.map(([request]) => [request.socialSecurityAnnual, request.socialSecurityStartAge]))
      .toEqual([[30_000, 67], [37_200, 70]]);
    const completed = execution as CompletedStatedRetirementPlanExecution;
    expect(completed.scenarios.map((scenario) => scenario.label))
      .toEqual(['Claiming Social Security at 67', 'Claiming Social Security at 70']);
    expect(completed.scenarios[1].claiming).toMatchObject({ fromAmount: 30_000, fromAge: 67, toAge: 70, amount: 37_200 });

    const disclosure = describeStatedRetirementPlanExecution(execution)!;
    expect(disclosure).toContain('I compared claiming Social Security at 67 with claiming Social Security at 70.');
    expect(disclosure).toContain(
      'Claimed at 70 instead of 67, Social Security of $30,000 a year becomes $37,200 by Social Security\'s own rules'
    );

    const facts = statedRetirementPlanCanonicalFacts(execution);
    const comparisonId = completed.scenarios[1].id.replace(/^stated_retirement_plan_/, '');
    const comparisonFact = (suffix: string) =>
      facts.find((fact) => fact.id === `stated_retirement_plan_${comparisonId}_${suffix}`);
    expect(comparisonFact('social_security_at_claiming_age')).toMatchObject({ value: 37_200, unit: 'usd' });
    expect(comparisonFact('social_security_claiming_change')).toMatchObject({ value: 24, unit: 'percent' });
    expect(comparisonFact('social_security_annual')?.label).toContain('as given, for claiming at 67');
    expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);
    // A what-if is never offered for saving.
    expect(statedRetirementPlanSavableFigures(execution)).toEqual(expect.arrayContaining([
      { key: 'socialSecurityAnnual', value: 30_000 },
      { key: 'socialSecurityStartAge', value: 67 },
    ]));
  });

  it('rescales a benefit quoted for one age and claimed at another, and saves it as paid', async () => {
    const runner = fakeRunner();
    const execution = await runStatedRetirementPlan(
      NO_HOLDINGS,
      plan({ ...LEAD, socialSecurityAmountAge: 67, socialSecurityStartAge: 62 }),
      runner as QuickPlanRunner
    );

    expect(runner.mock.calls[0][0]).toMatchObject({ socialSecurityAnnual: 21_000, socialSecurityStartAge: 62 });
    expect(describeStatedRetirementPlanExecution(execution)).toContain(
      'Social Security of $21,000 a year starts at 62. Claimed at 62 instead of 67, Social Security of $30,000 a year ' +
      'becomes $21,000 by Social Security\'s own rules (a reduction for each month before full retirement age'
    );
    // Saved as the benefit at the age it starts, so it reads back the same.
    const saved = statedRetirementPlanSavableFigures(execution);
    expect(saved).toEqual(expect.arrayContaining([
      { key: 'socialSecurityAnnual', value: 21_000 },
      { key: 'socialSecurityStartAge', value: 62 },
    ]));
    expect(saved).not.toContainEqual({ key: 'socialSecurityAnnual', value: 30_000 });
  });

  it('reads a saved benefit as the one for its saved start age', async () => {
    const runner = fakeRunner();
    await runStatedRetirementPlan(
      {
        ...NO_HOLDINGS,
        statedFigures: {
          socialSecurityAnnual: { value: 30_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
        },
      },
      plan({ currentAge: 45, investableAssets: 800_000, annualSpending: 70_000, socialSecurityStartAge: 70 }),
      runner as QuickPlanRunner
    );

    // Saved with no start age, it is the benefit from 67.
    expect(runner.mock.calls[0][0]).toMatchObject({ socialSecurityAnnual: 37_200, socialSecurityStartAge: 70 });
  });

  it('leaves a comparison\'s own Social Security figure as stated', async () => {
    const runner = fakeRunner();
    await runStatedRetirementPlan(
      NO_HOLDINGS,
      plan(LEAD, { socialSecurityAnnual: 40_000, socialSecurityStartAge: 70 }),
      runner as QuickPlanRunner
    );

    expect(runner.mock.calls.map(([request]) => request.socialSecurityAnnual)).toEqual([30_000, 40_000]);
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
    expect(scenario.outcome!.sequencesTested).toBeGreaterThan(100);
    expect(scenario.outcome!.survivalRate).toBeGreaterThan(0);
    expect(scenario.outcome!.survivalRate).toBeLessThanOrEqual(1);
    expect(scenario.outcome!.projectedPortfolioAtRetirement).toBeGreaterThan(LEAD.investableAssets);
  }, 120_000);
});
