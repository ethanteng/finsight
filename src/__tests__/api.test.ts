import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';

// Mock Prisma
jest.mock('@prisma/client');

const mockPrisma = {
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
  accessToken: {
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  conversation: {
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  syncStatus: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
  },
  $disconnect: jest.fn(),
};

(PrismaClient as jest.MockedClass<typeof PrismaClient>).mockImplementation(() => mockPrisma as any);

// Mock OpenAI
jest.mock('../openai', () => ({
  askOpenAI: jest.fn(),
}));

// Mock Plaid
jest.mock('plaid', () => ({
  Configuration: jest.fn(),
  PlaidApi: jest.fn().mockImplementation(() => ({
    itemPublicTokenExchange: jest.fn(),
    accountsGet: jest.fn(),
    transactionsGet: jest.fn(),
  })),
  PlaidEnvironments: {
    sandbox: 'https://sandbox.plaid.com',
  },
}));

describe('API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Check', () => {
    it('should return 200 OK for health check', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'OK' });
    });
  });

  describe('Plaid Endpoints', () => {
    describe('POST /plaid/create-link-token', () => {
      it('should create link token successfully', async () => {
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
        expect(response.body).toHaveProperty('error');
      });
    });

    describe('POST /plaid/exchange-token', () => {
      it('should exchange public token successfully', async () => {
        const mockExchangeResponse = {
          data: {
            access_token: 'test-access-token',
            item_id: 'test-item-id',
          },
        };

        const mockPlaidApi = require('plaid').PlaidApi;
        mockPlaidApi.mockImplementation(() => ({
          itemPublicTokenExchange: jest.fn().mockResolvedValue(mockExchangeResponse),
        }));

        mockPrisma.accessToken.create.mockResolvedValue({ id: 1 });

        const response = await request(app)
          .post('/plaid/exchange-token')
          .send({
            publicToken: 'test-public-token',
            userId: 'test-user',
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
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
        mockPrisma.accessToken.findMany.mockResolvedValue([
          { accessToken: 'test-token', itemId: 'test-item' },
        ]);

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
        mockPrisma.accessToken.findMany.mockResolvedValue([
          { accessToken: 'test-token', itemId: 'test-item' },
        ]);

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

  describe('AI Q&A Endpoints', () => {
    describe('POST /ask', () => {
      it('should answer questions successfully', async () => {
        const mockAskOpenAI = require('../openai').askOpenAI;
        mockAskOpenAI.mockResolvedValue('Your balance is $1,000');

        mockPrisma.account.findMany.mockResolvedValue([]);
        mockPrisma.transaction.findMany.mockResolvedValue([]);
        mockPrisma.conversation.create.mockResolvedValue({ id: '1' });

        const response = await request(app)
          .post('/ask')
          .send({
            question: 'What is my current balance?',
            userId: 'test-user',
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('answer');
        expect(response.body.answer).toBe('Your balance is $1,000');
      });

      it('should handle missing question', async () => {
        const response = await request(app)
          .post('/ask')
          .send({
            userId: 'test-user',
          });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });

      it('should handle OpenAI API errors', async () => {
        const mockAskOpenAI = require('../openai').askOpenAI;
        mockAskOpenAI.mockRejectedValue(new Error('OpenAI API error'));

        const response = await request(app)
          .post('/ask')
          .send({
            question: 'What is my current balance?',
            userId: 'test-user',
          });

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('error');
      });

      it('should include conversation history', async () => {
        const mockAskOpenAI = require('../openai').askOpenAI;
        mockAskOpenAI.mockResolvedValue('Based on our conversation, your net worth is $5,000');

        const mockConversationHistory = [
          { id: '1', question: 'What is my balance?', answer: 'Your balance is $1,000', createdAt: new Date() },
        ];

        mockPrisma.conversation.findMany.mockResolvedValue(mockConversationHistory);
        mockPrisma.conversation.create.mockResolvedValue({ id: '2' });

        const response = await request(app)
          .post('/ask')
          .send({
            question: 'What is my net worth?',
            userId: 'test-user',
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('answer');
      });
    });
  });

  describe('Privacy Endpoints', () => {
    describe('GET /privacy/data', () => {
      it('should return user data summary', async () => {
        mockPrisma.account.findMany.mockResolvedValue([
          { id: 1, name: 'Test Account', balance: 1000 },
        ]);
        mockPrisma.transaction.findMany.mockResolvedValue([
          { id: 1, name: 'Test Transaction', amount: 50 },
        ]);
        mockPrisma.conversation.findMany.mockResolvedValue([
          { id: '1', question: 'Test question', answer: 'Test answer', createdAt: new Date() },
        ]);

        const response = await request(app)
          .get('/privacy/data')
          .send({ userId: 'test-user' });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('accounts');
        expect(response.body).toHaveProperty('transactions');
        expect(response.body).toHaveProperty('conversations');
      });
    });

    describe('DELETE /privacy/delete-all', () => {
      it('should delete all user data', async () => {
        mockPrisma.accessToken.deleteMany.mockResolvedValue({ count: 2 });
        mockPrisma.account.deleteMany.mockResolvedValue({ count: 3 });
        mockPrisma.transaction.deleteMany.mockResolvedValue({ count: 10 });
        mockPrisma.conversation.deleteMany.mockResolvedValue({ count: 5 });

        const response = await request(app)
          .delete('/privacy/delete-all')
          .send({ userId: 'test-user' });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      });
    });
  });

  describe('Profile Endpoints', () => {
    describe('GET /profile', () => {
      it('should return user profile data', async () => {
        mockPrisma.account.findMany.mockResolvedValue([
          { id: 1, name: 'Test Account', balance: 1000 },
        ]);
        mockPrisma.syncStatus.findFirst.mockResolvedValue({
          lastSync: new Date(),
          status: 'success',
        });

        const response = await request(app)
          .get('/profile')
          .send({ userId: 'test-user' });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('accounts');
        expect(response.body).toHaveProperty('syncStatus');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown endpoints', async () => {
      const response = await request(app).get('/unknown-endpoint');
      
      expect(response.status).toBe(404);
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/ask')
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    it('should handle database connection errors', async () => {
      mockPrisma.account.findMany.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/plaid/accounts')
        .send({ userId: 'test-user' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Request Validation', () => {
    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/ask')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should validate field types', async () => {
      const response = await request(app)
        .post('/ask')
        .send({
          question: 123, // Should be string
          userId: 'test-user',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Response Format', () => {
    it('should return consistent response format', async () => {
      const mockAskOpenAI = require('../openai').askOpenAI;
      mockAskOpenAI.mockResolvedValue('Test answer');

      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.conversation.create.mockResolvedValue({ id: '1' });

      const response = await request(app)
        .post('/ask')
        .send({
          question: 'Test question?',
          userId: 'test-user',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('answer');
      expect(response.body).toHaveProperty('conversationId');
      expect(typeof response.body.answer).toBe('string');
      expect(typeof response.body.conversationId).toBe('string');
    });
  });
}); 