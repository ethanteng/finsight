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
import { sanitizeUngroundedResponse } from './response-grounding';
import { canonicalizeResponseNumbers, validateResponseFacts } from './response-facts';
import { validateCanonicalFactPack } from './canonical-facts';
import { askOpenAIWithPreparedPrompt } from './openai-fallback-client';
import { createHash } from 'crypto';
import { recordLlmAnalysis, recordLlmAnalysisFailure } from '../observability/llm-metrics';

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
    onAnswerReset
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
  const snapshot = await gatherContextSnapshot({
    userId,
    question,
    questionNeeds,
    tier,
    onProgress
  });
  const contextGatherMs = Date.now() - contextGatherStartedAt;

  // Step 2: Build the prompt directly from the persisted canonical snapshot.
  const promptBuildStartedAt = Date.now();
  onProgress?.('Submitting to Claude for analysis');
  await loadResponseToneConfig();
  const orderedConversationHistory = conversationHistory
    .slice()
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const promptInput = buildPromptInputFromSnapshot(
    question,
    snapshot,
    questionNeeds,
    orderedConversationHistory.map(c => ({ question: c.question, answer: c.answer }))
  );
  const factPack = promptInput.canonicalFacts!;
  const factPackIssues = validateCanonicalFactPack(factPack);
  if (factPackIssues.length > 0) {
    throw new Error(`Canonical fact validation failed: ${factPackIssues.join(' ')}`);
  }

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
    const retryPrompt = buildFinancialReasoningPrompt({
      ...promptInput,
      validationFeedback: validationIssues.slice(0, 8),
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
      structuredResponse = sanitizeUngroundedResponse(structuredResponse, groundingResult);
    } else {
      const postRetryIssues = await runSecondaryValidation('retry');
      if (postRetryIssues.length > 0) {
        console.error('Ask Linc: Retry passed grounding but secondary validation still flagged issues:', postRetryIssues);
        structuredResponse = sanitizeUngroundedResponse(structuredResponse, {
          valid: false,
          issues: postRetryIssues,
          invalidKeyNumbers: [],
          invalidSummary: true,
        });
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
        deterministic: { valid: groundingResult.valid, issues: groundingResult.issues },
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

  recordLlmAnalysis(showTheMathData.evidenceManifest);

  return {
    structuredResponse,
    displayText,
    showTheMathData
  };
}
