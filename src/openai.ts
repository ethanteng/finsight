import OpenAI from 'openai';
import * as Sentry from '@sentry/node';
import { AnonymizationService } from './services/anonymization-service';
import { DeanonymizationService } from './services/deanonymization-service';
import { analyzeQuestionNeeds } from './openai/question-analysis';
import { filterConversationHistory, analyzeConversationContext } from './openai/conversation-context';
import { gatherContextSnapshot } from './openai/context-service';
import { buildPromptPayload } from './openai/prompt-builder';
import { postProcessAnswer } from './openai/response-processor';
import { UserTier } from './data/types';
import { ConversationEntry } from './openai/types';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

export interface Conversation {
  id: string;
  question: string;
  answer: string;
  createdAt: Date;
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

  const anonymizationService = new AnonymizationService();
  const deanonymizationService = new DeanonymizationService(anonymizationService);

  try {
    const questionNeeds = analyzeQuestionNeeds(question);

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
      anonymizationService,
      demoProfile
    });

    const promptPayload = buildPromptPayload({
      question,
      snapshot,
      conversationHistory: filteredHistory,
      contextInstruction
    });

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

    if (!isDemo && userId) {
      try {
        answer = deanonymizationService.convertResponseToUserFriendly(userId, answer);
      } catch (deanonError) {
        console.warn('Deanonymization failed', deanonError);
      }
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
    Sentry.captureException(error);
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

