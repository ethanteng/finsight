/**
 * Ask Linc Analysis Pipeline
 *
 * Orchestrates the LLM-driven financial reasoning pipeline:
 * 1. Retrieve financial snapshot, user profile, market summary
 * 2. Call RAG retrieval
 * 3. LLM financial reasoning (Claude Sonnet)
 * 4. Optional validation (Gemini)
 * 5. Structured response
 *
 * Application code owns canonical facts and arithmetic; models explain those results.
 */

import { UserTier } from '../data/types';
import { gatherContextSnapshot } from './context-service';
import { buildPromptInputFromSnapshot, buildFinancialReasoningPrompt } from './financial-reasoning-prompt';
import { loadResponseToneConfig } from './prompt-config';
import { loadModelConfig } from './model-config';
import { askClaude, askClaudeStream, auditDataPacksWithClaude } from './claude-client';
import { parseStructuredResponse, toDisplayText, extractPartialSummary, AskLincResponse } from './structured-response';
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
  salvageUngroundedResponse,
  validateResponseFacts,
} from './response-facts';
import { validateCanonicalFactPack } from './canonical-facts';
import { describeMissingInputs } from './missing-inputs';
import {
  describeRetirementAssumptions,
  describeRetirementScenarioAssumptions,
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
  type RetirementScenarioExecution,
  type RetirementScenarioEvidence,
  type RetirementScenarioPlan,
} from '../scenarios/retirement-scenario';
import { scenarioCalculatorRegistry } from '../scenarios/calculator-registry';

const RETIREMENT_CALCULATOR = scenarioCalculatorRegistry.require<
  RetirementScenarioPlan,
  RetirementScenarioExecution,
  RetirementScenarioEvidence
>(RETIREMENT_CALCULATOR_ID);

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
    retirementScenarioPlan?: RetirementScenarioPlan;
    retirementScenarioExecution?: RetirementScenarioExecution;
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
  let retirementScenarioPlan = evaluation?.retirementScenarioPlan ?? contextPlan.retirementScenario;
  let retirementBaselineInputs = retirementInputsForBaseline(
    contextPlan.retirementInputs,
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
        plannedRetirementScenario: retirementScenarioPlan,
      });
      auditedPacks = toolResult.packs;
      auditModel = toolResult.model;
      auditReason = toolResult.reason;
      auditDurationMs = toolResult.durationMs;
      retirementScenarioPlan = retirementScenarioPlan ?? toolResult.retirementScenario;
      retirementBaselineInputs = retirementInputsForBaseline(
        contextPlan.retirementInputs,
        retirementScenarioPlan
      );
      const widenedPacks = normalizeContextPacks([
        ...selectedPacks,
        ...toolResult.packs,
        ...(retirementScenarioPlan ? RETIREMENT_CALCULATOR.requiredPacks : []),
      ]);
      const addedPacks = widenedPacks.filter((pack) => !selectedPacks.includes(pack));
      contextTool = {
        outcome: addedPacks.length > 0 ? 'expanded' : 'accepted',
        model: toolResult.model,
        requestedPacks: toolResult.packs,
        addedPacks: [],
        reason: toolResult.reason,
        durationMs: toolResult.durationMs,
        ...(toolResult.retirementScenario && { retirementScenario: toolResult.retirementScenario }),
      };
      if (addedPacks.length > 0 || retirementAnalysisDeferred) {
        const widenedNeeds = questionNeedsFromPacks(widenedPacks, contextPlan.needsSecondaryValidation);
        const toolGatherStartedAt = Date.now();
        const widenedSnapshot = await gatherContextSnapshot({
          userId,
          question,
          questionNeeds: widenedNeeds,
          tier,
          recentTurns,
          plannedRetirementInputs: retirementBaselineInputs,
          useExistingRetirementBaseline: Boolean(retirementScenarioPlan),
          onProgress,
        });
        contextGatherMs += Date.now() - toolGatherStartedAt;
        // Commit the wider selection only after its data was loaded successfully.
        snapshot = widenedSnapshot;
        selectedPacks = widenedPacks;
        questionNeeds = widenedNeeds;
        contextTool.addedPacks = addedPacks;
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
      if (retirementAnalysisDeferred) {
        try {
          const recoveryGatherStartedAt = Date.now();
          snapshot = await gatherContextSnapshot({
            userId,
            question,
            questionNeeds,
            tier,
            recentTurns,
            plannedRetirementInputs: retirementBaselineInputs,
            useExistingRetirementBaseline: Boolean(retirementScenarioPlan),
            onProgress,
          });
          contextGatherMs += Date.now() - recoveryGatherStartedAt;
        } catch (gatherError) {
          console.error('Ask Linc: Retirement context recovery failed after the tool audit:', gatherError);
        }
      }
    }
  } else if (evaluation?.toolRequestedPacks?.length) {
    selectedPacks = normalizeContextPacks([...selectedPacks, ...evaluation.toolRequestedPacks]);
    questionNeeds = questionNeedsFromPacks(selectedPacks, contextPlan.needsSecondaryValidation);
  }

  let retirementScenarioExecution: RetirementScenarioExecution | undefined;
  if (retirementScenarioPlan) {
    onProgress?.('Running the retirement scenarios');
    try {
      retirementScenarioExecution = evaluation?.retirementScenarioExecution
        ?? await scenarioCalculatorRegistry.execute<RetirementScenarioPlan, RetirementScenarioExecution>(
          RETIREMENT_CALCULATOR_ID,
          snapshot,
          retirementScenarioPlan
        );
    } catch (error) {
      console.error('Ask Linc: Retirement scenario execution failed:', error);
      retirementScenarioExecution = RETIREMENT_CALCULATOR.unavailable(
        Date.now(),
        'The requested retirement scenario could not be calculated. The existing retirement baseline remains available.'
      );
    }
    snapshot = { ...snapshot, retirementScenarioExecution };
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
  const callAnalysisModel = async (
    prompt: { systemPrompt: string; userMessage: string },
    phase: 'initial' | 'retry',
    preferredProvider: 'claude' | 'openai' = 'claude'
  ): Promise<{ rawResponse: string; provider: 'claude' | 'openai' }> => {
    if (evaluation) {
      const startedAt = Date.now();
      const rawResponse = await evaluation.model({
        systemPrompt: prompt.systemPrompt,
        userMessage: prompt.userMessage,
        phase,
      });
      modelCalls.push({
        phase,
        provider: 'claude',
        outcome: 'success',
        promptCharacters: prompt.systemPrompt.length + prompt.userMessage.length,
        responseCharacters: rawResponse.length,
        durationMs: Date.now() - startedAt,
      });
      return { rawResponse, provider: 'claude' };
    }
    if (preferredProvider === 'openai') {
      const startedAt = Date.now();
      const rawResponse = await askOpenAIWithPreparedPrompt(prompt.systemPrompt, prompt.userMessage);
      modelCalls.push({
        phase,
        provider: 'openai',
        outcome: 'success',
        promptCharacters: prompt.systemPrompt.length + prompt.userMessage.length,
        responseCharacters: rawResponse.length,
        durationMs: Date.now() - startedAt,
      });
      return {
        rawResponse,
        provider: 'openai',
      };
    }
    const claudeStartedAt = Date.now();
    try {
      const raw = onAnswerDelta
        ? await askClaudeStream(prompt.systemPrompt, prompt.userMessage, makeAnswerStreamer(onAnswerDelta, () => {
            firstAnswerTokenAt ??= Date.now();
          }))
        : await askClaude(prompt.systemPrompt, prompt.userMessage);
      modelCalls.push({
        phase,
        provider: 'claude',
        outcome: 'success',
        promptCharacters: prompt.systemPrompt.length + prompt.userMessage.length,
        responseCharacters: raw.length,
        durationMs: Date.now() - claudeStartedAt,
      });
      return { rawResponse: raw, provider: 'claude' };
    } catch (error) {
      modelCalls.push({
        phase,
        provider: 'claude',
        outcome: 'failed',
        promptCharacters: prompt.systemPrompt.length + prompt.userMessage.length,
        responseCharacters: 0,
        durationMs: Date.now() - claudeStartedAt,
      });
      console.error('Ask Linc: Claude failed; reusing the prepared context pack with OpenAI:', error);
      onAnswerReset?.();
      firstAnswerTokenAt = undefined;
      onProgress?.('Primary model unavailable; using backup analysis model');
      return callAnalysisModel(prompt, phase, 'openai');
    }
  };
  let { rawResponse, provider } = await callAnalysisModel({ systemPrompt, userMessage }, 'initial');

  // Step 4: Parse and validate the structured response locally.
  const validationStartedAt = Date.now();
  let structuredResponse = canonicalizeResponseNumbers(parseStructuredResponse(rawResponse), factPack);
  let groundingResult = validateResponseFacts(structuredResponse, factPack);
  let deterministicOutcome: 'passed' | 'salvaged' | 'replaced' = 'passed';
  let contextEscalated = false;
  let secondaryCaveat = false;

  let validationIssues = groundingResult.issues;

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
    ...(await runSecondaryValidation('initial')),
  ]));

  if (validationIssues.length > 0) {
    console.warn('Ask Linc: Response validation failed, regenerating with feedback:', validationIssues);
    // Secondary validation reports reasoning, not fact citations, so widening the
    // context cannot resolve those issues the way it can resolve a missing fact.
    const secondaryIssues = validationIssues.filter((issue) => !groundingResult.issues.includes(issue));

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
            useExistingRetirementBaseline: Boolean(retirementScenarioPlan),
            onProgress,
          });
          // Scenario results are answer-scoped and never persisted into the
          // financial snapshot. Reattach them after any late gather so the
          // retry keeps the same deterministic facts and disclosures.
          if (retirementScenarioExecution) {
            snapshot = { ...snapshot, retirementScenarioExecution };
          }
          contextGatherMs += Date.now() - escalationStartedAt;
          selectedPacks = escalatedPacks;
          questionNeeds = escalatedNeeds;
          promptInput = buildPromptInput(snapshot, escalatedNeeds);
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
        structuredResponse = canonicalizeResponseNumbers(parseStructuredResponse(rawResponse), factPack);
        groundingResult = validateResponseFacts(structuredResponse, factPack);
        validationIssues = Array.from(new Set([...groundingResult.issues, ...secondaryIssues]));
        if (validationIssues.length === 0) {
          console.warn('Ask Linc: Widened context grounded the original answer; skipping the retry.');
        }
      }
    }

    if (validationIssues.length > 0) {
      const retryPrompt = buildFinancialReasoningPrompt({
        ...promptInput,
        validationFeedback: selectValidationFeedback(validationIssues),
      });
      onAnswerReset?.();
      firstAnswerTokenAt = undefined;
      const retryResult = await callAnalysisModel(retryPrompt, 'retry', provider);
      rawResponse = retryResult.rawResponse;
      provider = retryResult.provider;
      structuredResponse = canonicalizeResponseNumbers(parseStructuredResponse(rawResponse), factPack);
      groundingResult = validateResponseFacts(structuredResponse, factPack);
      if (!groundingResult.valid) {
        console.error('Ask Linc: Retry was still not grounded:', groundingResult.issues);
        // Keep the grounded part of the answer; the placeholder is the last resort.
        structuredResponse = salvageUngroundedResponse(structuredResponse, factPack, groundingResult);
        deterministicOutcome = structuredResponse.summary === UNVERIFIABLE_SUMMARY ? 'replaced' : 'salvaged';
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

  // When something the question needed is missing and the user is the one who
  // can supply it, ask for it. Appended after validation because it is
  // server-authored: these values come from persisted state, not the model.
  const missingInputsAsk = describeMissingInputs(snapshot, questionNeeds);
  if (missingInputsAsk) {
    structuredResponse = appendNotice(structuredResponse, missingInputsAsk);
  }

  // A projection is only as right as the inputs read out of the conversation.
  // Stating them — with the user's own words where they are known — turns a
  // misread from something found later in the math into something corrected in
  // the next reply.
  // A scenario disclosure already contains the inherited baseline plus every
  // changed/defaulted variant input. Appending the baseline sentence too would
  // repeat the same ages and spending immediately before it.
  const retirementAssumptions = snapshot.retirementScenarioExecution
    ? null
    : describeRetirementAssumptions(snapshot);
  if (retirementAssumptions) {
    structuredResponse = appendNotice(structuredResponse, retirementAssumptions);
  }
  const retirementScenarioAssumptions = describeRetirementScenarioAssumptions(snapshot);
  if (retirementScenarioAssumptions) {
    structuredResponse = appendNotice(structuredResponse, retirementScenarioAssumptions);
  }

  // Step 6: Output validation (security)
  const displayText = toDisplayText(structuredResponse);
  const outputValidation = validateLLMResponse(displayText);
  if (!outputValidation.safe) {
    logFlaggedOutput(displayText, outputValidation.flagged || 'unknown', { userId });
    recordLlmAnalysisFailure(Date.now() - pipelineStartedAt);
    return {
      structuredResponse: { summary: outputValidation.sanitized, insights: [], suggested_actions: [] },
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
        summary: contextPlan.summary,
        ...(retirementScenarioPlan && { retirementScenario: retirementScenarioPlan }),
        ...(contextTool && { primaryTool: contextTool }),
      },
      ...(retirementScenarioExecution && {
        scenarioExecution: scenarioCalculatorRegistry.compactEvidence<
          RetirementScenarioExecution,
          RetirementScenarioEvidence
        >(RETIREMENT_CALCULATOR_ID, retirementScenarioExecution),
      }),
      ...(secondaryCaveat && { secondaryCaveat: true }),
      modelCalls,
      timings: {
        planningMs: contextPlan.durationMs,
        ...(contextTool && { contextToolMs }),
        ...(retirementScenarioExecution && { scenarioMs: retirementScenarioExecution.durationMs }),
        contextGatherMs,
        promptBuildMs,
        modelMs: modelCalls.reduce((total, call) => total + call.durationMs, 0),
        validationMs: Date.now() - validationStartedAt,
        ...(firstAnswerTokenAt && { timeToFirstAnswerTokenMs: firstAnswerTokenAt - pipelineStartedAt }),
        totalMs: Date.now() - pipelineStartedAt,
      },
      validation: {
        deterministic: { valid: groundingResult.valid, issues: groundingResult.issues, outcome: deterministicOutcome },
        ...(secondaryValidations.length > 0 && { secondary: secondaryValidations }),
      },
      evidenceRefs: {
        tickers: evidenceTickers(snapshot, question),
        retirementAnalysis: Boolean(snapshot.retirementAnalysis),
        ...(snapshot.retirementAnalysis?._evidence?.recordId && {
          retirementAnalysisId: snapshot.retirementAnalysis._evidence.recordId,
        }),
        marketContext: Boolean(snapshot.marketContext),
        ...(marketContextDigest && { marketContextDigest }),
        ...(searchContextDigest && { searchContextDigest }),
      },
    },
  };

  return {
    structuredResponse,
    displayText,
    showTheMathData
  };
}
