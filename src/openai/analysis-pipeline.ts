/**
 * Ask Linc Analysis Pipeline
 *
 * Orchestrates the LLM-driven financial reasoning pipeline:
 * 1. Retrieve financial snapshot, bounded personal context, market summary
 * 2. Call RAG retrieval
 * 3. LLM financial reasoning (Claude Sonnet)
 * 4. Optional validation (Gemini)
 * 5. Structured response
 *
 * Application code owns canonical facts and arithmetic; models explain those results.
 */

import { UserTier } from '../data/types';
import { completeRetirementAnalysis, gatherContextSnapshot } from './context-service';
import { buildPromptInputFromSnapshot, buildFinancialReasoningPrompt } from './financial-reasoning-prompt';
import { loadResponseToneConfig } from './prompt-config';
import { loadModelConfig } from './model-config';
import { askClaude, askClaudeStream, auditDataPacksWithClaude } from './claude-client';
import {
  parseStructuredResponseWithFormat,
  toDisplayText,
  extractPartialSummary,
  AskLincResponse,
  RESPONSE_FORMAT_ISSUES,
  type ResponseFormat,
} from './structured-response';
import { validateUserPrompt, getRejectionMessage } from '../security/prompt-validation';
import { validateLLMResponse } from '../security/output-validation';
import { logRejectedPrompt, logFlaggedOutput } from '../security/security-logger';
import { PromptValidationError } from './errors';
import type { EvidenceManifest, ShowTheMathData } from './show-the-math-types';
import {
  appendNotice,
  sanitizeUngroundedResponse,
  SECONDARY_REVIEW_CAVEAT,
  UNVERIFIABLE_SUMMARY,
} from './response-grounding';
import {
  canonicalizeResponseNumbers,
  hasUnsupportedValueIssue,
  salvageUngroundedResponseWithDetail,
  validateResponseFacts,
} from './response-facts';
import type { SalvageRemovals } from './response-facts';
import { validateCanonicalFactPack } from './canonical-facts';
import { describeMissingInputs } from './missing-inputs';
import {
  describeRetirementAssumptions,
} from './retirement-assumptions';
import { askOpenAIWithPreparedPrompt } from './openai-fallback-client';
import { createHash } from 'crypto';
import { recordLlmAnalysisFailure } from '../observability/llm-metrics';
import type { FinancialContextSnapshot } from './types';
import {
  fallbackContextPlan,
  planContext,
  buildPlannerTranscript,
  retirementInputsForBaseline,
  retirementInputsFromScenarioPlan,
  type ContextPlan,
} from './context-planner';
import {
  allContextPacks,
  normalizeContextPacks,
  questionNeedsFromPacks,
  type ContextPackId,
} from './context-packs';
import {
  RETIREMENT_CALCULATOR_ID,
  type RetirementScenarioPlan,
} from '../scenarios/retirement-scenario';
import { HOME_AFFORDABILITY_CALCULATOR_ID } from '../scenarios/home-affordability-scenario';
import {
  scenarioCalculatorRegistry,
  type ScenarioExecutionRecord,
  type ScenarioPlanRecord,
} from '../scenarios/calculator-registry';
import type { PlannedSearchQuery } from '../data/search-types';

export interface RunAskLincAnalysisOptions {
  question: string;
  userId?: string;
  userTier?: UserTier | string;
  conversationHistory?: Array<{ id: string; question: string; answer: string; createdAt: Date }>;
  enableValidation?: boolean;
  /** Optional callback for progress updates (e.g. for SSE streaming) */
  onProgress?: (message: string) => void;
  /** Optional callback for incremental answer text (the summary field) as Claude streams it. */
  onAnswerDelta?: (delta: string) => void;
  /** Optional callback signalling the streamed answer so far should be discarded (e.g. before a validation retry). */
  onAnswerReset?: () => void;
  /** Deterministic dependency seam for the offline end-to-end evaluation suite. */
  evaluation?: {
    snapshot: FinancialContextSnapshot;
    contextPlan?: ContextPlan;
    toolRequestedPacks?: ContextPackId[];
    toolSearchQueries?: PlannedSearchQuery[];
    scenarioPlans?: ScenarioPlanRecord;
    scenarioExecutions?: ScenarioExecutionRecord;
    model: (input: {
      systemPrompt: string;
      userMessage: string;
      phase: 'initial' | 'retry';
    }) => string | Promise<string>;
    skipToneConfig?: boolean;
  };
}

/**
 * Build an `onText` handler that decodes the streaming JSON and emits only the
 * incremental "summary" text via onAnswerDelta. Returns a no-op when no delta
 * sink is provided (non-streaming callers).
 */
function makeAnswerStreamer(
  onAnswerDelta?: (delta: string) => void,
  onFirstDelta?: () => void
): (delta: string) => void {
  if (!onAnswerDelta) return () => {};
  let raw = '';
  let emitted = 0;
  let receivedFirstDelta = false;
  return (delta: string) => {
    if (!receivedFirstDelta) {
      receivedFirstDelta = true;
      onFirstDelta?.();
    }
    raw += delta;
    const partial = extractPartialSummary(raw);
    if (partial.length > emitted) {
      onAnswerDelta(partial.slice(emitted));
      emitted = partial.length;
    }
  };
}

export interface RunAskLincAnalysisResult {
  structuredResponse: AskLincResponse;
  displayText: string;
  showTheMathData?: ShowTheMathData;
}

function evidenceTickers(
  snapshot: Awaited<ReturnType<typeof gatherContextSnapshot>>,
  question: string
): string[] {
  const tickers = new Set<string>();
  const mentionedTickers = new Set<string>();
  for (const item of [...(snapshot.investments?.holdings || []), ...(snapshot.investments?.securities || [])]) {
    const ticker = (item as { ticker_symbol?: string }).ticker_symbol?.trim().toUpperCase();
    if (ticker && ticker !== 'CASH' && ticker.length <= 10) {
      tickers.add(ticker);
      const escapedTicker = ticker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escapedTicker}\\b`, 'i').test(question)) mentionedTickers.add(ticker);
    }
  }
  return Array.from(mentionedTickers).sort();
}

function contextDigest(value: string | undefined): string | undefined {
  return value ? createHash('sha256').update(value).digest('hex') : undefined;
}

/** The validation issue a reply in the wrong format raises; none for a real answer. */
function formatIssues(format: ResponseFormat): string[] {
  return format === 'structured' ? [] : [RESPONSE_FORMAT_ISSUES[format]];
}

/**
 * Pick retry feedback that covers every kind of failure rather than the first N
 * of one kind. Sending eight "usd value X is not present" lines teaches nothing
 * about the percentage and bare-number failures further down the list, and the
 * retry reproduces them.
 */
export function selectValidationFeedback(issues: string[], limit = 12): string[] {
  const byKind = new Map<string, string[]>();
  for (const issue of issues) {
    const kind = issue.replace(/-?[\d,]+(?:\.\d+)?/g, 'N');
    const group = byKind.get(kind);
    if (group) group.push(issue);
    else byKind.set(kind, [issue]);
  }

  const selected: string[] = [];
  const groups = Array.from(byKind.values());
  for (let round = 0; selected.length < limit; round++) {
    const before = selected.length;
    for (const group of groups) {
      if (selected.length >= limit) break;
      if (round < group.length) selected.push(group[round]);
    }
    if (selected.length === before) break;
  }

  const omitted = issues.length - selected.length;
  if (omitted > 0) {
    selected.push(`${omitted} further issue(s) of the same kinds were omitted — fix the whole class, not just the examples above.`);
  }
  return selected;
}

/**
 * Run the Ask Linc financial analysis pipeline.
 */
export async function runAskLincAnalysis(options: RunAskLincAnalysisOptions): Promise<RunAskLincAnalysisResult> {
  const pipelineStartedAt = Date.now();
  let firstAnswerTokenAt: number | undefined;
  const {
    question,
    userId,
    userTier = UserTier.STARTER,
    conversationHistory = [],
    enableValidation = process.env.ENABLE_RESPONSE_VALIDATION === 'true',
    onProgress,
    onAnswerDelta,
    onAnswerReset,
    evaluation,
  } = options;

  const tier = typeof userTier === 'string' ? (userTier as UserTier) : userTier;

  // Step 0: Input validation
  const historyForValidation = conversationHistory.map(c => ({ question: c.question }));
  const validation = validateUserPrompt(question, historyForValidation);
  if (!validation.allowed) {
    logRejectedPrompt(question, validation.reason || 'unknown', { userId });
    const userMessage = getRejectionMessage(validation.reason);
    throw new PromptValidationError(`Prompt rejected: ${validation.reason}`, validation.reason, userMessage);
  }

  // Newest first. The context planner receives both sides of the decision,
  // since a short reply only means something beside what the assistant asked.
  const recentTurns = conversationHistory
    .slice()
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((entry) => ({ question: entry.question, answer: entry.answer }));
  // Covers the semantic context planner first, then every model the selected
  // packs and final analysis can reach.
  await loadModelConfig();

  onProgress?.('Planning the data needed for this decision');
  const contextPlan = evaluation?.contextPlan
    ?? (evaluation
      ? fallbackContextPlan(0, 'Offline evaluation supplied the complete context.')
      : await planContext({ question, recentTurns, tier }));
  const initiallySelectedPacks = [...contextPlan.selectedPacks];
  let selectedPacks = [...initiallySelectedPacks];
  let questionNeeds = contextPlan.questionNeeds;
  let scenarioPlans = evaluation?.scenarioPlans ?? contextPlan.scenarioPlans;
  let structuredMarketContextRequested = Boolean(
    scenarioCalculatorRegistry.getPlan(scenarioPlans, HOME_AFFORDABILITY_CALCULATOR_ID)
  );
  let retirementScenarioPlan = scenarioCalculatorRegistry.getPlan<RetirementScenarioPlan>(
    scenarioPlans,
    RETIREMENT_CALCULATOR_ID
  );
  let finalSearchQueries = [...contextPlan.searchQueries];
  // Prefer the stated plan so a later audit that only changes the scenario can
  // re-withhold against the user's words, not against an already-stripped copy.
  const statedRetirementInputs =
    contextPlan.statedRetirementInputs ?? contextPlan.retirementInputs;
  let retirementBaselineInputs = retirementInputsForBaseline(
    statedRetirementInputs,
    retirementScenarioPlan
  );
  // The primary audit can discover a scenario the preflight missed. Delay any
  // persisted retirement calculation until both planning passes have finished,
  // otherwise hypothetical inputs can become the stored baseline before they
  // are recognized as overrides.
  const retirementAnalysisDeferred = !evaluation && questionNeeds.needsRetirement;

  // Step 1: Retrieve context (snapshot, profile, market summary, RAG)
  const contextGatherStartedAt = Date.now();
  let snapshot = evaluation?.snapshot ?? await gatherContextSnapshot({
    userId,
    question,
    questionNeeds,
    tier,
    recentTurns,
    plannedRetirementInputs: retirementBaselineInputs,
    searchQueries: finalSearchQueries,
    deferSearchContext: true,
    includeStructuredMarketContext: structuredMarketContextRequested,
    deferRetirementAnalysis: retirementAnalysisDeferred,
    useExistingRetirementBaseline: Boolean(retirementScenarioPlan),
    onProgress
  });
  let contextGatherMs = Date.now() - contextGatherStartedAt;
  // What routing chose, before any widening. Routing metrics have to score the
  // prediction, not the correction it triggered.
  const routedContextSelection = snapshot.contextSelection;

  // The primary model gets one constrained, tool-based opportunity to widen
  // what the preflight planner selected. It can name allowlisted packs only;
  // dependency expansion and data access remain application-owned.
  let contextTool: NonNullable<EvidenceManifest['contextPlanning']>['primaryTool'];
  let contextToolMs = 0;
  let searchRetrievalAttempted = false;
  if (!evaluation) {
    const toolAuditStartedAt = Date.now();
    let auditedPacks: ContextPackId[] = [];
    let auditModel: string | undefined;
    let auditReason = '';
    let auditDurationMs = 0;
    try {
      onProgress?.('Checking whether the analysis needs any additional data');
      const initialPromptInput = buildPromptInputFromSnapshot(question, snapshot, questionNeeds, []);
      const toolResult = await auditDataPacksWithClaude({
        transcript: buildPlannerTranscript(question, recentTurns),
        selectedPacks,
        canonicalFactLabels: (initialPromptInput.canonicalFacts?.facts ?? []).map(
          (fact) => `${fact.id}: ${fact.label}`
        ),
        plannedScenarios: scenarioPlans,
        plannedSearchQueries: finalSearchQueries,
      });
      auditedPacks = toolResult.packs;
      auditModel = toolResult.model;
      auditReason = toolResult.reason;
      auditDurationMs = toolResult.durationMs;
      finalSearchQueries = [...toolResult.searchQueries];
      scenarioPlans = scenarioCalculatorRegistry.mergePlans(scenarioPlans, toolResult.scenarioPlans);
      const shouldRequestStructuredMarketContext = Boolean(
        scenarioCalculatorRegistry.getPlan(scenarioPlans, HOME_AFFORDABILITY_CALCULATOR_ID)
      );
      retirementScenarioPlan = scenarioCalculatorRegistry.getPlan<RetirementScenarioPlan>(
        scenarioPlans,
        RETIREMENT_CALCULATOR_ID
      );
      retirementBaselineInputs = retirementInputsForBaseline(
        statedRetirementInputs,
        retirementScenarioPlan
      );
      const widenedPacks = normalizeContextPacks([
        ...selectedPacks,
        ...toolResult.packs,
        ...scenarioCalculatorRegistry.requiredPacksForPlans(scenarioPlans),
      ]);
      const addedPacks = widenedPacks.filter((pack) => !selectedPacks.includes(pack));
      contextTool = {
        outcome: addedPacks.length > 0 ? 'expanded' : 'accepted',
        model: toolResult.model,
        requestedPacks: toolResult.packs,
        addedPacks: [],
        reason: toolResult.reason,
        durationMs: toolResult.durationMs,
        searchQueries: toolResult.searchQueries,
        ...(Object.keys(toolResult.scenarioPlans).length > 0 && { scenarios: toolResult.scenarioPlans }),
      };
      if (
        addedPacks.length > 0 ||
        (widenedPacks.includes('search_context') && finalSearchQueries.length > 0) ||
        (shouldRequestStructuredMarketContext && !structuredMarketContextRequested)
      ) {
        const widenedNeeds = questionNeedsFromPacks(widenedPacks, contextPlan.needsSecondaryValidation);
        const toolGatherStartedAt = Date.now();
        const widenedSnapshot = await gatherContextSnapshot({
          userId,
          question,
          questionNeeds: widenedNeeds,
          tier,
          recentTurns,
          plannedRetirementInputs: retirementBaselineInputs,
          searchQueries: finalSearchQueries,
          includeStructuredMarketContext: shouldRequestStructuredMarketContext,
          useExistingRetirementBaseline: Boolean(retirementScenarioPlan),
          onProgress,
        });
        contextGatherMs += Date.now() - toolGatherStartedAt;
        // Commit the wider selection only after its data was loaded successfully.
        snapshot = widenedSnapshot;
        selectedPacks = widenedPacks;
        questionNeeds = widenedNeeds;
        structuredMarketContextRequested = shouldRequestStructuredMarketContext;
        contextTool.addedPacks = addedPacks;
        // Mark retrieval only after a successful gather so a failed widen can
        // still fall through to the deferred-search recovery path below.
        searchRetrievalAttempted = widenedNeeds.needsSearchContext && finalSearchQueries.length > 0;
      }
      contextToolMs = toolResult.durationMs;
    } catch (error) {
      // The preflight plan is already valid and useful. A tool-audit failure
      // must not turn a healthy analysis request into an outage.
      console.warn('Ask Linc: Primary data-pack audit or widening failed; using the context plan:', error);
      contextToolMs = auditDurationMs || Date.now() - toolAuditStartedAt;
      contextTool = {
        outcome: 'failed',
        ...(auditModel && { model: auditModel }),
        requestedPacks: auditedPacks,
        addedPacks: [],
        reason: auditedPacks.length > 0
          ? `The primary model requested more context, but it could not be loaded; the preflight plan was used. ${auditReason}`.trim()
          : 'The primary-model data-pack audit could not be completed; the preflight plan was used.',
        durationMs: contextToolMs,
      };
    }

    if (
      !searchRetrievalAttempted &&
      questionNeeds.needsSearchContext &&
      finalSearchQueries.length > 0
    ) {
      try {
        searchRetrievalAttempted = true;
        const recoveryGatherStartedAt = Date.now();
        snapshot = await gatherContextSnapshot({
          userId,
          question,
          questionNeeds,
          tier,
          recentTurns,
          plannedRetirementInputs: retirementBaselineInputs,
          searchQueries: finalSearchQueries,
          includeStructuredMarketContext: structuredMarketContextRequested,
          useExistingRetirementBaseline: Boolean(retirementScenarioPlan),
          onProgress,
        });
        contextGatherMs += Date.now() - recoveryGatherStartedAt;
      } catch (gatherError) {
        console.error('Ask Linc: Search context recovery failed after the tool audit:', gatherError);
      }
    }

    if (
      retirementAnalysisDeferred &&
      !snapshot.retirementAnalysis &&
      !snapshot.retirementAnalysisNeedsInfo
    ) {
      try {
        const completionStartedAt = Date.now();
        snapshot = await completeRetirementAnalysis(snapshot, {
          userId,
          question,
          questionNeeds,
          recentTurns,
          plannedRetirementInputs: retirementBaselineInputs,
          useExistingRetirementBaseline: Boolean(retirementScenarioPlan),
          onProgress,
        });
        contextGatherMs += Date.now() - completionStartedAt;

        // The baseline stopped for want of planning inputs that the requested
        // scenario is itself carrying. Asking the user for them would repeat a
        // question they have already answered -- in the scenario the planner
        // read out of the same sentence -- and the scenario cannot run without
        // a baseline either. Retry once with those values folded in, so the
        // deadlock resolves into the projection the user asked for.
        //
        // Start from the stated plan (pre-withhold), not the stripped baseline.
        // Folding into the stripped copy would adopt a genuine what-if override
        // (retire at 62; what about 67?) as the baseline and erase the comparison.
        const missingBaselineInputs = snapshot.retirementAnalysisNeedsInfo?.missingParams ?? [];
        if (retirementScenarioPlan && missingBaselineInputs.length > 0) {
          const recoveredInputs = retirementInputsFromScenarioPlan(
            statedRetirementInputs,
            retirementScenarioPlan
          );
          // Only retry when recovery actually closes every gap relative to the
          // inputs already tried. A second pass that would stop on the same
          // missing number costs a database read and an engine run to arrive at
          // the answer already in hand.
          const recoveryIsComplete = recoveredInputs !== retirementBaselineInputs &&
            missingBaselineInputs.every((param) => recoveredInputs?.[param] !== undefined);
          if (recoveryIsComplete) {
            const retryStartedAt = Date.now();
            const recovered = await completeRetirementAnalysis(
              { ...snapshot, retirementAnalysis: undefined, retirementAnalysisNeedsInfo: undefined },
              {
                userId,
                question,
                questionNeeds,
                recentTurns,
                plannedRetirementInputs: recoveredInputs,
                useExistingRetirementBaseline: Boolean(retirementScenarioPlan),
                onProgress,
              }
            );
            contextGatherMs += Date.now() - retryStartedAt;
            // Keep the original result when the retry did not actually produce
            // a baseline: its needsInfo describes the same gap, and the first
            // one was resolved against the inputs the user really stated.
            if (recovered.retirementAnalysis) {
              snapshot = recovered;
              retirementBaselineInputs = retirementInputsForBaseline(
                recoveredInputs,
                retirementScenarioPlan
              );
            }
          }
        }
      } catch (completionError) {
        console.error('Ask Linc: Deferred retirement analysis could not be completed:', completionError);
      }
    }
  } else {
    if (evaluation.toolRequestedPacks?.length) {
      selectedPacks = normalizeContextPacks([...selectedPacks, ...evaluation.toolRequestedPacks]);
      questionNeeds = questionNeedsFromPacks(selectedPacks, contextPlan.needsSecondaryValidation);
    }
    finalSearchQueries = evaluation.toolSearchQueries ?? finalSearchQueries;
  }

  // The semantic planner and its constrained audit define what this question
  // actually needs. Validation may later load every pack as an evidence-recovery
  // measure, but that broader read is not permission to introduce an unrelated
  // user-facing ask or disclosure. Keep the two meanings separate before the
  // late recovery path can replace questionNeeds with its exhaustive selection.
  const plannedQuestionNeeds = { ...questionNeeds };

  // A calculator that stands in for missing data has nothing to add once the
  // data is there. Dropping its plan here, against the final snapshot, keeps a
  // user with linked holdings from being reported as a request that did not run.
  scenarioPlans = scenarioCalculatorRegistry.applicablePlans(snapshot, scenarioPlans);
  if (contextTool?.scenarios) {
    const applicableToolScenarios = scenarioCalculatorRegistry.applicablePlans(snapshot, contextTool.scenarios);
    if (Object.keys(applicableToolScenarios).length > 0) contextTool.scenarios = applicableToolScenarios;
    else delete contextTool.scenarios;
  }

  const scenarioExecutions = await scenarioCalculatorRegistry.executePlans(
    snapshot,
    scenarioPlans,
    evaluation?.scenarioExecutions,
    onProgress
  );
  if (Object.keys(scenarioExecutions).length > 0) {
    snapshot = { ...snapshot, scenarioExecutions };
  }

  // Step 2: Build the prompt directly from the persisted canonical snapshot.
  const promptBuildStartedAt = Date.now();
  onProgress?.('Submitting to Claude for analysis');
  if (!evaluation?.skipToneConfig) await loadResponseToneConfig();
  const orderedConversationHistory = conversationHistory
    .slice()
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const historyForPrompt = orderedConversationHistory.map(c => ({ question: c.question, answer: c.answer }));
  const buildPromptInput = (from: typeof snapshot, needs: typeof questionNeeds) => {
    const input = buildPromptInputFromSnapshot(question, from, needs, historyForPrompt);
    const issues = validateCanonicalFactPack(input.canonicalFacts!);
    if (issues.length > 0) {
      throw new Error(`Canonical fact validation failed: ${issues.join(' ')}`);
    }
    return input;
  };
  let promptInput = buildPromptInput(snapshot, questionNeeds);
  let factPack = promptInput.canonicalFacts!;

  // Step 3: LLM financial reasoning (Claude Sonnet). Build the prompt once and
  // pass it through (avoids rebuilding the large reasoning prompt inside the client).
  // When a delta sink is provided, stream the answer's summary text as it arrives.
  const { systemPrompt, userMessage } = buildFinancialReasoningPrompt(promptInput);
  const promptBuildMs = Date.now() - promptBuildStartedAt;
  const modelCalls: EvidenceManifest['modelCalls'] = [];
  const secondaryValidations: NonNullable<EvidenceManifest['validation']['secondary']> = [];
  interface ModelReply {
    rawResponse: string;
    provider: 'claude' | 'openai';
    response: AskLincResponse;
    format: ResponseFormat;
  }
  const callAnalysisModel = async (
    prompt: { systemPrompt: string; userMessage: string },
    phase: 'initial' | 'retry',
    preferredProvider: 'claude' | 'openai' = 'claude'
  ): Promise<ModelReply> => {
    const promptCharacters = prompt.systemPrompt.length + prompt.userMessage.length;
    const startedAt = Date.now();
    let rawResponse: string;
    let provider: 'claude' | 'openai';
    // Written by the client's callback; a holder keeps TypeScript from
    // narrowing it to its initial value at the read below.
    const stop: { reason?: string } = {};
    if (evaluation) {
      rawResponse = await evaluation.model({
        systemPrompt: prompt.systemPrompt,
        userMessage: prompt.userMessage,
        phase,
      });
      provider = 'claude';
    } else if (preferredProvider === 'openai') {
      rawResponse = await askOpenAIWithPreparedPrompt(prompt.systemPrompt, prompt.userMessage, {
        onFinishReason: (reason) => { stop.reason = reason ?? undefined; },
      });
      provider = 'openai';
    } else {
      const onStopReason = (reason: string | null) => { stop.reason = reason ?? undefined; };
      try {
        rawResponse = onAnswerDelta
          ? await askClaudeStream(prompt.systemPrompt, prompt.userMessage, makeAnswerStreamer(onAnswerDelta, () => {
              firstAnswerTokenAt ??= Date.now();
            }), { onStopReason })
          : await askClaude(prompt.systemPrompt, prompt.userMessage, { onStopReason });
        provider = 'claude';
      } catch (error) {
        modelCalls.push({
          phase,
          provider: 'claude',
          outcome: 'failed',
          promptCharacters,
          responseCharacters: 0,
          durationMs: Date.now() - startedAt,
        });
        console.error('Ask Linc: Claude failed; reusing the prepared context pack with OpenAI:', error);
        onAnswerReset?.();
        firstAnswerTokenAt = undefined;
        onProgress?.('Primary model unavailable; using backup analysis model');
        return callAnalysisModel(prompt, phase, 'openai');
      }
    }
    const { response, format } = parseStructuredResponseWithFormat(rawResponse);
    modelCalls.push({
      phase,
      provider,
      outcome: 'success',
      promptCharacters,
      responseCharacters: rawResponse.length,
      durationMs: Date.now() - startedAt,
      ...(stop.reason && { stopReason: stop.reason }),
      responseFormat: format,
    });
    return { rawResponse, provider, response, format };
  };
  const initialReply = await callAnalysisModel({ systemPrompt, userMessage }, 'initial');
  let { provider } = initialReply;

  // Step 4: Parse and validate the structured response locally.
  const validationStartedAt = Date.now();
  let structuredResponse = canonicalizeResponseNumbers(initialReply.response, factPack);
  let groundingResult = validateResponseFacts(structuredResponse, factPack);
  let deterministicOutcome: 'passed' | 'salvaged' | 'replaced' = 'passed';
  let salvageRemovals: SalvageRemovals | undefined;
  let shippedDraft: 'initial' | 'retry' | undefined;
  let contextEscalated = false;
  let secondaryCaveat = false;

  // A reply that is not an answer fails here even when every figure it
  // happens to contain is grounded; otherwise it ships as one.
  let validationIssues = [...groundingResult.issues, ...formatIssues(initialReply.format)];

  const runSecondaryValidation = async (phase: 'initial' | 'retry'): Promise<string[]> => {
    if (!enableValidation || !questionNeeds.needsSecondaryValidation) return [];
    try {
      onProgress?.('Sanity checking with Gemini');
      const { validateWithGemini } = await import('./response-validator');
      const validationResult = await validateWithGemini(structuredResponse, { question, snapshot });
      secondaryValidations.push({
        phase,
        valid: validationResult.valid,
        issues: validationResult.issues || [],
      });
      return validationResult.valid ? [] : (validationResult.issues || []);
    } catch (err) {
      console.warn('Ask Linc: Validation layer failed, using initial response:', err);
      return [];
    }
  };

  validationIssues = Array.from(new Set([
    ...validationIssues,
    // A reply that is not an answer has no reasoning to review.
    ...(initialReply.format === 'structured' ? await runSecondaryValidation('initial') : []),
  ]));
  // Everything the first draft failed, as first checked: the reason any
  // recovery or retry below runs. Widening re-judges the draft and replaces
  // validationIssues, so this is the only record of the original verdict.
  const initialIssues = [...validationIssues];

  if (validationIssues.length > 0) {
    console.warn('Ask Linc: Response validation failed, regenerating with feedback:', validationIssues);
    // Secondary validation reports reasoning, not fact citations, and a reply in
    // the wrong format is not missing a fact either, so widening the context
    // cannot resolve these the way it can resolve a missing fact.
    const nonGroundingIssues = validationIssues.filter((issue) => !groundingResult.issues.includes(issue));

    // The model reached for a number nobody gave it. Rather than re-prompting
    // against the same fact pack and hoping for restraint, widen the context and
    // let the retry answer the question it was actually asked. Routing predicts
    // what a question needs; this reacts to what it turned out to need.
    if (!evaluation && hasUnsupportedValueIssue(groundingResult.issues)) {
      // Semantic planning and the primary tool pass have already had their say.
      // If the answer still reached for missing evidence, the deterministic
      // recovery is exhaustive rather than another language heuristic: make
      // every remaining allowlisted pack available and re-check the answer.
      const escalatedPacks = allContextPacks();
      const escalatedNeeds = questionNeedsFromPacks(
        escalatedPacks,
        contextPlan.needsSecondaryValidation
      );
      const widens = escalatedPacks.some((pack) => !selectedPacks.includes(pack));
      if (widens) {
        try {
          onProgress?.('Loading more of your financial data');
          const escalationStartedAt = Date.now();
          snapshot = await gatherContextSnapshot({
            userId,
            question,
            questionNeeds: escalatedNeeds,
            tier,
            recentTurns,
            plannedRetirementInputs: retirementBaselineInputs,
            searchQueries: finalSearchQueries,
            includeStructuredMarketContext: structuredMarketContextRequested,
            useExistingRetirementBaseline: Boolean(retirementScenarioPlan),
            onProgress,
          });
          // Scenario results are answer-scoped and never persisted into the
          // financial snapshot. Reattach them after any late gather so the
          // retry keeps the same deterministic facts and disclosures.
          if (Object.keys(scenarioExecutions).length > 0) {
            snapshot = { ...snapshot, scenarioExecutions };
          }
          contextGatherMs += Date.now() - escalationStartedAt;
          selectedPacks = escalatedPacks;
          questionNeeds = escalatedNeeds;
          // Recovery reads every pack so the retry can cite the evidence the
          // first answer reached for. Two parts of the retirement pack are not
          // that evidence, and both put the user's retirement inputs in front
          // of a question that never asked for them:
          //  - `retirementAnalysisNeedsInfo` is a standing instruction to ask
          //    the user for those inputs, carrying the detected values with it.
          //  - `_storedInputParams` becomes canonical facts for current age,
          //    retirement age, spending, and withdrawal age, which is what
          //    makes a stray "$120,000" survive grounding in the retry.
          // Dropping both leaves the analysis itself — allocations, survival
          // rate, depletion percentiles — so recovery still supplies the
          // evidence it exists to supply.
          const snapshotForPrompt = plannedQuestionNeeds.needsRetirement
            ? snapshot
            : {
                ...snapshot,
                retirementAnalysisNeedsInfo: undefined,
                ...(snapshot.retirementAnalysis && {
                  retirementAnalysis: {
                    ...snapshot.retirementAnalysis,
                    _storedInputParams: undefined,
                  },
                }),
              };
          promptInput = buildPromptInput(snapshotForPrompt, escalatedNeeds);
          factPack = promptInput.canonicalFacts!;
          contextEscalated = true;
        } catch (error) {
          // A failed widening must not cost the user the retry they were owed.
          console.error('Ask Linc: Context escalation failed; retrying with the original context:', error);
        }
      }

      // Re-judge the first answer against the wider pack. Skipping this would
      // hand the retry a "Must Fix" telling it to drop the very number the
      // widened context just supplied — and when every issue resolves, the
      // answer was right all along and needs no second call at all.
      if (contextEscalated) {
        structuredResponse = canonicalizeResponseNumbers(initialReply.response, factPack);
        groundingResult = validateResponseFacts(structuredResponse, factPack);
        validationIssues = Array.from(new Set([...groundingResult.issues, ...nonGroundingIssues]));
        if (validationIssues.length === 0) {
          console.warn('Ask Linc: Widened context grounded the original answer; skipping the retry.');
        }
      }
    }

    if (validationIssues.length > 0) {
      // As judged against the final fact pack, so a fallback to it below is
      // held to the same pack as the retry it stands in for.
      const firstDraft = {
        response: structuredResponse,
        grounding: groundingResult,
        format: initialReply.format,
      };
      const retryPrompt = buildFinancialReasoningPrompt({
        ...promptInput,
        validationFeedback: selectValidationFeedback(validationIssues),
      });
      onAnswerReset?.();
      firstAnswerTokenAt = undefined;
      const retryResult = await callAnalysisModel(retryPrompt, 'retry', provider);
      provider = retryResult.provider;
      if (retryResult.format === 'structured') {
        structuredResponse = canonicalizeResponseNumbers(retryResult.response, factPack);
        groundingResult = validateResponseFacts(structuredResponse, factPack);
        shippedDraft = 'retry';
      } else if (firstDraft.format === 'structured') {
        // The retry came back with no answer in it. The first draft was a real
        // answer whose problems are already known, and salvage below can cut
        // exactly those out. A retry that merely passes grounding is not a
        // better answer when it says nothing: one such retry was a single
        // lead-in sentence, and it replaced a full answer that had one
        // unsupported figure.
        console.error(`Ask Linc: Retry returned ${retryResult.format} output; keeping the first draft.`);
        structuredResponse = firstDraft.response;
        groundingResult = firstDraft.grounding;
        shippedDraft = 'initial';
      } else {
        // Neither generation produced an answer, so there is nothing to salvage.
        console.error(`Ask Linc: Both generations returned no answer (${firstDraft.format}, ${retryResult.format}).`);
        groundingResult = {
          valid: false,
          issues: formatIssues(retryResult.format),
          invalidKeyNumbers: [],
          invalidSummary: true,
        };
        salvageRemovals = {
          sentences: [],
          keyNumbers: [],
          ...(retryResult.rawResponse.trim() && { replacedSummary: retryResult.rawResponse.trim() }),
        };
        structuredResponse = { summary: UNVERIFIABLE_SUMMARY, insights: [], suggested_actions: [] };
        deterministicOutcome = 'replaced';
      }
      if (deterministicOutcome !== 'replaced' && !groundingResult.valid) {
        console.error(
          `Ask Linc: ${shippedDraft === 'initial' ? 'First draft' : 'Retry'} was still not grounded:`,
          groundingResult.issues
        );
        // Keep the grounded part of the answer; the placeholder is the last resort.
        const salvage = salvageUngroundedResponseWithDetail(structuredResponse, factPack, groundingResult);
        structuredResponse = salvage.response;
        salvageRemovals = salvage.removals;
        deterministicOutcome = structuredResponse.summary === UNVERIFIABLE_SUMMARY ? 'replaced' : 'salvaged';
        // Salvage left nothing to ship; do not claim a draft that became the placeholder.
        if (deterministicOutcome === 'replaced') shippedDraft = undefined;
      }

      // Salvaged prose reaches the user, so it owes the same secondary check as a
      // retry that passed outright. Only the placeholder has nothing left to check.
      if (deterministicOutcome !== 'replaced') {
        const postRetryIssues = await runSecondaryValidation('retry');
        if (postRetryIssues.length > 0) {
          console.error('Ask Linc: Retry passed grounding but secondary validation still flagged issues:', postRetryIssues);
          // Every figure here has been checked against the snapshot; what the
          // reviewer objects to is the reasoning around them. Discarding the
          // answer for that spent the user's time and returned nothing, so it
          // ships with the objection attached instead. The specific issues stay
          // in the evidence manifest for review rather than going to the user,
          // where internal QA phrasing would confuse more than it warns.
          structuredResponse = appendNotice(structuredResponse, SECONDARY_REVIEW_CAVEAT);
          secondaryCaveat = true;
        }
      }
    }
  }

  onProgress?.('Formatting response');

  // A projection is only as right as the inputs read out of the conversation.
  // Stating them — with the user's own words where they are known — turns a
  // misread from something found later in the math into something corrected in
  // the next reply.
  // A scenario disclosure already contains the inherited baseline plus every
  // changed/defaulted variant input. Appending the baseline sentence too would
  // repeat the same ages and spending immediately before it.
  const retirementAssumptions =
    plannedQuestionNeeds.needsRetirement && !scenarioExecutions[RETIREMENT_CALCULATOR_ID]
      ? describeRetirementAssumptions(snapshot)
      : null;
  if (retirementAssumptions) {
    structuredResponse = appendNotice(structuredResponse, retirementAssumptions);
  }
  for (const disclosure of scenarioCalculatorRegistry.assumptionDisclosures(scenarioExecutions)) {
    structuredResponse = appendNotice(structuredResponse, disclosure);
  }
  // A calculator waiting on figures only the user has also hands the client a
  // form for them. Its disclosure above still asks in words, for any client
  // that does not render the form.
  const inputRequest = scenarioCalculatorRegistry.inputRequest(scenarioExecutions);
  if (inputRequest) {
    structuredResponse = { ...structuredResponse, input_request: inputRequest };
  }

  // When something the question needed is missing and the user is the one who
  // can supply it, ask for it. Appended after validation because it is
  // server-authored: these values come from persisted state, not the model.
  // Last, so the answer closes on what the user can do next -- after the
  // assumptions it would change, not before them.
  const missingInputsAsk = describeMissingInputs(snapshot, plannedQuestionNeeds, {
    personalDataQuestion: contextPlan.personalDataQuestion,
  });
  if (missingInputsAsk) {
    structuredResponse = appendNotice(structuredResponse, missingInputsAsk);
  }

  // Step 6: Output validation (security)
  const displayText = toDisplayText(structuredResponse);
  const outputValidation = validateLLMResponse(displayText);
  if (!outputValidation.safe) {
    logFlaggedOutput(displayText, outputValidation.flagged || 'unknown', { userId });
    recordLlmAnalysisFailure(Date.now() - pipelineStartedAt);
    // The form is application-owned (calculator fields, not model prose), so
    // keep it when the written answer is replaced with the safety fallback.
    return {
      structuredResponse: {
        summary: outputValidation.sanitized,
        insights: [],
        suggested_actions: [],
        ...(inputRequest && { input_request: inputRequest }),
      },
      displayText: outputValidation.sanitized
    };
  }

  const marketContextDigest = contextDigest(snapshot.marketContext);
  const searchContextDigest = contextDigest(snapshot.searchContext);
  const showTheMathData: ShowTheMathData = {
    evidenceManifest: {
      version: 1,
      generatedAt: new Date().toISOString(),
      snapshot: {
        ...(factPack.snapshotComputedAt && { computedAt: factPack.snapshotComputedAt }),
        ...(factPack.snapshotAsOf && { asOf: factPack.snapshotAsOf }),
        ...(snapshot.financialSummary?.status && { status: snapshot.financialSummary.status }),
      },
      facts: factPack.facts,
      contextSelection: snapshot.contextSelection,
      ...(contextEscalated && { contextEscalated: true }),
      ...((contextEscalated || (contextTool?.addedPacks.length ?? 0) > 0) &&
        routedContextSelection && { routedContextSelection }),
      ...((contextTool?.addedPacks.length ?? 0) > 0 && { contextToolExpanded: true }),
      contextPlanning: {
        source: contextPlan.source,
        ...(contextPlan.model && { model: contextPlan.model }),
        durationMs: contextPlan.durationMs,
        requestedPacks: contextPlan.requestedPacks,
        selectedPacks: initiallySelectedPacks,
        finalPacks: selectedPacks,
        needsSecondaryValidation: contextPlan.needsSecondaryValidation,
        searchQueries: contextPlan.searchQueries,
        summary: contextPlan.summary,
        ...(Object.keys(scenarioPlans).length > 0 && { scenarios: scenarioPlans }),
        ...(contextTool && { primaryTool: contextTool }),
      },
      ...(Object.keys(scenarioExecutions).length > 0 && {
        scenarioExecutions: scenarioCalculatorRegistry.compactEvidenceRecord(scenarioExecutions),
      }),
      ...(secondaryCaveat && { secondaryCaveat: true }),
      modelCalls,
      timings: {
        planningMs: contextPlan.durationMs,
        ...(contextTool && { contextToolMs }),
        ...(Object.keys(scenarioExecutions).length > 0 && {
          scenarioMs: Object.values(scenarioExecutions)
            .reduce((total, execution) => total + execution.durationMs, 0),
        }),
        contextGatherMs,
        promptBuildMs,
        modelMs: modelCalls.reduce((total, call) => total + call.durationMs, 0),
        validationMs: Date.now() - validationStartedAt,
        ...(firstAnswerTokenAt && { timeToFirstAnswerTokenMs: firstAnswerTokenAt - pipelineStartedAt }),
        totalMs: Date.now() - pipelineStartedAt,
      },
      validation: {
        deterministic: {
          valid: groundingResult.valid,
          issues: groundingResult.issues,
          outcome: deterministicOutcome,
          ...(salvageRemovals && { removals: salvageRemovals }),
          ...(shippedDraft && { shippedDraft }),
        },
        ...(secondaryValidations.length > 0 && { secondary: secondaryValidations }),
        ...(initialIssues.length > 0 && { initialIssues }),
      },
      evidenceRefs: {
        tickers: evidenceTickers(snapshot, question),
        retirementAnalysis: Boolean(snapshot.retirementAnalysis),
        ...(snapshot.retirementAnalysis?._evidence?.recordId && {
          retirementAnalysisId: snapshot.retirementAnalysis._evidence.recordId,
        }),
        marketContext: Boolean(snapshot.marketContext),
        ...(marketContextDigest && { marketContextDigest }),
        ...(snapshot.marketContextMetadata?.id && { marketContextId: snapshot.marketContextMetadata.id }),
        ...(snapshot.marketContextMetadata?.tier && { marketContextTier: snapshot.marketContextMetadata.tier }),
        ...(snapshot.marketContextMetadata?.lastUpdate && {
          marketContextLastUpdate: snapshot.marketContextMetadata.lastUpdate,
        }),
        ...(searchContextDigest && { searchContextDigest }),
        ...(snapshot.searchContextMetadata && { search: snapshot.searchContextMetadata }),
        ...(snapshot.searchQueryOutcomes && { searchQueryOutcomes: snapshot.searchQueryOutcomes }),
      },
    },
  };

  return {
    structuredResponse,
    displayText,
    showTheMathData
  };
}
