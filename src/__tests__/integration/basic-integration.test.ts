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

    // Integration tests should have real API keys and return 200
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('answer');
    expect(typeof response.body.answer).toBe('string');
    expect(response.body.answer.length).toBeGreaterThan(0);
  });
}); 