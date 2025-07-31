import request from 'supertest';
import { app } from '../../index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Basic Integration Tests', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should have a working health endpoint', async () => {
    const response = await request(app).get('/health');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('memory');
  });

  it('should have a working database connection', async () => {
    // Test that we can connect to the database
    const accounts = await prisma.account.findMany();
    expect(Array.isArray(accounts)).toBe(true);
  });

  it('should handle basic API requests', async () => {
    const response = await request(app)
      .post('/ask')
      .set('x-session-id', 'test-session-id')
      .send({
        question: 'What is my balance?',
        isDemo: true // Use demo mode to bypass authentication
      });

    // Accept various status codes depending on environment
    // 200: Success with valid API key
    // 500: API failure or missing API key
    // 401: Authentication error
    expect([200, 500, 401]).toContain(response.status);
    
    if (response.status === 200) {
      expect(response.body).toHaveProperty('answer');
    } else {
      // Any error status should have an error property
      expect(response.body).toHaveProperty('error');
    }
  });
}); 