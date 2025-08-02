import request from 'supertest';
import { createTestServer } from '../setup';
import { getPrismaClient } from '../../index';

describe('Admin Endpoints', () => {
  let app: any;
  let prisma: any;

  beforeAll(async () => {
    app = createTestServer();
    prisma = getPrismaClient();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.demoConversation.deleteMany();
    await prisma.demoSession.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /admin/demo-sessions', () => {
    it('should return empty sessions when no data exists', async () => {
      const response = await request(app)
        .get('/admin/demo-sessions')
        .expect(200);

      expect(response.body).toEqual({
        sessions: []
      });
    });

    it('should return sessions with conversation counts', async () => {
      // Create test session
      const session = await prisma.demoSession.create({
        data: {
          sessionId: 'test-session-1',
          userAgent: 'Mozilla/5.0...',
        }
      });

      // Create test conversations
      await prisma.demoConversation.createMany({
        data: [
          {
            question: 'What is my net worth?',
            answer: 'Your net worth is $50,000',
            sessionId: session.id,
          },
          {
            question: 'How much do I spend?',
            answer: 'You spend $2,000/month',
            sessionId: session.id,
          }
        ]
      });

      const response = await request(app)
        .get('/admin/demo-sessions')
        .expect(200);

      expect(response.body.sessions).toHaveLength(1);
      expect(response.body.sessions[0]).toMatchObject({
        sessionId: 'test-session-1',
        conversationCount: 2,
        firstQuestion: 'What is my net worth?',
        lastActivity: expect.any(String),
        userAgent: 'Mozilla/5.0...'
      });
    });

    it('should handle multiple sessions correctly', async () => {
      // Create multiple sessions
      const session1 = await prisma.demoSession.create({
        data: {
          sessionId: 'test-session-1',
          userAgent: 'Mozilla/5.0...',
        }
      });

      const session2 = await prisma.demoSession.create({
        data: {
          sessionId: 'test-session-2',
          userAgent: 'Chrome/91.0...',
        }
      });

      // Create conversations for both sessions
      await prisma.demoConversation.createMany({
        data: [
          {
            question: 'What is my net worth?',
            answer: 'Your net worth is $50,000',
            sessionId: session1.id,
          },
          {
            question: 'How much do I spend?',
            answer: 'You spend $2,000/month',
            sessionId: session2.id,
          }
        ]
      });

      const response = await request(app)
        .get('/admin/demo-sessions')
        .expect(200);

      expect(response.body.sessions).toHaveLength(2);
      expect(response.body.sessions[0].conversationCount).toBe(1);
      expect(response.body.sessions[1].conversationCount).toBe(1);
    });
  });

  describe('GET /admin/demo-conversations', () => {
    it('should return empty conversations when no data exists', async () => {
      const response = await request(app)
        .get('/admin/demo-conversations')
        .expect(200);

      expect(response.body).toEqual({
        conversations: []
      });
    });

    it('should return conversations with session data', async () => {
      // Create test session
      const session = await prisma.demoSession.create({
        data: {
          sessionId: 'test-session-1',
          userAgent: 'Mozilla/5.0...',
        }
      });

      // Create test conversation
      const conversation = await prisma.demoConversation.create({
        data: {
          question: 'What is my net worth?',
          answer: 'Your net worth is $50,000',
          sessionId: session.id,
        }
      });

      const response = await request(app)
        .get('/admin/demo-conversations')
        .expect(200);

      expect(response.body.conversations).toHaveLength(1);
      expect(response.body.conversations[0]).toMatchObject({
        id: conversation.id,
        question: 'What is my net worth?',
        answer: 'Your net worth is $50,000',
        sessionId: session.id,
        session: {
          sessionId: 'test-session-1',
          userAgent: 'Mozilla/5.0...',
          createdAt: expect.any(String)
        }
      });
    });

    it('should return multiple conversations correctly', async () => {
      // Create test session
      const session = await prisma.demoSession.create({
        data: {
          sessionId: 'test-session-1',
          userAgent: 'Mozilla/5.0...',
        }
      });

      // Create multiple conversations
      await prisma.demoConversation.createMany({
        data: [
          {
            question: 'What is my net worth?',
            answer: 'Your net worth is $50,000',
            sessionId: session.id,
          },
          {
            question: 'How much do I spend?',
            answer: 'You spend $2,000/month',
            sessionId: session.id,
          },
          {
            question: 'How much should I save?',
            answer: 'You should save 20% of your income',
            sessionId: session.id,
          }
        ]
      });

      const response = await request(app)
        .get('/admin/demo-conversations')
        .expect(200);

      expect(response.body.conversations).toHaveLength(3);
      
      // Check that conversations are sorted by creation date (newest first)
      const conversations = response.body.conversations;
      expect(conversations[0].question).toBe('How much should I save?');
      expect(conversations[1].question).toBe('How much do I spend?');
      expect(conversations[2].question).toBe('What is my net worth?');
    });
  });

  describe('GET /test-db', () => {
    it('should test database connection and demo storage', async () => {
      const response = await request(app)
        .get('/test-db')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'OK',
        message: 'Database connection and demo storage working correctly',
        sessionId: expect.any(String),
        conversationId: expect.any(String)
      });
    });
  });
}); 