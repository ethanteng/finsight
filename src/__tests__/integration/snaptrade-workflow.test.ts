import request from 'supertest';
import { app } from '../../index';
import { createTestUser } from '../unit/factories/user.factory';
import { hashPassword } from '../../auth/utils';
import { testPrisma } from '../setup/test-database-ci';
import { getPrismaClient } from '../../prisma-client';

// Mock SnapTrade SDK to prevent real API calls
jest.mock('snaptrade-typescript-sdk', () => ({
  Snaptrade: jest.fn().mockImplementation(() => ({
    apiStatus: {
      check: jest.fn().mockResolvedValue({ data: { status: 'healthy' } })
    },
    authentication: {
      registerSnapTradeUser: jest.fn().mockResolvedValue({
        data: { userSecret: 'mock-user-secret-123' }
      }),
      deleteSnapTradeUser: jest.fn().mockResolvedValue({
        data: { success: true }
      })
    },
    accountInformation: {
      listUserAccount: jest.fn().mockResolvedValue({
        data: [
          { id: 'acc-1', name: 'Test Investment Account', balance: 10000 }
        ]
      }),
      listUserHoldings: jest.fn().mockResolvedValue({
        data: [
          { symbol: 'AAPL', quantity: 10, value: 1500 },
          { symbol: 'GOOGL', quantity: 5, value: 1200 }
        ]
      }),
      getAllUserHoldings: jest.fn().mockResolvedValue({
        data: [
          {
            account: {
              id: 'acc-1',
              name: 'Test Investment Account',
              type: 'investment',
              balances: [{ cash: 10000 }]
            },
            total_value: { value: 10000 },
            positions: [
              { symbol: 'AAPL', quantity: 10, value: 1500 },
              { symbol: 'GOOGL', quantity: 5, value: 1200 }
            ]
          }
        ]
      }),
      listUserActivities: jest.fn().mockResolvedValue({
        data: [
          { id: 'act-1', type: 'buy', symbol: 'AAPL', quantity: 10, date: '2024-01-15' }
        ]
      }),
      getAccountActivities: jest.fn().mockResolvedValue({
        data: [
          { id: 'act-1', type: 'buy', symbol: 'AAPL', quantity: 10, date: '2024-01-15' }
        ]
      })
    }
  }))
}));

describe('SnapTrade Workflow Integration Tests', () => {
  let testUser: any;
  let userJWT: string;
  let mainPrisma: any;

  beforeEach(async () => {
    // Get main Prisma client for authentication
    mainPrisma = getPrismaClient();
    
    // Clean up before each test
    await testPrisma.snapTradeUser.deleteMany();
    await testPrisma.user.deleteMany();
    await mainPrisma.snapTradeUser.deleteMany();
    await mainPrisma.user.deleteMany();

    // Create test user in both databases
    testUser = await mainPrisma.user.create({
      data: {
        email: 'snaptrade-test@example.com',
        passwordHash: 'hashedpassword',
        tier: 'starter',
        isActive: true,
        emailVerified: false
      }
    });

    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    userJWT = jwt.sign(
      { userId: testUser.id, email: testUser.email, tier: 'starter' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
  });

  afterEach(async () => {
    // Clean up after each test
    await testPrisma.snapTradeUser.deleteMany();
    await testPrisma.user.deleteMany();
    await mainPrisma.snapTradeUser.deleteMany();
    await mainPrisma.user.deleteMany();
  });

  describe('Complete SnapTrade User Workflow', () => {
    it('should handle complete SnapTrade user lifecycle', async () => {
      // Step 1: Check SnapTrade service status
      const statusResponse = await request(app)
        .get('/snaptrade/status')
        .expect(200);

      expect(statusResponse.body).toHaveProperty('status', 'healthy');
      expect(statusResponse.body).toHaveProperty('service', 'snaptrade');

      // Step 2: Check user status (should be not initialized)
      const userStatusResponse = await request(app)
        .get('/snaptrade/status/user')
        .set('Authorization', `Bearer ${userJWT}`)
        .expect(404);

      expect(userStatusResponse.body).toHaveProperty('status', 'not_initialized');

      // Step 3: Initialize SnapTrade for user
      const initResponse = await request(app)
        .post('/snaptrade/init')
        .set('Authorization', `Bearer ${userJWT}`)
        .expect(200);

      expect(initResponse.body).toHaveProperty('success', true);
      expect(initResponse.body).toHaveProperty('message', 'SnapTrade initialized successfully');
      expect(initResponse.body.data).toHaveProperty('userSecret');

      // Step 4: Check user status (should now be initialized)
      const userStatusAfterInit = await request(app)
        .get('/snaptrade/status/user')
        .set('Authorization', `Bearer ${userJWT}`)
        .expect(200);

      expect(userStatusAfterInit.body).toHaveProperty('status', 'registered');

      // Step 5: Get login redirect URI
      const loginResponse = await request(app)
        .post('/snaptrade/login')
        .set('Authorization', `Bearer ${userJWT}`)
        .expect(200);

      expect(loginResponse.body).toHaveProperty('success', true);
      expect(loginResponse.body).toHaveProperty('message', 'Login redirect URI obtained');

      // Step 6: Get user accounts
      const accountsResponse = await request(app)
        .get('/snaptrade/accounts')
        .set('Authorization', `Bearer ${userJWT}`)
        .expect(200);

      expect(accountsResponse.body).toHaveProperty('success', true);
      expect(accountsResponse.body).toHaveProperty('message', 'Accounts retrieved successfully');
      expect(accountsResponse.body.data).toHaveProperty('accounts');
      expect(accountsResponse.body.data.accounts).toHaveLength(1);
      expect(accountsResponse.body.data.accounts[0]).toHaveProperty('name', 'Test Investment Account');

      // Step 7: Get user holdings
      const holdingsResponse = await request(app)
        .get('/snaptrade/holdings')
        .set('Authorization', `Bearer ${userJWT}`)
        .expect(200);

      expect(holdingsResponse.body).toHaveProperty('success', true);
      expect(holdingsResponse.body).toHaveProperty('message', 'Holdings retrieved successfully');
      expect(holdingsResponse.body.data).toHaveProperty('holdings');
      expect(holdingsResponse.body.data.holdings).toHaveLength(1);
      expect(holdingsResponse.body.data.holdings[0]).toHaveProperty('symbol', 'AAPL');

      // Step 8: Get user activities
      const activitiesResponse = await request(app)
        .get('/snaptrade/activities')
        .set('Authorization', `Bearer ${userJWT}`)
        .expect(200);

      expect(activitiesResponse.body).toHaveProperty('success', true);
      expect(activitiesResponse.body).toHaveProperty('message', 'Activities retrieved successfully');
      expect(activitiesResponse.body.data).toHaveProperty('activities');
      expect(activitiesResponse.body.data.activities).toHaveLength(1);
      expect(activitiesResponse.body.data.activities[0]).toHaveProperty('type', 'buy');

      // Step 9: Delete SnapTrade user
      const deleteResponse = await request(app)
        .delete('/snaptrade/delete')
        .set('Authorization', `Bearer ${userJWT}`)
        .expect(200);

      expect(deleteResponse.body).toHaveProperty('success', true);
      expect(deleteResponse.body).toHaveProperty('message', 'SnapTrade user deleted successfully');

      // Step 10: Verify user is deleted (should get 404)
      const userStatusAfterDelete = await request(app)
        .get('/snaptrade/status/user')
        .set('Authorization', `Bearer ${userJWT}`)
        .expect(404);

      expect(userStatusAfterDelete.body).toHaveProperty('status', 'not_initialized');
    });

    it('should handle errors gracefully when SnapTrade user not found', async () => {
      // Try to get accounts without initializing first
      const accountsResponse = await request(app)
        .get('/snaptrade/accounts')
        .set('Authorization', `Bearer ${userJWT}`)
        .expect(404);

      expect(accountsResponse.body).toHaveProperty('success', false);
      expect(accountsResponse.body).toHaveProperty('error', 'SnapTrade user not found. Please initialize first.');

      // Try to get holdings without initializing first
      const holdingsResponse = await request(app)
        .get('/snaptrade/holdings')
        .set('Authorization', `Bearer ${userJWT}`)
        .expect(404);

      expect(holdingsResponse.body).toHaveProperty('success', false);
      expect(holdingsResponse.body).toHaveProperty('error', 'SnapTrade user not found. Please initialize first.');

      // Try to get activities without initializing first
      const activitiesResponse = await request(app)
        .get('/snaptrade/activities')
        .set('Authorization', `Bearer ${userJWT}`)
        .expect(404);

      expect(activitiesResponse.body).toHaveProperty('success', false);
      expect(activitiesResponse.body).toHaveProperty('error', 'SnapTrade user not found. Please initialize first.');

      // Try to get login redirect without initializing first
      const loginResponse = await request(app)
        .post('/snaptrade/login')
        .set('Authorization', `Bearer ${userJWT}`)
        .expect(404);

      expect(loginResponse.body).toHaveProperty('success', false);
      expect(loginResponse.body).toHaveProperty('error', 'SnapTrade user not found. Please initialize first.');
    });

    it('should enforce authentication on all SnapTrade endpoints', async () => {
      // Test all endpoints without authentication
      const endpoints = [
        { method: 'get', path: '/snaptrade/status/user' },
        { method: 'post', path: '/snaptrade/init' },
        { method: 'post', path: '/snaptrade/login' },
        { method: 'get', path: '/snaptrade/accounts' },
        { method: 'get', path: '/snaptrade/holdings' },
        { method: 'get', path: '/snaptrade/activities' },
        { method: 'delete', path: '/snaptrade/delete' }
      ];

      for (const endpoint of endpoints) {
        let response;
        if (endpoint.method === 'get') {
          response = await request(app).get(endpoint.path);
        } else if (endpoint.method === 'post') {
          response = await request(app).post(endpoint.path);
        } else if (endpoint.method === 'delete') {
          response = await request(app).delete(endpoint.path);
        }
        expect(response!.status).toBe(401);
      }
    });
  });
});
