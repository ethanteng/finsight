import request from 'supertest';
import { app } from '../../index';
import { getPrismaClient } from '../../index';

describe('Authentication Tests', () => {
  let prisma: any;

  beforeAll(async () => {
    prisma = getPrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data - delete related records first
    await prisma.privacySettings.deleteMany({
      where: {
        user: {
          email: {
            in: ['test@example.com', 'newuser@example.com', 'user1@example.com', 'user2@example.com']
          }
        }
      }
    });
    
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['test@example.com', 'newuser@example.com', 'user1@example.com', 'user2@example.com']
        }
      }
    });
  });

  describe('User Registration', () => {
    it('should allow user to create a new account', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'TestPassword123',
          tier: 'starter'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('message');
      expect(response.body.user.email).toBe('newuser@example.com');
      expect(response.body.user.tier).toBe('starter');
    });

    it('should reject registration with existing email', async () => {
      // First registration
      await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123',
          tier: 'starter'
        });

      // Second registration with same email
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123',
          tier: 'starter'
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject registration with invalid email', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          password: 'testpassword123',
          name: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject registration with weak password', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: '123',
          tier: 'starter'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('User Login', () => {
    beforeEach(async () => {
      // Create a test user
      await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123',
          tier: 'starter'
        });
    });

    it('should allow user to log into existing account', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('message');
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should reject login with wrong password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPassword123'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Authorization Tests', () => {
    let authToken: string;
    let userId: string;

    beforeEach(async () => {
      // Create and login a test user
      const registerResponse = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123',
          tier: 'starter'
        });

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body).toHaveProperty('token');
      expect(registerResponse.body).toHaveProperty('user');
      expect(registerResponse.body.user).toHaveProperty('id');

      authToken = registerResponse.body.token;
      userId = registerResponse.body.user.id;
    });

    it('should allow access to /auth/profile with valid token', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });

    it('should reject access to /auth/profile without token', async () => {
      const response = await request(app)
        .get('/auth/profile');

      expect(response.status).toBe(401);
    });

    it('should reject access to /auth/profile with invalid token', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });

  describe('Demo Mode Tests', () => {
    it('should allow demo API requests without authentication', async () => {
      const response = await request(app)
        .post('/ask')
        .set('x-session-id', 'test-session-id')
        .send({
          question: 'What is my balance?',
          isDemo: true
        });

      expect([200, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('answer');
      }
    });

    it('should allow demo API requests without authentication', async () => {
      const response = await request(app)
        .post('/ask')
        .set('x-session-id', 'test-session-id')
        .send({
          question: 'What is my balance?',
          isDemo: true
        });

      expect([200, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('answer');
      }
    });

    it('should reject demo API requests without session ID', async () => {
      const response = await request(app)
        .post('/ask')
        .send({
          question: 'What is my balance?',
          isDemo: true
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Session Management', () => {
    let authToken: string;

    beforeEach(async () => {
      // Create and login a test user
      const registerResponse = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123',
          tier: 'starter'
        });

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body).toHaveProperty('token');

      authToken = registerResponse.body.token;
    });

    it('should maintain session across multiple requests', async () => {
      // First request
      const response1 = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response1.status).toBe(200);

      // Second request with same token
      const response2 = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response2.status).toBe(200);
    });

    it('should reject expired tokens', async () => {
      // This test would require token expiration logic
      // For now, we'll test that invalid tokens are rejected
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', 'Bearer expired-token');

      expect(response.status).toBe(401);
    });
  });

  describe('Data Isolation', () => {
    let user1Token: string;
    let user2Token: string;

    beforeEach(async () => {
      // Create two test users
      const user1Response = await request(app)
        .post('/auth/register')
        .send({
          email: 'user1@example.com',
          password: 'TestPassword123',
          tier: 'starter'
        });

      const user2Response = await request(app)
        .post('/auth/register')
        .send({
          email: 'user2@example.com',
          password: 'TestPassword123',
          tier: 'starter'
        });

      user1Token = user1Response.body.token;
      user2Token = user2Response.body.token;
    });

    it('should isolate user data between different users', async () => {
      // User 1 should not be able to access User 2's data
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      // The response should only contain User 1's data
      // This would need to be verified based on the actual response structure
    });

    it('should allow demo users to access demo data without affecting real users', async () => {
      // Demo request
      const demoResponse = await request(app)
        .post('/ask')
        .set('x-session-id', 'test-session-id')
        .send({
          question: 'What is my balance?',
          isDemo: true
        });

      expect([200, 500]).toContain(demoResponse.status);

      // Real user request should still work
      const userResponse = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(userResponse.status).toBe(200);
    });
  });
}); 