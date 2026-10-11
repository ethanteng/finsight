/**
 * Spending flexibility in the holdings-based projection, end to end: which
 * cut reaches the engine (the user's, or the comparison beside fixed
 * spending), what is stored with the run, and what the answer says and
 * publishes about it. The database and the engine are stubbed; the
 * resolution between them is the real code.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

/** Every input the engine was asked to run, newest last. */
const engineInputs: any[] = [];
const analyze = jest.fn(async (input: any) => {
  engineInputs.push(input);
  return engineOutput(input);
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

/** What a cut did across 400 sequences: cuts in 124 of them, for a median of 3 years and at most 9. */
function outcome(cutShare: number, survivalRate: number) {
  return {
    cutShare,
    triggerDrawdown: 0.2,
    survivalRate,
    sequencesTested: 400,
    sequencesSurvived: Math.round(400 * survivalRate),
    sequencesWithCuts: 124,
    medianYearsCut: 3,
    mostYearsCut: 9,
  };
}

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

function engineOutput(input: any = {}) {
  return {
    ...(input.spendingFlexibility && { spendingFlexibility: outcome(input.spendingFlexibility.cutShare, 0.9) }),
    ...(input.spendingFlexibilityComparison && {
      spendingFlexibilityComparison: outcome(input.spendingFlexibilityComparison.cutShare, 0.94),
    }),
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
    stressTest: { survivalRate: 0.82, totalSequences: 100, depletionPercentiles: { p10: 20, p25: 25, p50: null, p75: null, p90: null } },
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


const PLAN = {
  currentAge: 60,
  retirementAge: 65,
  annualWithdrawalAmount: 60_000,
  withdrawalStartAge: 65,
  sources: { currentAge: 'I am 60', retirementAge: 'retire at 65', annualWithdrawalAmount: '$60k a year' },
};

async function run(plan: Record<string, unknown> = PLAN, extra: Record<string, unknown> = {}) {
  const completed = await completeRetirementAnalysis(snapshot(extra), {
    userId: 'user-1',
    question: 'Am I on track to retire at 65?',
    questionNeeds: QUESTION_NEEDS,
    plannedRetirementInputs: plan as any,
  });
  return { completed, input: engineInputs[engineInputs.length - 1] };
}

function facts(completed: any) {
  const pack = buildCanonicalFactPack(
    { ...completed, accounts: [], metadata: { lastUpdated: new Date(), dataSources: {}, errors: [] } } as any,
    'Am I on track?',
    questionNeedsFromPacks(['retirement_analysis'], false)
  );
  return (id: string) => pack.facts.find((item) => item.id === id);
}

describe('spending flexibility in the holdings-based projection', () => {
  beforeEach(() => {
    analyze.mockClear();
    engineInputs.length = 0;
    prisma.retirementAnalysis.findFirst.mockReset();
    prisma.retirementAnalysis.findFirst.mockResolvedValue(null);
    prisma.retirementAnalysis.create.mockReset();
    prisma.retirementAnalysis.create.mockResolvedValue({ id: 'ra-1', computedAt: new Date('2026-10-10T00:00:00.000Z') });
  });

  it('keeps fixed spending when nobody has said, and reports what a 20% cut would change', async () => {
    const { completed, input } = await run();
    expect(input.spendingFlexibility).toBeUndefined();
    expect(input.spendingFlexibilityComparison).toEqual({ cutShare: 0.2 });
    const stored = (prisma.retirementAnalysis.create.mock.calls[0] as any[])[0].data.analysisInput;
    expect(stored.spendingFlexibilityComparison).toEqual({ cutShare: 0.2 });

    const disclosure = describeRetirementAssumptions(completed)!;
    // The plan itself is not cut: only the comparison sentence names one.
    expect(disclosure).not.toMatch(/assumes[^.]*cutting spending/);
    expect(disclosure).toContain(
      'If you cut spending 20% ($12,000 a year) in any year that started with your portfolio more than 20% below its ' +
      'inflation-adjusted value when withdrawals began, and spent in full again once it recovered, ' +
      'the plan would last in 94% of historical sequences instead of 82%, with spending cut in 31% of the 400 historical ' +
      'sequences, for a median of 3 years and at most 9 years. Tell me how much of your spending you could cut in a bad ' +
      'market and I will use your number.'
    );

    const fact = facts(completed);
    expect(fact('retirement_flexible_comparison_survival_rate')).toMatchObject({ value: 94, unit: 'percent' });
    expect(fact('retirement_flexible_comparison_cut_percent')).toMatchObject({ value: 20, unit: 'percent' });
    expect(fact('retirement_flexible_comparison_cut_annual')).toMatchObject({ value: 12_000, unit: 'usd' });
    expect(fact('retirement_flexible_comparison_sequences_cut_percent')).toMatchObject({ value: 31, unit: 'percent' });
    expect(fact('retirement_flexible_comparison_most_years_cut')).toMatchObject({ value: 9, unit: 'years' });
    expect(fact('retirement_spending_cut_percent')).toBeUndefined();
  });

  it('runs the cut the user names, and says how often it was in force', async () => {
    const { completed, input } = await run({ ...PLAN, spendingCutPercent: 25, sources: { ...PLAN.sources, spendingCutPercent: 'cut about a quarter' } });
    expect(input.spendingFlexibility).toEqual({ cutShare: 0.25 });
    expect(input.spendingFlexibilityComparison).toBeUndefined();
    expect(completed.retirementAnalysis?._storedInputParams?.spendingFlexibility).toEqual({ cutShare: 0.25 });

    const disclosure = describeRetirementAssumptions(completed)!;
    expect(disclosure).toContain(
      'cutting spending 25% ($15,000 a year) in any year that starts with your portfolio more than 20% below its ' +
      'inflation-adjusted value when withdrawals began, and spending in full again once it recovers.'
    );
    expect(disclosure).toContain(
      'With your 25% cut, spending was cut in 31% of the 400 historical sequences, for a median of 3 years and at most 9 years.'
    );
    expect(disclosure).not.toContain('If you were willing');

    const fact = facts(completed);
    expect(fact('retirement_spending_cut_percent')).toMatchObject({ value: 25 });
    expect(fact('retirement_spending_cut_annual')).toMatchObject({ value: 15_000 });
    expect(fact('retirement_spending_cut_sequences_cut_percent')).toMatchObject({ value: 31 });
    expect(fact('retirement_flexible_comparison_survival_rate')).toBeUndefined();
  });

  it('reads a cut from the spending the user could not go below, or from Your numbers', async () => {
    const floor = await run({ ...PLAN, essentialAnnualSpending: 45_000, sources: { ...PLAN.sources, essentialAnnualSpending: 'essentials are $45k' } });
    expect(floor.input.spendingFlexibility).toEqual({ cutShare: 0.25 });
    expect(describeRetirementAssumptions(floor.completed)).toContain(
      'once it recovers (everything above the spending you said you could not go below)'
    );

    const saved = await run(PLAN, {
      statedFigures: { spendingCutPercent: { value: 10, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' } },
    });
    expect(saved.input.spendingFlexibility).toEqual({ cutShare: 0.1 });
    expect(describeRetirementAssumptions(saved.completed)).toContain(
      'cutting spending 10% ($6,000 a year)'
    );
    expect(describeRetirementAssumptions(saved.completed)).toContain('(from Your numbers, saved Sep 14, 2026)');
  });

  it('runs neither when the user says they could not cut', async () => {
    const { completed, input } = await run({ ...PLAN, spendingCutPercent: 0, sources: { ...PLAN.sources, spendingCutPercent: 'we could not cut anything' } });
    expect(input.spendingFlexibility).toBeUndefined();
    expect(input.spendingFlexibilityComparison).toBeUndefined();
    expect(describeRetirementAssumptions(completed)).toContain('no spending cuts in a bad market, since you said you could not cut');
  });

  it('reruns rather than reuse a stored run when the cut changes', async () => {
    await run();
    const created = (prisma.retirementAnalysis.create.mock.calls[0] as any[])[0].data;
    prisma.retirementAnalysis.findFirst.mockResolvedValue({ ...created, id: 'ra-1', computedAt: new Date('2026-10-10T00:00:00.000Z') });
    analyze.mockClear();

    await run();
    expect(analyze).not.toHaveBeenCalled();

    await run({ ...PLAN, spendingCutPercent: 15, sources: { ...PLAN.sources, spendingCutPercent: '15%' } });
    expect(analyze).toHaveBeenCalledTimes(1);
  });
});
