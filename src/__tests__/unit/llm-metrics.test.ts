import {
  getLlmMetricsSnapshot,
  recordLlmAnalysis,
  resetLlmMetricsForTests,
} from '../../observability/llm-metrics';
import type { EvidenceManifest } from '../../openai/show-the-math-types';

describe('LLM stage metrics', () => {
  afterEach(resetLlmMetricsForTests);

  it('reports unmeasured targets as null instead of passing them', () => {
    const metrics = getLlmMetricsSnapshot();
    expect(metrics.targetStatus.contextGatherP95).toBeNull();
    expect(metrics.targetStatus.timeToFirstTokenP95).toBeNull();
    expect(metrics.targetStatus.deterministicGrounding).toBeNull();
    expect(metrics.baselineCandidate.ready).toBe(false);
    expect(metrics.observationWindow).toEqual({ from: null, to: null });
  });

  it('surfaces grounding failures that cluster on a withheld context tier', () => {
    // The shape both routing bugs had: questions that were given the
    // transaction rows stayed grounded, questions that were not did not.
    const sample = (transactionDetailsIncluded: boolean, valid: boolean): EvidenceManifest => ({
      version: 1,
      generatedAt: new Date().toISOString(),
      snapshot: {},
      facts: [],
      contextSelection: {
        accountsIncluded: true,
        transactionDetailsIncluded,
        investmentDetailsIncluded: true,
        marketContextRequested: false,
        searchContextRequested: false,
      },
      modelCalls: [],
      timings: { contextGatherMs: 1, promptBuildMs: 1, totalMs: 2 },
      validation: { deterministic: { valid, issues: [] } },
      evidenceRefs: { tickers: [], retirementAnalysis: false, marketContext: false },
    });

    recordLlmAnalysis(sample(false, false));
    recordLlmAnalysis(sample(false, false));
    recordLlmAnalysis(sample(false, true));
    recordLlmAnalysis(sample(true, true));
    recordLlmAnalysis(sample(true, true));

    const routing = getLlmMetricsSnapshot().routing;
    expect(routing.transactionDetailsIncluded).toEqual({
      withheld: { samples: 3, ungroundedRate: 2 / 3 },
      supplied: { samples: 2, ungroundedRate: 0 },
      excessWhenWithheld: 2 / 3,
    });
    // A tier that was never withheld has nothing to compare.
    expect(routing.accountsIncluded.excessWhenWithheld).toBeNull();
  });

  it('separates model grounding from what the user actually received', () => {
    const manifest = (outcome: 'passed' | 'salvaged' | 'replaced', valid: boolean): EvidenceManifest => ({
      version: 1,
      generatedAt: new Date().toISOString(),
      snapshot: {},
      facts: [],
      modelCalls: [],
      timings: { contextGatherMs: 1, promptBuildMs: 1, totalMs: 2 },
      validation: { deterministic: { valid, issues: [], outcome } },
      evidenceRefs: { tickers: [], retirementAnalysis: false, marketContext: false },
    });

    recordLlmAnalysis(manifest('passed', true));
    recordLlmAnalysis(manifest('salvaged', false));
    recordLlmAnalysis(manifest('replaced', false));

    const quality = getLlmMetricsSnapshot().quality;
    // One of three answers was fully grounded, but two of three reached the user.
    expect(quality.deterministicGroundingRate).toBeCloseTo(1 / 3);
    expect(quality.answerDeliveredRate).toBeCloseTo(2 / 3);
    expect(quality.salvageRate).toBeCloseTo(1 / 3);
  });

  it('reports stage percentiles and quality rates', () => {
    const manifest: EvidenceManifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      snapshot: {},
      facts: [],
      modelCalls: [{
        phase: 'initial', provider: 'claude', outcome: 'success',
        promptCharacters: 100, responseCharacters: 50, durationMs: 200,
      }],
      timings: {
        contextGatherMs: 20, promptBuildMs: 5, modelMs: 200,
        validationMs: 10, timeToFirstAnswerTokenMs: 100, totalMs: 240,
      },
      validation: { deterministic: { valid: true, issues: [] } },
      evidenceRefs: { tickers: [], retirementAnalysis: false, marketContext: false },
    };
    recordLlmAnalysis(manifest);
    const metrics = getLlmMetricsSnapshot();
    expect(metrics.stages.model.p95Ms).toBe(200);
    expect(metrics.quality.deterministicGroundingRate).toBe(1);
    expect(metrics.quality.fallbackRate).toBe(0);
    expect(metrics.baselineCandidate.stages.total.remainingSamples).toBe(99);
    expect(metrics.observationWindow.from).toBe(manifest.generatedAt);
  });

  it('marks a deployed baseline candidate ready only after every stage has enough samples', () => {
    for (let index = 0; index < 100; index += 1) {
      recordLlmAnalysis({
        version: 1,
        generatedAt: new Date(Date.UTC(2026, 7, 14, 12, index)).toISOString(),
        snapshot: {},
        facts: [],
        modelCalls: [{
          phase: 'initial', provider: 'claude', outcome: 'success',
          promptCharacters: 100, responseCharacters: 50, durationMs: 200,
        }],
        timings: {
          contextGatherMs: 20, promptBuildMs: 5, modelMs: 200,
          validationMs: 10, timeToFirstAnswerTokenMs: 100, totalMs: 240,
        },
        validation: { deterministic: { valid: true, issues: [] } },
        evidenceRefs: { tickers: [], retirementAnalysis: false, marketContext: false },
      });
    }

    const metrics = getLlmMetricsSnapshot();
    expect(metrics.baselineCandidate.ready).toBe(true);
    expect(metrics.baselineCandidate.timeToFirstTokenReady).toBe(true);
    expect(metrics.baselineCandidate.stages.timeToFirstToken.samples).toBe(100);
    expect(metrics.baselineCandidate.stages.total.p95Ms).toBe(240);
  });

  it('does not let optional first-token timing block a representative core baseline', () => {
    for (let index = 0; index < 100; index += 1) {
      recordLlmAnalysis({
        version: 1,
        generatedAt: new Date(Date.UTC(2026, 7, 14, 12, index)).toISOString(),
        snapshot: {},
        facts: [],
        modelCalls: [{
          phase: 'initial', provider: 'openai', outcome: 'success',
          promptCharacters: 100, responseCharacters: 50, durationMs: 200,
        }],
        timings: {
          contextGatherMs: 20, promptBuildMs: 5, modelMs: 200,
          validationMs: 10, totalMs: 240,
        },
        validation: { deterministic: { valid: true, issues: [] } },
        evidenceRefs: { tickers: [], retirementAnalysis: false, marketContext: false },
      });
    }

    const metrics = getLlmMetricsSnapshot();
    expect(metrics.baselineCandidate.ready).toBe(true);
    expect(metrics.baselineCandidate.timeToFirstTokenReady).toBe(false);
    expect(metrics.baselineCandidate.stages.timeToFirstToken.remainingSamples).toBe(100);
  });
});
