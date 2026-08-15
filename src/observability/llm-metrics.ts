import type { EvidenceManifest } from '../openai/show-the-math-types';

const MAX_SAMPLES = 500;
export const LLM_BASELINE_MIN_SAMPLES = 100;

export const LLM_PERFORMANCE_TARGETS = {
  contextGatherP95Ms: 1500,
  promptBuildP95Ms: 100,
  timeToFirstTokenP95Ms: 4000,
  totalP95Ms: 15000,
  deterministicGroundingRate: 1,
} as const;

/** Context tiers that are still decided by question routing rather than always loaded. */
const ROUTED_CONTEXT = [
  'accountsIncluded',
  'transactionDetailsIncluded',
  'investmentDetailsIncluded',
  'marketContextRequested',
  'searchContextRequested',
] as const;

type RoutedContext = (typeof ROUTED_CONTEXT)[number];

type Sample = {
  at: string;
  success: boolean;
  contextGatherMs?: number;
  promptBuildMs?: number;
  modelMs?: number;
  validationMs?: number;
  timeToFirstTokenMs?: number;
  totalMs?: number;
  grounded?: boolean;
  outcome?: 'passed' | 'salvaged' | 'replaced';
  contextSelection?: Partial<Record<RoutedContext, boolean>>;
  contextEscalated?: boolean;
  fallbackUsed: boolean;
  retryUsed: boolean;
};

const samples: Sample[] = [];

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[index];
}

function summarize(values: Array<number | undefined>) {
  const present = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
  return {
    samples: present.length,
    p50Ms: percentile(present, 0.5),
    p95Ms: percentile(present, 0.95),
    maxMs: present.length ? Math.max(...present) : null,
  };
}

function meetsUpperBound(value: number | null, target: number): boolean | null {
  return value === null ? null : value <= target;
}

function baselineStage(samples: number, p50Ms: number | null, p95Ms: number | null) {
  return {
    samples,
    minimumSamples: LLM_BASELINE_MIN_SAMPLES,
    remainingSamples: Math.max(0, LLM_BASELINE_MIN_SAMPLES - samples),
    ready: samples >= LLM_BASELINE_MIN_SAMPLES,
    p50Ms,
    p95Ms,
  };
}

export function recordLlmAnalysis(manifest: EvidenceManifest, success = true): void {
  const sample: Sample = {
    at: manifest.generatedAt,
    success,
    contextGatherMs: manifest.timings.contextGatherMs,
    promptBuildMs: manifest.timings.promptBuildMs,
    modelMs: manifest.timings.modelMs,
    validationMs: manifest.timings.validationMs,
    timeToFirstTokenMs: manifest.timings.timeToFirstAnswerTokenMs,
    totalMs: manifest.timings.totalMs,
    grounded: manifest.validation.deterministic.valid,
    outcome: manifest.validation.deterministic.outcome,
    contextSelection: manifest.contextSelection,
    contextEscalated: manifest.contextEscalated,
    fallbackUsed: manifest.modelCalls.some(call => call.provider === 'openai'),
    retryUsed: manifest.modelCalls.some(call => call.phase === 'retry'),
  };
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
}

export function recordLlmAnalysisFailure(totalMs: number): void {
  samples.push({
    at: new Date().toISOString(),
    success: false,
    totalMs,
    fallbackUsed: false,
    retryUsed: false,
  });
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
}

/**
 * Did grounding fail more often when a context tier was withheld than when it
 * was supplied?
 *
 * A routing miss is invisible today: the question is answered, the model fills
 * the gap with a number nobody supplied, and the failure surfaces as a grounding
 * error with no indication that the cause was upstream. Both bugs behind #62 and
 * #63 would have shown up here as a positive `excessWhenWithheld` on
 * `transactionDetailsIncluded` and `investmentDetailsIncluded` long before a
 * user reported one.
 *
 * This is a correlation, not a diagnosis — a tier can be withheld correctly and
 * still sit next to failures. Treat a persistent positive gap as a prompt to go
 * read those questions, not as proof the router is wrong.
 */
function routingSignals() {
  const scored = samples.filter((sample) => sample.contextSelection && sample.grounded !== undefined);
  const ungroundedRate = (subset: Sample[]) =>
    subset.length === 0 ? null : subset.filter((sample) => !sample.grounded).length / subset.length;

  return Object.fromEntries(ROUTED_CONTEXT.map((flag) => {
    const withheld = scored.filter((sample) => sample.contextSelection![flag] === false);
    const supplied = scored.filter((sample) => sample.contextSelection![flag] === true);
    const withheldRate = ungroundedRate(withheld);
    const suppliedRate = ungroundedRate(supplied);
    return [flag, {
      withheld: { samples: withheld.length, ungroundedRate: withheldRate },
      supplied: { samples: supplied.length, ungroundedRate: suppliedRate },
      excessWhenWithheld: withheldRate === null || suppliedRate === null
        ? null
        : withheldRate - suppliedRate,
    }];
  }));
}

export function getLlmMetricsSnapshot() {
  const grounded = samples.filter(sample => sample.grounded !== undefined);
  const rate = (predicate: (sample: Sample) => boolean) =>
    samples.length === 0 ? null : samples.filter(predicate).length / samples.length;
  const groundingRate = grounded.length === 0
    ? null
    : grounded.filter(sample => sample.grounded).length / grounded.length;

  const stages = {
    contextGather: summarize(samples.map(sample => sample.contextGatherMs)),
    promptBuild: summarize(samples.map(sample => sample.promptBuildMs)),
    model: summarize(samples.map(sample => sample.modelMs)),
    validation: summarize(samples.map(sample => sample.validationMs)),
    timeToFirstToken: summarize(samples.map(sample => sample.timeToFirstTokenMs)),
    total: summarize(samples.map(sample => sample.totalMs)),
  };

  const baselineStages = {
    contextGather: baselineStage(stages.contextGather.samples, stages.contextGather.p50Ms, stages.contextGather.p95Ms),
    promptBuild: baselineStage(stages.promptBuild.samples, stages.promptBuild.p50Ms, stages.promptBuild.p95Ms),
    model: baselineStage(stages.model.samples, stages.model.p50Ms, stages.model.p95Ms),
    validation: baselineStage(stages.validation.samples, stages.validation.p50Ms, stages.validation.p95Ms),
    timeToFirstToken: baselineStage(stages.timeToFirstToken.samples, stages.timeToFirstToken.p50Ms, stages.timeToFirstToken.p95Ms),
    total: baselineStage(stages.total.samples, stages.total.p50Ms, stages.total.p95Ms),
  };
  // Buffered and fallback responses cannot report a genuine first-token time.
  // Keep that baseline independently gated so it cannot block otherwise
  // representative request/stage latency baselines forever.
  const coreBaselineReady = [
    baselineStages.contextGather,
    baselineStages.promptBuild,
    baselineStages.model,
    baselineStages.validation,
    baselineStages.total,
  ].every(stage => stage.ready);

  return {
    processStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    retainedSamples: samples.length,
    observationWindow: {
      from: samples[0]?.at ?? null,
      to: samples[samples.length - 1]?.at ?? null,
    },
    targets: LLM_PERFORMANCE_TARGETS,
    stages,
    quality: {
      successRate: rate(sample => sample.success),
      deterministicGroundingRate: groundingRate,
      fallbackRate: rate(sample => sample.fallbackUsed),
      retryRate: rate(sample => sample.retryUsed),
      // deterministicGroundingRate measures the model: any ungrounded figure
      // counts against it, even when the user still got a usable answer. These
      // two measure what reached the user.
      answerDeliveredRate: rate(sample => sample.success && (sample.outcome ?? 'passed') !== 'replaced'),
      salvageRate: rate(sample => sample.outcome === 'salvaged'),
      contextEscalationRate: rate(sample => sample.contextEscalated === true),
    },
    routing: routingSignals(),
    baselineCandidate: {
      ready: coreBaselineReady,
      timeToFirstTokenReady: baselineStages.timeToFirstToken.ready,
      note: coreBaselineReady
        ? baselineStages.timeToFirstToken.ready
          ? 'Representative sample thresholds met, including streamed first-token latency.'
          : 'Core latency baseline is ready; collect more streamed responses before recording first-token latency.'
        : 'Collect more deployed samples before treating these values as a latency baseline.',
      stages: baselineStages,
      quality: {
        successRate: rate(sample => sample.success),
        deterministicGroundingRate: groundingRate,
        fallbackRate: rate(sample => sample.fallbackUsed),
        retryRate: rate(sample => sample.retryUsed),
      },
    },
    targetStatus: {
      contextGatherP95: meetsUpperBound(stages.contextGather.p95Ms, LLM_PERFORMANCE_TARGETS.contextGatherP95Ms),
      promptBuildP95: meetsUpperBound(stages.promptBuild.p95Ms, LLM_PERFORMANCE_TARGETS.promptBuildP95Ms),
      timeToFirstTokenP95: meetsUpperBound(stages.timeToFirstToken.p95Ms, LLM_PERFORMANCE_TARGETS.timeToFirstTokenP95Ms),
      totalP95: meetsUpperBound(stages.total.p95Ms, LLM_PERFORMANCE_TARGETS.totalP95Ms),
      deterministicGrounding: groundingRate === null
        ? null
        : groundingRate >= LLM_PERFORMANCE_TARGETS.deterministicGroundingRate,
    },
  };
}

export function resetLlmMetricsForTests(): void {
  samples.length = 0;
}
