/**
 * A decision is a line of questioning, and the user says where one starts by
 * clicking "New decision". Before this, history was "your last 10 questions"
 * regardless of what they were about or when you asked them, so a number from
 * one decision could silently become an input to another.
 */

import express from 'express';
import request from 'supertest';
import { runAskLincAnalysis } from '../../openai/analysis-pipeline';
import askRoutes from '../../routes/ask';
import { getPrismaClient } from '../../prisma-client';

jest.mock('../../auth/middleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'user@example.com', tier: 'starter' };
    next();
  },
}));

jest.mock('../../security/ai-rate-limiter', () => ({
  aiRateLimitMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../prisma-client', () => ({ getPrismaClient: jest.fn() }));

jest.mock('../../openai/analysis-pipeline', () => ({ runAskLincAnalysis: jest.fn() }));

jest.mock('../../profile/conversation-updater', () => ({
  updateProfileFromAnsweredTurn: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@sentry/node', () => ({
  startSpan: (_options: unknown, callback: CallableFunction) =>
    callback({ setAttribute: jest.fn() }),
  captureException: jest.fn(),
}));

describe('Ask route conversation threading', () => {
  const conversation = {
    findMany: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    conversation.findMany.mockResolvedValue([]);
    conversation.updateMany.mockResolvedValue({ count: 0 });
    conversation.create.mockImplementation(async ({ data }: any) => ({
      id: 'conversation-1',
      threadId: data.threadId ?? null,
    }));
    (getPrismaClient as jest.Mock).mockReturnValue({ conversation });
    (runAskLincAnalysis as jest.Mock).mockResolvedValue({
      displayText: 'Answer.',
      structuredResponse: { summary: 'Answer.' },
    });
  });

  function createApp() {
    const app = express();
    app.use(express.json());
    app.use(askRoutes);
    return app;
  }

  it('reads history from the thread the question belongs to', async () => {
    await request(createApp())
      .post('/ask/display-real')
      .send({ question: 'Re-run my retirement analysis.', threadId: 'thread-a' });

    expect(conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', threadId: 'thread-a' } })
    );
  });

  it('stores the thread on the answered turn and returns it', async () => {
    const response = await request(createApp())
      .post('/ask/display-real')
      .send({ question: 'Can I retire at 62?', threadId: 'thread-a' });

    expect(conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ threadId: 'thread-a' }) })
    );
    expect(response.body.threadId).toBe('thread-a');
  });

  it('gives a new decision none of the previous decision\'s turns', async () => {
    // The whole point of the button: the $125K from an earlier decision must not
    // reach a projection the user started fresh.
    await request(createApp())
      .post('/ask/display-real')
      .send({ question: 'Can I retire at 65?', threadId: 'thread-b' });

    const where = conversation.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ userId: 'user-1', threadId: 'thread-b' });
    expect(where.threadId).not.toBe('thread-a');
  });

  it('keeps the whole-history window for a client that predates threads', async () => {
    // The backend can deploy before the frontend. Until the new client ships,
    // nothing about those users' answers should change.
    await request(createApp())
      .post('/ask/display-real')
      .send({ question: 'Re-run my retirement analysis.' });

    expect(conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
    expect(conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ threadId: null }) })
    );
  });

  it('ignores a blank thread rather than treating it as a thread named ""', async () => {
    await request(createApp())
      .post('/ask/display-real')
      .send({ question: 'Re-run my retirement analysis.', threadId: '   ' });

    expect(conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
  });

  it('does not let a client set an unbounded thread id', async () => {
    await request(createApp())
      .post('/ask/display-real')
      .send({ question: 'Re-run it.', threadId: 'x'.repeat(500) });

    const stored = conversation.create.mock.calls[0][0].data.threadId;
    expect(stored).toHaveLength(64);
  });

  it('adopts a legacy row when the client resumes it by id', async () => {
    await request(createApp())
      .post('/ask/display-real')
      .send({ question: 'Follow up on that.', threadId: 'legacy-turn-1' });

    expect(conversation.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', id: 'legacy-turn-1', threadId: null },
      data: { threadId: 'legacy-turn-1' },
    });
  });
});
