import { buildAnswerQualityReport, type AnswerQualityConversation } from '../../services/answer-quality';
import type { ContextPackId } from '../../openai/context-packs';

function conversation(options: {
  id: string;
  minute: number;
  rating?: number;
  outcome?: 'passed' | 'salvaged' | 'replaced';
  plannerSource?: 'context_planner' | 'fallback_all';
  selected?: ContextPackId[];
  toolAdded?: ContextPackId[];
  toolFailed?: boolean;
  final?: ContextPackId[];
  late?: boolean;
  scenario?: 'completed' | 'unavailable' | 'not_run';
  searchPlanned?: boolean;
  search?: { providerCalls: number; cacheHits: number; resultCount: number };
  manifest?: boolean;
}): AnswerQualityConversation {
  const createdAt = new Date(Date.UTC(2026, 7, 17, 12, options.minute));
  const outcome = options.outcome ?? 'passed';
  const selected = options.selected ?? ['account_details'];
  const toolAdded = options.toolAdded ?? [];
  const final = options.final ?? [...selected, ...toolAdded];
  return {
    id: options.id,
    question: `Question ${options.id}`,
    createdAt,
    feedback: options.rating === undefined ? [] : [{ score: options.rating, createdAt }],
    showTheMathData: options.manifest === false ? null : {
      evidenceManifest: {
        version: 1,
        generatedAt: createdAt.toISOString(),
        snapshot: {},
        facts: [],
        contextPlanning: {
          source: options.plannerSource ?? 'context_planner',
          model: 'gpt-test',
          durationMs: 20,
          requestedPacks: selected,
          selectedPacks: selected,
          finalPacks: final,
          needsSecondaryValidation: false,
          summary: 'Test plan.',
          ...((options.search || options.searchPlanned) && {
            searchQueries: [{ query: 'current Federal Reserve interest rate', purpose: 'rate', freshness: 'pm' }],
          }),
          ...(options.scenario && {
            scenarios: {
              retirement: {
                requested: true,
                primary: { type: 'fixed_growth', annualRate: 0.03, source: '3% annual bump' },
              },
            },
          }),
          ...((toolAdded.length > 0 || options.toolFailed) && {
            primaryTool: {
              outcome: options.toolFailed ? 'failed' : 'expanded',
              model: 'claude-test',
              requestedPacks: toolAdded,
              addedPacks: toolAdded,
              reason: 'Needed for the comparison.',
              durationMs: 10,
            },
          }),
        },
        ...(options.scenario && options.scenario !== 'not_run' && {
          scenarioExecutions: {
            retirement: options.scenario === 'completed' ? {
                version: 1,
                calculator: 'retirement',
                status: 'completed',
                computedAt: createdAt.toISOString(),
                durationMs: 42,
                baselineScenarioId: 'baseline',
                scenarios: [],
              }
            : {
                version: 1,
                calculator: 'retirement',
                status: 'unavailable',
                computedAt: createdAt.toISOString(),
                durationMs: 8,
                reason: 'Missing retirement baseline.',
              },
          },
        }),
        ...(options.late && { contextEscalated: true }),
        modelCalls: [],
        timings: { contextGatherMs: 1, promptBuildMs: 1, totalMs: 2 },
        validation: { deterministic: { valid: outcome === 'passed', issues: [], outcome } },
        evidenceRefs: {
          tickers: [],
          retirementAnalysis: false,
          marketContext: false,
          ...(options.search && {
            search: {
              queries: [{ query: 'current Federal Reserve interest rate', purpose: 'rate', freshness: 'pm' }],
              ...options.search,
              retrievedAt: createdAt.toISOString(),
            },
          }),
        },
      },
    },
  };
}

describe('answer quality report', () => {
  it('separates clean, corrected, and failed deliveries', () => {
    const report = buildAnswerQualityReport([
      conversation({ id: 'clean', minute: 3, rating: 5 }),
      conversation({ id: 'corrected', minute: 2, outcome: 'salvaged' }),
      conversation({ id: 'failed', minute: 1, outcome: 'replaced' }),
    ]);

    expect(report.delivery).toMatchObject({ total: 3, clean: 1, recovered: 1, failed: 1, cleanRate: 0.333 });
    expect(report.evidence).toMatchObject({ verified: 1, salvaged: 1, replaced: 1, verifiedRate: 0.333 });
    expect(report.delivery.headline).toContain('1 failed');
  });

  it('treats the primary tool as a planning expansion, not a bad answer', () => {
    const report = buildAnswerQualityReport([
      conversation({
        id: 'tool',
        minute: 1,
        selected: ['account_details'],
        toolAdded: ['transaction_details'],
        final: ['account_details', 'transaction_details'],
      }),
    ]);

    expect(report.delivery).toMatchObject({ clean: 1, recovered: 0, failed: 0 });
    expect(report.planning).toMatchObject({ semanticPlans: 1, plannerAccepted: 0, primaryToolExpanded: 1, lateExpanded: 0 });
    expect(report.planning.byPack.transaction_details).toEqual({
      selectedInitially: 0,
      addedByPrimaryTool: 1,
      presentFinally: 1,
    });
  });

  it('labels post-answer widening as a recovered context miss', () => {
    const report = buildAnswerQualityReport([
      conversation({ id: 'late', minute: 1, late: true, final: ['account_details', 'search_context'] }),
    ]);
    expect(report.delivery).toMatchObject({ clean: 0, recovered: 1, failed: 0 });
    expect(report.planning.lateExpanded).toBe(1);
    expect(report.recent[0].statusReason).toContain('loaded all remaining packs');
  });

  it('does not count a failed primary-tool audit as planner acceptance', () => {
    const report = buildAnswerQualityReport([
      conversation({ id: 'audit-failed', minute: 1, toolFailed: true }),
    ]);

    expect(report.delivery).toMatchObject({ clean: 1, failed: 0 });
    expect(report.planning).toMatchObject({
      semanticPlans: 1,
      plannerAccepted: 0,
      primaryToolFailed: 1,
      plannerAcceptedRate: 0,
    });
    expect(report.recent[0].primaryToolOutcome).toBe('failed');
  });

  it('uses the newest user rating and lets a low rating flag a verified answer', () => {
    const base = conversation({ id: 'rated', minute: 1 });
    const createdAt = new Date('2026-08-17T12:01:00.000Z');
    const report = buildAnswerQualityReport([{
      ...base,
      feedback: [
        { score: 5, createdAt },
        { score: 2, createdAt: new Date(createdAt.getTime() + 1000) },
      ],
    }]);
    expect(report.users).toMatchObject({ rated: 1, negative: 1, averageRating: 2 });
    expect(report.recent[0]).toMatchObject({ deliveryStatus: 'failed', rating: 2 });
  });

  it('reports planner fallback and ignores rows with no evidence', () => {
    const report = buildAnswerQualityReport([
      conversation({ id: 'fallback', minute: 1, plannerSource: 'fallback_all' }),
      conversation({ id: 'legacy', minute: 2, manifest: false }),
    ]);
    expect(report.window).toMatchObject({ conversations: 2, withEvidence: 1 });
    expect(report.planning).toMatchObject({ semanticPlans: 0, fallbackPlans: 1, plannerAcceptedRate: null });
  });

  it('reports scenario completion, missing inputs, and planner requests that did not run', () => {
    const report = buildAnswerQualityReport([
      conversation({ id: 'scenario-complete', minute: 3, scenario: 'completed' }),
      conversation({ id: 'scenario-unavailable', minute: 2, scenario: 'unavailable' }),
      conversation({ id: 'scenario-not-run', minute: 1, scenario: 'not_run' }),
    ]);

    expect(report.scenarios).toEqual({
      requested: 3,
      completed: 1,
      unavailable: 1,
      notRun: 1,
      averageMs: 25,
      completedCalculations: 1,
      unavailableCalculations: 1,
      byCalculator: { retirement: { completed: 1, unavailable: 1 } },
    });
    expect(report.recent[0]).toMatchObject({
      scenarioRequested: true,
      scenarioStatus: 'completed',
      scenarioStatuses: { retirement: 'completed' },
    });
  });

  it('preserves completed and unavailable outcomes when calculators have mixed results', () => {
    const mixed = conversation({ id: 'mixed-scenarios', minute: 1, scenario: 'completed' });
    const manifest = (mixed.showTheMathData as any).evidenceManifest;
    manifest.contextPlanning.scenarios.home_affordability = { requested: true };
    manifest.scenarioExecutions.home_affordability = {
      version: 1,
      calculator: 'home_affordability',
      status: 'unavailable',
      computedAt: new Date(mixed.createdAt).toISOString(),
      durationMs: 18,
      reason: 'Missing purchase price.',
    };

    const report = buildAnswerQualityReport([mixed]);

    expect(report.recent[0]).toMatchObject({
      scenarioStatus: 'completed',
      scenarioStatuses: {
        retirement: 'completed',
        home_affordability: 'unavailable',
      },
    });
    expect(report.scenarios).toMatchObject({
      requested: 1,
      completed: 1,
      unavailable: 0,
      completedCalculations: 1,
      unavailableCalculations: 1,
      averageMs: 30,
      byCalculator: {
        home_affordability: { completed: 0, unavailable: 1 },
        retirement: { completed: 1, unavailable: 0 },
      },
    });
  });

  it('reports planned search retrieval, provider calls, and cache reuse', () => {
    const report = buildAnswerQualityReport([
      conversation({
        id: 'search-live',
        minute: 2,
        selected: ['search_context'],
        search: { providerCalls: 1, cacheHits: 1, resultCount: 5 },
      }),
      conversation({ id: 'search-unavailable', minute: 1, selected: ['search_context'], searchPlanned: true }),
    ]);

    expect(report.search).toEqual({
      requested: 2,
      retrieved: 1,
      unavailable: 1,
      retrievalRate: 0.5,
      plannedQueries: 2,
      providerCalls: 1,
      cacheHits: 1,
      cacheReuseRate: 0.5,
      resultCount: 5,
    });
    expect(report.recent[0]).toMatchObject({ searchRequested: true, searchRetrieved: true });
  });

  it('returns explicit empty-state nulls', () => {
    const report = buildAnswerQualityReport([]);
    expect(report.delivery).toMatchObject({ total: 0, cleanRate: null });
    expect(report.evidence.verifiedRate).toBeNull();
    expect(report.planning.plannerAcceptedRate).toBeNull();
    expect(report.users.averageRating).toBeNull();
    expect(report.scenarios).toEqual({
      requested: 0,
      completed: 0,
      unavailable: 0,
      notRun: 0,
      averageMs: null,
      completedCalculations: 0,
      unavailableCalculations: 0,
      byCalculator: {},
    });
    expect(report.search).toEqual({
      requested: 0,
      retrieved: 0,
      unavailable: 0,
      retrievalRate: null,
      plannedQueries: 0,
      providerCalls: 0,
      cacheHits: 0,
      cacheReuseRate: null,
      resultCount: 0,
    });
    expect(report.window).toEqual({ from: null, to: null, conversations: 0, withEvidence: 0 });
  });
});
