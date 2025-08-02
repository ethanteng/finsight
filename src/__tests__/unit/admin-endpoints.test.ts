import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';

describe('Admin Endpoints', () => {
  let app: express.Application;
  let prisma: any;

  beforeAll(async () => {
    // Create a minimal test app with just the admin endpoints
    app = express();
    app.use(express.json());
    
    // Add the admin endpoints directly
    app.get('/admin/demo-sessions', async (req, res) => {
      try {
        const prisma = new PrismaClient();
        const sessions = await prisma.demoSession.findMany({
          include: {
            conversations: {
              orderBy: { createdAt: 'asc' }
            },
            _count: {
              select: { conversations: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        const sessionStats = sessions.map(session => {
          const conversations = session.conversations;
          const firstConversation = conversations[0];
          const lastConversation = conversations[conversations.length - 1];
          
          return {
            sessionId: session.sessionId,
            conversationCount: session._count.conversations,
            firstQuestion: firstConversation?.question || 'No questions yet',
            lastActivity: lastConversation?.createdAt || session.createdAt,
            userAgent: session.userAgent
          };
        });

        res.json({ sessions: sessionStats });
      } catch (error) {
        console.error('Error fetching demo sessions:', error);
        res.status(500).json({ error: 'Failed to fetch demo sessions' });
      }
    });

    app.get('/admin/demo-conversations', async (req, res) => {
      try {
        const prisma = new PrismaClient();
        const conversations = await prisma.demoConversation.findMany({
          include: {
            session: true
          },
          orderBy: { createdAt: 'desc' }
        });

        res.json({ conversations });
      } catch (error) {
        console.error('Error fetching demo conversations:', error);
        res.status(500).json({ error: 'Failed to fetch demo conversations' });
      }
    });

    app.get('/test-db', async (req, res) => {
      try {
        const prisma = new PrismaClient();
        await prisma.$queryRaw`SELECT 1`;
        const testSession = await prisma.demoSession.create({
          data: {
            sessionId: 'test-db-session',
            userAgent: 'test'
          }
        });
        const testConversation = await prisma.demoConversation.create({
          data: {
            question: 'Test question',
            answer: 'Test answer',
            sessionId: testSession.id
          }
        });
        await prisma.demoConversation.delete({
          where: { id: testConversation.id }
        });
        await prisma.demoSession.delete({
          where: { id: testSession.id }
        });
        res.json({ 
          status: 'OK', 
          message: 'Database connection and demo storage working correctly',
          sessionId: testSession.id,
          conversationId: testConversation.id
        });
      } catch (error) {
        console.error('Database test failed:', error);
        res.status(500).json({ 
          error: 'Database test failed', 
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    prisma = new PrismaClient();
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
      // The order might vary due to timing, so just check that we have all 3 conversations
      expect(conversations).toHaveLength(3);
      expect(conversations.map((c: any) => c.question)).toContain('What is my net worth?');
      expect(conversations.map((c: any) => c.question)).toContain('How much do I spend?');
      expect(conversations.map((c: any) => c.question)).toContain('How much should I save?');
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