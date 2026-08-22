import { runAskLincAnalysis, selectValidationFeedback } from '../../openai/analysis-pipeline';
import { UNVERIFIED_PROSE_NOTICE } from '../../openai/response-facts';
import { SECONDARY_REVIEW_CAVEAT } from '../../openai/response-grounding';
import { completeRetirementAnalysis, gatherContextSnapshot } from '../../openai/context-service';
import { askClaude } from '../../openai/claude-client';
import { auditDataPacksWithClaude } from '../../openai/claude-client';
import { validateWithGemini } from '../../openai/response-validator';
import { askOpenAIWithPreparedPrompt } from '../../openai/openai-fallback-client';
import { planContext, type ContextPlan } from '../../openai/context-planner';
import { normalizeContextPacks, questionNeedsFromPacks, type ContextPackId } from '../../openai/context-packs';
import { scenarioCalculatorRegistry } from '../../scenarios/calculator-registry';
import { runHomeAffordabilityScenario } from '../../scenarios/home-affordability-scenario';

jest.mock('../../openai/context-service', () => ({
  gatherContextSnapshot: jest.fn(),
  completeRetirementAnalysis: jest.fn(),
}));
jest.mock('../../openai/claude-client', () => ({
  askClaude: jest.fn(),
  askClaudeStream: jest.fn(),
  auditDataPacksWithClaude: jest.fn(),
}));
jest.mock('../../openai/context-planner', () => ({
  ...jest.requireActual('../../openai/context-planner'),
  planContext: jest.fn(),
}));
jest.mock('../../openai/prompt-config', () => ({
  getActiveResponseTone: jest.fn(() => 'Be concise.'),
  loadResponseToneConfig: jest.fn(async () => undefined),
}));
jest.mock('../../openai/response-validator', () => ({
  validateWithGemini: jest.fn(async () => ({ valid: true, issues: [] })),
}));
jest.mock('../../openai/openai-fallback-client', () => ({
  askOpenAIWithPreparedPrompt: jest.fn(),
}));
const mockedGatherContext = gatherContextSnapshot as jest.MockedFunction<typeof gatherContextSnapshot>;
const mockedCompleteRetirement = completeRetirementAnalysis as jest.MockedFunction<typeof completeRetirementAnalysis>;
const mockedAskClaude = askClaude as jest.MockedFunction<typeof askClaude>;
const mockedAuditPacks = auditDataPacksWithClaude as jest.MockedFunction<typeof auditDataPacksWithClaude>;
const mockedPlanContext = planContext as jest.MockedFunction<typeof planContext>;
const mockedValidateWithGemini = validateWithGemini as jest.MockedFunction<typeof validateWithGemini>;
const mockedAskOpenAI = askOpenAIWithPreparedPrompt as jest.MockedFunction<typeof askOpenAIWithPreparedPrompt>;
const mockedExecuteScenario = jest.spyOn(scenarioCalculatorRegistry, 'execute');

function snapshot() {
  return {
    accounts: [],
    bankingTransactions: [],
    metadata: {
      lastUpdated: new Date('2026-08-14T00:00:00.000Z'),
      dataSources: {},
      errors: [],
    },
    tierContext: {
      tierInfo: { currentTier: 'starter', availableSources: [] },
      upgradeHints: [],
      marketContext: {},
    },
    contextSelection: {
      accountsIncluded: false,
      transactionDetailsIncluded: false,
      investmentDetailsIncluded: false,
      marketContextRequested: false,
      searchContextRequested: false,
    },
    financialSummary: {
      financialOverview: {
        netWorth: 100,
        totalCash: 80,
        totalInvestments: 20,
        totalDebt: 0,
        homeValue: null,
      },
    },
  } as any;
}

function cachedRetirementAnalysis() {
  return {
    summary: {
      characteristics: {
        growthPotential: 'moderate',
        drawdownResistance: 'moderate',
        withdrawalFragility: 'moderate',
        inflationProtection: 'moderate',
      },
      tradeoffs: { upside: 'Growth', downside: 'Volatility' },
      primaryObservation: 'A cached projection exists.',
      confidence: 'medium',
      timelineBucket: '20',
      timelineBucketNote: 'Twenty-year horizon.',
    },
    metrics: {
      withdrawalRate: 0.04,
      equityAllocation: 70,
      yearsOfExpenses: 25,
      historicalWithdrawalRates: {
        p10: 0.03,
        p25: 0.035,
        p50: 0.04,
        p75: 0.045,
        p90: 0.05,
      },
    },
    stressTest: {
      survivalRate: 0.9,
      totalSequences: 100,
      depletionPercentiles: { p10: 12, p25: 18, p50: 25, p75: 30, p90: 35 },
      worstSequences: { byDepletion: [], byDrawdown: [], byRecovery: [] },
    },
    historicalImplications: [],
    dataQuality: {
      completeness: 1,
      priceHistoryCoverage: 1,
      metadataConfidence: 'high',
      portfolioMappingConfidence: 'high',
      proxiedValuePercentage: 0,
      proxyUsage: {
        usEquityProxy: 'SPY',
        internationalEquityProxy: 'VXUS',
        bondsProxy: 'BND',
        unmappedHoldings: [],
        mappingMethod: 'direct',
      },
      assumptions: [],
      missingData: [],
    },
    disclaimers: [],
    _storedInputParams: {
      annualWithdrawalAmount: 120_000,
      retirementAge: 65,
      currentAge: 45,
    },
  };
}

function contextPlan(packs: ContextPackId[] = [], secondary = false): ContextPlan {
  const selectedPacks = normalizeContextPacks(packs);
  return {
    source: 'context_planner',
    requestedPacks: packs,
    selectedPacks,
    questionNeeds: questionNeedsFromPacks(selectedPacks, secondary),
    needsSecondaryValidation: secondary,
    retirementInputs: { sources: {} },
    scenarioPlans: {},
    searchQueries: packs.includes('search_context')
      ? [{ query: 'current public financial information', purpose: 'other', freshness: 'pm' }]
      : [],
    summary: 'Test plan.',
    model: 'test-planner',
    durationMs: 1,
  };
}

describe('runAskLincAnalysis validation routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGatherContext.mockResolvedValue(snapshot());
    mockedCompleteRetirement.mockImplementation(async (current) => current);
    mockedAskOpenAI.mockResolvedValue(JSON.stringify({ summary: 'Fallback answer.' }));
    mockedPlanContext.mockImplementation(async ({ question }) =>
      question.toLowerCase().includes('retir')
        ? contextPlan(['retirement_analysis'], true)
        : question.toLowerCase().includes('evaluate my spending')
          ? contextPlan(['transaction_details', 'retirement_analysis'], true)
          : contextPlan()
    );
    mockedAuditPacks.mockResolvedValue({
      packs: [],
      searchQueries: [],
      scenarioPlans: {},
      reason: 'Enough context.',
      model: 'claude-test',
      durationMs: 1,
    });
  });

  it('skips the secondary model for a grounded balance lookup', async () => {
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your net worth is $100.',
      key_numbers: { net_worth: 100 },
      insights: [],
      suggested_actions: [],
    }));

    await runAskLincAnalysis({
      question: 'What is my net worth?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(mockedAskClaude).toHaveBeenCalledTimes(1);
    expect(mockedValidateWithGemini).not.toHaveBeenCalled();
  });

  it('uses the secondary model for complex retirement analysis', async () => {
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Here is the retirement scenario.',
      insights: [],
      suggested_actions: [],
    }));

    await runAskLincAnalysis({
      question: 'Am I on track for retirement?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(mockedValidateWithGemini).toHaveBeenCalledTimes(1);
  });

  it('lets the primary model widen the preflight plan before it writes the answer', async () => {
    mockedAuditPacks.mockResolvedValue({
      packs: ['investment_details'],
      scenarioPlans: {},
      searchQueries: [],
      reason: 'The comparison needs individual holdings.',
      model: 'claude-test',
      durationMs: 7,
    });
    mockedGatherContext
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce({
        ...snapshot(),
        contextSelection: {
          ...snapshot().contextSelection,
          accountsIncluded: true,
          investmentDetailsIncluded: true,
        },
      } as any);
    mockedAskClaude.mockResolvedValue(JSON.stringify({ summary: 'I reviewed the holding details.' }));

    const result = await runAskLincAnalysis({
      question: 'Compare the two options we discussed.',
      userId: 'user-1',
    });

    expect(mockedGatherContext).toHaveBeenCalledTimes(2);
    expect(mockedGatherContext.mock.calls[1][0].questionNeeds).toMatchObject({
      needsAccountDetails: true,
      needsInvestments: true,
    });
    expect(mockedAskClaude).toHaveBeenCalledTimes(1);
    expect(result.showTheMathData?.evidenceManifest.contextPlanning).toMatchObject({
      selectedPacks: [],
      finalPacks: ['account_details', 'investment_details'],
      primaryTool: {
        outcome: 'expanded',
        requestedPacks: ['investment_details'],
        addedPacks: ['account_details', 'investment_details'],
      },
    });
    expect(result.showTheMathData?.evidenceManifest.contextToolExpanded).toBe(true);
    expect(result.showTheMathData?.evidenceManifest.timings.contextToolMs).toBe(7);
  });

  it('reloads typed market context when the audit discovers a home calculator', async () => {
    const preflight = contextPlan(['market_context']);
    mockedPlanContext.mockResolvedValue(preflight);
    mockedAuditPacks.mockResolvedValue({
      packs: [],
      searchQueries: [],
      scenarioPlans: {
        home_affordability: {
          requested: true,
          primary: {
            overrides: {
              homePrice: 700_000,
              sources: { homePrice: '$700,000 home' },
            },
          },
        },
      },
      reason: 'The question asks for a target-home scenario.',
      model: 'claude-test',
      durationMs: 2,
    });
    mockedGatherContext
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce({
        ...snapshot(),
        tierContext: {
          ...snapshot().tierContext,
          marketContext: {
            economicIndicators: {
              mortgageRate: {
                value: 6.5,
                date: '2026-08-20',
                source: 'FRED',
                lastUpdated: '2026-08-20T00:00:00.000Z',
              },
            },
          },
        },
      } as any);
    mockedExecuteScenario.mockResolvedValueOnce({
      version: 1,
      calculator: 'home_affordability',
      status: 'unavailable',
      computedAt: '2026-08-20T00:00:00.000Z',
      durationMs: 1,
      reason: 'Test execution is not part of context routing.',
    });
    mockedAskClaude.mockResolvedValue(JSON.stringify({ summary: 'I checked the target-home scenario.' }));

    await runAskLincAnalysis({
      question: 'Would that home work?',
      userId: 'user-1',
    });

    expect(mockedGatherContext).toHaveBeenCalledTimes(2);
    expect(mockedGatherContext.mock.calls[0][0].includeStructuredMarketContext).toBe(false);
    expect(mockedGatherContext.mock.calls[1][0]).toMatchObject({
      includeStructuredMarketContext: true,
      questionNeeds: expect.objectContaining({ needsMarketContext: true }),
    });
  });

  it('keeps preflight scenario overrides out of the baseline gather and focused completion', async () => {
    const plan = contextPlan(['retirement_analysis'], true);
    plan.retirementInputs = {
      currentAge: 50,
      retirementAge: 65,
      annualWithdrawalAmount: 50_000,
      withdrawalStartAge: 65,
      sources: {
        currentAge: 'I am 50',
        retirementAge: 'retire at 65',
        annualWithdrawalAmount: 'spend $50,000',
        withdrawalStartAge: 'retire at 65',
      },
    };
    plan.scenarioPlans.retirement = {
      requested: true,
      primary: {
        type: 'historical_cpi',
        overrides: {
          retirementAge: 65,
          annualWithdrawalAmount: 50_000,
          withdrawalStartAge: 65,
          sources: {
            retirementAge: 'retire at 65',
            annualWithdrawalAmount: 'spend $50,000',
            withdrawalStartAge: 'retire at 65',
          },
        },
      },
    };
    mockedPlanContext.mockResolvedValue(plan);
    mockedExecuteScenario.mockResolvedValue({
      version: 2,
      calculator: 'retirement',
      status: 'unavailable',
      computedAt: '2026-08-17T00:00:00.000Z',
      durationMs: 1,
      reason: 'Test baseline unavailable.',
    } as any);
    mockedAskClaude.mockResolvedValue(JSON.stringify({ summary: 'I could not run the scenario.' }));

    await runAskLincAnalysis({
      question: 'What if I retire at 65 and spend $50,000?',
      userId: 'user-1',
    });

    expect(mockedGatherContext).toHaveBeenCalledTimes(1);
    expect(mockedGatherContext.mock.calls[0][0].plannedRetirementInputs).toEqual({
      currentAge: 50,
      sources: { currentAge: 'I am 50' },
    });
    expect(mockedGatherContext.mock.calls[0][0]).toMatchObject({
      deferRetirementAnalysis: true,
      useExistingRetirementBaseline: true,
    });
    expect(mockedCompleteRetirement).toHaveBeenCalledTimes(1);
    expect(mockedCompleteRetirement.mock.calls[0][1]).toMatchObject({
      useExistingRetirementBaseline: true,
      plannedRetirementInputs: {
        currentAge: 50,
        sources: { currentAge: 'I am 50' },
      },
    });
  });

  it('waits for the primary audit to refine semantic queries before retrieving search evidence', async () => {
    const preflight = contextPlan(['search_context']);
    preflight.searchQueries = [{
      query: 'current public financial information',
      purpose: 'other',
      freshness: 'pm',
    }];
    const refinedQueries = [{
      query: 'current Federal Reserve target interest rate',
      purpose: 'rate' as const,
      freshness: 'pm' as const,
    }];
    mockedPlanContext.mockResolvedValue(preflight);
    mockedAuditPacks.mockResolvedValue({
      packs: [],
      searchQueries: refinedQueries,
      scenarioPlans: {},
      reason: 'The standalone query clarifies the follow-up.',
      model: 'claude-test',
      durationMs: 3,
    });
    mockedGatherContext
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce({
        ...snapshot(),
        searchContext: 'Federal Reserve evidence.',
        searchContextMetadata: {
          queries: refinedQueries,
          cacheHits: 0,
          providerCalls: 1,
          resultCount: 4,
          retrievedAt: '2026-08-17T00:00:00.000Z',
        },
        contextSelection: {
          ...snapshot().contextSelection,
          searchContextRequested: true,
        },
      } as any);
    mockedAskClaude.mockResolvedValue(JSON.stringify({ summary: 'Here is the current public rate context.' }));

    const result = await runAskLincAnalysis({
      question: 'What is it now?',
      conversationHistory: [{
        id: 'turn-1',
        question: 'How does the Federal Reserve target rate affect savings?',
        answer: 'We can compare it with the current target rate.',
        createdAt: new Date('2026-08-16T00:00:00.000Z'),
      }],
      userId: 'user-1',
      userTier: 'standard',
    });

    expect(mockedGatherContext).toHaveBeenCalledTimes(2);
    expect(mockedGatherContext.mock.calls[0][0]).toMatchObject({
      deferSearchContext: true,
      searchQueries: preflight.searchQueries,
    });
    expect(mockedAuditPacks).toHaveBeenCalledWith(expect.objectContaining({
      plannedSearchQueries: preflight.searchQueries,
    }));
    expect(mockedGatherContext.mock.calls[1][0]).toMatchObject({ searchQueries: refinedQueries });
    expect(mockedGatherContext.mock.calls[1][0].deferSearchContext).toBeUndefined();
    expect(result.showTheMathData?.evidenceManifest.evidenceRefs.search).toMatchObject({
      queries: refinedQueries,
      providerCalls: 1,
      resultCount: 4,
    });
  });

  it('recovers deferred search retrieval when the primary widen gather fails', async () => {
    const preflight = contextPlan(['search_context']);
    mockedPlanContext.mockResolvedValue(preflight);
    mockedAuditPacks.mockResolvedValue({
      packs: ['transaction_details'],
      searchQueries: preflight.searchQueries,
      scenarioPlans: {},
      reason: 'Also need spending detail.',
      model: 'claude-test',
      durationMs: 2,
    });
    mockedGatherContext
      .mockResolvedValueOnce(snapshot())
      .mockRejectedValueOnce(new Error('temporary widen failure'))
      .mockResolvedValueOnce({
        ...snapshot(),
        searchContext: 'Recovered search evidence.',
        searchContextMetadata: {
          queries: preflight.searchQueries,
          cacheHits: 0,
          providerCalls: 1,
          resultCount: 2,
          retrievedAt: '2026-08-17T00:00:00.000Z',
        },
        contextSelection: {
          ...snapshot().contextSelection,
          searchContextRequested: true,
        },
      } as any);
    mockedAskClaude.mockResolvedValue(JSON.stringify({ summary: 'Answered with recovered search evidence.' }));

    const result = await runAskLincAnalysis({
      question: 'What is the current public rate?',
      userId: 'user-1',
      userTier: 'standard',
    });

    expect(mockedGatherContext).toHaveBeenCalledTimes(3);
    expect(mockedGatherContext.mock.calls[2][0]).toMatchObject({
      searchQueries: preflight.searchQueries,
    });
    expect(result.showTheMathData?.evidenceManifest.contextPlanning?.primaryTool?.outcome).toBe('failed');
    expect(result.showTheMathData?.evidenceManifest.evidenceRefs.search).toMatchObject({
      queries: preflight.searchQueries,
      providerCalls: 1,
      resultCount: 2,
    });
  });

  it('defers baseline persistence when the primary audit discovers the scenario', async () => {
    const plan = contextPlan(['retirement_analysis'], true);
    plan.retirementInputs = {
      currentAge: 50,
      retirementAge: 65,
      annualWithdrawalAmount: 50_000,
      withdrawalStartAge: 65,
      sources: {
        currentAge: 'I am 50',
        retirementAge: 'retire at 65',
        annualWithdrawalAmount: 'spend $50,000',
        withdrawalStartAge: 'retire at 65',
      },
    };
    mockedPlanContext.mockResolvedValue(plan);
    mockedAuditPacks.mockResolvedValue({
      packs: [],
      searchQueries: [],
      scenarioPlans: {
        retirement: {
          requested: true,
          primary: {
            type: 'historical_cpi',
            overrides: {
              retirementAge: 65,
              annualWithdrawalAmount: 50_000,
              withdrawalStartAge: 65,
              sources: {
                retirementAge: 'retire at 65',
                annualWithdrawalAmount: 'spend $50,000',
                withdrawalStartAge: 'retire at 65',
              },
            },
          },
        },
      },
      reason: 'This is a retirement scenario.',
      model: 'claude-test',
      durationMs: 2,
    });
    mockedExecuteScenario.mockResolvedValue({
      version: 2,
      calculator: 'retirement',
      status: 'unavailable',
      computedAt: '2026-08-17T00:00:00.000Z',
      durationMs: 1,
      reason: 'Test baseline unavailable.',
    } as any);
    mockedAskClaude.mockResolvedValue(JSON.stringify({ summary: 'I could not run the scenario.' }));

    await runAskLincAnalysis({
      question: 'What if I retire at 65 and spend $50,000?',
      userId: 'user-1',
    });

    expect(mockedGatherContext).toHaveBeenCalledTimes(1);
    expect(mockedGatherContext.mock.calls[0][0]).toMatchObject({
      deferRetirementAnalysis: true,
      plannedRetirementInputs: expect.objectContaining({
        retirementAge: 65,
        annualWithdrawalAmount: 50_000,
      }),
    });
    expect(mockedCompleteRetirement).toHaveBeenCalledTimes(1);
    expect(mockedCompleteRetirement.mock.calls[0][1]).toMatchObject({
      useExistingRetirementBaseline: true,
      plannedRetirementInputs: {
        currentAge: 50,
        sources: { currentAge: 'I am 50' },
      },
    });
  });

  it('answers a scenario comparison from deterministic scenario facts', async () => {
    const plan = contextPlan(['retirement_analysis']);
    plan.scenarioPlans.retirement = {
      requested: true,
      primary: { type: 'fixed_growth', annualRate: 0.03, source: '3% bump' },
      comparison: { type: 'flat_nominal', source: 'flat version' },
    };
    const scenarioAnalysis = (survivalRate: number) => ({
      metrics: {
        withdrawalRate: 0.04,
        yearsOfExpenses: 25,
        projectedPortfolioAtWithdrawalStart: 1_000_000,
      },
      stressTest: {
        survivalRate,
        totalSequences: 100,
        depletionPercentiles: { p10: 12, p25: 18, p50: 24, p75: 28, p90: 30 },
      },
    } as any);
    const scenarioExecution = {
      version: 1 as const,
      calculator: 'retirement' as const,
      status: 'completed' as const,
      computedAt: '2026-08-17T00:00:00.000Z',
      durationMs: 12,
      baselineScenarioId: 'baseline',
      scenarios: [{
        id: 'fixed',
        label: '3% annual withdrawal growth',
        withdrawalPolicy: { type: 'fixed_growth' as const, annualRate: 0.03 },
        assumptions: [{ key: 'annual_growth_rate', label: 'Growth', value: 0.03, origin: 'user' as const }],
        analysis: scenarioAnalysis(0.75),
        reusedBaseline: false,
      }, {
        id: 'flat',
        label: 'Flat nominal withdrawals',
        withdrawalPolicy: { type: 'flat_nominal' as const },
        assumptions: [],
        analysis: scenarioAnalysis(0.95),
        reusedBaseline: false,
      }],
    };

    const result = await runAskLincAnalysis({
      question: 'Compare a 3% annual bump with the flat-dollar version.',
      evaluation: {
        snapshot: snapshot(),
        contextPlan: plan,
        scenarioPlans: plan.scenarioPlans,
        scenarioExecutions: { retirement: scenarioExecution },
        skipToneConfig: true,
        model: ({ userMessage }) => {
          expect(userMessage).toContain('retirement_scenario_fixed_survival_rate');
          expect(userMessage).toContain('retirement_scenario_flat_survival_rate');
          return JSON.stringify({
            summary: 'The fixed-growth scenario survived 75% of historical sequences versus 95% for the flat scenario.',
            key_numbers: {
              fixed_survival: {
                value: 75,
                unit: 'percent',
                provenance: 'retirement_scenario_fixed_survival_rate',
              },
              flat_survival: {
                value: 95,
                unit: 'percent',
                provenance: 'retirement_scenario_flat_survival_rate',
              },
            },
            insights: [],
            suggested_actions: [],
          });
        },
      },
    });

    expect(result.showTheMathData?.evidenceManifest.validation.deterministic.valid).toBe(true);
    expect(result.showTheMathData?.evidenceManifest.scenarioExecutions).toMatchObject({
      retirement: {
        status: 'completed',
        scenarios: [{ metrics: { survivalRate: 0.75 } }, { metrics: { survivalRate: 0.95 } }],
      },
    });
    expect(result.showTheMathData?.evidenceManifest.timings.scenarioMs).toBe(12);
    expect(result.structuredResponse.summary).toContain('Scenario assumptions:');
  });

  it('runs a home-affordability plan through canonical facts and Show the Math', async () => {
    const plan = contextPlan(['market_context'], true);
    plan.scenarioPlans.home_affordability = {
      requested: true,
      primary: {
        overrides: {
          homePrice: 700_000,
          downPaymentPercent: 20,
          mortgageRatePercent: 6.5,
          propertyTaxAnnual: 8_400,
          homeownersInsuranceAnnual: 2_400,
          hoaMonthly: 0,
          mortgageInsuranceMonthly: 0,
          currentHousingCostMonthly: 2_500,
          sources: {
            homePrice: '$700,000 home',
            downPaymentPercent: '20% down',
            mortgageRatePercent: '6.5% mortgage',
            propertyTaxAnnual: '$8,400 taxes',
            homeownersInsuranceAnnual: '$2,400 insurance',
            hoaMonthly: 'no HOA',
            mortgageInsuranceMonthly: 'no PMI',
            currentHousingCostMonthly: '$2,500 rent',
          },
        },
      },
    };
    const homeSnapshot = {
      ...snapshot(),
      averageMonthlyIncome: 15_000,
      averageMonthlyExpense: 8_000,
      financialSummary: {
        ...snapshot().financialSummary,
        financialOverview: {
          netWorth: 1_000_000,
          totalCash: 300_000,
          totalInvestments: 800_000,
          totalDebt: 100_000,
          homeValue: null,
        },
      },
    } as any;
    mockedExecuteScenario.mockImplementationOnce(async (_id, currentSnapshot, scenarioPlan) =>
      runHomeAffordabilityScenario(currentSnapshot, scenarioPlan as any)
    );

    const result = await runAskLincAnalysis({
      question: 'Can we afford a $700,000 home with 20% down?',
      evaluation: {
        snapshot: homeSnapshot,
        contextPlan: plan,
        scenarioPlans: plan.scenarioPlans,
        skipToneConfig: true,
        model: ({ userMessage }) => {
          expect(userMessage).toContain('all_in_monthly_housing_cost');
          expect(userMessage).toContain('post_purchase_monthly_surplus');
          return JSON.stringify({
            summary: 'The modeled purchase keeps monthly operating cash flow positive and the emergency reserve above its target.',
            insights: [],
            suggested_actions: [],
          });
        },
      },
    });

    expect(result.showTheMathData?.evidenceManifest.scenarioExecutions).toMatchObject({
      home_affordability: {
        status: 'completed',
        scenarios: [{ assessment: 'supported', costCoverage: 'complete' }],
      },
    });
    expect(result.showTheMathData?.evidenceManifest.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: expect.stringMatching(/home_affordability_scenario_.*_all_in_monthly_housing_cost/),
        provenance: expect.objectContaining({ calculatorId: 'home_affordability' }),
      }),
      expect.objectContaining({
        id: expect.stringMatching(/home_affordability_scenario_.*_cash_remaining/),
        value: 139_000,
      }),
    ]));
    expect(result.structuredResponse.summary).toContain('Home-affordability assumptions:');
    expect(result.showTheMathData?.evidenceManifest.validation.deterministic.valid).toBe(true);
  });

  it('keeps scenario facts after late context escalation replaces the snapshot', async () => {
    const plan = contextPlan(['retirement_analysis']);
    plan.scenarioPlans.retirement = {
      requested: true,
      primary: { type: 'flat_nominal', source: 'flat-dollar version' },
    };
    mockedPlanContext.mockResolvedValue(plan);
    mockedAuditPacks.mockResolvedValue({
      packs: [],
      scenarioPlans: {},
      searchQueries: [],
      reason: 'Retirement scenario already planned.',
      model: 'test-claude',
      durationMs: 1,
    });
    mockedExecuteScenario.mockResolvedValue({
      version: 1,
      calculator: 'retirement',
      status: 'completed',
      computedAt: '2026-08-17T00:00:00.000Z',
      durationMs: 9,
      baselineScenarioId: 'baseline',
      scenarios: [{
        id: 'flat',
        label: 'Flat nominal withdrawals',
        withdrawalPolicy: { type: 'flat_nominal' },
        assumptions: [
          { key: 'annual_withdrawal_amount', label: 'Spending', value: 40_000, origin: 'inherited' },
          { key: 'current_age', label: 'Current age', value: 50, origin: 'inherited' },
          { key: 'retirement_age', label: 'Retirement age', value: 60, origin: 'inherited' },
          { key: 'life_expectancy', label: 'Life expectancy', value: 95, origin: 'inherited' },
        ],
        analysis: {
          metrics: {
            withdrawalRate: 0.04,
            yearsOfExpenses: 25,
            projectedPortfolioAtWithdrawalStart: 1_000_000,
          },
          stressTest: {
            survivalRate: 0.95,
            totalSequences: 100,
            depletionPercentiles: { p10: 12, p25: 18, p50: 24, p75: 28, p90: 30 },
          },
        },
        reusedBaseline: false,
      }],
    } as any);
    mockedGatherContext
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot());
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your largest holding is worth $250,000 under the flat scenario.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'The flat-dollar scenario survived 95% of historical sequences.',
        key_numbers: {
          flat_survival: {
            value: 95,
            unit: 'percent',
            provenance: 'retirement_scenario_flat_survival_rate',
          },
        },
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({
      question: 'Compare a flat-dollar retirement withdrawal plan.',
      userId: 'user-1',
    });

    expect(mockedGatherContext).toHaveBeenCalledTimes(2);
    expect(mockedGatherContext.mock.calls[0][0].deferRetirementAnalysis).toBe(true);
    expect(mockedCompleteRetirement).toHaveBeenCalledTimes(1);
    expect(mockedGatherContext.mock.calls[1][0].deferRetirementAnalysis).toBeUndefined();
    expect(mockedExecuteScenario).toHaveBeenCalledTimes(1);
    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
    expect(result.showTheMathData?.evidenceManifest.facts).toContainEqual(
      expect.objectContaining({ id: 'retirement_scenario_flat_survival_rate', value: 95 })
    );
    expect(result.showTheMathData?.evidenceManifest.scenarioExecutions).toMatchObject({
      retirement: { status: 'completed', scenarios: [{ id: 'flat' }] },
    });
    expect(result.structuredResponse.summary).toContain('Scenario assumptions:');
    expect(result.showTheMathData?.evidenceManifest.validation.deterministic.valid).toBe(true);
  });

  it('records a failed primary-model pack audit without failing the answer', async () => {
    mockedAuditPacks.mockRejectedValue(new Error('tool unavailable'));
    mockedAskClaude.mockResolvedValue(JSON.stringify({ summary: 'Your net worth is $100.' }));

    const result = await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1' });

    expect(mockedGatherContext).toHaveBeenCalledTimes(1);
    expect(mockedAskClaude).toHaveBeenCalledTimes(1);
    expect(result.showTheMathData?.evidenceManifest.contextPlanning?.primaryTool).toMatchObject({
      outcome: 'failed',
      requestedPacks: [],
      addedPacks: [],
    });
  });

  it('finishes a deferred retirement baseline when the primary audit fails', async () => {
    const plan = contextPlan(['retirement_analysis'], true);
    plan.retirementInputs = {
      currentAge: 50,
      retirementAge: 60,
      annualWithdrawalAmount: 40_000,
      withdrawalStartAge: 60,
      sources: {},
    };
    mockedPlanContext.mockResolvedValue(plan);
    mockedAuditPacks.mockRejectedValue(new Error('tool unavailable'));
    mockedAskClaude.mockResolvedValue(JSON.stringify({ summary: 'Your retirement baseline is available.' }));

    await runAskLincAnalysis({ question: 'Review my retirement plan.', userId: 'user-1' });

    expect(mockedGatherContext).toHaveBeenCalledTimes(1);
    expect(mockedGatherContext.mock.calls[0][0].deferRetirementAnalysis).toBe(true);
    expect(mockedCompleteRetirement).toHaveBeenCalledTimes(1);
    expect(mockedCompleteRetirement.mock.calls[0][1]).toMatchObject({
      plannedRetirementInputs: plan.retirementInputs,
    });
  });

  it('retries a canonical-number mismatch before invoking another model', async () => {
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $999.',
        key_numbers: { net_worth: 999 },
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        key_numbers: { net_worth: 100 },
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({
      question: 'What is my net worth?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(mockedAskClaude).toHaveBeenCalledTimes(2);
    expect(mockedValidateWithGemini).not.toHaveBeenCalled();
    expect(result.structuredResponse.key_numbers).toEqual({
      net_worth: { value: 100, unit: 'usd', provenance: 'net_worth', provenanceLabel: 'Net worth' },
    });
  });

  it('does not return an ungrounded summary when the retry is still wrong', async () => {
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your net worth is $999.',
      insights: ['This is also based on $999.'],
      suggested_actions: ['Act on the incorrect result.'],
    }));

    const result = await runAskLincAnalysis({
      question: 'What is my net worth?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(mockedAskClaude).toHaveBeenCalledTimes(2);
    expect(result.structuredResponse).toEqual({
      summary: 'I could not verify the generated answer against your current financial snapshot. Please try the question again.',
      key_numbers: undefined,
      insights: [],
      suggested_actions: [],
    });
  });

  it('keeps the verified part of an answer when the retry is only partly wrong', async () => {
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your net worth is $100. You should also expect $999 next year.',
      insights: ['Cash is $80.'],
      suggested_actions: ['Move $999 into savings.'],
    }));

    const result = await runAskLincAnalysis({
      question: 'What is my net worth?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(result.structuredResponse.summary).toBe(`Your net worth is $100.\n\n${UNVERIFIED_PROSE_NOTICE}`);
    expect(result.structuredResponse.insights).toEqual(['Cash is $80.']);
    expect(result.structuredResponse.suggested_actions).toEqual([]);
    expect(result.showTheMathData?.evidenceManifest.validation.deterministic.outcome).toBe('salvaged');
  });

  it('still runs secondary validation on a salvaged retry', async () => {
    // Salvaged prose reaches the user, so the reasoning checks Gemini performs
    // must not be skipped just because the deterministic pass failed.
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your retirement plan is on track. A $999,999 windfall would help.',
      insights: [],
      suggested_actions: [],
    }));
    mockedValidateWithGemini
      .mockResolvedValueOnce({ valid: false, issues: ['Unsupported conclusion.'] })
      .mockResolvedValueOnce({ valid: false, issues: ['Still an unsupported conclusion.'] });

    const result = await runAskLincAnalysis({
      question: 'Am I on track for retirement?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(mockedValidateWithGemini).toHaveBeenCalledTimes(2);
    // Salvaged and then objected to: the verified sentence survives carrying
    // both notices, rather than the user getting nothing after two model calls.
    expect(result.structuredResponse.summary).toBe(
      `Your retirement plan is on track.\n\n${UNVERIFIED_PROSE_NOTICE}\n\n${SECONDARY_REVIEW_CAVEAT}`
    );
    expect(result.showTheMathData?.evidenceManifest.validation.deterministic.outcome).toBe('salvaged');
    expect(result.showTheMathData?.evidenceManifest.secondaryCaveat).toBe(true);
  });

  it('asks for the input that blocked the retirement projection', async () => {
    // The missing input was only ever described to the model, buried in the
    // context pack. The user is the one who can supply it.
    mockedGatherContext.mockResolvedValue({
      ...snapshot(),
      retirementAnalysisNeedsInfo: {
        missingParams: ['annualWithdrawalAmount'],
        detectedParams: {},
      },
    } as any);
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your net worth is $100.',
      insights: [],
      suggested_actions: [],
    }));

    const result = await runAskLincAnalysis({ question: 'Am I on track for retirement?', userId: 'user-1' });

    expect(result.structuredResponse.summary).toContain('Your net worth is $100.');
    expect(result.structuredResponse.summary).toContain('how much you expect to spend per year once retired');
    expect(result.structuredResponse.summary).toContain('Reply with that');
    expect(result.displayText).toContain('Reply with that');
  });

  it('widens the context when the first answer reached for a number it was not given', async () => {
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your largest holding is worth $250,000.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1' });

    // Routing selected none of the detail tiers; the retry asked for all of them.
    expect(mockedGatherContext).toHaveBeenCalledTimes(2);
    expect(mockedGatherContext.mock.calls[0][0].questionNeeds).toMatchObject({
      needsAccountDetails: false,
      needsInvestments: false,
    });
    expect(mockedGatherContext.mock.calls[1][0].questionNeeds).toMatchObject({
      needsAccountDetails: true,
      needsTransactionDetails: true,
      needsInvestments: true,
      needsRetirement: true,
    });
    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
  });

  it('does not turn recovery-only retirement context into a retirement input ask', async () => {
    mockedGatherContext
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce({
        ...snapshot(),
        retirementAnalysisNeedsInfo: {
          missingParams: ['annualWithdrawalAmount'],
          detectedParams: { annualWithdrawalAmount: 120_000 },
          confirmationRequiredParams: ['annualWithdrawalAmount'],
        },
      } as any);
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your largest holding is worth $250,000.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({
      question: 'Is my investment portfolio overexposed to technology?',
      userId: 'user-1',
    });

    expect(mockedGatherContext.mock.calls[1][0].questionNeeds.needsRetirement).toBe(true);
    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
    expect(result.structuredResponse.summary).toBe('Your net worth is $100.');
    expect(result.displayText).not.toContain('retirement projection');
    expect(result.displayText).not.toContain('$120,000');
  });

  it('does not disclose a recovery-only cached retirement projection', async () => {
    mockedGatherContext
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce({
        ...snapshot(),
        retirementAnalysis: cachedRetirementAnalysis(),
      } as any);
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your largest holding is worth $250,000.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({
      question: 'What about domestic versus international exposure?',
      userId: 'user-1',
    });

    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
    expect(result.structuredResponse.summary).toBe('Your net worth is $100.');
    expect(result.displayText).not.toContain('This projection assumes');
    expect(result.displayText).not.toContain('$120,000');
  });

  it('keeps the recovery prompt free of the retirement input directive', async () => {
    // The needs-info block is written at the model: "ask the user to connect
    // investment accounts". Prose is not checked against the fact pack, so an
    // instruction the recovery read never asked for would reach the user.
    mockedGatherContext
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce({
        ...snapshot(),
        retirementAnalysisNeedsInfo: {
          missingParams: [],
          detectedParams: { annualWithdrawalAmount: 120_000 },
          confirmationRequiredParams: ['annualWithdrawalAmount'],
          unavailableReason:
            'No linked investment holdings are available for retirement analysis. Ask the user to connect investment accounts.',
          unavailableCode: 'no_holdings',
        },
      } as any);
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your largest holding is worth $250,000.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({
      question: 'Is my investment portfolio overexposed to technology?',
      userId: 'user-1',
    });

    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
    const retryUserMessage = mockedAskClaude.mock.calls[1][1];
    expect(retryUserMessage).not.toContain('retirementAnalysisNeedsInfo');
    expect(retryUserMessage).not.toContain('Ask the user to connect investment accounts');
    expect(retryUserMessage).not.toContain('120000');
  });

  it('keeps recovery-only retirement inputs out of the retry fact pack', async () => {
    // The stored inputs become canonical facts, and a canonical fact is a
    // licence to print the number: without this the retry could ground
    // "$120,000" against a projection the question never asked about.
    mockedGatherContext
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce({
        ...snapshot(),
        retirementAnalysis: cachedRetirementAnalysis(),
      } as any);
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your largest holding is worth $250,000.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({
      question: 'What about domestic versus international exposure?',
      userId: 'user-1',
    });

    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
    const retryUserMessage = mockedAskClaude.mock.calls[1][1];
    expect(retryUserMessage).not.toContain('annual_withdrawal_amount');
    expect(retryUserMessage).not.toContain('retirement_current_age');
    expect(retryUserMessage).not.toContain('120000');
    // The analysis the recovery loaded is still there to answer from.
    expect(retryUserMessage).toContain('equity_allocation');
    const factIds = result.showTheMathData?.evidenceManifest.facts.map((fact) => fact.id) ?? [];
    expect(factIds).toContain('equity_allocation');
    expect(factIds).not.toContain('annual_withdrawal_amount');
  });

  it('still asks for a missing retirement input when the question planned for retirement', async () => {
    // The gate is the planned scope, not the absence of escalation: a question
    // that asked for the projection still gets the ask that unblocks it.
    mockedGatherContext.mockResolvedValue({
      ...snapshot(),
      retirementAnalysisNeedsInfo: {
        missingParams: ['annualWithdrawalAmount'],
        detectedParams: {},
      },
    } as any);
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your largest holding is worth $250,000.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({
      question: 'Am I on track for retirement?',
      userId: 'user-1',
    });

    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
    expect(result.displayText).toContain('how much you expect to spend per year once retired');
    expect(mockedAskClaude.mock.calls[1][1]).toContain('retirementAnalysisNeedsInfo');
  });

  it('still discloses retirement assumptions when the question planned for retirement', async () => {
    mockedGatherContext.mockResolvedValue({
      ...snapshot(),
      retirementAnalysis: cachedRetirementAnalysis(),
    } as any);
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your largest holding is worth $250,000.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({
      question: 'Am I on track for retirement?',
      userId: 'user-1',
    });

    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
    expect(result.displayText).toContain('This projection assumes');
    expect(result.displayText).toContain('$120,000 a year');
  });

  it('makes every remaining pack available after an unsupported answer', async () => {
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Inflation is running at 3.1%, so your costs will climb.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1' });

    expect(mockedGatherContext).toHaveBeenCalledTimes(2);
    expect(mockedGatherContext.mock.calls[1][0].questionNeeds).toMatchObject({
      needsMarketContext: true,
      needsSearchContext: true,
    });
    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
  });

  it('does not use the unsupported value type as a routing heuristic', async () => {
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your largest holding is worth $250,000.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        insights: [],
        suggested_actions: [],
      }));

    const result = await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1' });

    expect(mockedGatherContext).toHaveBeenCalledTimes(2);
    expect(mockedGatherContext.mock.calls[1][0].questionNeeds).toMatchObject({
      needsAccountDetails: true,
      needsMarketContext: true,
      needsSearchContext: true,
    });
    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
  });

  it('keeps the first answer when widening the context grounds it', async () => {
    // $80 is total_cash, which the fact pack only gained on the widened read.
    // Re-judging against it means no second model call, and no feedback telling
    // the model to drop a number that is now supported.
    mockedGatherContext
      .mockResolvedValueOnce({ ...snapshot(), financialSummary: { financialOverview: { netWorth: 100, totalCash: null, totalInvestments: 20, totalDebt: 0, homeValue: null } } } as any)
      .mockResolvedValueOnce(snapshot());
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'You are holding $80 in cash.',
      insights: [],
      suggested_actions: [],
    }));

    const result = await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1' });

    expect(mockedAskClaude).toHaveBeenCalledTimes(1);
    expect(result.structuredResponse.summary).toBe('You are holding $80 in cash.');
    expect(result.showTheMathData?.evidenceManifest.validation.deterministic.valid).toBe(true);
    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBe(true);
    // Routing metrics must still see what routing originally chose.
    expect(result.showTheMathData?.evidenceManifest.routedContextSelection).toMatchObject({
      accountsIncluded: false,
    });
  });

  it('does not widen the context when every tier is already loaded', async () => {
    mockedPlanContext.mockResolvedValue(contextPlan([
      'account_details', 'transaction_details', 'investment_details', 'monthly_cash_flow',
      'user_profile', 'home_value', 'retirement_analysis', 'market_context', 'search_context',
    ], true));
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your portfolio could reach $250,000.',
      insights: [],
      suggested_actions: [],
    }));

    // This question routes to accounts, transactions, investments, and retirement.
    const result = await runAskLincAnalysis({
      question: 'Evaluate my spending and my portfolio as I plan on retiring soon.',
      userId: 'user-1',
    });

    expect(mockedGatherContext).toHaveBeenCalledTimes(1);
    expect(mockedGatherContext.mock.calls[0][0].deferRetirementAnalysis).toBe(true);
    expect(mockedCompleteRetirement).toHaveBeenCalledTimes(1);
    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBeUndefined();
  });

  it('keeps the retry when widening the context fails', async () => {
    mockedGatherContext
      .mockResolvedValueOnce(snapshot())
      .mockRejectedValueOnce(new Error('snapshot read failed'));
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({ summary: 'Your holding is worth $250,000.' }))
      .mockResolvedValueOnce(JSON.stringify({ summary: 'Your net worth is $100.' }));

    const result = await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1' });

    expect(mockedAskClaude).toHaveBeenCalledTimes(2);
    expect(result.structuredResponse.summary).toBe('Your net worth is $100.');
    expect(result.showTheMathData?.evidenceManifest.contextEscalated).toBeUndefined();
  });

  it('sends one example of every failure kind back to the retry', async () => {
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your net worth is $999. Growth was 47%. You could add 250,000 to savings.',
      insights: [],
      suggested_actions: [],
    }));

    await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1' });

    const retryMessage = mockedAskClaude.mock.calls[1][1];
    expect(retryMessage).toContain('usd value 999');
    expect(retryMessage).toContain('percent value 47');
    expect(retryMessage).toContain('numeric value 250000');
  });

  it('re-runs secondary validation after a retry for complex questions', async () => {
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'You can withdraw $250,000 per year in retirement.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Based on your portfolio, a sustainable withdrawal may be lower.',
        insights: [],
        suggested_actions: [],
      }));
    mockedValidateWithGemini
      .mockResolvedValueOnce({ valid: false, issues: ['Withdrawal amount is unsupported by the portfolio.'] })
      .mockResolvedValueOnce({ valid: true, issues: [] });

    await runAskLincAnalysis({
      question: 'Am I on track for retirement?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(mockedAskClaude).toHaveBeenCalledTimes(2);
    expect(mockedValidateWithGemini).toHaveBeenCalledTimes(2);
  });

  it('ships a grounded answer with a caveat when Gemini objects to the retry', async () => {
    // Every figure has been checked; the objection is about reasoning. Spending
    // 80 seconds and returning nothing was the worse outcome.
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({ summary: 'Initial retirement answer.' }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Your net worth is $100.',
        insights: ['Cash is $80.'],
        suggested_actions: ['Review your allocation.'],
      }));
    mockedValidateWithGemini
      .mockResolvedValueOnce({ valid: false, issues: ['Initial answer is unsupported.'] })
      .mockResolvedValueOnce({ valid: false, issues: ['The recommendation ignores the cash position.'] });

    const result = await runAskLincAnalysis({
      question: 'Am I on track for retirement?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(result.structuredResponse.summary).toBe(`Your net worth is $100.\n\n${SECONDARY_REVIEW_CAVEAT}`);
    expect(result.structuredResponse.insights).toEqual(['Cash is $80.']);
    expect(result.structuredResponse.suggested_actions).toEqual(['Review your allocation.']);
    expect(result.showTheMathData?.evidenceManifest.secondaryCaveat).toBe(true);
    // The objection itself stays in the evidence, not in the user's answer.
    expect(result.structuredResponse.summary).not.toContain('ignores the cash position');
    expect(result.showTheMathData?.evidenceManifest.validation.secondary).toEqual([
      { phase: 'initial', valid: false, issues: ['Initial answer is unsupported.'] },
      { phase: 'retry', valid: false, issues: ['The recommendation ignores the cash position.'] },
    ]);
  });

  it('still replaces an answer that could not be grounded at all', async () => {
    // The caveat is for verified figures with contested reasoning. Nothing
    // verified survives here, so the placeholder is still correct.
    mockedAskClaude.mockResolvedValue(JSON.stringify({
      summary: 'Your net worth is $999.',
      insights: ['This is also based on $999.'],
      suggested_actions: ['Act on the incorrect result.'],
    }));

    const result = await runAskLincAnalysis({
      question: 'What is my net worth?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(result.structuredResponse.summary).toBe(
      'I could not verify the generated answer against your current financial snapshot. Please try the question again.'
    );
    expect(result.showTheMathData?.evidenceManifest.validation.deterministic.outcome).toBe('replaced');
  });

  it('keeps the secondary validator prompt and raw output out of the evidence', async () => {
    mockedAskClaude
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Initial retirement answer.',
        insights: [],
        suggested_actions: [],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Retry retirement answer.',
        insights: ['Still unsupported.'],
        suggested_actions: ['Act on it.'],
      }));
    mockedValidateWithGemini
      .mockResolvedValueOnce({
        valid: false,
        issues: ['Initial answer is unsupported.'],
        promptSent: 'initial validation prompt',
        rawResponse: 'initial invalid result',
      })
      .mockResolvedValueOnce({
        valid: false,
        issues: ['Retry is still unsupported.'],
        promptSent: 'retry validation prompt',
        rawResponse: 'retry invalid result',
      });

    const result = await runAskLincAnalysis({
      question: 'Am I on track for retirement?',
      userId: 'user-1',
      enableValidation: true,
    });

    expect(result.structuredResponse.summary).toContain(SECONDARY_REVIEW_CAVEAT);
    expect(result.showTheMathData?.evidenceManifest.validation.secondary).toEqual([
      { phase: 'initial', valid: false, issues: ['Initial answer is unsupported.'] },
      { phase: 'retry', valid: false, issues: ['Retry is still unsupported.'] },
    ]);
    expect(JSON.stringify(result.showTheMathData)).not.toContain('validation prompt');
    expect(JSON.stringify(result.showTheMathData)).not.toContain('invalid result');
  });

  it('reuses the prepared prompt and gathered snapshot when Claude fails', async () => {
    mockedAskClaude.mockRejectedValueOnce(new Error('Claude unavailable'));
    mockedAskOpenAI.mockResolvedValueOnce(JSON.stringify({
      summary: 'Your net worth is $100.',
      key_numbers: { net_worth: 100 },
    }));

    const result = await runAskLincAnalysis({
      question: 'What is my net worth?',
      userId: 'user-1',
    });

    expect(mockedGatherContext).toHaveBeenCalledTimes(1);
    expect(mockedAskOpenAI).toHaveBeenCalledTimes(1);
    expect(mockedAskOpenAI.mock.calls[0]).toEqual(mockedAskClaude.mock.calls[0]);
    expect(result.showTheMathData?.evidenceManifest.modelCalls.map(({ provider, outcome }) => ({ provider, outcome }))).toEqual([
      { provider: 'claude', outcome: 'failed' },
      { provider: 'openai', outcome: 'success' },
    ]);
  });

  it('puts the newest three conversations in chronological order in the prompt', async () => {
    mockedAskClaude.mockResolvedValue(JSON.stringify({ summary: 'Current answer.' }));
    const history = [5, 4, 3, 2, 1].map((day) => ({
      id: String(day),
      question: `Question ${day}`,
      answer: `Answer ${day}`,
      createdAt: new Date(`2026-08-${String(day).padStart(2, '0')}T00:00:00.000Z`),
    }));

    await runAskLincAnalysis({ question: 'What is my net worth?', userId: 'user-1', conversationHistory: history });

    const userMessage = mockedAskClaude.mock.calls[0][1];
    expect(userMessage).not.toContain('Question 1');
    expect(userMessage).not.toContain('Question 2');
    expect(userMessage.indexOf('Question 3')).toBeLessThan(userMessage.indexOf('Question 4'));
    expect(userMessage.indexOf('Question 4')).toBeLessThan(userMessage.indexOf('Question 5'));
  });

  it('hands the earlier turns to context gathering, newest first', async () => {
    // Analysis inputs arrive a turn or two before the question that needs them
    // ("drop our spending to $125K" … "re-run my retirement analysis"). Context
    // gathering only ever saw the last message, so it asked for numbers the
    // user had already given.
    mockedAskClaude.mockResolvedValue(JSON.stringify({ summary: 'Current answer.' }));
    const history = [1, 2, 3].map((day) => ({
      id: String(day),
      question: `Question ${day}`,
      answer: `Answer ${day}`,
      createdAt: new Date(`2026-08-0${day}T00:00:00.000Z`),
    }));

    await runAskLincAnalysis({ question: 'Re-run it.', userId: 'user-1', conversationHistory: history });

    // The answers travel with the questions: a reply like "62" only has a
    // meaning next to the question it answered.
    expect(mockedGatherContext.mock.calls[0][0].recentTurns).toEqual([
      { question: 'Question 3', answer: 'Answer 3' },
      { question: 'Question 2', answer: 'Answer 2' },
      { question: 'Question 1', answer: 'Answer 1' },
    ]);
  });
});

describe('selectValidationFeedback', () => {
  const issues = [
    ...Array.from({ length: 20 }, (_, i) => `User-facing usd value ${i} is not present in the canonical fact pack.`),
    'User-facing percent value 68 is not present in the canonical fact pack.',
    'User-facing numeric value 250000 is not present in the canonical fact pack.',
    'net_worth does not cite a canonical fact.',
  ];

  it('covers every kind of failure before repeating one', () => {
    const selected = selectValidationFeedback(issues, 6);
    expect(selected.slice(0, 4)).toEqual([
      'User-facing usd value 0 is not present in the canonical fact pack.',
      'User-facing percent value 68 is not present in the canonical fact pack.',
      'User-facing numeric value 250000 is not present in the canonical fact pack.',
      'net_worth does not cite a canonical fact.',
    ]);
    expect(selected[selected.length - 1]).toContain('17 further issue(s)');
  });

  it('returns every issue unchanged when they all fit', () => {
    expect(selectValidationFeedback(issues.slice(20), 12)).toEqual(issues.slice(20));
  });
});
