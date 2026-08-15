import { runAskLincAnalysis } from '../openai/analysis-pipeline';
import { analyzeQuestionNeeds } from '../openai/question-analysis';
import { resolveRetirementInputs } from '../openai/retirement-inputs';
import type { FinancialContextSnapshot } from '../openai/types';

export type AskLincEvalCategory =
  | 'numerical_accuracy'
  | 'follow_up'
  | 'stale_data'
  | 'missing_data'
  | 'retirement';

export interface AskLincEvalResult {
  id: string;
  category: AskLincEvalCategory;
  passed: boolean;
  detail: string;
}

const SNAPSHOT_COMPUTED_AT = '2026-08-14T12:00:00.000Z';
const SNAPSHOT_AS_OF = '2026-08-13T12:00:00.000Z';

function baseSnapshot(
  status: 'current' | 'stale' | 'partial' | 'unavailable' = 'current'
): FinancialContextSnapshot {
  return {
    accounts: [
      { id: 'checking-1', name: 'Primary Checking', type: 'depository', balance: 30_000, institution: 'Example Bank' },
      { id: 'brokerage-1', name: 'Brokerage', type: 'investment', balance: 220_000, institution: 'Example Brokerage' },
    ],
    bankingTransactions: [],
    investments: {
      totalValue: 220_000,
      holdingCount: 2,
      summaryLines: [],
      holdings: [],
      securities: [],
    },
    metadata: {
      lastUpdated: new Date(SNAPSHOT_COMPUTED_AT),
      persistedAsOf: new Date(SNAPSHOT_AS_OF),
      dataSources: {},
      errors: { plaid: [], snaptrade: [], homeValue: null },
    },
    tierContext: {
      tierInfo: { currentTier: 'starter', availableSources: [] },
      upgradeHints: [],
      marketContext: {},
    },
    contextSelection: {
      accountsIncluded: true,
      transactionDetailsIncluded: false,
      investmentDetailsIncluded: true,
      marketContextRequested: false,
      searchContextRequested: false,
    },
    financialSummary: {
      computedAt: SNAPSHOT_COMPUTED_AT,
      asOf: SNAPSHOT_AS_OF,
      status,
      reportingCurrency: 'USD',
      quality: status === 'current' ? {} : {
        staleSourceIds: status === 'stale' ? ['plaid:item-1'] : [],
        unavailableSourceIds: status === 'partial' ? ['snaptrade'] : [],
        requiredUnavailableSourceIds: [],
        errors: [],
      },
      financialOverview: {
        netWorth: 250_000,
        totalCash: 50_000,
        totalInvestments: 220_000,
        totalDebt: 20_000,
        homeValue: null,
      },
      investmentPortfolio: {
        totalValue: 220_000,
        holdingCount: 2,
        securityCount: 2,
        assetAllocation: [],
      },
    },
  } as unknown as FinancialContextSnapshot;
}

function jsonResponse(
  summary: string,
  keyNumbers: Record<string, { value: number; unit: string; provenance: string }> = {},
  insights: string[] = [],
  suggestedActions: string[] = []
): string {
  return JSON.stringify({ summary, key_numbers: keyNumbers, insights, suggested_actions: suggestedActions });
}

function keyNumberValue(result: Awaited<ReturnType<typeof runAskLincAnalysis>>, key: string): number | undefined {
  const metric = result.structuredResponse.key_numbers?.[key];
  return typeof metric === 'number' ? metric : metric?.value;
}

function retirementSnapshot(): FinancialContextSnapshot {
  const snapshot = baseSnapshot();
  snapshot.retirementAnalysis = {
    summary: {
      characteristics: {
        growthPotential: 'moderate',
        drawdownResistance: 'moderate',
        withdrawalFragility: 'moderate',
        inflationProtection: 'moderate',
      },
      tradeoffs: { upside: 'Growth before withdrawals.', downside: 'Market sequence risk remains.' },
      primaryObservation: 'The projection includes an accumulation phase before withdrawals.',
      confidence: 'medium',
      timelineBucket: '20',
      timelineBucketNote: 'The historical analysis uses the closest supported horizon.',
    },
    metrics: {
      equityAllocation: 70,
      withdrawalRate: 0.04,
      yearsOfExpenses: 25,
      projectedPortfolioAtWithdrawalStart: 500_000,
      yearsToWithdrawalStart: 20,
      historicalWithdrawalRates: { p10: 0.032, p25: 0.036, p50: 0.04, p75: 0.044, p90: 0.048 },
    },
    stressTest: {
      totalSequences: 50,
      survivalRate: 0.8,
      depletionPercentiles: { p10: 12, p25: 18, p50: 25, p75: null, p90: null },
      worstSequences: { byDepletion: [], byDrawdown: [], byRecovery: [] },
    },
    historicalImplications: [],
    dataQuality: {
      completeness: 0.9,
      priceHistoryCoverage: 0.85,
      metadataConfidence: 'medium',
      portfolioMappingConfidence: 'medium',
      proxiedValuePercentage: 100,
      proxyUsage: {
        usEquityProxy: 'Shiller US equity total-return history',
        internationalEquityProxy: 'Shiller US equity history (international proxy)',
        bondsProxy: 'Shiller historical bond-return series',
        unmappedHoldings: [],
        mappingMethod: 'Asset-class proxy mapping.',
      },
      assumptions: [
        'Portfolio grows for 20 years before withdrawals begin; no future contributions are assumed.',
      ],
      missingData: ['Future contributions are not modeled.'],
    },
    disclaimers: ['Historical scenarios are not forecasts.'],
    _storedInputParams: {
      currentAge: 45,
      retirementAge: 65,
      annualWithdrawalAmount: 20_000,
      withdrawalStartAge: 65,
      lifeExpectancy: 90,
    },
  };
  return snapshot;
}

export async function runAskLincEvalSet(): Promise<AskLincEvalResult[]> {
  const grounded = await runAskLincAnalysis({
    question: 'What is my net worth?',
    enableValidation: false,
    evaluation: {
      snapshot: baseSnapshot(),
      skipToneConfig: true,
      model: () => jsonResponse('Your net worth is $250,000.', {
        net_worth: { value: 250_000, unit: 'usd', provenance: 'net_worth' },
      }),
    },
  });

  const retryPhases: string[] = [];
  const retry = await runAskLincAnalysis({
    question: 'What is my net worth?',
    enableValidation: false,
    evaluation: {
      snapshot: baseSnapshot(),
      skipToneConfig: true,
      model: ({ phase }) => {
        retryPhases.push(phase);
        return phase === 'initial'
          ? jsonResponse('Your net worth is $275,000.', {
              net_worth: { value: 275_000, unit: 'usd', provenance: 'net_worth' },
            })
          : jsonResponse('Your net worth is $250,000.', {
              net_worth: { value: 250_000, unit: 'usd', provenance: 'net_worth' },
            });
      },
    },
  });

  let followUpPrompt = '';
  const followUpNeeds = analyzeQuestionNeeds(
    'What about that one instead?',
    ['How should I diversify my investment portfolio?']
  );
  const followUp = await runAskLincAnalysis({
    question: 'What about that one instead?',
    conversationHistory: [{
      id: 'conversation-1',
      question: 'How should I diversify my investment portfolio?',
      answer: 'We discussed the portfolio mix.',
      createdAt: new Date('2026-08-14T11:00:00.000Z'),
    }],
    enableValidation: false,
    evaluation: {
      snapshot: baseSnapshot(),
      skipToneConfig: true,
      model: ({ userMessage }) => {
        followUpPrompt = userMessage;
        return jsonResponse('The current portfolio value is $220,000.', {
          portfolio_value: { value: 220_000, unit: 'usd', provenance: 'portfolio_value' },
        });
      },
    },
  });

  let stalePrompt = '';
  const stale = await runAskLincAnalysis({
    question: 'What is my net worth?',
    enableValidation: false,
    evaluation: {
      snapshot: baseSnapshot('stale'),
      skipToneConfig: true,
      model: ({ userMessage }) => {
        stalePrompt = userMessage;
        return jsonResponse('The latest stored snapshot shows net worth of $250,000.', {
          net_worth: { value: 250_000, unit: 'usd', provenance: 'net_worth' },
        });
      },
    },
  });

  const partialSnapshot = baseSnapshot('partial');
  partialSnapshot.financialSummary!.financialOverview = undefined;
  partialSnapshot.financialSummary!.investmentPortfolio = undefined;
  partialSnapshot.investments = undefined;
  let partialPrompt = '';
  const partial = await runAskLincAnalysis({
    question: 'How much cash do I have?',
    enableValidation: false,
    evaluation: {
      snapshot: partialSnapshot,
      skipToneConfig: true,
      model: ({ userMessage }) => {
        partialPrompt = userMessage;
        return jsonResponse('Cash totals are unavailable because this snapshot is incomplete.');
      },
    },
  });

  let retirementPrompt = '';
  const retirement = await runAskLincAnalysis({
    question: 'What does my retirement projection show?',
    enableValidation: false,
    evaluation: {
      snapshot: retirementSnapshot(),
      skipToneConfig: true,
      model: ({ userMessage }) => {
        retirementPrompt = userMessage;
        return jsonResponse(
          "At withdrawal start, the median historically projected portfolio is $500,000 in today's dollars, with a 4% withdrawal rate.",
          {
            projected_portfolio_at_withdrawal_start: {
              value: 500_000,
              unit: 'usd',
              provenance: 'projected_portfolio_at_withdrawal_start',
            },
            withdrawal_rate: { value: 4, unit: 'percent', provenance: 'withdrawal_rate' },
          },
          ['The projection explicitly separates accumulation from withdrawals.']
        );
      },
    },
  });

  const retirementInputs = resolveRetirementInputs({
    questionParams: { retirementAge: 65 } as any,
    profileAge: 45,
    profileRetirementAge: null,
  });

  const groundedManifest = grounded.showTheMathData!.evidenceManifest;
  const retryManifest = retry.showTheMathData!.evidenceManifest;
  const followUpFactIds = followUp.showTheMathData!.evidenceManifest.facts.map(fact => fact.id);
  const partialManifest = partial.showTheMathData!.evidenceManifest;
  const retirementFactIds = retirement.showTheMathData!.evidenceManifest.facts.map(fact => fact.id);

  return [
    {
      id: 'grounded-number-survives-real-pipeline',
      category: 'numerical_accuracy',
      passed: keyNumberValue(grounded, 'net_worth') === 250_000 &&
        groundedManifest.validation.deterministic.valid,
      detail: 'A canonical amount survives prompt, parse, canonicalization, grounding, and evidence generation.',
    },
    {
      id: 'invented-number-triggers-grounded-retry',
      category: 'numerical_accuracy',
      passed: keyNumberValue(retry, 'net_worth') === 250_000 &&
        retryPhases.join(',') === 'initial,retry' &&
        retryManifest.modelCalls.some(call => call.phase === 'retry') &&
        retryManifest.validation.deterministic.valid,
      detail: 'An invented amount is rejected locally and replaced only by a grounded retry.',
    },
    {
      id: 'follow-up-inherits-question-intent-through-pipeline',
      category: 'follow_up',
      passed: followUpNeeds.needsInvestments && followUpNeeds.needsAccountDetails &&
        followUpFactIds.includes('portfolio_value') &&
        followUpPrompt.includes('How should I diversify my investment portfolio?'),
      detail: 'A short follow-up inherits portfolio intent and receives the corresponding compact context and history.',
    },
    {
      id: 'stale-snapshot-keeps-status-and-provenance',
      category: 'stale_data',
      passed: stale.showTheMathData!.evidenceManifest.snapshot.status === 'stale' &&
        stale.showTheMathData!.evidenceManifest.snapshot.asOf === SNAPSHOT_AS_OF &&
        stalePrompt.includes('"status": "stale"') &&
        stalePrompt.includes('plaid:item-1'),
      detail: 'Staleness and source quality reach the prompt and remain attached to the evidence manifest.',
    },
    {
      id: 'partial-snapshot-does-not-create-missing-number',
      category: 'missing_data',
      passed: partial.structuredResponse.summary.includes('unavailable') &&
        partialManifest.facts.every(fact => fact.id !== 'total_cash') &&
        partialManifest.validation.deterministic.valid &&
        partialPrompt.includes('"status": "partial"') &&
        partialPrompt.includes('snaptrade'),
      detail: 'A partial snapshot carries its unavailable source and yields no fabricated cash total.',
    },
    {
      id: 'retirement-uses-accumulation-phase-facts',
      category: 'retirement',
      passed: retirementFactIds.includes('projected_portfolio_at_withdrawal_start') &&
        retirementFactIds.includes('years_to_withdrawal_start') &&
        retirementPrompt.includes('Portfolio grows for 20 years before withdrawals begin') &&
        keyNumberValue(retirement, 'withdrawal_rate') === 4 &&
        retirement.showTheMathData!.evidenceManifest.validation.deterministic.valid,
      detail: 'The real pipeline explains deterministic retirement-start facts and carries the accumulation assumption.',
    },
    {
      id: 'retirement-does-not-default-withdrawal',
      category: 'retirement',
      passed: retirementInputs.missingParams.includes('annualWithdrawalAmount') &&
        retirementInputs.annualWithdrawalAmount == null,
      detail: 'Retirement analysis requests a missing withdrawal amount instead of assuming one.',
    },
  ];
}

export async function summarizeAskLincEval(results = runAskLincEvalSet()) {
  const resolvedResults = await results;
  const passed = resolvedResults.filter(result => result.passed).length;
  const categories = Object.fromEntries(
    Array.from(new Set(resolvedResults.map(result => result.category))).map(category => [
      category,
      resolvedResults.filter(result => result.category === category).every(result => result.passed),
    ])
  );
  return {
    passed,
    total: resolvedResults.length,
    score: resolvedResults.length ? passed / resolvedResults.length : 0,
    requiredScore: 1,
    categories,
    results: resolvedResults,
  };
}

if (require.main === module) {
  void summarizeAskLincEval()
    .then(summary => {
      console.log(JSON.stringify(summary, null, 2));
      if (summary.score < summary.requiredScore) process.exitCode = 1;
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}
