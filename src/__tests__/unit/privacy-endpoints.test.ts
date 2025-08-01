import request from 'supertest';
import { PrismaClient } from '@prisma/client';

// Mock the problematic imports
jest.mock('../../index', () => ({
  app: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    use: jest.fn(),
  },
}));

jest.mock('../../plaid', () => ({
  setupPlaidRoutes: jest.fn(),
}));

jest.mock('../../auth/utils', () => ({
  verifyToken: jest.fn(),
}));

const { app } = require('../../index');
const { verifyToken } = require('../../auth/utils');

const prisma = new PrismaClient();

describe('Privacy Endpoints', () => {
  beforeEach(async () => {
    // Clean up database before each test
    await prisma.conversation.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.account.deleteMany();
    await prisma.accessToken.deleteMany();
    await prisma.user.deleteMany();
    
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /privacy/disconnect-accounts', () => {
    it('should require authentication', async () => {
      verifyToken.mockReturnValue(null);

      const response = await request(app)
        .post('/privacy/disconnect-accounts')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('should disconnect all accounts for authenticated user', async () => {
      // Mock authenticated user
      verifyToken.mockReturnValue({
        userId: 'test-user-123',
        email: 'test@example.com',
      });

      // Create test data
      await prisma.user.create({
        data: {
          id: 'test-user-123',
          email: 'test@example.com',
          tier: 'starter',
          passwordHash: 'test-hash',
        },
      });

      await prisma.accessToken.create({
        data: {
          token: 'test-token-1',
          itemId: 'test-item-1',
          userId: 'test-user-123',
        },
      });

      await prisma.accessToken.create({
        data: {
          token: 'test-token-2',
          itemId: 'test-item-2',
          userId: 'test-user-123',
        },
      });

      await prisma.account.create({
        data: {
          plaidAccountId: 'test-account-1',
          name: 'Test Account',
          type: 'depository',
          subtype: 'checking',
          currentBalance: 1000,
          userId: 'test-user-123',
        },
      });

      // Verify data exists
      const initialTokens = await prisma.accessToken.findMany();
      const initialAccounts = await prisma.account.findMany();
      expect(initialTokens.length).toBe(2);
      expect(initialAccounts.length).toBe(1);

      const response = await request(app)
        .post('/privacy/disconnect-accounts')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);

      // Verify accounts are disconnected
      const remainingTokens = await prisma.accessToken.findMany();
      const remainingAccounts = await prisma.account.findMany();
      expect(remainingTokens.length).toBe(0);
      expect(remainingAccounts.length).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      verifyToken.mockReturnValue({
        userId: 'test-user-123',
        email: 'test@example.com',
      });

      // Mock database error
      jest.spyOn(prisma.accessToken, 'deleteMany').mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app)
        .post('/privacy/disconnect-accounts')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /privacy/delete-all-data', () => {
    it('should require authentication', async () => {
      verifyToken.mockReturnValue(null);

      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('should delete all user data for authenticated user', async () => {
      // Mock authenticated user
      verifyToken.mockReturnValue({
        userId: 'test-user-123',
        email: 'test@example.com',
      });

      // Create test data
      await prisma.user.create({
        data: {
          id: 'test-user-123',
          email: 'test@example.com',
          tier: 'starter',
          passwordHash: 'test-hash',
        },
      });

      await prisma.accessToken.create({
        data: {
          token: 'test-token-1',
          itemId: 'test-item-1',
          userId: 'test-user-123',
        },
      });

      await prisma.account.create({
        data: {
          plaidAccountId: 'test-account-1',
          name: 'Test Account',
          type: 'depository',
          subtype: 'checking',
          currentBalance: 1000,
          userId: 'test-user-123',
        },
      });

      const account = await prisma.account.findFirst();
      if (account) {
        await prisma.transaction.create({
          data: {
            plaidTransactionId: 'test-transaction-1',
            accountId: account.id,
            amount: 50,
            date: new Date(),
            name: 'Test Transaction',
            pending: false,
          },
        });
      }

      await prisma.conversation.create({
        data: {
          question: 'Test question',
          answer: 'Test answer',
          userId: 'test-user-123',
        },
      });

      // Verify data exists
      const initialTokens = await prisma.accessToken.findMany();
      const initialAccounts = await prisma.account.findMany();
      const initialTransactions = await prisma.transaction.findMany();
      const initialConversations = await prisma.conversation.findMany();

      expect(initialTokens.length).toBe(1);
      expect(initialAccounts.length).toBe(1);
      expect(initialTransactions.length).toBe(1);
      expect(initialConversations.length).toBe(1);

      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);

      // Verify all data is deleted
      const remainingTokens = await prisma.accessToken.findMany();
      const remainingAccounts = await prisma.account.findMany();
      const remainingTransactions = await prisma.transaction.findMany();
      const remainingConversations = await prisma.conversation.findMany();

      expect(remainingTokens.length).toBe(0);
      expect(remainingAccounts.length).toBe(0);
      expect(remainingTransactions.length).toBe(0);
      expect(remainingConversations.length).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      verifyToken.mockReturnValue({
        userId: 'test-user-123',
        email: 'test@example.com',
      });

      // Mock database error
      jest.spyOn(prisma.accessToken, 'deleteMany').mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    it('should only delete data for the authenticated user', async () => {
      // Mock authenticated user
      verifyToken.mockReturnValue({
        userId: 'test-user-123',
        email: 'test@example.com',
      });

      // Create test data for multiple users
      await prisma.user.createMany({
        data: [
          {
            id: 'test-user-123',
            email: 'test@example.com',
            tier: 'starter',
            passwordHash: 'test-hash-1',
          },
          {
            id: 'test-user-456',
            email: 'other@example.com',
            tier: 'starter',
            passwordHash: 'test-hash-2',
          },
        ],
      });

      // Create data for user 123
      await prisma.accessToken.create({
        data: {
          token: 'test-token-1',
          itemId: 'test-item-1',
          userId: 'test-user-123',
        },
      });

      await prisma.account.create({
        data: {
          plaidAccountId: 'test-account-1',
          name: 'Test Account',
          type: 'depository',
          subtype: 'checking',
          currentBalance: 1000,
          userId: 'test-user-123',
        },
      });

      // Create data for user 456
      await prisma.accessToken.create({
        data: {
          token: 'test-token-2',
          itemId: 'test-item-2',
          userId: 'test-user-456',
        },
      });

      await prisma.account.create({
        data: {
          plaidAccountId: 'test-account-2',
          name: 'Other Account',
          type: 'depository',
          subtype: 'checking',
          currentBalance: 2000,
          userId: 'test-user-456',
        },
      });

      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);

      // Verify only user 123's data is deleted
      const remainingTokens = await prisma.accessToken.findMany();
      const remainingAccounts = await prisma.account.findMany();

      expect(remainingTokens.length).toBe(1);
      expect(remainingAccounts.length).toBe(1);
      expect(remainingTokens[0].userId).toBe('test-user-456');
      expect(remainingAccounts[0].userId).toBe('test-user-456');
    });
  });

  describe('Demo Mode Security', () => {
    it('should not allow demo mode to bypass authentication', async () => {
      const response = await request(app)
        .post('/privacy/disconnect-accounts')
        .set('x-demo-mode', 'true')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('should not allow demo mode to delete data', async () => {
      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .set('x-demo-mode', 'true')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('Data Validation', () => {
    it('should validate user ID in token', async () => {
      verifyToken.mockReturnValue({
        userId: null, // Invalid user ID
        email: 'test@example.com',
      });

      const response = await request(app)
        .post('/privacy/disconnect-accounts')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle malformed request bodies', async () => {
      verifyToken.mockReturnValue({
        userId: 'test-user-123',
        email: 'test@example.com',
      });

      const response = await request(app)
        .post('/privacy/disconnect-accounts')
        .set('Authorization', 'Bearer valid-token')
        .send('invalid json');

      expect(response.status).toBe(400);
    });
  });
}); 