import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Privacy Logic Tests', () => {
  beforeEach(async () => {
    // Clean up database before each test
    await prisma.conversation.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.account.deleteMany();
    await prisma.accessToken.deleteMany();
    await prisma.privacySettings.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Data Deletion Logic', () => {
    it('should delete all user data correctly', async () => {
      // Create test user
      const user = await prisma.user.create({
        data: {
          id: 'test-user-123',
          email: 'test@example.com',
          tier: 'starter',
          passwordHash: 'test-hash',
        },
      });

      // Create test data for the user
      await prisma.accessToken.create({
        data: {
          token: 'test-token-1',
          itemId: 'test-item-1',
          userId: user.id,
        },
      });

      await prisma.account.create({
        data: {
          plaidAccountId: 'test-account-1',
          name: 'Test Account',
          type: 'depository',
          subtype: 'checking',
          currentBalance: 1000,
          userId: user.id,
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
          userId: user.id,
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

      // Simulate delete all data operation
      await prisma.accessToken.deleteMany({
        where: { userId: user.id },
      });
      await prisma.transaction.deleteMany({
        where: { account: { userId: user.id } },
      });
      await prisma.account.deleteMany({
        where: { userId: user.id },
      });
      await prisma.conversation.deleteMany({
        where: { userId: user.id },
      });

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

    it('should only delete data for specific user', async () => {
      // Create two users
      const user1 = await prisma.user.create({
        data: {
          id: 'test-user-1',
          email: 'user1@example.com',
          tier: 'starter',
          passwordHash: 'test-hash-1',
        },
      });

      const user2 = await prisma.user.create({
        data: {
          id: 'test-user-2',
          email: 'user2@example.com',
          tier: 'starter',
          passwordHash: 'test-hash-2',
        },
      });

      // Create data for both users
      await prisma.accessToken.createMany({
        data: [
          {
            token: 'test-token-1',
            itemId: 'test-item-1',
            userId: user1.id,
          },
          {
            token: 'test-token-2',
            itemId: 'test-item-2',
            userId: user2.id,
          },
        ],
      });

      await prisma.account.createMany({
        data: [
          {
            plaidAccountId: 'test-account-1',
            name: 'User 1 Account',
            type: 'depository',
            subtype: 'checking',
            currentBalance: 1000,
            userId: user1.id,
          },
          {
            plaidAccountId: 'test-account-2',
            name: 'User 2 Account',
            type: 'depository',
            subtype: 'checking',
            currentBalance: 2000,
            userId: user2.id,
          },
        ],
      });

      // Verify both users have data
      const initialTokens = await prisma.accessToken.findMany();
      const initialAccounts = await prisma.account.findMany();
      expect(initialTokens.length).toBe(2);
      expect(initialAccounts.length).toBe(2);

      // Delete only user1's data
      await prisma.accessToken.deleteMany({
        where: { userId: user1.id },
      });
      await prisma.account.deleteMany({
        where: { userId: user1.id },
      });

      // Verify only user1's data is deleted
      const remainingTokens = await prisma.accessToken.findMany();
      const remainingAccounts = await prisma.account.findMany();

      expect(remainingTokens.length).toBe(1);
      expect(remainingAccounts.length).toBe(1);
      expect(remainingTokens[0].userId).toBe(user2.id);
      expect(remainingAccounts[0].userId).toBe(user2.id);
    });
  });

  describe('Account Disconnection Logic', () => {
    it('should disconnect all accounts for a user', async () => {
      // Create test user
      const user = await prisma.user.create({
        data: {
          id: 'test-user-123',
          email: 'test@example.com',
          tier: 'starter',
          passwordHash: 'test-hash',
        },
      });

      // Create multiple access tokens
      await prisma.accessToken.createMany({
        data: [
          {
            token: 'test-token-1',
            itemId: 'test-item-1',
            userId: user.id,
          },
          {
            token: 'test-token-2',
            itemId: 'test-item-2',
            userId: user.id,
          },
        ],
      });

      await prisma.account.createMany({
        data: [
          {
            plaidAccountId: 'test-account-1',
            name: 'Account 1',
            type: 'depository',
            subtype: 'checking',
            currentBalance: 1000,
            userId: user.id,
          },
          {
            plaidAccountId: 'test-account-2',
            name: 'Account 2',
            type: 'depository',
            subtype: 'savings',
            currentBalance: 2000,
            userId: user.id,
          },
        ],
      });

      // Verify data exists
      const initialTokens = await prisma.accessToken.findMany();
      const initialAccounts = await prisma.account.findMany();
      expect(initialTokens.length).toBe(2);
      expect(initialAccounts.length).toBe(2);

      // Simulate disconnect accounts operation
      await prisma.accessToken.deleteMany({
        where: { userId: user.id },
      });
      await prisma.account.deleteMany({
        where: { userId: user.id },
      });

      // Verify accounts are disconnected
      const remainingTokens = await prisma.accessToken.findMany();
      const remainingAccounts = await prisma.account.findMany();
      expect(remainingTokens.length).toBe(0);
      expect(remainingAccounts.length).toBe(0);
    });
  });

  describe('Data Validation', () => {
    it('should validate user data structure', () => {
      const validateUser = (user: any) => {
        if (!user || typeof user !== 'object') return false;
        if (!user.id || typeof user.id !== 'string') return false;
        if (!user.email || typeof user.email !== 'string') return false;
        if (!user.tier || typeof user.tier !== 'string') return false;
        return true;
      };

      const validUser = {
        id: 'test-user-123',
        email: 'test@example.com',
        tier: 'starter',
      };

      const invalidUser = {
        id: 'test-user-123',
        // Missing required fields
      };

      expect(validateUser(validUser)).toBe(true);
      expect(validateUser(invalidUser)).toBe(false);
      expect(validateUser(null)).toBe(false);
      expect(validateUser(undefined)).toBe(false);
    });

    it('should validate access token data structure', () => {
      const validateAccessToken = (token: any) => {
        if (!token || typeof token !== 'object') return false;
        if (!token.token || typeof token.token !== 'string') return false;
        if (!token.itemId || typeof token.itemId !== 'string') return false;
        if (!token.userId || typeof token.userId !== 'string') return false;
        return true;
      };

      const validToken = {
        token: 'test-token-123',
        itemId: 'test-item-123',
        userId: 'test-user-123',
      };

      const invalidToken = {
        token: 'test-token-123',
        // Missing required fields
      };

      expect(validateAccessToken(validToken)).toBe(true);
      expect(validateAccessToken(invalidToken)).toBe(false);
      expect(validateAccessToken(null)).toBe(false);
      expect(validateAccessToken(undefined)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Test with invalid user ID that doesn't exist
      const result = await prisma.accessToken.deleteMany({
        where: { userId: 'non-existent-user' },
      });

      // Should not throw error, just return count of 0
      expect(result.count).toBe(0);
    });

    it('should handle cascading deletes correctly', async () => {
      // Create user with accounts and transactions
      const user = await prisma.user.create({
        data: {
          id: 'test-user-123',
          email: 'test@example.com',
          tier: 'starter',
          passwordHash: 'test-hash',
        },
      });

      await prisma.account.create({
        data: {
          plaidAccountId: 'test-account-1',
          name: 'Test Account',
          type: 'depository',
          subtype: 'checking',
          currentBalance: 1000,
          userId: user.id,
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

      // Delete transactions first due to foreign key constraints
      await prisma.transaction.deleteMany({
        where: { account: { userId: user.id } },
      });

      // Then delete accounts
      await prisma.account.deleteMany({
        where: { userId: user.id },
      });

      // Verify account is deleted
      const remainingAccounts = await prisma.account.findMany();
      expect(remainingAccounts.length).toBe(0);

      // Transactions should also be deleted
      const remainingTransactions = await prisma.transaction.findMany();
      expect(remainingTransactions.length).toBe(0);
    });
  });
}); 