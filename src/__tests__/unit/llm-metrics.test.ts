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
