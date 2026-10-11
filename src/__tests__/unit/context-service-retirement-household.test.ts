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
const { describeRetirementAssumptions } = jest.requireActual<typeof import('../../openai/retirement-assumptions')>(
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
  sources: {
    currentAge: 'I am 60',
    retirementAge: 'retire at 65',
    annualWithdrawalAmount: '$80k a year',
    socialSecurityAnnual: '$30k Social Security',
    partnerAge: 'my wife is 55',
    partnerSocialSecurityAnnual: 'she gets $20k',
    partnerPensionAnnual: 'her $12k pension',
    survivorAnnualSpending: '$60k alone',
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

  it('runs both incomes until the younger reaches their planning age, with the survivor years', async () => {
    const { completed, input } = await run();

    // The partner reaches 95 when the user is 100.
    expect(input.lifeExpectancy).toBe(100);
    expect(input.incomeStreams).toEqual([
      { label: 'Social Security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true },
      // Their 67 is the user's 72; the smaller benefit stops when the user reaches 95.
      { label: 'your partner\'s Social Security', annualAmount: 20_000, startAge: 72, inflationAdjusted: true, endAge: 95 },
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
    expect(disclosure).toContain(
      'your partner\'s Social Security of $20,000 a year in today\'s dollars from their 67 (your 72), an age I assumed, ' +
      'until the first of you reaches their planning age, when the survivor keeps the larger benefit'
    );
    expect(disclosure).toContain(
      'your partner\'s pension of $12,000 a year from their 60 (your 65), a fixed amount that buys less each year prices rise ' +
      '(I assumed that it starts when you retire and that it does not rise with inflation)'
    );
    expect(disclosure).toContain('planning for you and your partner, 55 today; the plan runs until your partner reaches 95, an age I assumed, when you would be 100');
    expect(disclosure).toContain('and spending becomes $60,000 a year, what you said one of you would spend alone');

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
    expect(fact('retirement_partner_social_security_end_age')).toMatchObject({ value: 95 });
    expect(fact('retirement_plan_end_age')).toMatchObject({ value: 100 });
    expect(fact('retirement_first_death_age')).toMatchObject({ value: 95 });
    expect(fact('retirement_survivor_spending')).toMatchObject({ value: 60_000 });
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
