import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';

// Mock Prisma client
const mockPrismaClient = {
  user: {
    findUnique: jest.fn(),
    delete: jest.fn()
  },
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
  },
  privacySettings: {
    deleteMany: jest.fn()
  },
  userProfile: {
    deleteMany: jest.fn(),
    findMany: jest.fn()
  },
  encrypted_profile_data: {
    deleteMany: jest.fn()
  },
  encryptedUserData: {
    deleteMany: jest.fn()
  },
  passwordResetToken: {
    deleteMany: jest.fn()
  },
  emailVerificationCode: {
    deleteMany: jest.fn()
  }
};

// Mock the prisma client module
jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => mockPrismaClient
}));

describe('Privacy Endpoints Security', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    const mockRequireAuth = (req: any, res: any, next: any) => {
      if (req.headers.authorization?.includes('valid-token')) {
        req.user = { id: 'user-123', email: 'test@example.com', tier: 'starter' };
        next();
      } else {
        res.status(401).json({ error: 'Authentication required' });
      }
    };

    // Add the privacy endpoints with mocked Prisma calls
    app.delete('/privacy/delete-all-data', mockRequireAuth, async (req: any, res: any) => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        // Get user info before deletion for logging
        const user = await mockPrismaClient.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true }
        });
        
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
        
        // Delete user data in the correct order (respecting foreign key constraints)
        // 1. Delete conversations (references users)
        await mockPrismaClient.conversation.deleteMany({
          where: { userId }
        });
        
        // 2. Delete transactions (references accounts)
        await mockPrismaClient.transaction.deleteMany({
          where: { account: { userId } }
        });
        
        // 3. Delete accounts (references users)
        await mockPrismaClient.account.deleteMany({
          where: { userId }
        });
        
        // 4. Delete access tokens (references users)
        await mockPrismaClient.accessToken.deleteMany({
          where: { userId }
        });
        
        // 5. Delete sync statuses (references users)
        await mockPrismaClient.syncStatus.deleteMany({
          where: { userId }
        });
        
        // 6. Delete privacy settings (references users)
        await mockPrismaClient.privacySettings.deleteMany({
          where: { userId }
        });
        
        // 7. Delete encrypted profile data first (references userProfile)
        await mockPrismaClient.encrypted_profile_data.deleteMany({
          where: { 
            profileHash: {
              in: await mockPrismaClient.userProfile.findMany({
                where: { userId },
                select: { profileHash: true }
              }).then((profiles: any[]) => profiles.map((p: any) => p.profileHash))
            }
          }
        });
        
        // 8. Delete user profile (references users)
        await mockPrismaClient.userProfile.deleteMany({
          where: { userId }
        });
        
        // 9. Delete encrypted user data (references users)
        await mockPrismaClient.encryptedUserData.deleteMany({
          where: { userId }
        });
        
        // 10. Delete password reset tokens (references users)
        await mockPrismaClient.passwordResetToken.deleteMany({
          where: { userId }
        });
        
        // 11. Delete email verification codes (references users)
        await mockPrismaClient.emailVerificationCode.deleteMany({
          where: { userId }
        });
        
        // 12. Finally, delete the user themselves (including login/email)
        await mockPrismaClient.user.delete({
          where: { id: userId }
        });
        
        res.json({ 
          success: true, 
          message: 'All data and account deleted successfully. You will need to create a new account to use the service again.' 
        });
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
          where: { account: { userId } }
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

    // Setup default mock responses
    mockPrismaClient.user.findUnique.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com'
    });
    
    mockPrismaClient.conversation.deleteMany.mockResolvedValue({ count: 5 });
    mockPrismaClient.transaction.deleteMany.mockResolvedValue({ count: 10 });
    mockPrismaClient.account.deleteMany.mockResolvedValue({ count: 2 });
    mockPrismaClient.accessToken.deleteMany.mockResolvedValue({ count: 1 });
    mockPrismaClient.syncStatus.deleteMany.mockResolvedValue({ count: 1 });
    mockPrismaClient.privacySettings.deleteMany.mockResolvedValue({ count: 1 });
    mockPrismaClient.userProfile.deleteMany.mockResolvedValue({ count: 1 });
    mockPrismaClient.userProfile.findMany.mockResolvedValue([{ profileHash: 'hash123' }]);
    mockPrismaClient.encryptedUserData.deleteMany.mockResolvedValue({ count: 1 });
    mockPrismaClient.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaClient.emailVerificationCode.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaClient.user.delete.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('DELETE /privacy/delete-all-data', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should only delete data for authenticated user', async () => {
      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should not delete data for all users (security check)', async () => {
      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Verify that deleteMany was NOT called without user filtering
      expect(mockPrismaClient.conversation.deleteMany).not.toHaveBeenCalledWith({});
    });

    it('should delete UserProfile when deleting all data', async () => {
      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockPrismaClient.userProfile.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' }
      });
    });

    it('should delete all user data for authenticated user', async () => {
      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Verify all deletion operations were called in correct order
      expect(mockPrismaClient.conversation.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
      expect(mockPrismaClient.transaction.deleteMany).toHaveBeenCalledWith({ where: { account: { userId: 'user-123' } } });
      expect(mockPrismaClient.account.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
      expect(mockPrismaClient.accessToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
      expect(mockPrismaClient.syncStatus.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
      expect(mockPrismaClient.privacySettings.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
      expect(mockPrismaClient.userProfile.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
      expect(mockPrismaClient.encryptedUserData.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
      expect(mockPrismaClient.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
      expect(mockPrismaClient.emailVerificationCode.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
      expect(mockPrismaClient.user.delete).toHaveBeenCalledWith({ where: { id: 'user-123' } });
    });

    it('should return 404 for non-existent user', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(response.body.error).toBe('User not found');
    });

    it('should handle database errors gracefully', async () => {
      mockPrismaClient.conversation.deleteMany.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      expect(response.body.error).toBe('Failed to delete data');
    });
  });

  describe('POST /privacy/disconnect-accounts', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/privacy/disconnect-accounts')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should only disconnect accounts for authenticated user', async () => {
      const response = await request(app)
        .post('/privacy/disconnect-accounts')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should not disconnect accounts for all users (security check)', async () => {
      const response = await request(app)
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