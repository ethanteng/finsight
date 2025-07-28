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
    expect(response.body).toEqual({ status: 'OK' });
  });

  it('should have a working database connection', async () => {
    // Test that we can connect to the database
    const accounts = await prisma.account.findMany();
    expect(Array.isArray(accounts)).toBe(true);
  });

  it('should handle basic API requests', async () => {
    const response = await request(app)
      .post('/ask')
      .send({
        question: 'What is my balance?',
        userId: 'test-user'
      });

    // Should return a response (even if it's an error due to missing data)
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('answer');
  });
}); 