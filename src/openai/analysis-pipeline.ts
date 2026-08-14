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
 * Designed to allow future replacement of LLM calculations with deterministic engines.
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
import { PromptValidationError } from '../openai';
import { fetchShowTheMathDBData } from './show-the-math-db-service';
import type { ShowTheMathData, ShowTheMathClaudeCall, ShowTheMathGeminiValidation } from './show-the-math-types';

export interface RunAskLincAnalysisOptions {
  question: string;
  userId?: string;
  isDemo?: boolean;
  userTier?: UserTier | string;
  conversationHistory?: Array<{ id: string; question: string; answer: string; createdAt: Date }>;
  demoProfile?: string;
  enableValidation?: boolean;
  /** Optional callback for progress updates (e.g. for SSE streaming) */
  onProgress?: (message: string) => void;
  /** Optional callback for live Show the Math data (streams partial data as pipeline runs) */
  onShowTheMathProgress?: (partial: Partial<ShowTheMathData>) => void;
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
function makeAnswerStreamer(onAnswerDelta?: (delta: string) => void): (delta: string) => void {
  if (!onAnswerDelta) return () => {};
  let raw = '';
  let emitted = 0;
  return (delta: string) => {
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

/**
 * Run the Ask Linc financial analysis pipeline.
 */
export async function runAskLincAnalysis(options: RunAskLincAnalysisOptions): Promise<RunAskLincAnalysisResult> {
  const {
    question,
    userId,
    isDemo = false,
    userTier = UserTier.STARTER,
    conversationHistory = [],
    demoProfile,
    enableValidation = process.env.ENABLE_RESPONSE_VALIDATION === 'true',
    onProgress,
    onShowTheMathProgress,
    onAnswerDelta,
    onAnswerReset
  } = options;

  const tier = typeof userTier === 'string' ? (userTier as UserTier) : userTier;

  // Step 0: Input validation
  const historyForValidation = conversationHistory.map(c => ({ question: c.question }));
  const validation = validateUserPrompt(question, historyForValidation);
  if (!validation.allowed) {
    logRejectedPrompt(question, validation.reason || 'unknown', { userId: isDemo ? undefined : userId });
    const userMessage = getRejectionMessage(validation.reason);
    throw new PromptValidationError(`Prompt rejected: ${validation.reason}`, validation.reason, userMessage);
  }

  onProgress?.('Loading your account and transaction data');

  const questionNeeds = analyzeQuestionNeeds(question);

  // Step 1: Retrieve context (snapshot, profile, market summary, RAG)
  const snapshot = await gatherContextSnapshot({
    userId,
    isDemo,
    question,
    questionNeeds,
    tier,
    demoProfile,
    alwaysIncludeMarketAndRAG: true,
    onProgress
  });

  // Step 2: Build the prompt directly from the persisted canonical snapshot.
  onProgress?.('Submitting to Claude for analysis');
  await loadResponseToneConfig();
  const promptInput = buildPromptInputFromSnapshot(
    question,
    snapshot,
    conversationHistory.map(c => ({ question: c.question, answer: c.answer }))
  );

  // Show the Math: the DB fetch is independent of the Claude call, so run them
  // concurrently and let the (fast) DB read hide under the (slow) LLM latency.
  const databaseDataPromise = fetchShowTheMathDBData(userId, snapshot);

  // Step 3: LLM financial reasoning (Claude Sonnet). Build the prompt once and
  // pass it through (avoids rebuilding the large reasoning prompt inside the client).
  // When a delta sink is provided, stream the answer's summary text as it arrives.
  const { systemPrompt, userMessage } = buildFinancialReasoningPrompt(promptInput);
  const claudePromise = onAnswerDelta
    ? askClaudeStream(systemPrompt, userMessage, makeAnswerStreamer(onAnswerDelta))
    : askClaude(systemPrompt, userMessage);

  const databaseData = await databaseDataPromise;
  onShowTheMathProgress?.({ databaseData });

  let rawResponse = await claudePromise;
  const claudeFirstCall: ShowTheMathClaudeCall = { systemPrompt, userMessage, rawResponse };
  onShowTheMathProgress?.({ claudeFirstCall });

  // Step 4: Parse structured response
  let structuredResponse = parseStructuredResponse(rawResponse);

  let geminiValidation: ShowTheMathGeminiValidation | undefined;
  let claudeRetry: ShowTheMathClaudeCall | undefined;

  // Step 5: Optional validation with Gemini (if enabled)
  if (enableValidation) {
    try {
      onProgress?.('Sanity checking with Gemini');
      const { validateWithGemini } = await import('./response-validator');
      const validationResult = await validateWithGemini(structuredResponse, { question, snapshot });
      if (validationResult.promptSent != null && validationResult.rawResponse != null) {
        geminiValidation = {
          prompt: validationResult.promptSent,
          rawResponse: validationResult.rawResponse,
          parsedResult: {
            valid: validationResult.valid,
            issues: validationResult.issues
          }
        };
        onShowTheMathProgress?.({ geminiValidation });
      }
      if (!validationResult.valid && validationResult.issues?.length) {
        console.warn('Ask Linc: Gemini validation failed, regenerating with feedback:', validationResult.issues);
        // Rebuild prompt input with full Financial Context (same as initial pass) + validation feedback
        const retryPromptInput = {
          ...buildPromptInputFromSnapshot(
            question,
            snapshot,
            conversationHistory.map(c => ({ question: c.question, answer: c.answer }))
          ),
          validationFeedback: validationResult.issues
        };
        const retryPrompt = buildFinancialReasoningPrompt(retryPromptInput);
        // Discard the streamed first-pass answer before streaming the regenerated one.
        onAnswerReset?.();
        rawResponse = onAnswerDelta
          ? await askClaudeStream(retryPrompt.systemPrompt, retryPrompt.userMessage, makeAnswerStreamer(onAnswerDelta))
          : await askClaude(retryPrompt.systemPrompt, retryPrompt.userMessage);
        claudeRetry = {
          systemPrompt: retryPrompt.systemPrompt,
          userMessage: retryPrompt.userMessage,
          rawResponse
        };
        onShowTheMathProgress?.({ claudeRetry });
        structuredResponse = parseStructuredResponse(rawResponse);
      }
    } catch (err) {
      console.warn('Ask Linc: Validation layer failed, using initial response:', err);
    }
  }

  onProgress?.('Formatting response');

  // Step 6: Output validation (security)
  const displayText = toDisplayText(structuredResponse);
  const outputValidation = validateLLMResponse(displayText);
  if (!outputValidation.safe) {
    logFlaggedOutput(displayText, outputValidation.flagged || 'unknown', { userId });
    return {
      structuredResponse: { summary: outputValidation.sanitized, insights: [], suggested_actions: [] },
      displayText: outputValidation.sanitized
    };
  }

  const showTheMathData: ShowTheMathData = {
    claudeFirstCall,
    databaseData,
    ...(geminiValidation && { geminiValidation }),
    ...(claudeRetry && { claudeRetry })
  };

  return {
    structuredResponse,
    displayText,
    showTheMathData
  };
}
