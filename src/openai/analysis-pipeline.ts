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
import { toCanonicalSnapshot } from './canonical-snapshot';
import { buildPromptInputFromSnapshot } from './financial-reasoning-prompt';
import { askClaudeWithFinancialContext } from './claude-client';
import { parseStructuredResponse, toDisplayText, AskLincResponse } from './structured-response';
import { validateUserPrompt, getRejectionMessage } from '../security/prompt-validation';
import { validateLLMResponse } from '../security/output-validation';
import { logRejectedPrompt, logFlaggedOutput } from '../security/security-logger';
import { PromptValidationError } from '../openai';

export interface RunAskLincAnalysisOptions {
  question: string;
  userId?: string;
  isDemo?: boolean;
  userTier?: UserTier | string;
  conversationHistory?: Array<{ id: string; question: string; answer: string; createdAt: Date }>;
  demoProfile?: string;
  enableValidation?: boolean;
}

export interface RunAskLincAnalysisResult {
  structuredResponse: AskLincResponse;
  displayText: string;
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
    enableValidation = process.env.ENABLE_RESPONSE_VALIDATION === 'true'
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

  const questionNeeds = analyzeQuestionNeeds(question);

  // Step 1: Retrieve context (snapshot, profile, market summary, RAG)
  const snapshot = await gatherContextSnapshot({
    userId,
    isDemo,
    question,
    questionNeeds,
    tier,
    demoProfile,
    alwaysIncludeMarketAndRAG: true
  });

  // Step 2: Build canonical snapshot and prompt input
  const canonicalSnapshot = toCanonicalSnapshot(snapshot);
  const promptInput = buildPromptInputFromSnapshot(
    question,
    snapshot,
    canonicalSnapshot,
    conversationHistory.map(c => ({ question: c.question, answer: c.answer }))
  );

  // Step 3: LLM financial reasoning (Claude Sonnet)
  let rawResponse = await askClaudeWithFinancialContext(promptInput);

  // Step 4: Parse structured response
  let structuredResponse = parseStructuredResponse(rawResponse);

  // Step 5: Optional validation with Gemini (if enabled)
  if (enableValidation) {
    try {
      const { validateWithGemini } = await import('./response-validator');
      const validationResult = await validateWithGemini(structuredResponse, { question, snapshot });
      if (!validationResult.valid && validationResult.issues?.length) {
        console.warn('Ask Linc: Gemini validation failed, regenerating:', validationResult.issues);
        rawResponse = await askClaudeWithFinancialContext(promptInput);
        structuredResponse = parseStructuredResponse(rawResponse);
      }
    } catch (err) {
      console.warn('Ask Linc: Validation layer failed, using initial response:', err);
    }
  }

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

  return {
    structuredResponse,
    displayText
  };
}
