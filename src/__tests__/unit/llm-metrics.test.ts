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
  });
});
