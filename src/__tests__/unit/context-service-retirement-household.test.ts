/**
 * A partner in the holdings-based projection, end to end through the baseline
 * and a what-if: which incomes and horizon reach the engine, what is stored
 * with the run, and what the answer says about it. The database and the
 * engine are stubbed; the resolution between them is the real code.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

/** Every input the engine was asked to run, newest last. */
const engineInputs: any[] = [];
const analyze = jest.fn(async (input: any) => {
  engineInputs.push(input);
  return engineOutput();
});
const prisma = {
  retirementAnalysis: {
    findFirst: jest.fn<() => Promise<any>>(),
    create: jest.fn<() => Promise<any>>(),
  },
};

jest.mock('../../prisma-client', () => ({ getPrismaClient: () => prisma }));
jest.mock('../../retirement-analytics', () => ({ analyzeRetirementPortfolio: (input: any) => analyze(input) }));
jest.mock('../../retirement-analytics/engine/historical-data-loader', () => ({
  getHistoricalDatasetVersion: () => 'test-dataset',
}));

const { completeRetirementAnalysis } = jest.requireActual<typeof import('../../openai/context-service')>(
  '../../openai/context-service'
);
const { describeRetirementAssumptions, retirementHouseholdRequest } = jest.requireActual<typeof import('../../openai/retirement-assumptions')>(
  '../../openai/retirement-assumptions'
);
const { buildCanonicalFactPack } = jest.requireActual<typeof import('../../openai/canonical-facts')>(
  '../../openai/canonical-facts'
);
const { questionNeedsFromPacks } = jest.requireActual<typeof import('../../openai/context-packs')>(
  '../../openai/context-packs'
);

const QUESTION_NEEDS = {
  needsMarketContext: false,
  needsSearchContext: false,
  needsHomeValue: false,
  needsInvestments: true,
  needsRetirement: true,
  needsAccountDetails: false,
  needsTransactionDetails: false,
  needsMonthlyCashFlow: false,
  needsUserProfile: true,
  needsSecondaryValidation: true,
} as any;

function engineOutput() {
  return {
    summary: {
      characteristics: {},
      tradeoffs: { upside: '', downside: '' },
      primaryObservation: '',
      confidence: 'high',
      timelineBucket: '30',
      timelineBucketNote: '',
    },
    metrics: {
      withdrawalRate: 0.04,
      yearsOfExpenses: 25,
      projectedPortfolioAtWithdrawalStart: 1_500_000,
      firstYearPortfolioWithdrawal: 80_000,
      historicalWithdrawalRates: { p10: 0.03, p25: 0.035, p50: 0.04, p75: 0.045, p90: 0.05 },
    },
    stressTest: { survivalRate: 0.9, totalSequences: 100, depletionPercentiles: { p10: 20, p25: 25, p50: null, p75: null, p90: null } },
    historicalImplications: [],
    dataQuality: {
      completeness: 1,
      priceHistoryCoverage: 1,
      modeledValue: 500_000,
      unmodeledValue: 0,
      valueCoverage: 1,
      unmodeledReasons: [],
      metadataConfidence: 'high',
      portfolioMappingConfidence: 'high',
      proxiedValuePercentage: 0,
      proxyUsage: { usEquityProxy: 'VTI', internationalEquityProxy: 'VXUS', bondsProxy: 'AGG', unmappedHoldings: [], unsupportedHoldings: [], usListingFallbackHoldings: [], mappingMethod: 'direct' },
      assumptions: [],
      missingData: [],
    },
    disclaimers: [],
  };
}

function snapshot(extra: Record<string, unknown> = {}) {
  return {
    accounts: [],
    bankingTransactions: [],
    metadata: {},
    tierContext: {},
    userProfile: '',
    investments: {
      totalValue: 500_000,
      holdingCount: 1,
      summaryLines: [],
      holdings: [{ id: 'h1', account_id: 'plaid-401k', security_id: 's1', institution_value: 500_000 }],
      securities: [{ security_id: 's1', ticker_symbol: 'VTI' }],
      linkedContributions: null,
    },
    financialSummary: { computedAt: '2026-10-10T00:00:00.000Z' },
    ...extra,
  } as any;
}

/** A couple: the user 60, their partner 55, each with Social Security, and a pension for the partner. */
const PLAN = {
  currentAge: 60,
  retirementAge: 65,
  annualWithdrawalAmount: 80_000,
  withdrawalStartAge: 65,
  socialSecurityAnnual: 30_000,
  partnerAge: 55,
  partnerSocialSecurityAnnual: 20_000,
  partnerPensionAnnual: 12_000,
  survivorAnnualSpending: 60_000,
  partnerMarried: true,
  sources: {
    currentAge: 'I am 60',
    retirementAge: 'retire at 65',
    annualWithdrawalAmount: '$80k a year',
    socialSecurityAnnual: '$30k Social Security',
    partnerAge: 'my wife is 55',
    partnerSocialSecurityAnnual: 'she gets $20k',
    partnerPensionAnnual: 'her $12k pension',
    survivorAnnualSpending: '$60k alone',
    partnerMarried: 'my wife',
  },
};

/** The plan without the named figures, as if the user never stated them. */
function without(...fields: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(PLAN).filter(([field]) => !fields.includes(field)));
}

async function run(plan: Record<string, unknown> = PLAN, extra: Record<string, unknown> = {}) {
  const completed = await completeRetirementAnalysis(snapshot(extra), {
    userId: 'user-1',
    question: 'Are we on track to retire when I am 65?',
    questionNeeds: QUESTION_NEEDS,
    plannedRetirementInputs: plan as any,
  });
  return { completed, input: engineInputs[engineInputs.length - 1] };
}

describe('a partner in the holdings-based projection', () => {
  beforeEach(() => {
    analyze.mockClear();
    engineInputs.length = 0;
    prisma.retirementAnalysis.findFirst.mockReset();
    prisma.retirementAnalysis.findFirst.mockResolvedValue(null);
    prisma.retirementAnalysis.create.mockReset();
    prisma.retirementAnalysis.create.mockResolvedValue({ id: 'ra-1', computedAt: new Date('2026-10-10T00:00:00.000Z') });
  });

  it('runs both incomes until the later of their planning ages, with the survivor years', async () => {
    const { completed, input } = await run();

    // The partner reaches 95 when the user is 100.
    expect(input.lifeExpectancy).toBe(100);
    expect(input.incomeStreams).toEqual([
      // The user's own stops when they reach 95.
      { label: 'Social Security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true, endAge: 95 },
      // Their 67 is the user's 72.
      { label: 'your partner\'s Social Security', annualAmount: 20_000, startAge: 72, inflationAdjusted: true },
      // Married, the partner is then paid the user's $30,000: $10,000 above their own.
      { label: 'your partner\'s survivor benefit on your record', annualAmount: 10_000, startAge: 95, inflationAdjusted: true },
      // From the household's retirement: the user's 65 is the partner's 60.
      { label: 'your partner\'s pension or other income', annualAmount: 12_000, startAge: 65, inflationAdjusted: false },
    ]);
    expect(input.survivorSpending).toEqual({ fromAge: 95, annualAmount: 60_000 });

    const stored = (prisma.retirementAnalysis.create.mock.calls[0] as any[])[0].data.analysisInput;
    expect(stored).toMatchObject({ lifeExpectancy: 100, userPlanThroughAge: 95, survivorSpending: { fromAge: 95, annualAmount: 60_000 } });

    const analysis = completed.retirementAnalysis!;
    expect(analysis._storedInputParams).toMatchObject({
      lifeExpectancy: 100,
      userPlanThroughAge: 95,
      survivorSpending: { fromAge: 95, annualAmount: 60_000 },
    });
    expect(analysis._household).toMatchObject({
      plan: { age: 55, planThroughAge: 95 },
      timeline: { ageGap: 5, horizonAge: 100, firstDeath: { who: 'user', atUserAge: 95 } },
    });

    const disclosure = describeRetirementAssumptions(completed)!;
    expect(disclosure).toContain('your Social Security $30,000 a year in today\'s dollars from 67, an age I assumed, until you reach your planning age');
    expect(disclosure).toContain(
      'your partner\'s Social Security of $20,000 a year in today\'s dollars from their 67 (your 72), an age I assumed;'
    );
    expect(disclosure).toContain(
      'your partner\'s pension of $12,000 a year from their 60 (your 65), a fixed amount that buys less each year prices rise ' +
      '(I assumed that it starts when you retire and that it does not rise with inflation)'
    );
    expect(disclosure).toContain('planning for you and your partner, 55 today; the plan runs until your partner reaches 95, an age I assumed, when you would be 100');
    expect(disclosure).toContain(
      'from when you reach 95, your partner\'s Social Security becomes $30,000 a year, the survivor benefit on your record, ' +
      'and spending becomes $60,000 a year, what you said one of you would spend alone'
    );

    const pack = buildCanonicalFactPack(
      { ...completed, accounts: [], metadata: { lastUpdated: new Date(), dataSources: {}, errors: [] } } as any,
      'Are we on track?',
      questionNeedsFromPacks(['retirement_analysis'], false)
    );
    const fact = (id: string) => pack.facts.find((item) => item.id === id);
    expect(fact('retirement_social_security_annual')).toMatchObject({ value: 30_000 });
    expect(fact('retirement_partner_social_security_annual')).toMatchObject({ value: 20_000 });
    expect(fact('retirement_partner_social_security_start_age_partner')).toMatchObject({ value: 67 });
    expect(fact('retirement_partner_social_security_start_age')).toMatchObject({ value: 72 });
    expect(fact('retirement_social_security_end_age')).toMatchObject({ value: 95 });
    expect(fact('retirement_partner_social_security_end_age')).toBeUndefined();
    expect(fact('retirement_full_retirement_benefit')).toMatchObject({ value: 30_000 });
    expect(fact('retirement_partner_full_retirement_benefit')).toMatchObject({ value: 20_000 });
    expect(fact('retirement_partner_survivor_benefit_annual')).toMatchObject({ value: 30_000 });
    expect(fact('retirement_partner_survivor_benefit_start_age')).toMatchObject({ value: 95 });
    // Half the user's $30,000 is less than the partner's own: no spousal benefit.
    expect(fact('retirement_partner_spousal_annual')).toBeUndefined();
    expect(fact('retirement_plan_end_age')).toMatchObject({ value: 100 });
    expect(fact('retirement_first_death_age')).toMatchObject({ value: 95 });
    expect(fact('retirement_survivor_spending')).toMatchObject({ value: 60_000 });
  });

  it('taxes the couple jointly on their accounts\' own types, with premiums, and reruns when coverage changes', async () => {
    const extra = {
      investments: {
        ...snapshot().investments,
        accountTaxMix: { taxable: 100_000, pretax: 350_000, roth: 50_000, unknown: 0, taxableBasis: 40_000, taxableWithoutBasis: 0 },
      },
      userProfileValues: { stateOrProvince: 'Texas' },
    };
    const { completed, input } = await run(PLAN, extra);

    expect(input.taxes).toEqual({
      accounts: { taxable: 0.2, pretax: 0.7, roth: 0.1 },
      taxableBasisShare: 0.4,
      filing: 'joint',
      stateRate: 0,
    });
    // The partner is 60 when the user retires at 65.
    expect(input.healthcare).toEqual({ coverage: 'marketplace' });
    expect(input.people).toEqual({ userPlanThroughAge: 95, partner: { age: 55, planEndsAtUserAge: 100 } });
    expect(completed.retirementAnalysis!._storedInputParams).toMatchObject({ taxes: input.taxes, healthcare: input.healthcare });

    const disclosure = describeRetirementAssumptions(completed)!;
    expect(disclosure).toContain('2026 federal income tax on each year\'s withdrawals and income, filing jointly');
    expect(disclosure).toContain('savings 70% pre-tax, 20% taxable, 10% Roth by your linked accounts\' types; no state income tax, since Texas has none');
    expect(disclosure).toContain('To make the tax and health figures yours, tell me what health coverage you will have before Medicare');

    // The same plan with coverage now stated is a different run.
    const created = (prisma.retirementAnalysis.create.mock.calls[0] as any[])[0].data;
    prisma.retirementAnalysis.findFirst.mockResolvedValue({ ...created, id: 'ra-1', computedAt: new Date('2026-10-10T00:00:00.000Z') });
    analyze.mockClear();
    await run(PLAN, extra);
    expect(analyze).not.toHaveBeenCalled();
    await run({ ...PLAN, preMedicareCoverage: 'employer_retiree', preMedicareAnnualPremium: 4_800 }, extra);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(engineInputs[engineInputs.length - 1].healthcare).toEqual({ coverage: 'employer_retiree', annualPremium: 4_800 });
  });

  it('reuses the run on the next question rather than growing the horizon', async () => {
    await run();
    const created = (prisma.retirementAnalysis.create.mock.calls[0] as any[])[0].data;
    prisma.retirementAnalysis.findFirst.mockResolvedValue({
      ...created,
      id: 'ra-1',
      computedAt: new Date('2026-10-10T00:00:00.000Z'),
    });
    analyze.mockClear();

    const { completed } = await run();
    expect(analyze).not.toHaveBeenCalled();
    expect(completed.retirementAnalysis?._storedInputParams?.lifeExpectancy).toBe(100);
  });

  it('asks for the partner\'s age rather than assume it, and runs the user\'s own plan meanwhile', async () => {
    const { completed, input } = await run(without('partnerAge'));

    expect(input.lifeExpectancy).toBe(95);
    expect(input.incomeStreams).toEqual([
      { label: 'Social Security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true },
    ]);
    expect(describeRetirementAssumptions(completed)).toContain(
      'not your partner, since I need their age to plan for them (tell me how old they are and I will include them)'
    );
    // The answer stands; the form under it asks for the age alone.
    expect(retirementHouseholdRequest(completed)).toMatchObject({
      calculatorId: 'retirement',
      question: 'Am I on track for retirement?',
      fields: [{ id: 'partnerAge', required: true, sentence: 'My partner is {value} years old.' }],
    });
    // Once the age is known, only the taxes and coverage the run assumed are asked about.
    expect(retirementHouseholdRequest((await run()).completed)?.title).toBe('Make the tax and health figures yours');
  });

  it('counts no spousal or survivor benefit while the marriage is unknown, and asks', async () => {
    const { completed, input } = await run(without('partnerMarried'));
    expect(input.incomeStreams).toEqual([
      { label: 'Social Security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true, endAge: 95 },
      { label: 'your partner\'s Social Security', annualAmount: 20_000, startAge: 72, inflationAdjusted: true },
      { label: 'your partner\'s pension or other income', annualAmount: 12_000, startAge: 65, inflationAdjusted: false },
    ]);
    const disclosure = describeRetirementAssumptions(completed)!;
    expect(disclosure).toContain('from when you reach 95, each Social Security benefit stops with the person it belongs to');
    expect(disclosure).toContain(
      'no spousal or survivor Social Security benefits, since I don\'t know whether you\'re married (tell me if you are and I will count them)'
    );
    expect(retirementHouseholdRequest(completed)).toMatchObject({
      calculatorId: 'retirement',
      title: 'Spousal and survivor benefits',
      fields: [{ id: 'partnerMarried', required: true, sentence: 'My partner and I are {value}.' }],
    });
  });

  it('knows the couple is married from the household status Linc remembers', async () => {
    const { completed, input } = await run(without('partnerMarried'), { userProfileValues: { householdStatus: 'married' } });
    expect(input.incomeStreams).toContainEqual(
      { label: 'your partner\'s survivor benefit on your record', annualAmount: 10_000, startAge: 95, inflationAdjusted: true }
    );
    expect(describeRetirementAssumptions(completed)).toContain('planning for you and your partner (married, as you told me before), 55 today');
    expect(retirementHouseholdRequest(completed)?.title).toBe('Make the tax and health figures yours');
  });

  it('runs the partner saved in Your numbers, and says when it was saved', async () => {
    const savedAt = '2026-09-14T10:00:00.000Z';
    const own = without('partnerAge', 'partnerSocialSecurityAnnual', 'partnerPensionAnnual', 'survivorAnnualSpending');
    const { completed, input } = await run(own, {
      statedFigures: {
        partnerAge: { value: 62, savedAt, source: 'page' },
        partnerSocialSecurityAnnual: { value: 18_000, savedAt, source: 'page' },
      },
    });

    // An older partner: the plan ends at the user's own 95, and theirs stops first.
    expect(input.lifeExpectancy).toBe(95);
    expect(input.incomeStreams[1]).toEqual({
      label: 'your partner\'s Social Security', annualAmount: 18_000, startAge: 65, inflationAdjusted: true, endAge: 93,
    });
    expect(describeRetirementAssumptions(completed)).toContain('(from Your numbers, saved Sep 14, 2026)');
  });
});

describe('the user\'s own planning age in the holdings-based projection', () => {
  const SINGLE = {
    currentAge: 60,
    retirementAge: 65,
    annualWithdrawalAmount: 80_000,
    withdrawalStartAge: 65,
    sources: { currentAge: 'I am 60', retirementAge: 'retire at 65', annualWithdrawalAmount: '$80k a year' },
  };
  const savedAt = '2026-09-14T10:00:00.000Z';
  const savedPlanThrough = (value: number) => ({ statedFigures: { planThroughAge: { value, savedAt, source: 'page' } } });

  beforeEach(() => {
    analyze.mockClear();
    engineInputs.length = 0;
    prisma.retirementAnalysis.findFirst.mockReset();
    prisma.retirementAnalysis.findFirst.mockResolvedValue(null);
    prisma.retirementAnalysis.create.mockReset();
    prisma.retirementAnalysis.create.mockResolvedValue({ id: 'ra-1', computedAt: new Date('2026-10-10T00:00:00.000Z') });
  });

  it('plans through the age saved in Your numbers, and says when it was saved', async () => {
    const { completed, input } = await run(SINGLE, savedPlanThrough(92));
    expect(input.lifeExpectancy).toBe(92);
    expect(completed.retirementAnalysis?._planThroughAgeOrigin).toEqual({ origin: 'saved', savedAt });
    expect(describeRetirementAssumptions(completed)).toContain('planning through age 92 (from Your numbers, saved Sep 14, 2026)');
  });

  it('lets what the user says now, and an earlier run, rank as the rest of the plan does', async () => {
    const stated = await run(
      { ...SINGLE, lifeExpectancy: 90, sources: { ...SINGLE.sources, lifeExpectancy: 'plan to 90' } },
      savedPlanThrough(92)
    );
    expect(stated.input.lifeExpectancy).toBe(90);
    expect(describeRetirementAssumptions(stated.completed)).not.toContain('from Your numbers');

    // Saved outranks what a run last week stored.
    prisma.retirementAnalysis.findFirst.mockResolvedValue({
      id: 'ra-old',
      computedAt: new Date('2026-10-09T00:00:00.000Z'),
      analysisInput: { currentAge: 60, retirementAge: 65, annualWithdrawalAmount: 80_000, withdrawalStartAge: 65, lifeExpectancy: 100 },
      portfolioSnapshot: { holdings: [], securities: [] },
    });
    const overStored = await run(SINGLE, savedPlanThrough(92));
    expect(overStored.input.lifeExpectancy).toBe(92);
  });

  it('leaves out a saved age the withdrawals would already run past', async () => {
    const { completed, input } = await run(SINGLE, savedPlanThrough(65));
    expect(input.lifeExpectancy).toBe(95);
    expect(completed.retirementAnalysis?._planThroughAgeOrigin).toBeUndefined();
  });

  it('plans the household through the later of the two, from the user\'s saved age', async () => {
    const { completed, input } = await run(
      { ...SINGLE, partnerAge: 55, sources: { ...SINGLE.sources, partnerAge: 'my wife is 55' } },
      savedPlanThrough(90)
    );
    // The partner reaches 95 at the user's 100; the user's own 90 is the first death.
    expect(input.lifeExpectancy).toBe(100);
    expect(input.survivorSpending).toBeUndefined();
    expect(completed.retirementAnalysis?._household).toMatchObject({ timeline: { userPlanThroughAge: 90, horizonAge: 100 } });
    expect(describeRetirementAssumptions(completed)).toContain('you plan through age 90 (from Your numbers, saved Sep 14, 2026)');
  });

  it('recomputes when only the user\'s own planning age changes under a partner\'s later horizon', async () => {
    const couple = { ...SINGLE, partnerAge: 55, sources: { ...SINGLE.sources, partnerAge: 'my wife is 55' } };
    await run(couple, savedPlanThrough(90));
    const created = (prisma.retirementAnalysis.create.mock.calls[0] as any[])[0].data;
    expect(created.analysisInput).toMatchObject({ lifeExpectancy: 100, userPlanThroughAge: 90 });
    prisma.retirementAnalysis.findFirst.mockResolvedValue({
      ...created,
      id: 'ra-1',
      computedAt: new Date('2026-10-10T00:00:00.000Z'),
    });
    analyze.mockClear();

    // Same household horizon (100), but the first death moves from 90 to 92.
    const { completed, input } = await run(couple, savedPlanThrough(92));
    expect(analyze).toHaveBeenCalled();
    expect(input).toMatchObject({ lifeExpectancy: 100, userPlanThroughAge: 92 });
    expect(completed.retirementAnalysis?._household).toMatchObject({
      timeline: { userPlanThroughAge: 92, horizonAge: 100 },
    });
    expect(describeRetirementAssumptions(completed)).toContain(
      'you plan through age 92 (from Your numbers, saved Sep 14, 2026)'
    );
  });
});
