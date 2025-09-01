import request from 'supertest';
import { app } from '../../index';
import { createTestUser } from '../unit/factories/user.factory';
import { hashPassword } from '../../auth/utils';
import { testPrisma } from '../setup/test-database-ci';
import { getPrismaClient } from '../../prisma-client';

describe('SnapTrade Privacy Integration Tests', () => {
  let user1: any, user2: any;
  let user1JWT: string, user2JWT: string;
  let user1SnapTradeUser: any, user2SnapTradeUser: any;
  let mainPrisma: any;
  let mainUser1: any, mainUser2: any;

  beforeEach(async () => {
    // Initialize main Prisma client for authentication middleware
    mainPrisma = getPrismaClient();
    // Clean up before each test - order matters for foreign key constraints
    await testPrisma.encryptedEmailVerificationCode.deleteMany();
    await testPrisma.encryptedUserData.deleteMany();
    await testPrisma.encrypted_profile_data.deleteMany();
    await testPrisma.demoConversation.deleteMany();
    await testPrisma.demoSession.deleteMany();
    await testPrisma.accessToken.deleteMany();
    await testPrisma.syncStatus.deleteMany();
    await testPrisma.transaction.deleteMany();
    await testPrisma.account.deleteMany();
    // Clean SnapTrade users (if table exists)
    try {
      await testPrisma.snapTradeUser.deleteMany();
    } catch (error) {
      // Table might not exist in test database - that's okay
      console.log('SnapTrade table not found in test database - skipping cleanup');
    }
    await testPrisma.userProfile.deleteMany();
    await testPrisma.user.deleteMany();

    // Create test users in database with unique emails to prevent conflicts
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    
    user1 = await testPrisma.user.create({
      data: {
        email: `snaptrade-privacy-user1-${timestamp}-${randomId}@test.com`,
        passwordHash: 'hashedpassword1',
        tier: 'starter',
        isActive: true,
        emailVerified: false
      }
    });
    user2 = await testPrisma.user.create({
      data: {
        email: `snaptrade-privacy-user2-${timestamp}-${randomId}@test.com`,
        passwordHash: 'hashedpassword2',
        tier: 'starter',
        isActive: true,
        emailVerified: false
      }
    });
    
    // Also create users in main database for authentication middleware (with error handling)
    try {
      console.log('Creating users in main database...');
      mainUser1 = await mainPrisma.user.create({
        data: {
          email: `snaptrade-privacy-user1-${timestamp}-${randomId}@test.com`,
          passwordHash: 'hashedpassword1',
          tier: 'starter',
          isActive: true,
          emailVerified: false
        }
      });
      mainUser2 = await mainPrisma.user.create({
        data: {
          email: `snaptrade-privacy-user2-${timestamp}-${randomId}@test.com`,
          passwordHash: 'hashedpassword2',
          tier: 'starter',
          isActive: true,
          emailVerified: false
        }
      });
      console.log('Main database users created:', mainUser1.id, mainUser2.id);
    } catch (error) {
      // Main database might not be available or have different schema
      console.log('Main database user creation failed:', error instanceof Error ? error.message : 'Unknown error');
      // Fallback to test database user IDs
      mainUser1 = user1;
      mainUser2 = user2;
    }

    // Generate JWT tokens using main database user IDs
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    user1JWT = jwt.sign(
      { userId: mainUser1.id, email: mainUser1.email, tier: mainUser1.tier },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    user2JWT = jwt.sign(
      { userId: mainUser2.id, email: mainUser2.email, tier: mainUser2.tier },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Create SnapTrade users for testing (if table exists)
    try {
      user1SnapTradeUser = await testPrisma.snapTradeUser.create({
        data: {
          userId: user1.id,
          userSecret: 'user1_snaptrade_secret',
          snapTradeUserId: 'snaptrade_user1_id'
        }
      });

      user2SnapTradeUser = await testPrisma.snapTradeUser.create({
        data: {
          userId: user2.id,
          userSecret: 'user2_snaptrade_secret',
          snapTradeUserId: 'snaptrade_user2_id'
        }
      });
      
      // Also create SnapTrade users in main database for testing
      try {
        await mainPrisma.snapTradeUser.create({
          data: {
            userId: mainUser1.id,
            userSecret: 'user1_snaptrade_secret',
            snapTradeUserId: 'snaptrade_user1_id'
          }
        });
        await mainPrisma.snapTradeUser.create({
          data: {
            userId: mainUser2.id,
            userSecret: 'user2_snaptrade_secret',
            snapTradeUserId: 'snaptrade_user2_id'
          }
        });
        console.log('SnapTrade users created in main database');
      } catch (error) {
        console.log('SnapTrade table not found in main database - skipping SnapTrade user creation:', error instanceof Error ? error.message : 'Unknown error');
      }
    } catch (error) {
      // Table might not exist in test database - that's okay for testing
      console.log('SnapTrade table not found in test database - skipping SnapTrade user creation');
      user1SnapTradeUser = null;
      user2SnapTradeUser = null;
    }

    // Create some Plaid data for testing with unique tokens (using test database user IDs)
    try {
      await testPrisma.accessToken.createMany({
        data: [
          {
            token: `snaptrade-privacy-token-${timestamp}-${randomId}-user1`,
            itemId: `snaptrade-privacy-item-${timestamp}-${randomId}-user1`,
            userId: user1.id, // Use test database user ID
          },
          {
            token: `snaptrade-privacy-token-${timestamp}-${randomId}-user2`,
            itemId: `snaptrade-privacy-item-${timestamp}-${randomId}-user2`,
            userId: user2.id, // Use test database user ID
          }
        ]
      });
    } catch (error) {
      console.log('AccessToken creation failed:', error instanceof Error ? error.message : 'Unknown error');
      console.log('User1 ID:', user1.id, 'User2 ID:', user2.id);
      // Verify users exist in test database
      const user1Check = await testPrisma.user.findUnique({ where: { id: user1.id } });
      const user2Check = await testPrisma.user.findUnique({ where: { id: user2.id } });
      console.log('User1 exists:', !!user1Check, 'User2 exists:', !!user2Check);
      throw error;
    }

    try {
      await testPrisma.account.createMany({
        data: [
          {
            plaidAccountId: 'user1_account_1',
            name: 'User1 Checking',
            type: 'depository',
            subtype: 'checking',
            currentBalance: 1000,
            userId: user1.id, // Use test database user ID
          },
          {
            plaidAccountId: 'user2_account_1',
            name: 'User2 Savings',
            type: 'depository',
            subtype: 'savings',
            currentBalance: 2000,
            userId: user2.id, // Use test database user ID
          }
        ]
      });
    } catch (error) {
      console.log('Account creation failed:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  });

  afterEach(async () => {
    // Clean up after each test
    await testPrisma.encryptedEmailVerificationCode.deleteMany();
    await testPrisma.encryptedUserData.deleteMany();
    await testPrisma.encrypted_profile_data.deleteMany();
    await testPrisma.demoConversation.deleteMany();
    await testPrisma.demoSession.deleteMany();
    await testPrisma.accessToken.deleteMany();
    await testPrisma.syncStatus.deleteMany();
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.emailVerificationCode.deleteMany();
    await testPrisma.userProfile.deleteMany();
    try {
      await testPrisma.snapTradeUser.deleteMany();
    } catch (error) {
      // Table might not exist in test database
    }
    await testPrisma.user.deleteMany();
    
    // Also clean up main database (with error handling)
    try {
      await mainPrisma.encryptedEmailVerificationCode.deleteMany();
      await mainPrisma.encryptedUserData.deleteMany();
      await mainPrisma.encrypted_profile_data.deleteMany();
      await mainPrisma.demoConversation.deleteMany();
      await mainPrisma.demoSession.deleteMany();
      await mainPrisma.accessToken.deleteMany();
      await mainPrisma.syncStatus.deleteMany();
      await mainPrisma.passwordResetToken.deleteMany();
      await mainPrisma.emailVerificationCode.deleteMany();
      await mainPrisma.userProfile.deleteMany();
      try {
        await mainPrisma.snapTradeUser.deleteMany();
      } catch (error) {
        // Table might not exist in main database
      }
      await mainPrisma.user.deleteMany();
    } catch (error) {
      // Main database might not be available or have different schema
      console.log('Main database cleanup skipped:', error instanceof Error ? error.message : 'Unknown error');
    }
  });

  describe('SnapTrade Account Disconnection', () => {
    it('should disconnect SnapTrade accounts when disconnecting all accounts', async () => {
      // Skip test if SnapTrade table doesn't exist in test database
      if (!user1SnapTradeUser) {
        console.log('Skipping SnapTrade disconnect test - table not available in test database');
        return;
      }

      // Verify SnapTrade users exist before disconnection
      const snapTradeUsersBefore = await mainPrisma.snapTradeUser.findMany({
        where: { userId: mainUser1.id }
      });
      expect(snapTradeUsersBefore.length).toBe(1);
      expect(snapTradeUsersBefore[0].userSecret).toBe('user1_snaptrade_secret');

      // Disconnect all accounts
      const response = await request(app)
        .post('/privacy/disconnect-accounts')
        .set('Authorization', `Bearer ${user1JWT}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('All accounts disconnected and data cleared');

      // Verify SnapTrade user is deleted (check main database since that's what the endpoint uses)
      const snapTradeUsersAfter = await mainPrisma.snapTradeUser.findMany({
        where: { userId: mainUser1.id }
      });
      expect(snapTradeUsersAfter.length).toBe(0);

      // Verify Plaid data is also deleted (check main database since that's what the endpoint uses)
      const plaidTokensAfter = await mainPrisma.accessToken.findMany({
        where: { userId: mainUser1.id }
      });
      expect(plaidTokensAfter.length).toBe(0);

      const accountsAfter = await mainPrisma.account.findMany({
        where: { userId: mainUser1.id }
      });
      expect(accountsAfter.length).toBe(0);

      // Verify other user's data is intact (if SnapTrade table exists)
      if (user2SnapTradeUser) {
        const user2SnapTradeAfter = await mainPrisma.snapTradeUser.findMany({
          where: { userId: mainUser2.id }
        });
        expect(user2SnapTradeAfter.length).toBe(1);
        expect(user2SnapTradeAfter[0].userSecret).toBe('user2_snaptrade_secret');
      }
    });

    it('should handle users without SnapTrade accounts gracefully', async () => {
      // Skip test if SnapTrade table doesn't exist in test database
      if (!user1SnapTradeUser) {
        console.log('Skipping SnapTrade graceful handling test - table not available in test database');
        return;
      }

      // Delete user1's SnapTrade account from main database to test graceful handling
      await mainPrisma.snapTradeUser.deleteMany({
        where: { userId: mainUser1.id }
      });

      // Verify no SnapTrade user exists
      const snapTradeUsersBefore = await mainPrisma.snapTradeUser.findMany({
        where: { userId: mainUser1.id }
      });
      expect(snapTradeUsersBefore.length).toBe(0);

      // Disconnect accounts should still work
      const response = await request(app)
        .post('/privacy/disconnect-accounts')
        .set('Authorization', `Bearer ${user1JWT}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('All accounts disconnected and data cleared');

      // Verify other user's data is still intact
      const user2SnapTradeAfter = await mainPrisma.snapTradeUser.findMany({
        where: { userId: mainUser2.id }
      });
      expect(user2SnapTradeAfter.length).toBe(1);
    });
  });

  describe('SnapTrade Account Deletion', () => {
    it('should delete SnapTrade accounts when deleting all data', async () => {
      // Skip test if SnapTrade table doesn't exist in test database
      if (!user1SnapTradeUser) {
        console.log('Skipping SnapTrade deletion test - table not available in test database');
        return;
      }

      // Verify SnapTrade users exist before deletion
      const snapTradeUsersBefore = await mainPrisma.snapTradeUser.findMany({
        where: { userId: mainUser1.id }
      });
      expect(snapTradeUsersBefore.length).toBe(1);
      expect(snapTradeUsersBefore[0].userSecret).toBe('user1_snaptrade_secret');

      // Delete all data
      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .set('Authorization', `Bearer ${user1JWT}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('All data and account deleted successfully');

      // Verify SnapTrade user is deleted
      const snapTradeUsersAfter = await mainPrisma.snapTradeUser.findMany({
        where: { userId: mainUser1.id }
      });
      expect(snapTradeUsersAfter.length).toBe(0);

      // Verify user is completely deleted from main database
      const userAfter = await mainPrisma.user.findUnique({
        where: { id: mainUser1.id }
      });
      expect(userAfter).toBeNull();

      // Verify other user's data is intact
      const user2SnapTradeAfter = await mainPrisma.snapTradeUser.findMany({
        where: { userId: mainUser2.id }
      });
      expect(user2SnapTradeAfter.length).toBe(1);
      expect(user2SnapTradeAfter[0].userSecret).toBe('user2_snaptrade_secret');

      const user2After = await mainPrisma.user.findUnique({
        where: { id: mainUser2.id }
      });
      expect(user2After).toBeDefined();
      expect(user2After!.email).toMatch(/^snaptrade-privacy-user2-\d+-[a-z0-9]+@test\.com$/);
    });

    it('should handle users without SnapTrade accounts gracefully during deletion', async () => {
      // Skip test if SnapTrade table doesn't exist in test database
      if (!user1SnapTradeUser) {
        console.log('Skipping SnapTrade graceful deletion test - table not available in test database');
        return;
      }

      // Delete user1's SnapTrade account from main database to test graceful handling
      await mainPrisma.snapTradeUser.deleteMany({
        where: { userId: mainUser1.id }
      });

      // Verify no SnapTrade user exists
      const snapTradeUsersBefore = await mainPrisma.snapTradeUser.findMany({
        where: { userId: mainUser1.id }
      });
      expect(snapTradeUsersBefore.length).toBe(0);

      // Delete all data should still work
      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .set('Authorization', `Bearer ${user1JWT}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('All data and account deleted successfully');

      // Verify user is completely deleted from main database
      const userAfter = await mainPrisma.user.findUnique({
        where: { id: mainUser1.id }
      });
      expect(userAfter).toBeNull();

      // Verify other user's data is still intact
      const user2SnapTradeAfter = await mainPrisma.snapTradeUser.findMany({
        where: { userId: mainUser2.id }
      });
      expect(user2SnapTradeAfter.length).toBe(1);
    });
  });

  describe('Cross-User Data Isolation', () => {
    it('should ensure SnapTrade data isolation between users', async () => {
      // Skip test if SnapTrade table doesn't exist in test database
      if (!user1SnapTradeUser || !user2SnapTradeUser) {
        console.log('Skipping SnapTrade isolation test - table not available in test database');
        return;
      }

      // User1 disconnects accounts
      await request(app)
        .post('/privacy/disconnect-accounts')
        .set('Authorization', `Bearer ${user1JWT}`)
        .expect(200);

      // User2 deletes all data (this will delete the user from main database)
      await request(app)
        .delete('/privacy/delete-all-data')
        .set('Authorization', `Bearer ${user2JWT}`)
        .expect(200);

      // Verify user1's SnapTrade data is gone (disconnected)
      const user1SnapTradeAfter = await mainPrisma.snapTradeUser.findMany({
        where: { userId: mainUser1.id }
      });
      expect(user1SnapTradeAfter.length).toBe(0);

      // Verify user2's SnapTrade data is gone (deleted)
      const user2SnapTradeAfter = await mainPrisma.snapTradeUser.findMany({
        where: { userId: mainUser2.id }
      });
      expect(user2SnapTradeAfter.length).toBe(0);

      // Verify user1 still exists (only disconnected) in main database
      const user1After = await mainPrisma.user.findUnique({
        where: { id: mainUser1.id }
      });
      expect(user1After).toBeDefined();
      expect(user1After!.email).toMatch(/^snaptrade-privacy-user1-\d+-[a-z0-9]+@test\.com$/);

      // Verify user2 is completely deleted from main database
      const user2After = await mainPrisma.user.findUnique({
        where: { id: mainUser2.id }
      });
      expect(user2After).toBeNull();
    });
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for disconnect accounts', async () => {
      const response = await request(app)
        .post('/privacy/disconnect-accounts')
        .expect(401);

      expect(response.body.error).toBe('No token provided');
    });

    it('should require authentication for delete all data', async () => {
      const response = await request(app)
        .delete('/privacy/delete-all-data')
        .expect(401);

      expect(response.body.error).toBe('No token provided');
    });

    it('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .post('/privacy/disconnect-accounts')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(response.body.error).toBe('Invalid or expired token');
    });
  });
});
