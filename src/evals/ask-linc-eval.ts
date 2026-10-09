import { runAskLincAnalysis } from '../openai/analysis-pipeline';
import { resolveRetirementInputs } from '../openai/retirement-inputs';
import type { FinancialContextSnapshot } from '../openai/types';
import { normalizeContextPacks, questionNeedsFromPacks } from '../openai/context-packs';
import type { ContextPlan } from '../openai/context-planner';
import { scenarioCalculatorRegistry } from '../scenarios/calculator-registry';

export type AskLincEvalCategory =
  | 'numerical_accuracy'
  | 'follow_up'
  | 'stale_data'
  | 'missing_data'
  | 'retirement'
  | 'calculator_follow_up';

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
  const followUpPacks = normalizeContextPacks(['investment_details']);
  const followUpPlan: ContextPlan = {
    source: 'context_planner',
    requestedPacks: ['investment_details'],
    selectedPacks: followUpPacks,
    questionNeeds: questionNeedsFromPacks(followUpPacks, true),
    needsSecondaryValidation: true,
    personalDataQuestion: true,
    retirementInputs: { sources: {} },
    scenarioPlans: {},
    searchQueries: [],
    summary: 'The current message continues the portfolio comparison.',
    model: 'offline-context-planner',
    durationMs: 0,
  };
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
      contextPlan: followUpPlan,
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

  // The first follow-up of someone the Coast FIRE calculator sent here: the
  // same question, asked again in Ask Linc, with nothing linked. This used to
  // end on "link an investment account" and told them the calculator's own
  // figures were unconfirmed.
  const coastQuestion = 'Have I reached Coast FIRE? I am 38 now and plan to retire at 55. I have $500,000 ' +
    'in retirement savings and expect to spend $80,000 a year once I stop. I assumed 5% growth a year after ' +
    'inflation and a 4% withdrawal rate.';
  const coastSnapshot = baseSnapshot();
  coastSnapshot.retirementAnalysisNeedsInfo = {
    missingParams: [],
    detectedParams: {},
    unavailableReason: 'No linked investment holdings are available.',
    unavailableCode: 'no_holdings',
  };
  const coastPacks = normalizeContextPacks(['retirement_analysis']);
  const coastStated = { currentAge: 38, retirementAge: 55, currentSavings: 500_000, annualRetirementSpending: 80_000, realReturnRatePercent: 5, withdrawalRatePercent: 4 };
  const coastFields = ['currentAge', 'retirementAge', 'currentSavings', 'annualRetirementSpending', 'annualRetirementIncome', 'realReturnRatePercent', 'withdrawalRatePercent', 'annualContribution'];
  const coastVariant = (values: Record<string, number>) => ({
    overrides: {
      ...Object.fromEntries(coastFields.map(field => [field, values[field] ?? null])),
      sources: Object.fromEntries(coastFields.map(field => [field, values[field] !== undefined ? coastQuestion.slice(0, 60) : null])),
    },
  });
  const coastPlan: ContextPlan = {
    source: 'context_planner',
    requestedPacks: ['retirement_analysis'],
    selectedPacks: coastPacks,
    questionNeeds: questionNeedsFromPacks(coastPacks, true),
    needsSecondaryValidation: true,
    personalDataQuestion: true,
    retirementInputs: { sources: {} },
    scenarioPlans: scenarioCalculatorRegistry.parsePlans({
      coast_fire: { requested: true, primary: coastVariant(coastStated), comparison: coastVariant({}) },
    }),
    searchQueries: [],
    summary: 'A Coast FIRE question from the calculator run that opened this decision.',
    model: 'offline-context-planner',
    durationMs: 0,
  };
  let coastSystemPrompt = '';
  const coastFollowUp = await runAskLincAnalysis({
    question: coastQuestion,
    conversationHistory: [{
      id: 'calculator-first-decision',
      question: coastQuestion,
      answer: 'On the assumptions you entered, not yet. Your Coast FIRE number was $872,593, and you have $500,000.',
      createdAt: new Date('2026-08-14T11:00:00.000Z'),
    }],
    enableValidation: false,
    evaluation: {
      snapshot: coastSnapshot,
      contextPlan: coastPlan,
      skipToneConfig: true,
      model: ({ systemPrompt, userMessage }) => {
        coastSystemPrompt = systemPrompt;
        const factId = /"(coast_fire_scenario_[0-9a-f]+_coast_fire_number)"/.exec(userMessage)?.[1] ?? 'missing';
        return jsonResponse(
          'Not yet on these assumptions: your Coast FIRE number is $872,593 and you have $500,000.',
          { coast_fire_number: { value: 872_593.38, unit: 'usd', provenance: factId } }
        );
      },
    },
  });
  const coastSummary = coastFollowUp.structuredResponse.summary;

  // The same question from someone with nothing linked who has said only when
  // they want to retire:
  // the answer asks for the rest in words and hands the client a form for it,
  // built from the calculator's own fields rather than written by the model.
  const coastAskQuestion = 'Have I reached Coast FIRE? I want to retire at 55.';
  const coastAskVariant = (values: Record<string, number>) => ({
    overrides: {
      ...Object.fromEntries(coastFields.map(field => [field, values[field] ?? null])),
      sources: Object.fromEntries(coastFields.map(field => [field, values[field] !== undefined ? 'retire at 55' : null])),
    },
  });
  const coastAskSnapshot = baseSnapshot();
  coastAskSnapshot.retirementAnalysisNeedsInfo = coastSnapshot.retirementAnalysisNeedsInfo;
  coastAskSnapshot.linkedData = { accounts: 0, cash: 0, credit: 0, loans: 0, investments: 0, holdings: 0, transactionMonths: 0 };
  coastAskSnapshot.financialSummary!.financialOverview = { netWorth: 0, totalCash: 0, totalInvestments: 0, totalDebt: 0, homeValue: null } as any;
  coastAskSnapshot.financialSummary!.investmentPortfolio = { totalValue: 0, holdingCount: 0, securityCount: 0, assetAllocation: [] } as any;
  const coastAsk = await runAskLincAnalysis({
    question: coastAskQuestion,
    enableValidation: false,
    evaluation: {
      snapshot: coastAskSnapshot,
      contextPlan: {
        ...coastPlan,
        scenarioPlans: scenarioCalculatorRegistry.parsePlans({
          coast_fire: { requested: true, primary: coastAskVariant({ retirementAge: 55 }), comparison: coastAskVariant({}) },
        }),
      },
      skipToneConfig: true,
      model: () => jsonResponse('Coast FIRE means having enough invested now that growth alone reaches your target by 55.'),
    },
  });
  const coastAskForm = coastAsk.structuredResponse.input_request;

  // Assumptions are allowed, but only from something real: with no cash flow
  // linked and no earlier figure, there is nothing to read spending from.
  const retirementInputs = resolveRetirementInputs({
    questionParams: { retirementAge: 65 } as any,
    profileAge: 45,
    profileRetirementAge: null,
    assumeWhenMissing: { currentAnnualSpending: null },
  });
  const assumedRetirementInputs = resolveRetirementInputs({
    questionParams: {} as any,
    profileAge: 45,
    profileRetirementAge: null,
    assumeWhenMissing: { currentAnnualSpending: 66_000 },
  });

  // Someone with nothing linked asking about their own money: an answer, not
  // "your net worth is $0", and a closing note on what linking would change.
  const unlinkedSnapshot = baseSnapshot();
  unlinkedSnapshot.linkedData = { accounts: 0, cash: 0, credit: 0, loans: 0, investments: 0, holdings: 0, transactionMonths: 0 };
  unlinkedSnapshot.accounts = [];
  unlinkedSnapshot.financialSummary!.financialOverview = { netWorth: 0, totalCash: 0, totalInvestments: 0, totalDebt: 0, homeValue: null } as any;
  unlinkedSnapshot.financialSummary!.investmentPortfolio = { totalValue: 0, holdingCount: 0, securityCount: 0, assetAllocation: [] } as any;
  const unlinkedPlan: ContextPlan = {
    ...followUpPlan,
    requestedPacks: [],
    selectedPacks: [],
    questionNeeds: questionNeedsFromPacks([], false),
    needsSecondaryValidation: false,
    personalDataQuestion: true,
    summary: 'A question about the user\'s own net worth.',
  };
  let unlinkedPrompt = '';
  const unlinked = await runAskLincAnalysis({
    question: 'How is my net worth looking? I have about $40,000 in savings and $15,000 on a car loan.',
    enableValidation: false,
    evaluation: {
      snapshot: unlinkedSnapshot,
      contextPlan: unlinkedPlan,
      skipToneConfig: true,
      model: ({ userMessage }) => {
        unlinkedPrompt = userMessage;
        return jsonResponse(
          'From what you told me, you have $40,000 in savings against a $15,000 car loan, so you are comfortably ahead.'
        );
      },
    },
  });
  const unlinkedFactIds = unlinked.showTheMathData!.evidenceManifest.facts.map(fact => fact.id);

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
      passed: followUpPlan.questionNeeds.needsInvestments && followUpPlan.questionNeeds.needsAccountDetails &&
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
      id: 'calculator-follow-up-answers-without-linked-holdings',
      category: 'calculator_follow_up',
      passed: keyNumberValue(coastFollowUp, 'coast_fire_number') === 872_593.38 &&
        coastFollowUp.showTheMathData!.evidenceManifest.validation.deterministic.valid &&
        coastSummary.includes('Coast FIRE assumptions: 5% a year after inflation') &&
        coastSummary.includes('The market-history test ran the Balanced preset') &&
        coastFollowUp.showTheMathData!.evidenceManifest.facts.some(fact => fact.id.endsWith('_history_survival_rate')) &&
        coastSummary.endsWith('get modeled against their own returns.') &&
        !coastSummary.includes('I could not run') &&
        coastSystemPrompt.includes('Never tell the user that a figure in an earlier answer is unverified'),
      detail: 'A calculator lead with nothing linked gets the deterministic answer, a market-history test on a preset mix, and what linking would add -- not a refusal.',
    },
    {
      id: 'calculator-asks-for-missing-figures-with-a-form',
      category: 'calculator_follow_up',
      passed: coastAsk.structuredResponse.summary.includes('To work out your Coast FIRE number I need your current age') &&
        coastAskForm?.calculatorId === 'coast_fire' &&
        JSON.stringify(coastAskForm.fields.filter(field => field.required).map(field => field.id)) ===
          JSON.stringify(['currentAge', 'currentSavings', 'annualRetirementSpending']) &&
        coastAskForm.fields.some(field => field.id === 'retirementAge' && field.value === 55) &&
        !coastAsk.showTheMathData!.evidenceManifest.facts.some(fact => fact.id.endsWith('_coast_fire_number')),
      detail: 'A Coast FIRE question missing figures runs nothing, asks for them in words, and carries a form for exactly those, with the retirement age already stated filled in.',
    },
    {
      id: 'retirement-never-invents-spending',
      category: 'retirement',
      passed: retirementInputs.missingParams.includes('annualWithdrawalAmount') &&
        retirementInputs.annualWithdrawalAmount == null,
      detail: 'With no earlier figure and no linked cash flow, no retirement spending level is invented.',
    },
    {
      id: 'retirement-assumes-current-spending-and-says-so',
      category: 'retirement',
      passed: assumedRetirementInputs.annualWithdrawalAmount === 66_000 &&
        assumedRetirementInputs.retirementAge === 65 &&
        assumedRetirementInputs.missingParams.length === 0 &&
        assumedRetirementInputs.assumed.annualWithdrawalAmount === 'current_spending' &&
        assumedRetirementInputs.assumed.retirementAge === 'convention',
      detail: 'Missing retirement inputs are filled from current spending and the conventional age, and marked as assumptions.',
    },
    {
      id: 'unlinked-user-gets-an-answer-not-a-zero',
      category: 'missing_data',
      passed: !unlinkedFactIds.includes('net_worth') &&
        !unlinkedFactIds.includes('total_cash') &&
        unlinkedFactIds.some(fact => fact.startsWith('user_input_usd_')) &&
        unlinkedPrompt.includes('The user has not linked any accounts yet.') &&
        unlinked.showTheMathData!.evidenceManifest.validation.deterministic.valid &&
        unlinked.structuredResponse.summary.includes('$40,000 in savings') &&
        unlinked.structuredResponse.summary.endsWith('and what you hold.'),
      detail: 'Nothing linked: no $0 balances are offered as facts, the answer works from the user\'s own figures, and it closes on what linking would change.',
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
