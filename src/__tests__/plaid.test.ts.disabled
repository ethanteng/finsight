import { PrismaClient } from '@prisma/client';
import express from 'express';

// Mock environment variables
process.env.PLAID_ENV = 'sandbox';
process.env.PLAID_CLIENT_ID = 'test-client-id';
process.env.PLAID_SECRET = 'test-secret';

// Mock Plaid client
jest.mock('plaid', () => ({
  Configuration: jest.fn(),
  PlaidApi: jest.fn().mockImplementation(() => ({
    itemPublicTokenExchange: jest.fn(),
    accountsGet: jest.fn(),
    transactionsGet: jest.fn(),
    itemGet: jest.fn(),
  })),
  PlaidEnvironments: {
    sandbox: 'https://sandbox.plaid.com',
  },
}));

// Mock the plaid module after environment setup
jest.mock('../plaid', () => ({
  setupPlaidRoutes: jest.fn(),
}));

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

describe('Plaid Integration', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    // Mock setupPlaidRoutes since we're testing the integration
    const { setupPlaidRoutes } = require('../plaid');
    setupPlaidRoutes(app);
    jest.clearAllMocks();
  });

  describe('POST /plaid/create-link-token', () => {
    it('should create a link token successfully', async () => {
      const response = await request(app)
        .post('/plaid/create-link-token')
        .send({ userId: 'test-user' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('linkToken');
      expect(response.body).toHaveProperty('expiration');
    });

    it('should handle missing userId', async () => {
      const response = await request(app)
        .post('/plaid/create-link-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('User ID is required');
    });
  });

  describe('POST /plaid/exchange-token', () => {
    it('should exchange public token for access token', async () => {
      const mockExchangeResponse = {
        data: {
          access_token: 'test-access-token',
          item_id: 'test-item-id',
        },
      };

      // Mock Plaid API response
      const mockPlaidApi = require('plaid').PlaidApi;
      mockPlaidApi.mockImplementation(() => ({
        itemPublicTokenExchange: jest.fn().mockResolvedValue(mockExchangeResponse),
      }));

      // Mock Prisma responses
      mockPrisma.accessToken.create.mockResolvedValue({ id: 1 });
      mockPrisma.account.upsert.mockResolvedValue({ id: 1 });

      const response = await request(app)
        .post('/plaid/exchange-token')
        .send({
          publicToken: 'test-public-token',
          userId: 'test-user',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    it('should handle invalid public token', async () => {
      const mockPlaidApi = require('plaid').PlaidApi;
      mockPlaidApi.mockImplementation(() => ({
        itemPublicTokenExchange: jest.fn().mockRejectedValue(new Error('Invalid token')),
      }));

      const response = await request(app)
        .post('/plaid/exchange-token')
        .send({
          publicToken: 'invalid-token',
          userId: 'test-user',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /plaid/sync-accounts', () => {
    it('should sync accounts successfully', async () => {
      // Mock access tokens
      mockPrisma.accessToken.findMany.mockResolvedValue([
        { accessToken: 'test-token', itemId: 'test-item' },
      ]);

      // Mock Plaid accounts response
      const mockAccountsResponse = {
        data: {
          accounts: [
            {
              account_id: 'test-account-1',
              name: 'Test Account',
              type: 'depository',
              subtype: 'checking',
              balances: { current: 1000, available: 1000 },
            },
          ],
        },
      };

      const mockPlaidApi = require('plaid').PlaidApi;
      mockPlaidApi.mockImplementation(() => ({
        accountsGet: jest.fn().mockResolvedValue(mockAccountsResponse),
      }));

      // Mock Prisma upsert
      mockPrisma.account.upsert.mockResolvedValue({ id: 1 });

      const response = await request(app)
        .post('/plaid/sync-accounts')
        .send({ userId: 'test-user' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('accountsSynced');
    });

    it('should handle no access tokens', async () => {
      mockPrisma.accessToken.findMany.mockResolvedValue([]);

      const response = await request(app)
        .post('/plaid/sync-accounts')
        .send({ userId: 'test-user' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.accountsSynced).toBe(0);
    });
  });

  describe('POST /plaid/sync-transactions', () => {
    it('should sync transactions successfully', async () => {
      // Mock access tokens
      mockPrisma.accessToken.findMany.mockResolvedValue([
        { accessToken: 'test-token', itemId: 'test-item' },
      ]);

      // Mock Plaid transactions response
      const mockTransactionsResponse = {
        data: {
          transactions: [
            {
              transaction_id: 'test-transaction-1',
              account_id: 'test-account-1',
              amount: 50.00,
              date: '2024-01-01',
              name: 'Test Transaction',
              category: ['Food and Drink'],
            },
          ],
          total_transactions: 1,
        },
      };

      const mockPlaidApi = require('plaid').PlaidApi;
      mockPlaidApi.mockImplementation(() => ({
        transactionsGet: jest.fn().mockResolvedValue(mockTransactionsResponse),
      }));

      // Mock Prisma upsert
      mockPrisma.transaction.upsert.mockResolvedValue({ id: 1 });

      const response = await request(app)
        .post('/plaid/sync-transactions')
        .send({ userId: 'test-user' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('transactionsSynced');
    });
  });

  describe('GET /plaid/accounts', () => {
    it('should return user accounts', async () => {
      const mockAccounts = [
        {
          id: 1,
          accountId: 'test-account-1',
          name: 'Test Account',
          type: 'depository',
          subtype: 'checking',
          balance: 1000,
        },
      ];

      mockPrisma.account.findMany.mockResolvedValue(mockAccounts);

      const response = await request(app)
        .get('/plaid/accounts')
        .send({ userId: 'test-user' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockAccounts);
    });
  });

  describe('DELETE /plaid/disconnect', () => {
    it('should disconnect all accounts', async () => {
      mockPrisma.accessToken.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.account.deleteMany.mockResolvedValue({ count: 3 });
      mockPrisma.transaction.deleteMany.mockResolvedValue({ count: 10 });

      const response = await request(app)
        .delete('/plaid/disconnect')
        .send({ userId: 'test-user' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });
  });
});

// Helper function for making requests
function request(app: express.Application) {
  const supertest = require('supertest');
  return supertest(app);
} 