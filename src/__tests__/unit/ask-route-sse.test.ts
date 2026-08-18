import express from 'express';
import request from 'supertest';
import { runAskLincAnalysis } from '../../openai/analysis-pipeline';
import askRoutes from '../../routes/ask';
import { getPrismaClient } from '../../prisma-client';
import { PromptValidationError } from '../../openai/errors';
import { updateProfileFromAnsweredTurn } from '../../profile/conversation-updater';

jest.mock('../../auth/middleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'user@example.com', tier: 'starter' };
    next();
  },
}));

jest.mock('../../security/ai-rate-limiter', () => ({
  aiRateLimitMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn(),
}));

jest.mock('../../openai/analysis-pipeline', () => ({
  runAskLincAnalysis: jest.fn(),
}));

jest.mock('../../profile/conversation-updater', () => ({
  updateProfileFromAnsweredTurn: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@sentry/node', () => ({
  startSpan: (_options: unknown, callback: CallableFunction) =>
    callback({ setAttribute: jest.fn() }),
  captureException: jest.fn(),
}));

describe('Ask route SSE lifecycle', () => {
  const conversation = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'conversation-1' }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getPrismaClient as jest.Mock).mockReturnValue({ conversation });
  });

  function createApp() {
    const app = express();
    app.use(express.json());
    app.use(askRoutes);
    return app;
  }

  it('delivers the final result after streaming headers have been flushed', async () => {
    (runAskLincAnalysis as jest.Mock).mockImplementation(async options => {
      options.onProgress?.('Loading context');
      options.onAnswerDelta?.('Grounded answer');
      return {
        displayText: 'Grounded answer',
        structuredResponse: { summary: 'Grounded answer' },
      };
    });

    const response = await request(createApp())
      .post('/ask/display-real')
      .set('Accept', 'text/event-stream')
      .send({ question: 'What is my net worth?' });

    expect(response.status).toBe(200);
    expect(response.headers['x-ai-mode']).toBe('canonical');
    expect(response.text).toContain('event: answerDelta');
    expect(response.text).toContain('event: result');
    expect(response.text).toContain('"conversationId":"conversation-1"');
  });

  it('persists the structured answer with its evidence for history rendering', async () => {
    const structuredResponse = {
      summary: 'You have a healthy cash cushion.',
      key_numbers: {
        total_cash: { value: 77655, unit: 'usd', provenance: 'total_cash' },
      },
      insights: ['Your reserve is above the usual range.'],
      suggested_actions: ['Give the excess cash a specific job.'],
    };
    const showTheMathData = {
      evidenceManifest: {
        version: 1,
        generatedAt: new Date().toISOString(),
        snapshot: {},
        facts: [],
        modelCalls: [],
        timings: { contextGatherMs: 1, promptBuildMs: 1, totalMs: 3 },
        validation: { deterministic: { valid: true, issues: [] } },
        evidenceRefs: { tickers: [], retirementAnalysis: false, marketContext: false },
      },
    };
    (runAskLincAnalysis as jest.Mock).mockResolvedValue({
      displayText: 'You have a healthy cash cushion.',
      structuredResponse,
      showTheMathData,
    });

    await request(createApp())
      .post('/ask/display-real')
      .send({ question: 'How is my emergency fund?' });

    expect(conversation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        showTheMathData: { ...showTheMathData, structuredResponse },
      }),
    }));
  });

  it('returns structured answers for saved and legacy conversations', async () => {
    conversation.findMany.mockResolvedValueOnce([
      {
        id: 'saved-1',
        question: 'How is my cash?',
        answer: 'Flattened compatibility answer.',
        threadId: 'thread-1',
        createdAt: new Date('2026-08-17T12:00:00Z'),
        showTheMathData: {
          structuredResponse: {
            summary: 'Your cash position is healthy.',
            key_numbers: { total_cash: { value: 77655, unit: 'usd', provenance: 'total_cash' } },
            insights: ['You have ample liquidity.'],
            suggested_actions: ['Assign excess cash to a goal.'],
          },
        },
      },
      {
        id: 'legacy-1',
        question: 'What is my savings rate?',
        answer: 'Your savings rate is strong.\n\n**Key Numbers:**\n- Savings Rate: 35.42%\n\n**Insights:**\n- You are saving consistently.',
        threadId: null,
        createdAt: new Date('2026-08-16T12:00:00Z'),
        showTheMathData: null,
      },
      {
        id: 'freeform-1',
        question: 'Explain the key numbers section.',
        answer: 'Keep this entire answer.\n\n**Key Numbers:**\nThis is explanatory prose, not a generated metric list.',
        threadId: null,
        createdAt: new Date('2026-08-15T12:00:00Z'),
        showTheMathData: null,
      },
    ]);

    const response = await request(createApp()).get('/conversations');

    expect(response.status).toBe(200);
    expect(response.body.conversations[0].structuredResponse).toMatchObject({
      summary: 'Your cash position is healthy.',
      key_numbers: { total_cash: { value: 77655, provenance: 'total_cash' } },
    });
    expect(response.body.conversations[1].structuredResponse).toEqual({
      summary: 'Your savings rate is strong.',
      key_numbers: { savings_rate: { value: 35.42, unit: 'percent', provenance: '' } },
      insights: ['You are saving consistently.'],
    });
    expect(response.body.conversations[2].answer).toContain('This is explanatory prose');
    expect(response.body.conversations[2].structuredResponse).toBeUndefined();
  });

  it('404s Show the Math when only a card snapshot was persisted', async () => {
    conversation.findFirst.mockResolvedValueOnce({
      id: 'cards-only-1',
      userId: 'user-1',
      showTheMathData: {
        structuredResponse: { summary: 'Sanitized fallback answer.' },
      },
    });

    const response = await request(createApp()).get('/conversations/cards-only-1/show-the-math');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('No pipeline data available for this conversation');
  });

  it('still expands Show the Math when evidence is present beside the card snapshot', async () => {
    const evidenceManifest = {
      version: 1,
      generatedAt: '2026-08-17T12:00:00.000Z',
      snapshot: {},
      facts: [],
      modelCalls: [],
      timings: { contextGatherMs: 1, promptBuildMs: 1, totalMs: 3 },
      validation: { deterministic: { valid: true, issues: [] } },
      evidenceRefs: { tickers: [], retirementAnalysis: false, marketContext: false },
    };
    conversation.findFirst.mockResolvedValueOnce({
      id: 'with-evidence-1',
      userId: 'user-1',
      showTheMathData: {
        evidenceManifest,
        structuredResponse: { summary: 'Your cash position is healthy.' },
      },
    });

    const response = await request(createApp()).get('/conversations/with-evidence-1/show-the-math');

    expect(response.status).toBe(200);
    expect(response.body.evidenceManifest).toEqual(evidenceManifest);
    expect(response.body.structuredResponse).toEqual({ summary: 'Your cash position is healthy.' });
    expect(response.body.databaseData).toEqual({ canonical_facts: [] });
  });

  it('refreshes personal context from each answered turn', async () => {
    (runAskLincAnalysis as jest.Mock).mockResolvedValue({
      displayText: 'You can retire around 62.',
      structuredResponse: { summary: 'You can retire around 62.' },
    });

    await request(createApp())
      .post('/ask/display-real')
      .send({ question: 'When can I retire?' });

    expect(updateProfileFromAnsweredTurn).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'conversation-1',
      question: 'When can I retire?',
    });
  });

  it('refreshes personal context from a streamed turn as well', async () => {
    (runAskLincAnalysis as jest.Mock).mockImplementation(async options => {
      options.onAnswerDelta?.('You can retire around 62.');
      return {
        displayText: 'You can retire around 62.',
        structuredResponse: { summary: 'You can retire around 62.' },
      };
    });

    await request(createApp())
      .post('/ask/display-real')
      .set('Accept', 'text/event-stream')
      .send({ question: 'When can I retire?' });

    expect(updateProfileFromAnsweredTurn).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'conversation-1',
      question: 'When can I retire?',
    });
  });

  it('still answers when the profile refresh rejects', async () => {
    (updateProfileFromAnsweredTurn as jest.Mock).mockRejectedValueOnce(new Error('profile down'));
    (runAskLincAnalysis as jest.Mock).mockResolvedValue({
      displayText: 'You can retire around 62.',
      structuredResponse: { summary: 'You can retire around 62.' },
    });

    const response = await request(createApp())
      .post('/ask/display-real')
      .send({ question: 'When can I retire?' });

    expect(response.status).toBe(200);
    expect(response.body.answer).toBe('You can retire around 62.');
  });

  it('delivers a streamed validation error without mutating flushed headers', async () => {
    (runAskLincAnalysis as jest.Mock).mockRejectedValue(new PromptValidationError(
      'Prompt rejected',
      'off_topic',
      'Please ask a financial question.'
    ));

    const response = await request(createApp())
      .post('/ask/display-real')
      .set('Accept', 'text/event-stream')
      .send({ question: 'What is the weather?' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('event: error');
    expect(response.text).toContain('Please ask a financial question.');
  });
});
