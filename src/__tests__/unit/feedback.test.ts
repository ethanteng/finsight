import request from 'supertest';
import express from 'express';
import { getPrismaClient } from '../../prisma-client';

describe('Feedback System Tests', () => {
  const prisma = getPrismaClient();
  let app: express.Application;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.post('/feedback', async (req, res) => {
      const { conversationId, score } = req.body;
      if (!conversationId || !Number.isInteger(score)) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (score < 1 || score > 5) {
        return res.status(400).json({ error: 'Score must be between 1 and 5' });
      }
      try {
        const feedback = await prisma.feedback.create({
          data: { conversationId, score },
        });
        return res.json({ success: true, feedbackId: feedback.id });
      } catch {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    });

    await prisma.feedback.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('saves feedback for a persisted user conversation', async () => {
    const user = await prisma.user.create({
      data: { email: 'feedback@example.com', passwordHash: 'hash', tier: 'starter' },
    });
    const conversation = await prisma.conversation.create({
      data: { question: 'Test question', answer: 'Test answer', userId: user.id },
    });

    const response = await request(app)
      .post('/feedback')
      .send({ conversationId: conversation.id, score: 4 })
      .expect(200);

    const savedFeedback = await prisma.feedback.findUnique({
      where: { id: response.body.feedbackId },
    });
    expect(savedFeedback).toMatchObject({ score: 4, conversationId: conversation.id });
  });

  it('validates score range', async () => {
    const response = await request(app)
      .post('/feedback')
      .send({ conversationId: 'test-id', score: 6 })
      .expect(400);
    expect(response.body.error).toBe('Score must be between 1 and 5');
  });

  it('validates required fields', async () => {
    const response = await request(app)
      .post('/feedback')
      .send({ conversationId: 'test-id' })
      .expect(400);
    expect(response.body.error).toBe('Missing required fields');
  });

  it('rejects feedback for a nonexistent conversation', async () => {
    await request(app)
      .post('/feedback')
      .send({ conversationId: 'missing-conversation', score: 3 })
      .expect(404);
  });
});
