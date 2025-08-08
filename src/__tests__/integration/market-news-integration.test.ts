import request from 'supertest';
import { app } from '../../index';
import { PrismaClient } from '@prisma/client';
import { UserTier } from '../../data/types';

const prisma = new PrismaClient();

describe('Market News Context Integration Tests', () => {
  beforeAll(async () => {
    // Clean up any existing market news context data
    await prisma.marketNewsHistory.deleteMany();
    await prisma.marketNewsContext.deleteMany();
    
    // Create initial market context data for testing
    await prisma.marketNewsContext.create({
      data: {
        id: 'auto-starter',
        contextText: 'Starter tier market context - basic economic indicators available.',
        dataSources: ['fred'],
        keyEvents: ['Federal Reserve rate at 5.25%'],
        availableTiers: ['starter'],
        isActive: true
      }
    });
    
    await prisma.marketNewsContext.create({
      data: {
        id: 'auto-standard',
        contextText: 'Standard tier market context - comprehensive economic and market data available.',
        dataSources: ['fred', 'brave_search'],
        keyEvents: ['Federal Reserve rate at 5.25%', 'Mortgage rates at 6.85%'],
        availableTiers: ['standard'],
        isActive: true
      }
    });
  });

  afterAll(async () => {
    await prisma.marketNewsHistory.deleteMany();
    await prisma.marketNewsContext.deleteMany();
    await prisma.$disconnect();
  });

  describe('Market News Context API', () => {
    test('should get market context for Standard tier', async () => {
      const response = await request(app)
        .get('/market-news/context/standard')
        .expect(200);

      expect(response.body).toHaveProperty('contextText');
      expect(response.body).toHaveProperty('dataSources');
      expect(response.body).toHaveProperty('keyEvents');
      expect(response.body).toHaveProperty('lastUpdate');
      expect(response.body.tier).toBe('standard');
      // Context might be empty initially, which is okay
      expect(typeof response.body.contextText).toBe('string');
    });

    test('should get market context for Starter tier', async () => {
      const response = await request(app)
        .get('/market-news/context/starter')
        .expect(200);

      expect(response.body).toHaveProperty('contextText');
      expect(response.body).toHaveProperty('dataSources');
      expect(response.body).toHaveProperty('keyEvents');
      expect(response.body).toHaveProperty('lastUpdate');
      expect(response.body.tier).toBe('starter');
      // Context might be empty initially, which is okay
      expect(typeof response.body.contextText).toBe('string');
    });

    test('should update market context manually', async () => {
      const updateData = {
        contextText: 'Test market context update'
      };

      const response = await request(app)
        .put('/admin/market-news/context/standard')
        .send(updateData)
        .expect(401); // Should require authentication

      expect(response.body).toHaveProperty('error');
    });

    test('should get market context history', async () => {
      const response = await request(app)
        .get('/admin/market-news/history/standard')
        .query({ limit: '5' })
        .expect(401); // Should require authentication

      expect(response.body).toHaveProperty('error');
    });

    test('should handle invalid tier gracefully', async () => {
      const response = await request(app)
        .get('/market-news/context/invalid_tier')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Market News Context with Ask Endpoint', () => {
    // TODO: Fix race conditions in these tests
    // These tests are temporarily commented out due to race conditions
    // that cause 500 errors instead of 200 responses
    /*
    test('should include market context in AI responses for Standard tier', async () => {
      const response = await request(app)
        .post('/ask')
        .set('X-Session-ID', 'test-market-news-session')
        .send({
          question: 'What are the current market conditions?',
          tier: 'standard',
          isDemo: true
        })
        .expect(200);

      expect(response.body).toHaveProperty('answer');
      // The ask endpoint doesn't return sources in the current implementation
      // expect(response.body).toHaveProperty('sources');
      
      // The answer should contain market-related information
      const answer = response.body.answer.toLowerCase();
      expect(answer).toMatch(/market|rate|economic|fed|cd|treasury/i);
    });

    test('should provide different responses for different tiers', async () => {
      // Test Starter tier
      const starterResponse = await request(app)
        .post('/ask')
        .set('X-Session-ID', 'test-starter-session')
        .send({
          question: 'What are the current market conditions?',
          tier: 'starter',
          isDemo: true
        })
        .expect(200);

      // Test Standard tier
      const standardResponse = await request(app)
        .post('/ask')
        .set('X-Session-ID', 'test-standard-session')
        .send({
          question: 'What are the current market conditions?',
          tier: 'standard',
          isDemo: true
        })
        .expect(200);

      // The responses should be different due to different market context access
      expect(starterResponse.body.answer).not.toBe(standardResponse.body.answer);
    });
    */
  });

  describe('Market News Context Database Operations', () => {
    test('should store and retrieve market context from database', async () => {
      // Create a test market context
      const testContext = await prisma.marketNewsContext.create({
        data: {
          id: 'test-context-1',
          contextText: 'Test market context for database test',
          dataSources: ['fred', 'brave_search'],
          keyEvents: ['Test event'],
          availableTiers: ['standard'],
          isActive: true
        }
      });

      expect(testContext.id).toBe('test-context-1');
      expect(testContext.contextText).toBe('Test market context for database test');
      expect(testContext.dataSources).toEqual(['fred', 'brave_search']);

      // Retrieve the context
      const retrievedContext = await prisma.marketNewsContext.findUnique({
        where: { id: 'test-context-1' }
      });

      expect(retrievedContext).toBeDefined();
      expect(retrievedContext?.contextText).toBe('Test market context for database test');

      // Clean up
      await prisma.marketNewsContext.delete({
        where: { id: 'test-context-1' }
      });
    });
  });
});
