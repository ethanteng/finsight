import request from 'supertest';
import { app } from '../../index';
import { PrismaClient } from '@prisma/client';

// Mock external dependencies
jest.mock('../../openai', () => ({
  askOpenAI: jest.fn().mockResolvedValue('Mocked AI response'),
}));

jest.mock('../../data/orchestrator', () => ({
  dataOrchestrator: {
    getMarketContext: jest.fn().mockResolvedValue({}),
  },
}));

const prisma = new PrismaClient();

describe('Authentication Integration', () => {
  const testUser = {
    email: 'test@example.com',
    password: 'TestPassword123',
    tier: 'starter'
  };

  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Clean up any existing test user and related records
    await prisma.privacySettings.deleteMany({
      where: { user: { email: testUser.email } }
    });
    await prisma.conversation.deleteMany({
      where: { user: { email: testUser.email } }
    });
    await prisma.user.deleteMany({
      where: { email: testUser.email }
    });
  });

  afterAll(async () => {
    // Clean up test user and related records
    await prisma.privacySettings.deleteMany({
      where: { user: { email: testUser.email } }
    });
    await prisma.conversation.deleteMany({
      where: { user: { email: testUser.email } }
    });
    await prisma.user.deleteMany({
      where: { email: testUser.email }
    });
    await prisma.$disconnect();
  });

  describe('User Registration', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(testUser);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.tier).toBe(testUser.tier);

      // Store token and user ID for later tests
      authToken = response.body.token;
      userId = response.body.user.id;
    });

    it('should reject duplicate email registration', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(testUser);

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error', 'User with this email already exists');
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          password: 'TestPassword123'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid email format');
    });

    it('should reject weak password', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test2@example.com',
          password: 'weak'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Password must be');
    });
  });

  describe('User Login', () => {
    it('should login with correct credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(testUser.email);
    });

    it('should reject incorrect password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid email or password');
    });

    it('should reject non-existent email', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPassword123'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid email or password');
    });
  });

  describe('Protected Endpoints', () => {
    it('should access protected endpoint with valid token', async () => {
      const response = await request(app)
        .post('/ask')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          question: 'What is my account balance?'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('answer');
    });

    it('should reject access without token', async () => {
      const response = await request(app)
        .post('/ask')
        .send({
          question: 'What is my account balance?'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('should reject access with invalid token', async () => {
      const response = await request(app)
        .post('/ask')
        .set('Authorization', 'Bearer invalid.token.here')
        .send({
          question: 'What is my account balance?'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('User Profile', () => {
    it('should get user profile with valid token', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.tier).toBe(testUser.tier);
    });

    it('should update user profile', async () => {
      const response = await request(app)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tier: 'standard'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Profile updated successfully');
      expect(response.body.user.tier).toBe('standard');
    });
  });

  describe('Demo Mode', () => {
    it('should allow demo requests without authentication', async () => {
      const response = await request(app)
        .post('/ask')
        .send({
          question: 'What is my account balance?',
          isDemo: true
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('answer');
    });
  });
}); 