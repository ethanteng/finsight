/**
 * The holdings-based projection's contribution, end to end through the
 * baseline: which figure reaches the engine, what is stored with the run, and
 * what the answer says about it. The database and the engine are stubbed; the
 * resolution between them is the real code.
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

const LINKED = {
  annualAmount: 18_000,
  typicalMonthlyNet: 1_500,
  months: 12,
  firstMonth: '2025-10',
  lastMonth: '2026-09',
  contributed: 19_000,
  withdrawn: 1_000,
};

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
      linkedContributions: LINKED,
    },
    financialSummary: { computedAt: '2026-10-10T00:00:00.000Z' },
    ...extra,
  } as any;
}

const PLAN = {
  currentAge: 45,
  retirementAge: 60,
  annualWithdrawalAmount: 80_000,
  withdrawalStartAge: 60,
  sources: { currentAge: 'I am 45', retirementAge: 'retire at 60', annualWithdrawalAmount: '$80k a year' },
};

async function run(plan: Record<string, unknown> = PLAN, extra: Record<string, unknown> = {}) {
  const completed = await completeRetirementAnalysis(snapshot(extra), {
    userId: 'user-1',
    question: 'Am I on track to retire at 60?',
    questionNeeds: QUESTION_NEEDS,
    plannedRetirementInputs: plan as any,
  });
  return { completed, input: engineInputs[engineInputs.length - 1] };
}

describe('contributions in the holdings-based projection', () => {
  beforeEach(() => {
    analyze.mockClear();
    engineInputs.length = 0;
    prisma.retirementAnalysis.findFirst.mockReset();
    prisma.retirementAnalysis.findFirst.mockResolvedValue(null);
    prisma.retirementAnalysis.create.mockReset();
    prisma.retirementAnalysis.create.mockResolvedValue({ id: 'ra-1', computedAt: new Date('2026-10-10T00:00:00.000Z') });
  });

  it('runs what the linked accounts receive in a typical month, stores it, and says where it came from', async () => {
    const { completed, input } = await run();

    expect(input.annualContributionAmount).toBe(18_000);
    const analysis = completed.retirementAnalysis!;
    expect(analysis._storedInputParams?.annualContributionAmount).toBe(18_000);
    expect(analysis._contributionOrigin).toEqual({ origin: 'linked', linked: LINKED });
    expect(describeRetirementAssumptions(completed)).toContain(
      'adding $18,000 a year in today\'s dollars until withdrawals begin at 60: what your linked investment accounts ' +
      'received in a typical month from October 2025 to September 2026, less withdrawals, times twelve'
    );

    const pack = buildCanonicalFactPack(
      { ...completed, accounts: [], metadata: { lastUpdated: new Date(), dataSources: {}, errors: [] } } as any,
      'Am I on track?',
      questionNeedsFromPacks(['retirement_analysis'], false)
    );
    const fact = (id: string) => pack.facts.find((item) => item.id === id);
    expect(fact('retirement_annual_contribution')).toMatchObject({ value: 18_000 });
    expect(fact('retirement_annual_contribution')?.label).toContain('typical month');
    expect(fact('retirement_linked_contributions_total')).toMatchObject({ value: 19_000 });
    expect(fact('retirement_linked_withdrawals_total')).toMatchObject({ value: 1_000 });
  });

  it('takes Your numbers over linked accounts, and what the user said over both', async () => {
    const saved = { statedFigures: { annualContribution: { value: 24_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' } } };
    const fromSaved = await run(PLAN, saved);
    expect(fromSaved.input.annualContributionAmount).toBe(24_000);
    expect(describeRetirementAssumptions(fromSaved.completed)).toContain(
      'adding $24,000 a year in today\'s dollars until withdrawals begin at 60 (from Your numbers, saved Sep 14, 2026)'
    );

    const fromStated = await run(
      { ...PLAN, annualContributionAmount: 0, sources: { ...PLAN.sources, annualContributionAmount: 'I stopped saving' } },
      saved
    );
    expect(fromStated.input.annualContributionAmount).toBe(0);
    expect(fromStated.completed.retirementAnalysis?._contributionOrigin).toEqual({ origin: 'stated' });
  });

  it('counts none, and says so, when nothing says what goes in', async () => {
    const { completed, input } = await run(PLAN, {
      investments: { ...snapshot().investments, linkedContributions: null },
    });
    expect(input.annualContributionAmount).toBe(0);
    expect(describeRetirementAssumptions(completed)).toContain(
      'no new contributions before withdrawals begin, since I have none for you'
    );
  });

  it('adds nothing once withdrawals have begun, whatever was saved', async () => {
    const { completed, input } = await run(
      { currentAge: 66, retirementAge: 66, annualWithdrawalAmount: 80_000, withdrawalStartAge: 66, sources: PLAN.sources },
      { statedFigures: { annualContribution: { value: 24_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' } } }
    );
    expect(input.annualContributionAmount).toBe(0);
    expect(describeRetirementAssumptions(completed)).not.toMatch(/contribution|adding \$/);
  });
});
