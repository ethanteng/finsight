import express from 'express';
import request from 'supertest';
import { runAskLincAnalysis } from '../../openai/analysis-pipeline';
import askRoutes from '../../routes/ask';
import { getPrismaClient } from '../../prisma-client';
import { PromptValidationError } from '../../openai/errors';

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

jest.mock('@sentry/node', () => ({
  startSpan: (_options: unknown, callback: CallableFunction) =>
    callback({ setAttribute: jest.fn() }),
  captureException: jest.fn(),
}));

describe('Ask route SSE lifecycle', () => {
  const conversation = {
    findMany: jest.fn().mockResolvedValue([]),
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
