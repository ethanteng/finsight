import * as Sentry from '@sentry/node';

export interface AnsweredTurn {
  userId: string;
  conversationId: string;
  question: string;
  createdAt?: Date;
}

const pendingByUser = new Map<string, Promise<void>>();

/**
 * Refresh the bounded personal context from a completed Ask Linc turn.
 *
 * Only the user's message is inspected. Updates are serialized per user so two
 * answers completing together cannot overwrite one another in this process.
 *
 * Callers invoke this after the answer has been delivered: the extraction makes
 * its own model call, so it must never sit in front of the user's response.
 */
export async function updateProfileFromAnsweredTurn(turn: AnsweredTurn): Promise<void> {
  if (!process.env.PROFILE_ENCRYPTION_KEY) {
    console.warn('PROFILE_ENCRYPTION_KEY is not set; skipping personal context update from conversation');
    return;
  }

  const previous = pendingByUser.get(turn.userId) ?? Promise.resolve();
  const update = previous.catch(() => undefined).then(async () => {
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
        createdAt: turn.createdAt ?? new Date(),
      });
    } catch (error) {
      // The answer is already with the user; a failed memory refresh must not
      // surface as a request failure, but it should still be visible in Sentry.
      console.warn('Personal context update from conversation failed:', error);
      Sentry.captureException(error);
    }
  });
  pendingByUser.set(turn.userId, update);
  try {
    await update;
  } finally {
    if (pendingByUser.get(turn.userId) === update) pendingByUser.delete(turn.userId);
  }
}
