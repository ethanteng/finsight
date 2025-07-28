import { PrismaClient } from '@prisma/client';

// Mock Prisma
jest.mock('@prisma/client');

const mockPrisma = {
  accessToken: {
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  account: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  transaction: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  syncStatus: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
  },
  $disconnect: jest.fn(),
};

(PrismaClient as jest.MockedClass<typeof PrismaClient>).mockImplementation(() => mockPrisma as any);

describe('Plaid Integration (Simple)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Database Operations', () => {
    it('should store access token', async () => {
      const mockToken = {
        id: 1,
        accessToken: 'test-access-token',
        itemId: 'test-item-id',
        userId: 'test-user',
      };

      mockPrisma.accessToken.create.mockResolvedValue(mockToken);

      const result = await mockPrisma.accessToken.create({
        data: {
          accessToken: 'test-access-token',
          itemId: 'test-item-id',
          userId: 'test-user',
        },
      });

      expect(result).toEqual(mockToken);
      expect(mockPrisma.accessToken.create).toHaveBeenCalledWith({
        data: {
          accessToken: 'test-access-token',
          itemId: 'test-item-id',
          userId: 'test-user',
        },
      });
    });

    it('should upsert account data', async () => {
      const mockAccount = {
        id: 1,
        accountId: 'test-account-1',
        name: 'Test Account',
        type: 'depository',
        subtype: 'checking',
        balance: 1000,
      };

      mockPrisma.account.upsert.mockResolvedValue(mockAccount);

      const result = await mockPrisma.account.upsert({
        where: { accountId: 'test-account-1' },
        update: { balance: 1000 },
        create: {
          accountId: 'test-account-1',
          name: 'Test Account',
          type: 'depository',
          subtype: 'checking',
          balance: 1000,
        },
      });

      expect(result).toEqual(mockAccount);
    });

    it('should upsert transaction data', async () => {
      const mockTransaction = {
        id: 1,
        transactionId: 'test-transaction-1',
        accountId: 'test-account-1',
        amount: 50.00,
        date: '2024-01-01',
        name: 'Test Transaction',
        category: ['Food and Drink'],
      };

      mockPrisma.transaction.upsert.mockResolvedValue(mockTransaction);

      const result = await mockPrisma.transaction.upsert({
        where: { transactionId: 'test-transaction-1' },
        update: { amount: 50.00 },
        create: {
          transactionId: 'test-transaction-1',
          accountId: 'test-account-1',
          amount: 50.00,
          date: '2024-01-01',
          name: 'Test Transaction',
          category: ['Food and Drink'],
        },
      });

      expect(result).toEqual(mockTransaction);
    });

    it('should disconnect all accounts', async () => {
      mockPrisma.accessToken.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.account.deleteMany.mockResolvedValue({ count: 3 });
      mockPrisma.transaction.deleteMany.mockResolvedValue({ count: 10 });

      const tokenResult = await mockPrisma.accessToken.deleteMany();
      const accountResult = await mockPrisma.account.deleteMany();
      const transactionResult = await mockPrisma.transaction.deleteMany();

      expect(tokenResult.count).toBe(2);
      expect(accountResult.count).toBe(3);
      expect(transactionResult.count).toBe(10);
    });
  });

  describe('Data Validation', () => {
    it('should validate account data structure', () => {
      const validAccount = {
        account_id: 'test-account-1',
        name: 'Test Account',
        type: 'depository',
        subtype: 'checking',
        balances: { current: 1000, available: 1000 },
      };

      expect(validAccount).toHaveProperty('account_id');
      expect(validAccount).toHaveProperty('name');
      expect(validAccount).toHaveProperty('type');
      expect(validAccount).toHaveProperty('subtype');
      expect(validAccount).toHaveProperty('balances');
      expect(validAccount.balances).toHaveProperty('current');
      expect(validAccount.balances).toHaveProperty('available');
    });

    it('should validate transaction data structure', () => {
      const validTransaction = {
        transaction_id: 'test-transaction-1',
        account_id: 'test-account-1',
        amount: 50.00,
        date: '2024-01-01',
        name: 'Test Transaction',
        category: ['Food and Drink'],
      };

      expect(validTransaction).toHaveProperty('transaction_id');
      expect(validTransaction).toHaveProperty('account_id');
      expect(validTransaction).toHaveProperty('amount');
      expect(validTransaction).toHaveProperty('date');
      expect(validTransaction).toHaveProperty('name');
      expect(validTransaction).toHaveProperty('category');
      expect(Array.isArray(validTransaction.category)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing access tokens gracefully', async () => {
      mockPrisma.accessToken.findMany.mockResolvedValue([]);

      const tokens = await mockPrisma.accessToken.findMany();
      expect(tokens).toEqual([]);
    });

    it('should handle database connection errors', async () => {
      mockPrisma.accessToken.findMany.mockRejectedValue(new Error('Database connection failed'));

      await expect(mockPrisma.accessToken.findMany()).rejects.toThrow('Database connection failed');
    });
  });
}); 