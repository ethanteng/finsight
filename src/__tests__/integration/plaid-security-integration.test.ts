import { describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../../index';
import { prisma } from './setup';
import { createTestUser, createTestAccessToken } from '../unit/factories/user.factory';

describe('Plaid Security Integration Tests', () => {
  let user1: any;
  let user2: any;
  let user1Token: any;
  let user2Token: any;
  let user1JWT: string;
  let user2JWT: string;

  beforeEach(async () => {
    // Clean up before each test
    await prisma.accessToken.deleteMany();
    await prisma.user.deleteMany();

    // Create test users in database
    user1 = await prisma.user.create({
      data: createTestUser({ 
        email: 'user1@test.com',
        passwordHash: 'hashed-password'
      })
    });
    user2 = await prisma.user.create({
      data: createTestUser({ 
        email: 'user2@test.com',
        passwordHash: 'hashed-password'
      })
    });

    // Create access tokens for each user (simulating linked banks)
    user1Token = await prisma.accessToken.create({
      data: createTestAccessToken({ 
        userId: user1.id,
        token: 'user1_plaid_token',
        itemId: 'user1_item_id'
      })
    });
    user2Token = await prisma.accessToken.create({
      data: createTestAccessToken({ 
        userId: user2.id,
        token: 'user2_plaid_token',
        itemId: 'user2_item_id'
      })
    });

    // Login users to get JWT tokens
    const user1LoginResponse = await request(app)
      .post('/auth/login')
      .send({
        email: 'user1@test.com',
        password: 'password123'
      });

    const user2LoginResponse = await request(app)
      .post('/auth/login')
      .send({
        email: 'user2@test.com',
        password: 'password123'
      });

    user1JWT = user1LoginResponse.body.token;
    user2JWT = user2LoginResponse.body.token;
  });

  afterEach(async () => {
    // Clean up after each test
    await prisma.accessToken.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('User Data Isolation Tests', () => {
    it('should prevent new user from seeing another user\'s account data', async () => {
      // This simulates the exact scenario you encountered:
      // User2 creates a new account, hasn't linked any banks yet,
      // but somehow sees User1's account data

      // User2 asks about their accounts (should see none since they haven't linked any banks)
      const user2Response = await request(app)
        .post('/ask')
        .set('Authorization', `Bearer ${user2JWT}`)
        .send({
          question: 'How many accounts do I have and what are my transactions?'
        });

      expect(user2Response.status).toBe(200);
      
      // The response should indicate no accounts linked, not show User1's data
      const responseText = user2Response.body.answer.toLowerCase();
      
      // Should not contain any indication of User1's data
      expect(responseText).not.toContain('2 accounts');
      expect(responseText).not.toContain('5 transactions');
      
      // Should indicate no accounts are linked
      expect(responseText).toMatch(/no accounts|no banks|haven't linked|connect.*bank/i);
    });

    it('should only return data for the authenticated user', async () => {
      // User1 asks about their accounts
      const user1Response = await request(app)
        .post('/ask')
        .set('Authorization', `Bearer ${user1JWT}`)
        .send({
          question: 'Show me my accounts and transactions'
        });

      expect(user1Response.status).toBe(200);
      
      // User2 asks about their accounts
      const user2Response = await request(app)
        .post('/ask')
        .set('Authorization', `Bearer ${user2JWT}`)
        .send({
          question: 'Show me my accounts and transactions'
        });

      expect(user2Response.status).toBe(200);

      // The responses should be different for each user
      expect(user1Response.body.answer).not.toBe(user2Response.body.answer);
    });

    it('should handle user with no linked accounts correctly', async () => {
      // Create a third user with no linked accounts
      const user3 = await createTestUser({ 
        email: 'user3@test.com',
        password: 'password123'
      });

      const user3LoginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: 'user3@test.com',
          password: 'password123'
        });

      const user3JWT = user3LoginResponse.body.token;

      // User3 asks about accounts (has no linked banks)
      const user3Response = await request(app)
        .post('/ask')
        .set('Authorization', `Bearer ${user3JWT}`)
        .send({
          question: 'How many accounts do I have?'
        });

      expect(user3Response.status).toBe(200);
      
      const responseText = user3Response.body.answer.toLowerCase();
      
      // Should indicate no accounts are linked
      expect(responseText).toMatch(/no accounts|no banks|haven't linked|connect.*bank/i);
      
      // Should not show any account data
      expect(responseText).not.toMatch(/\d+ accounts?/);
      expect(responseText).not.toMatch(/\d+ transactions?/);
    });
  });

  describe('Token Access Control Tests', () => {
    it('should only access tokens belonging to the authenticated user', async () => {
      // Verify that the backend only queries tokens for the authenticated user
      // This is a white-box test that verifies our fix is working

      // Mock the database query to verify it's filtered by user
      const originalFindMany = prisma.accessToken.findMany;
      let queryFilter: any = null;

      prisma.accessToken.findMany = jest.fn().mockImplementation((args) => {
        queryFilter = args?.where;
        return originalFindMany.call(prisma.accessToken, args);
      });

      // Make a request that would trigger token access
      await request(app)
        .post('/ask')
        .set('Authorization', `Bearer ${user1JWT}`)
        .send({
          question: 'Show me my accounts'
        });

      // Verify that the query was filtered by user ID
      expect(queryFilter).toBeDefined();
      expect(queryFilter.userId).toBe(user1.id);
    });

    it('should not allow cross-user token access in API responses', async () => {
      // Test that API responses don't leak token information
      const response = await request(app)
        .post('/ask')
        .set('Authorization', `Bearer ${user1JWT}`)
        .send({
          question: 'Show me my accounts'
        });

      expect(response.status).toBe(200);
      
      // Verify the response doesn't contain sensitive token data
      const responseBody = JSON.stringify(response.body);
      expect(responseBody).not.toContain('access_token');
      expect(responseBody).not.toContain('accessToken');
      expect(responseBody).not.toContain('plaid_token');
    });
  });

  describe('Authentication Boundary Tests', () => {
    it('should reject requests without valid authentication', async () => {
      const response = await request(app)
        .post('/ask')
        .send({
          question: 'Show me my accounts'
        });

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid JWT', async () => {
      const response = await request(app)
        .post('/ask')
        .set('Authorization', 'Bearer invalid-jwt-token')
        .send({
          question: 'Show me my accounts'
        });

      expect(response.status).toBe(401);
    });

    it('should reject requests with expired JWT', async () => {
      // Create an expired JWT (this would require JWT library mocking)
      const expiredJWT = 'expired.jwt.token';
      
      const response = await request(app)
        .post('/ask')
        .set('Authorization', `Bearer ${expiredJWT}`)
        .send({
          question: 'Show me my accounts'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('Demo Mode Security Tests', () => {
    it('should not expose real user data in demo mode', async () => {
      // Test that demo mode doesn't leak real user data
      const demoResponse = await request(app)
        .post('/ask')
        .set('X-Demo-Mode', 'true')
        .send({
          question: 'How many accounts do I have?'
        });

      expect(demoResponse.status).toBe(200);
      
      // Demo mode should return demo data, not real user data
      const responseText = demoResponse.body.answer.toLowerCase();
      
      // Should not contain any real user account information
      expect(responseText).not.toContain('user1');
      expect(responseText).not.toContain('user2');
      expect(responseText).not.toContain('user1@test.com');
      expect(responseText).not.toContain('user2@test.com');
    });

    it('should maintain demo mode isolation from real users', async () => {
      // Demo mode request
      const demoResponse = await request(app)
        .post('/ask')
        .set('X-Demo-Mode', 'true')
        .send({
          question: 'Show me my accounts'
        });

      // Real user request
      const realUserResponse = await request(app)
        .post('/ask')
        .set('Authorization', `Bearer ${user1JWT}`)
        .send({
          question: 'Show me my accounts'
        });

      expect(demoResponse.status).toBe(200);
      expect(realUserResponse.status).toBe(200);

      // The responses should be different
      expect(demoResponse.body.answer).not.toBe(realUserResponse.body.answer);
    });
  });

  describe('Error Handling Security Tests', () => {
    it('should not leak sensitive information in error messages', async () => {
      // Test error responses don't contain sensitive data
      const response = await request(app)
        .post('/ask')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          question: 'Show me my accounts'
        });

      expect(response.status).toBe(401);
      
      // Error response should not contain sensitive information
      const errorBody = JSON.stringify(response.body);
      expect(errorBody).not.toContain(user1.id);
      expect(errorBody).not.toContain(user2.id);
      expect(errorBody).not.toContain('user1_plaid_token');
      expect(errorBody).not.toContain('user2_plaid_token');
    });

    it('should handle database errors securely', async () => {
      // This test would require mocking database errors
      // to ensure they don't leak sensitive information
      
      const mockError = new Error('Database connection failed');
      const originalFindMany = prisma.accessToken.findMany;
      
      prisma.accessToken.findMany = jest.fn().mockRejectedValue(mockError);

      const response = await request(app)
        .post('/ask')
        .set('Authorization', `Bearer ${user1JWT}`)
        .send({
          question: 'Show me my accounts'
        });

      // Restore original function
      prisma.accessToken.findMany = originalFindMany;

      expect(response.status).toBe(500);
      
      // Error response should not contain sensitive information
      const errorBody = JSON.stringify(response.body);
      expect(errorBody).not.toContain(user1.id);
      expect(errorBody).not.toContain('user1_plaid_token');
    });
  });
}); 

describe('GPT Context User Isolation Integration', () => {
  let user1: any;
  let user2: any;
  let user1JWT: string;
  let user2JWT: string;

  beforeAll(async () => {
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();
    user1 = await prisma.user.create({ data: { email: 'user1@test.com', passwordHash: 'pw', tier: 'starter' } });
    user2 = await prisma.user.create({ data: { email: 'user2@test.com', passwordHash: 'pw', tier: 'starter' } });
    // Create accounts for user1 only
    await prisma.account.create({ data: { name: 'User1 Checking', type: 'checking', plaidAccountId: 'acc1', userId: user1.id } });
    await prisma.account.create({ data: { name: 'User1 Savings', type: 'savings', plaidAccountId: 'acc2', userId: user1.id } });
    // Login users to get JWT tokens
    const user1Login = await request(app).post('/auth/login').send({ email: 'user1@test.com', password: 'pw' });
    const user2Login = await request(app).post('/auth/login').send({ email: 'user2@test.com', password: 'pw' });
    user1JWT = user1Login.body.token;
    user2JWT = user2Login.body.token;
  });

  it('should not leak user1 data to user2 in /ask response', async () => {
    const response = await request(app)
      .post('/ask')
      .set('Authorization', `Bearer ${user2JWT}`)
      .send({ question: 'What accounts do I have?' });
    expect(response.status).toBe(200);
    const answer = response.body.answer.toLowerCase();
    expect(answer).not.toContain('user1 checking');
    expect(answer).not.toContain('user1 savings');
    // Should indicate no accounts or similar
    expect(answer).toMatch(/no accounts|no banks|haven't linked|connect.*bank/);
  });
}); 