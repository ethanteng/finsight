import * as Sentry from '@sentry/node';

export interface AnsweredTurn {
  userId: string;
  conversationId: string;
  question: string;
  answer: string;
  createdAt?: Date;
}

/**
 * Refresh the stored user profile from a completed Ask Linc turn.
 *
 * ProfileExtractor decides whether the turn actually revealed anything new, and
 * ProfileManager skips the write when the profile is unchanged, so this is safe
 * to run after every answered question.
 *
 * Callers invoke this after the answer has been delivered: the extraction makes
 * its own model call, so it must never sit in front of the user's response.
 */
export async function updateProfileFromAnsweredTurn(turn: AnsweredTurn): Promise<void> {
  if (!process.env.PROFILE_ENCRYPTION_KEY) {
    console.warn('PROFILE_ENCRYPTION_KEY is not set; skipping profile update from conversation');
    return;
  }

  try {
    // Extraction runs after the response is sent, outside the pipeline's own
    // config load, so refresh the model selection here too.
    const { loadModelConfig } = await import('../openai/model-config');
    await loadModelConfig();

    const { ProfileManager } = await import('./manager');
    const profileManager = new ProfileManager();
    await profileManager.updateProfileFromConversation(turn.userId, {
      id: turn.conversationId,
      question: turn.question,
      answer: turn.answer,
      createdAt: turn.createdAt ?? new Date(),
    });
  } catch (error) {
    // The answer is already with the user; a failed profile refresh must not
    // surface as a request failure, but it should still be visible in Sentry.
    console.warn('Profile update from conversation failed:', error);
    Sentry.captureException(error);
  }
}
