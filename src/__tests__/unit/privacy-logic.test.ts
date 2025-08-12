import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Privacy Logic Tests', () => {
  beforeEach(async () => {
    // Clean up any existing test data
    await prisma.transaction.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.accessToken.deleteMany();
    await prisma.account.deleteMany();
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
          email: 'test-delete-all@example.com',
          tier: 'starter',
          passwordHash: 'test-hash',
        },
      });

      // Verify user was created
      expect(user.id).toBeDefined();
      expect(user.email).toBe('test-delete-all@example.com');
      console.log('Created user with ID:', user.id);

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

      // Verify data exists
      const initialTokens = await prisma.accessToken.findMany({
        where: { userId: user.id }
      });
      const initialAccounts = await prisma.account.findMany({
        where: { userId: user.id }
      });
      expect(initialTokens.length).toBe(1);
      expect(initialAccounts.length).toBe(1);

      // Delete all user data
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

      // Verify data is deleted
      const remainingTokens = await prisma.accessToken.findMany({
        where: { userId: user.id }
      });
      const remainingAccounts = await prisma.account.findMany({
        where: { userId: user.id }
      });
      expect(remainingTokens.length).toBe(0);
      expect(remainingAccounts.length).toBe(0);
    });

    it('should only delete data for specific user', async () => {
      // Create two users
      const user1 = await prisma.user.create({
        data: {
          email: 'user1-specific@example.com',
          tier: 'starter',
          passwordHash: 'test-hash-1',
        },
      });

      const user2 = await prisma.user.create({
        data: {
          email: 'user2-specific@example.com',
          tier: 'starter',
          passwordHash: 'test-hash-2',
        },
      });

      // Verify users were created
      expect(user1.id).toBeDefined();
      expect(user2.id).toBeDefined();
      expect(user1.email).toBe('user1-specific@example.com');
      expect(user2.email).toBe('user2-specific@example.com');
      console.log('Created users with IDs:', user1.id, user2.id);

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

      // Get the created accounts
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

      // Delete only user1's data in the correct order
      // First delete transactions for user1
      await prisma.transaction.deleteMany({
        where: { account: { userId: user1.id } },
      });

      // Then delete conversations for user1
      await prisma.conversation.deleteMany({
        where: { userId: user1.id },
      });

      // Then delete access tokens for user1
      await prisma.accessToken.deleteMany({
        where: { userId: user1.id },
      });

      // Finally delete accounts for user1
      await prisma.account.deleteMany({
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
          email: 'test-disconnect@example.com',
          tier: 'starter',
          passwordHash: 'test-hash',
        },
      });

      // Verify user was created
      expect(user.id).toBeDefined();
      expect(user.email).toBe('test-disconnect@example.com');
      console.log('Created user with ID:', user.id);

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
          email: 'test-cascade@example.com',
          tier: 'starter',
          passwordHash: 'test-hash',
        },
      });

      // Verify user was created
      expect(user.id).toBeDefined();
      expect(user.email).toBe('test-cascade@example.com');
      console.log('Created user with ID:', user.id);

      // Create account first
      const account = await prisma.account.create({
        data: {
          plaidAccountId: 'test-account-1',
          name: 'Test Account',
          type: 'depository',
          subtype: 'checking',
          currentBalance: 1000,
          userId: user.id,
        },
      });

      // Verify account was created
      expect(account).toBeTruthy();
      expect(account.id).toBeDefined();
      expect(account.userId).toBe(user.id);
      console.log('Created account with ID:', account.id);

      // Create transaction for the account
      const transaction = await prisma.transaction.create({
        data: {
          plaidTransactionId: 'test-transaction-1',
          accountId: account.id,
          amount: 50,
          date: new Date(),
          name: 'Test Transaction',
          pending: false,
        },
      });

      // Verify transaction was created
      expect(transaction).toBeTruthy();
      expect(transaction.accountId).toBe(account.id);
      console.log('Created transaction with ID:', transaction.id);

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

  describe('Privacy Anonymization Functions', () => {
    // Import the privacy functions
    const {
      tokenizeAccount,
      tokenizeInstitution,
      tokenizeMerchant,
      tokenizeSecurity,
      tokenizeLiability,
      anonymizeAccountData,
      anonymizeTransactionData,
      anonymizeInvestmentData,
      anonymizeLiabilityData,
      anonymizeEnhancedTransactionData,
      convertResponseToUserFriendly,
      clearTokenizationMaps,
      getRealAccountName,
      getRealInstitutionName,
      getRealMerchantName,
      getRealSecurityName,
      getRealLiabilityName
    } = require('../../privacy');

    beforeEach(() => {
      // Clear tokenization maps before each test for isolation
      clearTokenizationMaps();
    });

    afterEach(() => {
      // Clear tokenization maps after each test for cleanup
      clearTokenizationMaps();
    });

    describe('Tokenization Functions', () => {
      it('should tokenize account names consistently', () => {
        const token1 = tokenizeAccount('Chase Checking', 'Chase Bank');
        const token2 = tokenizeAccount('Chase Checking', 'Chase Bank');
        const token3 = tokenizeAccount('Chase Savings', 'Chase Bank');
        
        expect(token1).toBe(token2); // Same account should get same token
        expect(token1).not.toBe(token3); // Different accounts should get different tokens
        expect(token1).toMatch(/^Account_\d+$/);
        expect(token3).toMatch(/^Account_\d+$/);
      });

      it('should tokenize institution names consistently', () => {
        const token1 = tokenizeInstitution('Chase Bank');
        const token2 = tokenizeInstitution('Chase Bank');
        const token3 = tokenizeInstitution('Bank of America');
        
        expect(token1).toBe(token2); // Same institution should get same token
        expect(token1).not.toBe(token3); // Different institutions should get different tokens
        expect(token1).toMatch(/^Institution_\d+$/);
        expect(token3).toMatch(/^Institution_\d+$/);
      });

      it('should tokenize merchant names consistently', () => {
        const token1 = tokenizeMerchant('Starbucks');
        const token2 = tokenizeMerchant('Starbucks');
        const token3 = tokenizeMerchant('Amazon');
        
        expect(token1).toBe(token2); // Same merchant should get same token
        expect(token1).not.toBe(token3); // Different merchants should get different tokens
        expect(token1).toMatch(/^Merchant_\d+$/);
        expect(token3).toMatch(/^Merchant_\d+$/);
      });

      it('should tokenize security names with ticker and type', () => {
        const token1 = tokenizeSecurity('Apple Inc.', 'AAPL', 'stock');
        const token2 = tokenizeSecurity('Apple Inc.', 'AAPL', 'stock');
        const token3 = tokenizeSecurity('Apple Inc.', 'AAPL', 'etf');
        
        expect(token1).toBe(token2); // Same security should get same token
        expect(token1).not.toBe(token3); // Different type should get different token
        expect(token1).toMatch(/^Security_\d+$/);
        expect(token3).toMatch(/^Security_\d+$/);
      });

      it('should tokenize liability names with type and institution', () => {
        const token1 = tokenizeLiability('Chase Credit Card', 'credit', 'Chase Bank');
        const token2 = tokenizeLiability('Chase Credit Card', 'credit', 'Chase Bank');
        const token3 = tokenizeLiability('Chase Credit Card', 'mortgage', 'Chase Bank');
        
        expect(token1).toBe(token2); // Same liability should get same token
        expect(token1).not.toBe(token3); // Different type should get different token
        expect(token1).toMatch(/^Liability_\d+$/);
        expect(token3).toMatch(/^Liability_\d+$/);
      });

      it('should handle null/undefined inputs safely', () => {
        expect(() => tokenizeAccount(null as any, undefined)).not.toThrow();
        expect(() => tokenizeInstitution(null as any)).not.toThrow();
        expect(() => tokenizeMerchant(undefined as any)).not.toThrow();
        expect(() => tokenizeSecurity('', '', '')).not.toThrow();
        expect(() => tokenizeLiability('', '', '')).not.toThrow();
      });
    });

    describe('Anonymization Functions', () => {
      it('should anonymize account data correctly', () => {
        const accounts = [
          { name: 'Chase Checking', institution: 'Chase Bank', type: 'checking', subtype: 'checking', currentBalance: 2500.75, availableBalance: 2400.50 },
          { name: 'Chase Savings', institution: 'Chase Bank', type: 'depository', subtype: 'savings', currentBalance: 15200.00, availableBalance: 15200.00 }
        ];

        const anonymized = anonymizeAccountData(accounts);
        
        expect(anonymized).toContain('Account_1');
        expect(anonymized).toContain('Account_2');
        expect(anonymized).toContain('Institution_1');
        expect(anonymized).toContain('$2500.75');
        expect(anonymized).toContain('$15200.00');
        expect(anonymized).not.toContain('Chase Checking');
        expect(anonymized).not.toContain('Chase Bank');
      });

      it('should anonymize transaction data correctly', () => {
        const transactions = [
          { 
            name: 'Starbucks', 
            date: '2025-01-15', 
            amount: -4.75, 
            category: ['Food and Drink', 'Coffee Shop'],
            pending: false,
            merchantName: 'Starbucks Coffee'
          },
          { 
            name: 'Amazon', 
            date: '2025-01-14', 
            amount: -89.99, 
            category: ['Shopping', 'Online'],
            pending: true,
            merchantName: 'Amazon.com'
          }
        ];

        const anonymized = anonymizeTransactionData(transactions);
        
        expect(anonymized).toContain('Merchant_1');
        expect(anonymized).toContain('Merchant_2');
        expect(anonymized).toContain('$-4.75');
        expect(anonymized).toContain('$-89.99');
        expect(anonymized).toContain('[PENDING]');
        expect(anonymized).not.toContain('Starbucks');
        expect(anonymized).not.toContain('Amazon');
      });

      it('should anonymize investment data correctly', () => {
        const investments = [
          {
            security_name: 'Apple Inc.',
            ticker_symbol: 'AAPL',
            security_type: 'stock',
            quantity: 100,
            institution_price: 150.25,
            institution_value: 15025.00
          },
          {
            security_name: 'Vanguard Total Stock Market ETF',
            ticker_symbol: 'VTSAX',
            security_type: 'etf',
            quantity: 50.5,
            institution_price: 85.75,
            institution_value: 4330.38
          }
        ];

        const anonymized = anonymizeInvestmentData(investments);
        
        expect(anonymized).toContain('Security_1');
        expect(anonymized).toContain('Security_2');
        expect(anonymized).toContain('100 shares');
        expect(anonymized).toContain('50.5000 shares');
        expect(anonymized).toContain('$150.25');
        expect(anonymized).toContain('$85.75');
        expect(anonymized).toContain('(stock)');
        expect(anonymized).toContain('(etf)');
        expect(anonymized).not.toContain('Apple Inc.');
        expect(anonymized).not.toContain('AAPL');
        expect(anonymized).not.toContain('Vanguard Total Stock Market ETF');
        expect(anonymized).not.toContain('VTSAX');
      });

      it('should anonymize liability data correctly', () => {
        const liabilities = [
          {
            name: 'Chase Credit Card',
            type: 'credit',
            institution: 'Chase Bank',
            balance: 1245.50,
            limit: 5000.00,
            apr: 24.99
          },
          {
            name: 'Student Loan',
            type: 'student',
            institution: 'Sallie Mae',
            balance: 25000.00,
            limit: 25000.00,
            apr: 5.50
          }
        ];

        const anonymized = anonymizeLiabilityData(liabilities);
        
        expect(anonymized).toContain('Liability_1');
        expect(anonymized).toContain('Liability_2');
        expect(anonymized).toContain('Institution_1');
        expect(anonymized).toContain('Institution_2');
        expect(anonymized).toContain('$1245.50');
        expect(anonymized).toContain('$25000.00');
        expect(anonymized).toContain('(credit)');
        expect(anonymized).toContain('(student)');
        expect(anonymized).toContain('24.99%');
        expect(anonymized).toContain('5.50%');
        expect(anonymized).not.toContain('Chase Credit Card');
        expect(anonymized).not.toContain('Chase Bank');
        expect(anonymized).not.toContain('Student Loan');
        expect(anonymized).not.toContain('Sallie Mae');
      });

      it('should anonymize enhanced transaction data correctly', () => {
        const enhancedTransactions = [
          {
            name: 'Starbucks',
            date: '2025-01-15',
            amount: -4.75,
            category: ['Food and Drink', 'Coffee Shop'],
            pending: false,
            enriched_data: {
              merchant_name: 'Starbucks Coffee',
              category: ['Food and Drink', 'Coffee Shop', 'Beverages'],
              payment_method: 'credit card',
              location: JSON.stringify({ city: 'Seattle', state: 'WA' }),
              website: 'starbucks.com',
              brand_name: 'Starbucks'
            }
          }
        ];

        const anonymized = anonymizeEnhancedTransactionData(enhancedTransactions);
        
        expect(anonymized).toContain('Merchant_1');
        expect(anonymized).toContain('$-4.75');
        expect(anonymized).toContain('[Enhanced: Food and Drink, Coffee Shop, Beverages]');
        expect(anonymized).toContain('via credit card');
        expect(anonymized).toContain('at Seattle');
        expect(anonymized).not.toContain('Starbucks');
        expect(anonymized).not.toContain('Starbucks Coffee');
      });

      it('should handle empty arrays gracefully', () => {
        expect(anonymizeAccountData([])).toBe('');
        expect(anonymizeTransactionData([])).toBe('');
        expect(anonymizeInvestmentData([])).toBe('');
        expect(anonymizeLiabilityData([])).toBe('');
        expect(anonymizeEnhancedTransactionData([])).toBe('');
      });

      it('should handle missing or null data gracefully', () => {
        const accounts = [
          { name: null, institution: undefined, type: 'checking', currentBalance: null, availableBalance: undefined }
        ];

        const anonymized = anonymizeAccountData(accounts);
        expect(anonymized).toContain('Account_1');
        expect(anonymized).toContain('N/A');
      });
    });

    describe('De-anonymization Functions', () => {
      it('should convert response back to user-friendly format', () => {
        // First create some tokens
        tokenizeAccount('Chase Checking', 'Chase Bank');
        tokenizeMerchant('Starbucks');
        tokenizeSecurity('Apple Inc.', 'AAPL', 'stock');
        tokenizeLiability('Chase Credit Card', 'credit', 'Chase Bank');

        const aiResponse = 'Your Account_1 at Institution_1 has a transaction from Merchant_1. Consider investing in Security_1 and managing your Liability_1.';
        
        const userFriendly = convertResponseToUserFriendly(aiResponse);
        
        expect(userFriendly).toContain('Chase Checking at Chase Bank');
        expect(userFriendly).toContain('Starbucks');
        expect(userFriendly).toContain('Apple Inc. (AAPL) - stock');
        expect(userFriendly).toContain('Chase Credit Card (credit) at Chase Bank');
        expect(userFriendly).not.toContain('Account_1');
        expect(userFriendly).not.toContain('Merchant_1');
        expect(userFriendly).not.toContain('Security_1');
        expect(userFriendly).not.toContain('Liability_1');
      });

      it('should handle unknown tokens gracefully', () => {
        const aiResponse = 'Unknown token: Unknown_Token_123';
        const userFriendly = convertResponseToUserFriendly(aiResponse);
        
        expect(userFriendly).toBe(aiResponse); // Should remain unchanged
      });

      it('should handle non-string inputs safely', () => {
        expect(convertResponseToUserFriendly(null as any)).toBe('null');
        expect(convertResponseToUserFriendly(undefined as any)).toBe('undefined');
        expect(convertResponseToUserFriendly(123 as any)).toBe('123');
      });
    });

    describe('Tokenization Map Management', () => {
      it('should clear all tokenization maps correctly', () => {
        // Create some tokens
        tokenizeAccount('Test Account', 'Test Bank');
        tokenizeMerchant('Test Merchant');
        tokenizeSecurity('Test Security', 'TEST', 'stock');
        tokenizeLiability('Test Liability', 'credit', 'Test Bank');

        // Verify tokens exist
        expect(getRealAccountName('Account_1')).toBe('Test Account');
        expect(getRealMerchantName('Merchant_1')).toBe('Test Merchant');
        expect(getRealSecurityName('Security_1')).toBe('Test Security');
        expect(getRealLiabilityName('Liability_1')).toBe('Test Liability');

        // Clear maps
        clearTokenizationMaps();

        // Verify tokens are cleared
        expect(getRealAccountName('Account_1')).toBe('Account_1');
        expect(getRealMerchantName('Merchant_1')).toBe('Merchant_1');
        expect(getRealSecurityName('Security_1')).toBe('Security_1');
        expect(getRealLiabilityName('Liability_1')).toBe('Liability_1');
      });

      it('should maintain token consistency within a session', () => {
        const token1 = tokenizeAccount('Chase Checking', 'Chase Bank');
        const token2 = tokenizeAccount('Chase Checking', 'Chase Bank');
        
        expect(token1).toBe(token2);
        expect(getRealAccountName(token1)).toBe('Chase Checking');
        expect(getRealAccountName(token2)).toBe('Chase Checking');
      });
    });

    describe('Edge Cases and Error Handling', () => {
      it('should handle very long names gracefully', () => {
        const longName = 'A'.repeat(1000);
        const token = tokenizeAccount(longName, 'Long Bank Name');
        
        expect(token).toMatch(/^Account_\d+$/);
        expect(getRealAccountName(token)).toBe(longName);
      });

      it('should handle special characters in names', () => {
        const specialName = 'Account & Co. (Ltd.) - Special "Quotes" & <Tags>';
        const token = tokenizeAccount(specialName, 'Special Bank');
        
        expect(token).toMatch(/^Account_\d+$/);
        expect(getRealAccountName(token)).toBe(specialName);
      });

      it('should handle numeric names', () => {
        const numericName = '12345';
        const token = tokenizeAccount(numericName, 'Numeric Bank');
        
        expect(token).toMatch(/^Account_\d+$/);
        expect(getRealAccountName(token)).toBe(numericName);
      });

      it('should handle empty strings and whitespace', () => {
        const token1 = tokenizeAccount('', '');
        const token2 = tokenizeAccount('   ', '   ');
        const token3 = tokenizeAccount('normal', 'normal');
        
        expect(token1).toMatch(/^Account_\d+$/);
        expect(token2).toMatch(/^Account_\d+$/);
        expect(token3).toMatch(/^Account_\d+$/);
        expect(token1).not.toBe(token2);
        expect(token2).not.toBe(token3);
      });
    });
  });
}); 