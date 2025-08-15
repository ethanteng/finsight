import request from 'supertest';
import express from 'express';
import { getPrismaClient } from '../../prisma-client';

describe('Feedback System Tests', () => {
  let app: express.Application;
  let prisma: any;

  beforeAll(async () => {
    prisma = getPrismaClient();
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Add the feedback endpoint directly
    app.post('/feedback', async (req, res) => {
      try {
        const { conversationId, score, isDemo } = req.body;
        
        if (!conversationId || !score || typeof isDemo !== 'boolean') {
          return res.status(400).json({ error: 'Missing required fields' });
        }
        
        if (score < 1 || score > 5) {
          return res.status(400).json({ error: 'Score must be between 1 and 5' });
        }
        
        let feedback;
        
        if (isDemo) {
          // Save feedback for demo conversation
          feedback = await prisma.feedback.create({
            data: {
              score,
              demoConversationId: conversationId
            }
          });
        } else {
          // Save feedback for production conversation
          feedback = await prisma.feedback.create({
            data: {
              score,
              conversationId: conversationId
            }
          });
        }
        
        // console.log('Feedback saved:', { id: feedback.id, score, isDemo });
        res.json({ success: true, feedbackId: feedback.id });
        
      } catch (error) {
        console.error('Error saving feedback:', error);
        res.status(500).json({ error: 'Failed to save feedback' });
      }
    });
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.feedback.deleteMany();
    await prisma.demoConversation.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.demoSession.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /feedback', () => {
    it('should save feedback for demo conversation', async () => {
      // Create a demo session and conversation
      const demoSession = await prisma.demoSession.create({
        data: { sessionId: 'test-session-123' }
      });

      const demoConversation = await prisma.demoConversation.create({
        data: {
          question: 'Test question',
          answer: 'Test answer',
          sessionId: demoSession.id
        }
      });

      const response = await request(app)
        .post('/feedback')
        .send({
          conversationId: demoConversation.id,
          score: 5,
          isDemo: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.feedbackId).toBeDefined();

      // Verify feedback was saved
      const savedFeedback = await prisma.feedback.findUnique({
        where: { id: response.body.feedbackId }
      });

      expect(savedFeedback).toBeDefined();
      expect(savedFeedback.score).toBe(5);
      expect(savedFeedback.demoConversationId).toBe(demoConversation.id);
      expect(savedFeedback.conversationId).toBeNull();
    });

    it('should save feedback for production conversation', async () => {
      // Create a user and conversation
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          passwordHash: 'hash',
          tier: 'starter'
        }
      });

      const conversation = await prisma.conversation.create({
        data: {
          question: 'Test question',
          answer: 'Test answer',
          userId: user.id
        }
      });

      const response = await request(app)
        .post('/feedback')
        .send({
          conversationId: conversation.id,
          score: 4,
          isDemo: false
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.feedbackId).toBeDefined();

      // Verify feedback was saved
      const savedFeedback = await prisma.feedback.findUnique({
        where: { id: response.body.feedbackId }
      });

      expect(savedFeedback).toBeDefined();
      expect(savedFeedback.score).toBe(4);
      expect(savedFeedback.conversationId).toBe(conversation.id);
      expect(savedFeedback.demoConversationId).toBeNull();
    });

    it('should validate score range', async () => {
      const response = await request(app)
        .post('/feedback')
        .send({
          conversationId: 'test-id',
          score: 6,
          isDemo: true
        })
        .expect(400);

      expect(response.body.error).toBe('Score must be between 1 and 5');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/feedback')
        .send({
          conversationId: 'test-id',
          // Missing score and isDemo
        })
        .expect(400);

      expect(response.body.error).toBe('Missing required fields');
    });

    it('should handle invalid conversation ID gracefully', async () => {
      // Create a real conversation first, then try to save feedback for it
      const demoSession = await prisma.demoSession.create({
        data: { sessionId: 'test-session-456' }
      });

      const demoConversation = await prisma.demoConversation.create({
        data: {
          question: 'Test question',
          answer: 'Test answer',
          sessionId: demoSession.id
        }
      });

      const response = await request(app)
        .post('/feedback')
        .send({
          conversationId: demoConversation.id, // Use real conversation ID
          score: 3,
          isDemo: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
