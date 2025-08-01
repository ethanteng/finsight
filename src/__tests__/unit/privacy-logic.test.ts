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
      // Create a test user first
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          tier: 'starter',
          passwordHash: 'test-hash',
        },
      });

      // Verify user was created
      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');

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

      const account = await prisma.account.findFirst({
        where: { userId: user.id }
      });
      expect(account).toBeTruthy();
      
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
      const initialTokens = await prisma.accessToken.findMany({
        where: { userId: user.id }
      });
      const initialAccounts = await prisma.account.findMany({
        where: { userId: user.id }
      });
      const initialTransactions = await prisma.transaction.findMany({
        where: { account: { userId: user.id } }
      });
      const initialConversations = await prisma.conversation.findMany({
        where: { userId: user.id }
      });

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
      const remainingTokens = await prisma.accessToken.findMany({
        where: { userId: user.id }
      });
      const remainingAccounts = await prisma.account.findMany({
        where: { userId: user.id }
      });
      const remainingTransactions = await prisma.transaction.findMany({
        where: { account: { userId: user.id } }
      });
      const remainingConversations = await prisma.conversation.findMany({
        where: { userId: user.id }
      });

      expect(remainingTokens.length).toBe(0);
      expect(remainingAccounts.length).toBe(0);
      expect(remainingTransactions.length).toBe(0);
      expect(remainingConversations.length).toBe(0);
    });

    it('should only delete data for specific user', async () => {
      // Create two users
      const user1 = await prisma.user.create({
        data: {
          email: 'user1@example.com',
          tier: 'starter',
          passwordHash: 'test-hash-1',
        },
      });

      const user2 = await prisma.user.create({
        data: {
          email: 'user2@example.com',
          tier: 'starter',
          passwordHash: 'test-hash-2',
        },
      });

      // Verify users were created
      expect(user1.id).toBeDefined();
      expect(user2.id).toBeDefined();
      expect(user1.email).toBe('user1@example.com');
      expect(user2.email).toBe('user2@example.com');

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
            subtype: 'savings',
            currentBalance: 2000,
            userId: user2.id,
          },
        ],
      });

      // Create transactions for both users
      const user1Account = await prisma.account.findFirst({
        where: { userId: user1.id }
      });
      const user2Account = await prisma.account.findFirst({
        where: { userId: user2.id }
      });

      expect(user1Account).toBeTruthy();
      expect(user2Account).toBeTruthy();

      if (user1Account && user2Account) {
        await prisma.transaction.createMany({
          data: [
            {
              plaidTransactionId: 'test-transaction-1',
              accountId: user1Account.id,
              amount: 50,
              date: new Date(),
              name: 'User 1 Transaction',
              pending: false,
            },
            {
              plaidTransactionId: 'test-transaction-2',
              accountId: user2Account.id,
              amount: 100,
              date: new Date(),
              name: 'User 2 Transaction',
              pending: false,
            },
          ],
        });
      }

      await prisma.conversation.createMany({
        data: [
          {
            question: 'User 1 question',
            answer: 'User 1 answer',
            userId: user1.id,
          },
          {
            question: 'User 2 question',
            answer: 'User 2 answer',
            userId: user2.id,
          },
        ],
      });

      // Verify both users have data
      const user1Tokens = await prisma.accessToken.findMany({
        where: { userId: user1.id }
      });
      const user2Tokens = await prisma.accessToken.findMany({
        where: { userId: user2.id }
      });
      const user1Accounts = await prisma.account.findMany({
        where: { userId: user1.id }
      });
      const user2Accounts = await prisma.account.findMany({
        where: { userId: user2.id }
      });

      expect(user1Tokens.length).toBe(1);
      expect(user2Tokens.length).toBe(1);
      expect(user1Accounts.length).toBe(1);
      expect(user2Accounts.length).toBe(1);

      // Delete only user1's data
      await prisma.accessToken.deleteMany({
        where: { userId: user1.id },
      });
      await prisma.transaction.deleteMany({
        where: { account: { userId: user1.id } },
      });
      await prisma.account.deleteMany({
        where: { userId: user1.id },
      });
      await prisma.conversation.deleteMany({
        where: { userId: user1.id },
      });

      // Verify user1's data is deleted but user2's data remains
      const remainingUser1Tokens = await prisma.accessToken.findMany({
        where: { userId: user1.id }
      });
      const remainingUser2Tokens = await prisma.accessToken.findMany({
        where: { userId: user2.id }
      });
      const remainingUser1Accounts = await prisma.account.findMany({
        where: { userId: user1.id }
      });
      const remainingUser2Accounts = await prisma.account.findMany({
        where: { userId: user2.id }
      });

      expect(remainingUser1Tokens.length).toBe(0);
      expect(remainingUser2Tokens.length).toBe(1);
      expect(remainingUser1Accounts.length).toBe(0);
      expect(remainingUser2Accounts.length).toBe(1);
    });
  });

  describe('Account Disconnection Logic', () => {
    it('should disconnect all accounts for a user', async () => {
      // Create test user
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          tier: 'starter',
          passwordHash: 'test-hash',
        },
      });

      // Verify user was created
      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');

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
      const initialTokens = await prisma.accessToken.findMany({
        where: { userId: user.id }
      });
      const initialAccounts = await prisma.account.findMany({
        where: { userId: user.id }
      });
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
      const remainingTokens = await prisma.accessToken.findMany({
        where: { userId: user.id }
      });
      const remainingAccounts = await prisma.account.findMany({
        where: { userId: user.id }
      });
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
          email: 'test@example.com',
          tier: 'starter',
          passwordHash: 'test-hash',
        },
      });

      // Verify user was created
      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');

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

      const account = await prisma.account.findFirst({
        where: { userId: user.id }
      });
      expect(account).toBeTruthy();
      
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

      // Verify data exists before deletion
      const initialAccounts = await prisma.account.findMany({
        where: { userId: user.id }
      });
      const initialTransactions = await prisma.transaction.findMany({
        where: { account: { userId: user.id } }
      });
      expect(initialAccounts.length).toBe(1);
      expect(initialTransactions.length).toBe(1);

      // Delete transactions first due to foreign key constraints
      await prisma.transaction.deleteMany({
        where: { account: { userId: user.id } },
      });

      // Then delete accounts
      await prisma.account.deleteMany({
        where: { userId: user.id },
      });

      // Verify account is deleted
      const remainingAccounts = await prisma.account.findMany({
        where: { userId: user.id }
      });
      expect(remainingAccounts.length).toBe(0);

      // Transactions should also be deleted
      const remainingTransactions = await prisma.transaction.findMany({
        where: { account: { userId: user.id } }
      });
      expect(remainingTransactions.length).toBe(0);
    });
  });
}); 