import { Router, type Response } from 'express';
import * as Sentry from '@sentry/node';
import { requireAuth } from '../auth/middleware';
import { getPrismaClient } from '../prisma-client';
import { runAskLincAnalysis } from '../openai/analysis-pipeline';
import { PromptValidationError } from '../openai/errors';
import { loadShowTheMathEvidence } from '../openai/show-the-math-db-service';
import { aiRateLimitMiddleware } from '../security/ai-rate-limiter';
import { recordLlmAnalysis, recordLlmAnalysisFailure } from '../observability/llm-metrics';
import { updateProfileFromAnsweredTurn } from '../profile/conversation-updater';

const router = Router();

function writeSse(res: Response, event: string, data: object): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.post('/ask/display-real', aiRateLimitMiddleware, requireAuth, async (req, res) => {
  const startedAt = Date.now();
  const streaming = req.headers.accept?.includes('text/event-stream') === true;
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question) return res.status(400).json({ error: 'Question is required' });
  // The client sends the thread it is continuing, and omits it when the user
  // starts a new decision. This is the one signal about conversation boundaries
  // that is stated rather than inferred, so it is worth more than any amount of
  // reading the wording.
  const requestedThreadId =
    typeof req.body?.threadId === 'string' && req.body.threadId.trim()
      ? req.body.threadId.trim().slice(0, 64)
      : null;

  if (streaming) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-AI-Mode', 'canonical');
    res.flushHeaders?.();
  }

  try {
    await Sentry.startSpan({ op: 'ai.request', name: 'Ask Linc analysis' }, async span => {
      const user = req.user!;
      span.setAttribute('ai.question_length', question.length);
      span.setAttribute('ai.endpoint', '/ask/display-real');
      span.setAttribute('ai.user_tier', user.tier);

      let conversationHistory: Array<{
        id: string; question: string; answer: string; createdAt: Date;
      }> = [];
      try {
        conversationHistory = await getPrismaClient().conversation.findMany({
          // A declared thread answers "which turns belong to this question?"
          // exactly. A new decision still sends one — the client mints it — so
          // it simply matches nothing yet, which is the correct history for a
          // fresh line of questioning. Only a client that predates threads sends
          // none, and it keeps the old whole-history window so that a backend
          // deploy landing before a frontend deploy changes nothing for it.
          //
          // A turn written with no thread of its own is resumed under its own id,
          // which is how the sidebar groups it, so match that row too. Reading it
          // beats back-filling it on the way past: the rows that need this only
          // exist between the backend and frontend deploys, and a write on every
          // question is a permanent cost for a temporary population.
          where: requestedThreadId
            ? {
                userId: user.id,
                OR: [{ threadId: requestedThreadId }, { id: requestedThreadId, threadId: null }],
              }
            : { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, question: true, answer: true, createdAt: true },
        });
      } catch (error) {
        console.warn('Conversation history unavailable; continuing without it:', error);
      }

      const result = await runAskLincAnalysis({
        question,
        userId: user.id,
        userTier: user.tier,
        conversationHistory,
        enableValidation: process.env.ENABLE_RESPONSE_VALIDATION === 'true',
        onProgress: streaming ? message => writeSse(res, 'progress', { message }) : undefined,
        onAnswerDelta: streaming ? delta => writeSse(res, 'answerDelta', { delta }) : undefined,
        onAnswerReset: streaming ? () => writeSse(res, 'answerReset', {}) : undefined,
      });

      const manifest = result.showTheMathData?.evidenceManifest;
      if (manifest) {
        if (manifest.timings.planningMs !== undefined) {
          span.setAttribute('ai.context_planning_ms', manifest.timings.planningMs);
        }
        if (manifest.timings.contextToolMs !== undefined) {
          span.setAttribute('ai.context_tool_ms', manifest.timings.contextToolMs);
        }
        if (manifest.timings.scenarioMs !== undefined) {
          span.setAttribute('ai.scenario_ms', manifest.timings.scenarioMs);
        }
        span.setAttribute('ai.context_gather_ms', manifest.timings.contextGatherMs);
        span.setAttribute('ai.prompt_build_ms', manifest.timings.promptBuildMs);
        span.setAttribute('ai.model_ms', manifest.timings.modelMs);
        span.setAttribute('ai.validation_ms', manifest.timings.validationMs);
        span.setAttribute('ai.response_time_ms', manifest.timings.totalMs);
        if (manifest.timings.timeToFirstAnswerTokenMs !== undefined) {
          span.setAttribute('ai.time_to_first_answer_token_ms', manifest.timings.timeToFirstAnswerTokenMs);
        }
      }

      const conversation = await getPrismaClient().conversation.create({
        data: {
          userId: user.id,
          question,
          answer: result.displayText,
          threadId: requestedThreadId,
          showTheMathData: result.showTheMathData as object,
        },
        select: { id: true, threadId: true },
      });
      if (result.showTheMathData?.evidenceManifest) {
        recordLlmAnalysis(result.showTheMathData.evidenceManifest);
      }
      const payload = {
        answer: result.displayText,
        conversationId: conversation.id,
        threadId: conversation.threadId ?? conversation.id,
        structuredResponse: result.structuredResponse,
      };
      if (streaming) {
        writeSse(res, 'result', payload);
        res.end();
      } else {
        res.set('X-AI-Response-Time', String(Date.now() - startedAt));
        res.set('X-AI-Mode', 'canonical');
        res.json(payload);
      }

      // Keep the stored profile current from what this turn revealed. Deliberately
      // not awaited: the answer is already sent, and extraction runs its own model call.
      void updateProfileFromAnsweredTurn({
        userId: user.id,
        conversationId: conversation.id,
        question,
        answer: result.displayText,
      }).catch(error => {
        // updateProfileFromAnsweredTurn handles its own failures; this guards the
        // unawaited promise so nothing can escape as an unhandled rejection.
        console.warn('Profile update from conversation rejected:', error);
      });
    });
  } catch (error) {
    const totalMs = Date.now() - startedAt;
    const rejectedPrompt = error instanceof PromptValidationError;
    if (!rejectedPrompt) recordLlmAnalysisFailure(totalMs);
    const message = rejectedPrompt
      ? error.userMessage
      : error instanceof Error ? error.message : 'Failed to process question';
    if (!rejectedPrompt) Sentry.captureException(error);
    if (streaming) {
      writeSse(res, 'error', { error: message });
      res.end();
    } else {
      res.set('X-AI-Response-Time', String(totalMs));
      res.set('X-AI-Mode', 'error');
      res.status(rejectedPrompt ? 400 : 500).json({ error: message });
    }
  }
});

router.post('/feedback', requireAuth, async (req, res) => {
  const { conversationId, score } = req.body;
  if (!conversationId || !Number.isInteger(score) || score < 1 || score > 5) {
    return res.status(400).json({ error: 'A conversation and score from 1 to 5 are required' });
  }
  const conversation = await getPrismaClient().conversation.findFirst({
    where: { id: conversationId, userId: req.user!.id }, select: { id: true },
  });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  const feedback = await getPrismaClient().feedback.create({ data: { score, conversationId } });
  res.json({ success: true, feedbackId: feedback.id });
});

router.get('/conversations', requireAuth, async (req, res) => {
  const conversations = await getPrismaClient().conversation.findMany({
    where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 50,
  });
  res.json({
    conversations: conversations.map(conversation => ({
      id: conversation.id,
      question: conversation.question,
      answer: conversation.answer,
      // Lets the sidebar resume a line of questioning: picking a past turn
      // adopts its thread, so the next question continues from there.
      threadId: conversation.threadId ?? conversation.id,
      timestamp: conversation.createdAt.getTime(),
    })),
  });
});

router.get('/conversations/:id/show-the-math', requireAuth, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const conversation = await getPrismaClient().conversation.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  if (!conversation.showTheMathData) {
    return res.status(404).json({ error: 'No pipeline data available for this conversation' });
  }
  res.json(await loadShowTheMathEvidence(conversation.showTheMathData, req.user!.id));
});

export default router;
