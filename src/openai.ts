import OpenAI from 'openai';
import * as Sentry from '@sentry/node';
import { analyzeQuestionNeeds } from './openai/question-analysis';
import { filterConversationHistory, analyzeConversationContext } from './openai/conversation-context';
import { gatherContextSnapshot } from './openai/context-service';
import { buildPromptPayload, formatAccountSummary, formatTransactionSummary, formatInvestmentSummary } from './openai/prompt-builder';
import { loadResponseToneConfig } from './openai/prompt-config';
import { postProcessAnswer } from './openai/response-processor';
import { UserTier } from './data/types';
import { ConversationEntry } from './openai/types';
import { logGPTContext } from './services/gpt-logger';
import { validateUserPrompt, getRejectionMessage } from './security/prompt-validation';
import { validateLLMResponse } from './security/output-validation';
import { logRejectedPrompt, logFlaggedOutput } from './security/security-logger';
import { sanitizeUngroundedResponse, validateResponseGrounding } from './openai/response-grounding';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

export interface Conversation {
  id: string;
  question: string;
  answer: string;
  createdAt: Date;
}

/** Thrown when user prompt fails validation (security or off-topic) */
export class PromptValidationError extends Error {
  constructor(
    message: string,
    public readonly reason?: string,
    public readonly userMessage: string = message
  ) {
    super(message);
    this.name = 'PromptValidationError';
  }
}

export async function askOpenAIWithEnhancedContext(
  question: string,
  conversationHistory: Conversation[] = [],
  userTier: UserTier | string = UserTier.STARTER,
  isDemo = false,
  userId?: string,
  model?: string,
  demoProfile?: string
): Promise<string> {
  const tier = typeof userTier === 'string' ? (userTier as UserTier) : userTier;

  try {
    // Input validation - reject before sending to LLM
    const historyForValidation = conversationHistory.map(c => ({ question: c.question }));
    const validation = validateUserPrompt(question, historyForValidation);
    if (!validation.allowed) {
      logRejectedPrompt(question, validation.reason || 'unknown', {
        userId: isDemo ? undefined : userId,
        sessionId: isDemo ? undefined : undefined,
      });
      const userMessage = getRejectionMessage(validation.reason);
      throw new PromptValidationError(
        `Prompt rejected: ${validation.reason}`,
        validation.reason,
        userMessage
      );
    }

    const recentQuestions = conversationHistory
      .slice()
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map((entry) => entry.question);
    const questionNeeds = analyzeQuestionNeeds(question, recentQuestions);

    const normalizedHistory: ConversationEntry[] = conversationHistory.map(item => ({
      id: item.id,
      question: item.question,
      answer: item.answer,
      createdAt: item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt)
    }));

    const filteredHistory = filterConversationHistory(normalizedHistory, question)
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const contextAnalysis = analyzeConversationContext(filteredHistory, question);
    const contextInstruction = contextAnalysis.hasContextOpportunities
      ? `CONTEXT BUILDING OPPORTUNITY: ${contextAnalysis.instruction}`
      : undefined;

    const snapshot = await gatherContextSnapshot({
      userId,
      isDemo,
      question,
      questionNeeds,
      tier,
      demoProfile
    });

    await loadResponseToneConfig();
    const promptPayload = buildPromptPayload({
      question,
      snapshot,
      conversationHistory: filteredHistory,
      contextInstruction
    });

    // Log GPT context for debugging (only for authenticated users, not demo)
    // ✅ IMPORTANT: This logs NON-ANONYMIZED data - all account names, transaction details,
    // institution names, merchant names, and profile information are logged as-is.
    // The snapshot from gatherContextSnapshot() uses getOriginalProfile() and raw account/transaction data.
    if (userId && !isDemo && process.env.PERSIST_GPT_CONTEXT === 'true') {
      try {
        // Format summaries using non-anonymized data from snapshot
        const accountSummary = formatAccountSummary(snapshot.accounts);
        const transactionSummary = formatTransactionSummary(snapshot.bankingTransactions);
        const investmentSummary = snapshot.investments ? formatInvestmentSummary(snapshot.investments) : undefined;
        
        await logGPTContext({
          userId,
          question,
          systemPrompt: promptPayload.systemPrompt, // Contains non-anonymized profile, accounts, transactions
          conversationHistory: filteredHistory.map(conv => ({
            id: conv.id,
            question: conv.question,
            answer: conv.answer,
            createdAt: conv.createdAt
          })),
          accountSummary, // Non-anonymized account names and institutions
          transactionSummary, // Non-anonymized transaction names and merchants
          investmentSummary, // Non-anonymized investment holdings
          marketContextSummary: snapshot.marketContext,
          searchContext: snapshot.searchContext,
          timestamp: new Date()
        });
      } catch (logError) {
        // Don't fail the request if logging fails
        console.warn('Failed to log GPT context:', logError);
      }
    }

    const completion = await openai.chat.completions.create({
      model: model || 'gpt-4o',
      messages: promptPayload.messages,
      temperature: 0.7,
      max_tokens: 1800
    });

    let answer =
      completion.choices[0]?.message?.content ||
      'I am sorry, but I was unable to generate a response.';

    answer = postProcessAnswer(answer);

    const groundingResult = validateResponseGrounding({ summary: answer }, snapshot, question);
    if (!groundingResult.valid) {
      console.warn('Legacy Ask Linc response failed deterministic grounding:', groundingResult.issues);
      answer = sanitizeUngroundedResponse({ summary: answer }, groundingResult).summary;
    }

    // Output validation - sanitize before returning to user
    const outputValidation = validateLLMResponse(answer);
    if (!outputValidation.safe) {
      logFlaggedOutput(answer, outputValidation.flagged || 'unknown', { userId });
      answer = outputValidation.sanitized;
    } else {
      answer = outputValidation.sanitized;
    }

    if (userId && !isDemo) {
      try {
        const { ProfileManager } = await import('./profile/manager');
        const profileManager = new ProfileManager();
        await profileManager.updateProfileFromConversation(userId, {
          id: `conv-${Date.now()}`,
          question,
          answer,
          createdAt: new Date()
        });
      } catch (profileError) {
        console.warn('Profile update from conversation failed', profileError);
      }
    }

    return answer;
  } catch (error) {
    // Skip Sentry for expected validation failures - they pollute error tracking
    if (!(error instanceof PromptValidationError)) {
      Sentry.captureException(error);
    }
    throw error;
  }
}

export async function askOpenAI(
  question: string,
  conversationHistory: Conversation[] = [],
  userTier: UserTier | string = UserTier.STARTER,
  isDemo = false,
  userId?: string,
  model?: string
): Promise<string> {
  return askOpenAIWithEnhancedContext(
    question,
    conversationHistory,
    userTier,
    isDemo,
    userId,
    model
  );
}

export async function askOpenAIForTests(
  question: string,
  conversationHistory: Conversation[] = [],
  userTier: UserTier | string = UserTier.STARTER,
  isDemo = false,
  userId?: string,
  model = 'gpt-4o-mini'
): Promise<string> {
  return askOpenAIWithEnhancedContext(
    question,
    conversationHistory,
    userTier,
    isDemo,
    userId,
    model
  );
}

export { filterConversationHistory, analyzeConversationContext } from './openai/conversation-context';
export { analyzeQuestionNeeds } from './openai/question-analysis';
