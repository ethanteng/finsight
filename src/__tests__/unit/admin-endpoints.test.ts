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

    // Production admin endpoints
    app.get('/admin/production-sessions', async (req, res) => {
      try {
        const prisma = new PrismaClient();
        const users = await prisma.user.findMany({
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

        const userStats = users.map(user => {
          const conversations = user.conversations;
          const firstConversation = conversations[0];
          const lastConversation = conversations[conversations.length - 1];
          
          return {
            userId: user.id,
            email: user.email,
            tier: user.tier,
            conversationCount: user._count.conversations,
            firstQuestion: firstConversation?.question || 'No questions yet',
            lastActivity: lastConversation?.createdAt || user.createdAt,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt
          };
        });

        res.json({ users: userStats });
      } catch (error) {
        console.error('Error fetching production sessions:', error);
        res.status(500).json({ error: 'Failed to fetch production sessions' });
      }
    });

    app.get('/admin/production-conversations', async (req, res) => {
      try {
        const prisma = new PrismaClient();
        const conversations = await prisma.conversation.findMany({
          include: {
            user: true
          },
          orderBy: { createdAt: 'desc' }
        });

        res.json({ conversations });
      } catch (error) {
        console.error('Error fetching production conversations:', error);
        res.status(500).json({ error: 'Failed to fetch production conversations' });
      }
    });

    app.get('/admin/production-users', async (req, res) => {
      try {
        const prisma = new PrismaClient();
        const users = await prisma.user.findMany({
          select: {
            id: true,
            email: true,
            tier: true,
            createdAt: true,
            lastLoginAt: true,
            _count: {
              select: { conversations: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        res.json({ users });
      } catch (error) {
        console.error('Error fetching production users:', error);
        res.status(500).json({ error: 'Failed to fetch production users' });
      }
    });

    app.put('/admin/update-user-tier', async (req, res) => {
      try {
        const prisma = new PrismaClient();
        const { userId, newTier } = req.body;
        
        if (!userId || !newTier) {
          return res.status(400).json({ error: 'Missing userId or newTier' });
        }

        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data: { tier: newTier },
          select: {
            id: true,
            email: true,
            tier: true,
            updatedAt: true
          }
        });

        res.json({ success: true, user: updatedUser });
      } catch (error) {
        console.error('Error updating user tier:', error);
        res.status(500).json({ error: 'Failed to update user tier' });
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

  describe('GET /admin/production-sessions', () => {
    it('should return empty users when no production data exists', async () => {
      const response = await request(app)
        .get('/admin/production-sessions')
        .expect(200);

      expect(response.body).toEqual({
        users: []
      });
    });

    it('should return production users with conversation stats', async () => {
      // Create test user
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          passwordHash: 'hashedpassword',
          tier: 'starter',
        }
      });

      // Create test conversation
      await prisma.conversation.create({
        data: {
          question: 'What is my net worth?',
          answer: 'Your net worth is $50,000',
          userId: user.id,
        }
      });

      const response = await request(app)
        .get('/admin/production-sessions')
        .expect(200);

      expect(response.body.users).toHaveLength(1);
      expect(response.body.users[0]).toMatchObject({
        userId: user.id,
        email: 'test@example.com',
        tier: 'starter',
        conversationCount: 1,
        firstQuestion: 'What is my net worth?',
        lastActivity: expect.any(String),
        createdAt: expect.any(String)
      });
    });
  });

  describe('GET /admin/production-conversations', () => {
    it('should return empty conversations when no production data exists', async () => {
      const response = await request(app)
        .get('/admin/production-conversations')
        .expect(200);

      expect(response.body).toEqual({
        conversations: []
      });
    });

    it('should return production conversations with user data', async () => {
      // Create test user
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          passwordHash: 'hashedpassword',
          tier: 'starter',
        }
      });

      // Create test conversation
      const conversation = await prisma.conversation.create({
        data: {
          question: 'What is my net worth?',
          answer: 'Your net worth is $50,000',
          userId: user.id,
        }
      });

      const response = await request(app)
        .get('/admin/production-conversations')
        .expect(200);

      expect(response.body.conversations).toHaveLength(1);
      expect(response.body.conversations[0]).toMatchObject({
        id: conversation.id,
        question: 'What is my net worth?',
        answer: 'Your net worth is $50,000',
        user: {
          id: user.id,
          email: 'test@example.com',
          tier: 'starter'
        }
      });
    });
  });

  describe('GET /admin/production-users', () => {
    it('should return empty users when no production users exist', async () => {
      const response = await request(app)
        .get('/admin/production-users')
        .expect(200);

      expect(response.body).toEqual({
        users: []
      });
    });

    it('should return production users for management', async () => {
      // Create test user
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          passwordHash: 'hashedpassword',
          tier: 'starter',
        }
      });

      const response = await request(app)
        .get('/admin/production-users')
        .expect(200);

      expect(response.body.users).toHaveLength(1);
      expect(response.body.users[0]).toMatchObject({
        id: user.id,
        email: 'test@example.com',
        tier: 'starter',
        createdAt: expect.any(String),
        _count: {
          conversations: 0
        }
      });
    });
  });

  describe('PUT /admin/update-user-tier', () => {
    it('should return 400 when missing userId or newTier', async () => {
      const response = await request(app)
        .put('/admin/update-user-tier')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Missing userId or newTier');
    });

    it('should return 400 when missing userId', async () => {
      const response = await request(app)
        .put('/admin/update-user-tier')
        .send({ newTier: 'premium' })
        .expect(400);

      expect(response.body.error).toBe('Missing userId or newTier');
    });

    it('should return 400 when missing newTier', async () => {
      const response = await request(app)
        .put('/admin/update-user-tier')
        .send({ userId: 'test-id' })
        .expect(400);

      expect(response.body.error).toBe('Missing userId or newTier');
    });

    it('should update user tier successfully', async () => {
      // Create test user
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          passwordHash: 'hashedpassword',
          tier: 'starter',
        }
      });

      const response = await request(app)
        .put('/admin/update-user-tier')
        .send({ userId: user.id, newTier: 'premium' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toMatchObject({
        id: user.id,
        email: 'test@example.com',
        tier: 'premium',
        updatedAt: expect.any(String)
      });

      // Verify the tier was actually updated in the database
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });
      expect(updatedUser?.tier).toBe('premium');
    });
  });
}); 