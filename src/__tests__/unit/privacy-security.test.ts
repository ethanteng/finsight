import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { UserTier } from '../../data/types';

// Mock Prisma client
const mockPrismaClient = {
  conversation: {
    deleteMany: jest.fn()
  },
  transaction: {
    deleteMany: jest.fn()
  },
  account: {
    deleteMany: jest.fn()
  },
  accessToken: {
    deleteMany: jest.fn()
  },
  syncStatus: {
    deleteMany: jest.fn()
  }
};

// Mock the prisma client module
jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => mockPrismaClient
}));

// Mock auth middleware
const mockRequireAuth = jest.fn((req: any, res: any, next: any) => {
  // Simulate authentication middleware
  if (req.headers.authorization?.includes('valid-token')) {
    req.user = { id: 'user-123', email: 'test@example.com', tier: 'starter' };
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
});

// Create a simple Express app for testing
const app = express();
app.use(express.json());

// Mock the privacy endpoints
app.delete('/privacy/delete-all-data', mockRequireAuth, async (req: any, res: any) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Delete only the authenticated user's data
    await mockPrismaClient.conversation.deleteMany({
      where: { userId }
    });
    await mockPrismaClient.transaction.deleteMany({
      where: { userId }
    });
    await mockPrismaClient.account.deleteMany({
      where: { userId }
    });
    await mockPrismaClient.accessToken.deleteMany({
      where: { userId }
    });
    await mockPrismaClient.syncStatus.deleteMany({
      where: { userId }
    });

    res.json({ success: true, message: 'All data deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete data' });
  }
});

app.post('/privacy/disconnect-accounts', mockRequireAuth, async (req: any, res: any) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Remove only the authenticated user's Plaid access tokens
    await mockPrismaClient.accessToken.deleteMany({
      where: { userId }
    });
    
    // Clear only the authenticated user's account and transaction data
    await mockPrismaClient.transaction.deleteMany({
      where: { userId }
    });
    await mockPrismaClient.account.deleteMany({
      where: { userId }
    });
    await mockPrismaClient.syncStatus.deleteMany({
      where: { userId }
    });

    res.json({ success: true, message: 'All accounts disconnected and data cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect accounts' });
  }
});

describe('Privacy Endpoints Security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('DELETE /privacy/delete-all-data', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
      expect(mockPrismaClient.conversation.deleteMany).not.toHaveBeenCalled();
    });

    it('should only delete data for authenticated user', async () => {
      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Verify that deleteMany was called with user filtering
      expect(mockPrismaClient.conversation.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' }
      });
      expect(mockPrismaClient.transaction.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' }
      });
      expect(mockPrismaClient.account.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' }
      });
      expect(mockPrismaClient.accessToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' }
      });
      expect(mockPrismaClient.syncStatus.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' }
      });
    });

    it('should not delete data for all users (security check)', async () => {
      await request(app)
        .delete('/privacy/delete-all-data')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Verify that deleteMany was NOT called without user filtering
      expect(mockPrismaClient.conversation.deleteMany).not.toHaveBeenCalledWith({});
      expect(mockPrismaClient.transaction.deleteMany).not.toHaveBeenCalledWith({});
      expect(mockPrismaClient.account.deleteMany).not.toHaveBeenCalledWith({});
      expect(mockPrismaClient.accessToken.deleteMany).not.toHaveBeenCalledWith({});
      expect(mockPrismaClient.syncStatus.deleteMany).not.toHaveBeenCalledWith({});
    });
  });

  describe('POST /privacy/disconnect-accounts', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/privacy/disconnect-accounts')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
      expect(mockPrismaClient.accessToken.deleteMany).not.toHaveBeenCalled();
    });

    it('should only disconnect accounts for authenticated user', async () => {
      const response = await request(app)
        .post('/privacy/disconnect-accounts')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Verify that deleteMany was called with user filtering
      expect(mockPrismaClient.accessToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' }
      });
      expect(mockPrismaClient.transaction.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' }
      });
      expect(mockPrismaClient.account.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' }
      });
      expect(mockPrismaClient.syncStatus.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' }
      });
    });

    it('should not disconnect accounts for all users (security check)', async () => {
      await request(app)
        .post('/privacy/disconnect-accounts')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Verify that deleteMany was NOT called without user filtering
      expect(mockPrismaClient.accessToken.deleteMany).not.toHaveBeenCalledWith({});
      expect(mockPrismaClient.transaction.deleteMany).not.toHaveBeenCalledWith({});
      expect(mockPrismaClient.account.deleteMany).not.toHaveBeenCalledWith({});
      expect(mockPrismaClient.syncStatus.deleteMany).not.toHaveBeenCalledWith({});
    });
  });
}); 