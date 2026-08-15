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
import { analyzeQuestionNeeds } from './question-analysis';
import { gatherContextSnapshot } from './context-service';
import { buildPromptInputFromSnapshot, buildFinancialReasoningPrompt } from './financial-reasoning-prompt';
import { loadResponseToneConfig } from './prompt-config';
import { askClaude, askClaudeStream } from './claude-client';
import { parseStructuredResponse, toDisplayText, extractPartialSummary, AskLincResponse } from './structured-response';
import { validateUserPrompt, getRejectionMessage } from '../security/prompt-validation';
import { validateLLMResponse } from '../security/output-validation';
import { logRejectedPrompt, logFlaggedOutput } from '../security/security-logger';
import { PromptValidationError } from './errors';
import type { EvidenceManifest, ShowTheMathData } from './show-the-math-types';
import { sanitizeUngroundedResponse, UNVERIFIABLE_SUMMARY } from './response-grounding';
import {
  canonicalizeResponseNumbers,
  hasUnsupportedValueIssue,
  salvageUngroundedResponse,
  validateResponseFacts,
} from './response-facts';
import { validateCanonicalFactPack } from './canonical-facts';
import { askOpenAIWithPreparedPrompt } from './openai-fallback-client';
import { createHash } from 'crypto';
import { recordLlmAnalysisFailure } from '../observability/llm-metrics';
import type { FinancialContextSnapshot } from './types';

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

/** Context tiers a retry can switch on; the rest is loaded for every question. */
const ROUTED_NEEDS = [
  'needsAccountDetails',
  'needsTransactionDetails',
  'needsInvestments',
  'needsRetirement',
] as const;

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

  onProgress?.('Loading your financial snapshot');

  const recentQuestions = conversationHistory
    .slice()
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((entry) => entry.question);
  const questionNeeds = analyzeQuestionNeeds(question, recentQuestions);

  // Step 1: Retrieve context (snapshot, profile, market summary, RAG)
  const contextGatherStartedAt = Date.now();
  let snapshot = evaluation?.snapshot ?? await gatherContextSnapshot({
    userId,
    question,
    questionNeeds,
    tier,
    onProgress
  });
  let contextGatherMs = Date.now() - contextGatherStartedAt;
  // What routing chose, before any widening. Routing metrics have to score the
  // prediction, not the correction it triggered.
  const routedContextSelection = snapshot.contextSelection;

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
      const escalatedNeeds = {
        ...questionNeeds,
        needsAccountDetails: true,
        needsTransactionDetails: true,
        needsInvestments: true,
        needsRetirement: true,
      };
      const widens = ROUTED_NEEDS.some((need) => !questionNeeds[need]);
      if (widens) {
        try {
          onProgress?.('Loading more of your financial data');
          const escalationStartedAt = Date.now();
          snapshot = await gatherContextSnapshot({ userId, question, questionNeeds: escalatedNeeds, tier, onProgress });
          contextGatherMs += Date.now() - escalationStartedAt;
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
          // Secondary validation reports prose, not claims, so there is nothing
          // specific to strip — the whole answer has to go.
          structuredResponse = sanitizeUngroundedResponse(structuredResponse, {
            valid: false,
            issues: postRetryIssues,
            invalidKeyNumbers: [],
            invalidSummary: true,
          });
          deterministicOutcome = 'replaced';
        }
      }
    }
  }

  onProgress?.('Formatting response');

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
      ...(contextEscalated && {
        contextEscalated: true,
        ...(routedContextSelection && { routedContextSelection }),
      }),
      modelCalls,
      timings: {
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
