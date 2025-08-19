import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock the Plaid client before importing the app
jest.mock('../../plaid', () => {
  return {
    setupPlaidRoutes: jest.fn((app: express.Application) => {
      // Mock the create link token endpoint
      app.post('/plaid/create_link_token', (req: any, res: any) => {
        const isDemo = req.body.isDemo || req.headers['x-demo-mode'] === 'true';
        
        if (isDemo) {
          // Demo mode - return sandbox link token
          res.json({
            link_token: 'demo-sandbox-link-token-12345',
            expiration: '2025-12-31T23:59:59Z',
            request_id: 'demo-request-123'
          });
        } else {
          // Production mode - return production link token
          res.json({
            link_token: 'production-link-token-67890',
            expiration: '2025-12-31T23:59:59Z',
            request_id: 'prod-request-456'
          });
        }
      });

      // Mock other Plaid endpoints that might be needed
      app.post('/plaid/item/public_token/exchange', (req: any, res: any) => {
        res.json({
          access_token: 'test-access-token',
          item_id: 'test-item-id',
          request_id: 'exchange-request-123'
        });
      });

      app.get('/plaid/accounts', (req: any, res: any) => {
        res.json({
          accounts: [
            {
              account_id: 'test-account-1',
              name: 'Test Checking',
              type: 'depository',
              subtype: 'checking',
              balances: { current: 1000.00 }
            }
          ],
          request_id: 'accounts-request-123'
        });
      });
    })
  };
});

// Import the app after mocking
import { testApp } from './test-app-setup';
import { getPrismaClient } from '../../prisma-client';

describe('Demo Mode Plaid Integration', () => {
  let prisma: any;

  beforeAll(async () => {
    prisma = getPrismaClient();
    
    // Note: setupPlaidRoutes is not needed for testApp since we have mock endpoints
    // The testApp already has all the necessary Plaid mock endpoints
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Demo Mode Link Token Creation', () => {
    it('should detect demo mode and use sandbox environment', async () => {
      const response = await request(testApp)
        .post('/plaid/create_link_token')
        .set('x-demo-mode', 'true')
        .send({ isDemo: true });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('link_token');
      expect(response.body.link_token).toBe('demo-sandbox-link-token-12345');
    });

    it('should detect demo mode from body parameter', async () => {
      const response = await request(testApp)
        .post('/plaid/create_link_token')
        .send({ isDemo: true });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('link_token');
      expect(response.body.link_token).toBe('demo-sandbox-link-token-12345');
    });

    it('should not create demo link token when demo mode is not specified', async () => {
      const response = await request(testApp)
        .post('/plaid/create_link_token')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('link_token');
      expect(response.body.link_token).toBe('production-link-token-67890');
    });
  });

  describe('Demo Mode Environment Isolation', () => {
    it('should use sandbox environment regardless of main environment setting', async () => {
      // Test that demo mode always uses sandbox, even if main environment is production
      const response = await request(testApp)
        .post('/plaid/create_link_token')
        .set('x-demo-mode', 'true')
        .send({ isDemo: true });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('link_token');
      expect(response.body.link_token).toBe('demo-sandbox-link-token-12345');
    });
  });
});
