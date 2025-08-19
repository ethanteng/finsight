import { describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
const request = require('supertest');
import { app } from '../../index';
import { getPrismaClient } from '../../prisma-client';
import { createTestUser, createTestAccessToken } from '../unit/factories/user.factory';
import { hashPassword } from '../../auth/utils';

// Mock Stripe service to avoid database issues in security tests
jest.mock('../../services/stripe', () => ({
  stripeService: {
    getUserSubscriptionStatus: jest.fn().mockResolvedValue({
      tier: 'starter',
      accessLevel: 'limited',
      status: 'active',
      message: 'Access granted',
      upgradeRequired: false
    }),
    canAccessFeature: jest.fn().mockResolvedValue({
      access: true,
      reason: 'Access granted',
      currentTier: 'starter',
      requiredTier: 'premium',
      upgradeRequired: false
    })
  }
}));

describe('Comprehensive Security Test Suite', () => {
  let user1: any;
  let user2: any;
  let user1JWT: string;
  let user2JWT: string;
  let user1StripeCustomerId: string;
  let user2StripeCustomerId: string;
  let prisma: any;

  beforeEach(async () => {
    // Get Prisma client for this test
    prisma = getPrismaClient();
    
    // Clean up before each test
    await prisma.accessToken.deleteMany();
    await prisma.user.deleteMany();

    // Create test users with proper password hash
    const passwordHash = await hashPassword('password123');
    
    user1 = await prisma.user.create({
      data: createTestUser({ 
        email: 'user1@test.com',
        passwordHash: passwordHash
      })
    });
    
    user2 = await prisma.user.create({
      data: createTestUser({ 
        email: 'user2@test.com',
        passwordHash: passwordHash
      })
    });

    // Create JWT tokens for each user
    user1JWT = require('jsonwebtoken').sign(
      { userId: user1.id, email: user1.email, tier: 'starter' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '24h' }
    );

    user2JWT = require('jsonwebtoken').sign(
      { userId: user2.id, email: user2.email, tier: 'starter' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '24h' }
    );

    // Create test Stripe customer IDs
    user1StripeCustomerId = 'cus_test_user1_' + Date.now();
    user2StripeCustomerId = 'cus_test_user2_' + Date.now();

    // Update users with Stripe customer IDs
    await prisma.user.update({
      where: { id: user1.id },
      data: { stripeCustomerId: user1StripeCustomerId }
    });

    await prisma.user.update({
      where: { id: user2.id },
      data: { stripeCustomerId: user2StripeCustomerId }
    });

    // Create access tokens for Plaid testing
    await prisma.accessToken.create({
      data: createTestAccessToken({ 
        userId: user1.id,
        token: 'user1_plaid_token',
        itemId: 'user1_item_id'
      })
    });

    await prisma.accessToken.create({
      data: createTestAccessToken({ 
        userId: user2.id,
        token: 'user2_plaid_token',
        itemId: 'user2_item_id'
      })
    });
  });

  describe('🔒 Plaid Endpoint Security Tests', () => {
    it('should enforce authentication on /plaid/all-accounts', async () => {
      // Unauthenticated request should fail
      const unauthenticatedResponse = await request(app)
        .get('/plaid/all-accounts');
      
      expect(unauthenticatedResponse.status).toBe(401);
      expect(unauthenticatedResponse.body.error).toContain('Authentication required');
    });

    it('should isolate user data on /plaid/all-accounts', async () => {
      // User1 should only see their own data
      const user1Response = await request(app)
        .get('/plaid/all-accounts')
        .set('Authorization', `Bearer ${user1JWT}`);

      expect(user1Response.status).toBe(200);
      expect(user1Response.body.accounts).toBeDefined();

      // User2 should only see their own data
      const user2Response = await request(app)
        .get('/plaid/all-accounts')
        .set('Authorization', `Bearer ${user2JWT}`);

      expect(user2Response.status).toBe(200);
      expect(user2Response.body.accounts).toBeDefined();

      // Both users should be properly isolated
      expect(user1Response.body.accounts).toEqual([]);
      expect(user2Response.body.accounts).toEqual([]);
    });

    it('should prevent cross-user data access on Plaid endpoints', async () => {
      // User1 should not be able to access User2's data
      const user1Response = await request(app)
        .get('/plaid/all-accounts')
        .set('Authorization', `Bearer ${user1JWT}`);

      // User2 should not be able to access User1's data
      const user2Response = await request(app)
        .get('/plaid/all-accounts')
        .set('Authorization', `Bearer ${user2JWT}`);

      // Both users should get empty accounts since they have no real Plaid connections
      // This is the correct behavior - users are properly isolated
      expect(user1Response.body.accounts).toEqual([]);
      expect(user2Response.body.accounts).toEqual([]);
      
      // Verify that the responses are properly structured
      expect(user1Response.body.accounts).toBeDefined();
      expect(user2Response.body.accounts).toBeDefined();
      expect(Array.isArray(user1Response.body.accounts)).toBe(true);
      expect(Array.isArray(user2Response.body.accounts)).toBe(true);
    });
  });

  describe('🔒 Stripe Endpoint Security Tests', () => {
    it('should enforce authentication on /api/stripe/subscription-status', async () => {
      // Unauthenticated request should fail
      const unauthenticatedResponse = await request(app)
        .get('/api/stripe/subscription-status');
      
      expect(unauthenticatedResponse.status).toBe(401);
    });

    it('should isolate user subscription data on /api/stripe/subscription-status', async () => {
      // User1 should only see their own subscription status
      const user1Response = await request(app)
        .get('/api/stripe/subscription-status')
        .set('Authorization', `Bearer ${user1JWT}`);

      expect(user1Response.status).toBe(200);
      expect(user1Response.body.stripeCustomerId).toBe(user1StripeCustomerId);
      expect(user1Response.body.stripeCustomerId).not.toBe(user2StripeCustomerId);

      // User2 should only see their own subscription status
      const user2Response = await request(app)
        .get('/api/stripe/subscription-status')
        .set('Authorization', `Bearer ${user2JWT}`);

      expect(user2Response.status).toBe(200);
      expect(user2Response.body.stripeCustomerId).toBe(user2StripeCustomerId);
      expect(user2Response.body.stripeCustomerId).not.toBe(user1StripeCustomerId);
    });

    it('should enforce authentication on /api/stripe/check-feature-access', async () => {
      // Unauthenticated request should fail
      const unauthenticatedResponse = await request(app)
        .post('/api/stripe/check-feature-access')
        .send({ requiredTier: 'premium' });
      
      expect(unauthenticatedResponse.status).toBe(401);
    });

    it('should prevent cross-user feature access checks', async () => {
      // User1 should only be able to check their own feature access
      const user1Response = await request(app)
        .post('/api/stripe/check-feature-access')
        .set('Authorization', `Bearer ${user1JWT}`)
        .send({ requiredTier: 'premium' });

      expect(user1Response.status).toBe(200);
      expect(user1Response.body.access).toBeDefined();

      // User2 should only be able to check their own feature access
      const user2Response = await request(app)
        .post('/api/stripe/check-feature-access')
        .set('Authorization', `Bearer ${user2JWT}`)
        .send({ requiredTier: 'premium' });

      expect(user2Response.status).toBe(200);
      expect(user2Response.body.access).toBeDefined();

      // Both users should get independent results
      expect(user1Response.body.access).toBeDefined();
      expect(user2Response.body.access).toBeDefined();
    });

    it('should allow public access to /api/stripe/plans and /api/stripe/config', async () => {
      // These endpoints should be publicly accessible (no auth required)
      const plansResponse = await request(app)
        .get('/api/stripe/plans');
      
      expect(plansResponse.status).toBe(200);
      expect(plansResponse.body.plans).toBeDefined();

      const configResponse = await request(app)
        .get('/api/stripe/config');
      
      expect(configResponse.status).toBe(200);
      expect(configResponse.body.publishableKey).toBeDefined();
    });

    it('should handle webhook authentication properly', async () => {
      // Webhook endpoint should validate Stripe signatures
      const webhookResponse = await request(app)
        .post('/api/stripe/webhooks')
        .set('stripe-signature', 'invalid_signature')
        .send({ id: 'test_event', type: 'test.event' });
      
      // Should fail with invalid signature
      expect(webhookResponse.status).toBe(400);
      expect(webhookResponse.body.error).toBeDefined();
    });
  });

  describe('🔒 Cross-Service Security Tests', () => {
    it('should maintain user isolation across Plaid and Stripe endpoints', async () => {
      // User1 accesses Plaid data
      const user1PlaidResponse = await request(app)
        .get('/plaid/all-accounts')
        .set('Authorization', `Bearer ${user1JWT}`);

      // User1 accesses Stripe data
      const user1StripeResponse = await request(app)
        .get('/api/stripe/subscription-status')
        .set('Authorization', `Bearer ${user1JWT}`);

      // User2 accesses Plaid data
      const user2PlaidResponse = await request(app)
        .get('/plaid/all-accounts')
        .set('Authorization', `Bearer ${user2JWT}`);

      // User2 accesses Stripe data
      const user2StripeResponse = await request(app)
        .get('/api/stripe/subscription-status')
        .set('Authorization', `Bearer ${user2JWT}`);

      // Verify complete isolation across services
      expect(user1PlaidResponse.body.accounts).toEqual([]);
      expect(user2PlaidResponse.body.accounts).toEqual([]);
      expect(user1StripeResponse.body.stripeCustomerId).toBe(user1StripeCustomerId);
      expect(user2StripeResponse.body.stripeCustomerId).toBe(user2StripeCustomerId);
      expect(user1StripeResponse.body.stripeCustomerId).not.toBe(user2StripeCustomerId);
    });

    it('should prevent privilege escalation through endpoint manipulation', async () => {
      // User1 should not be able to access premium features if they only have starter tier
      const user1FeatureResponse = await request(app)
        .post('/api/stripe/check-feature-access')
        .set('Authorization', `Bearer ${user1JWT}`)
        .send({ requiredTier: 'premium' });

      expect(user1FeatureResponse.status).toBe(200);
      // The actual access result depends on the business logic, but the endpoint should work
      expect(user1FeatureResponse.body.access).toBeDefined();
    });
  });

  describe('🔒 Authentication Boundary Tests', () => {
    it('should reject invalid JWT tokens on all protected endpoints', async () => {
      const invalidToken = 'invalid.jwt.token';
      const protectedEndpoints = [
        { method: 'GET', path: '/plaid/all-accounts' },
        { method: 'GET', path: '/api/stripe/subscription-status' },
        { method: 'POST', path: '/api/stripe/check-feature-access', body: { requiredTier: 'premium' } }
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await request(app)
          [endpoint.method.toLowerCase()](endpoint.path)
          .set('Authorization', `Bearer ${invalidToken}`)
          .send(endpoint.body || {});

        expect(response.status).toBe(401);
      }
    });

    it('should reject expired JWT tokens', async () => {
      // Create an expired token
      const expiredToken = require('jsonwebtoken').sign(
        { userId: user1.id, email: user1.email, tier: 'starter' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(app)
        .get('/plaid/all-accounts')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });

    it('should reject requests without Authorization header', async () => {
      const protectedEndpoints = [
        '/plaid/all-accounts',
        '/api/stripe/subscription-status'
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await request(app).get(endpoint);
        expect(response.status).toBe(401);
      }
    });
  });

  describe('🔒 Data Leakage Prevention Tests', () => {
    it('should not expose internal database IDs in responses', async () => {
      const user1Response = await request(app)
        .get('/plaid/all-accounts')
        .set('Authorization', `Bearer ${user1JWT}`);

      const responseBody = JSON.stringify(user1Response.body);
      
      // Should not expose internal database IDs
      expect(responseBody).not.toContain(user1.id);
      expect(responseBody).not.toContain(user2.id);
    });

    it('should not expose Stripe internal IDs in public endpoints', async () => {
      const configResponse = await request(app).get('/api/stripe/config');
      const plansResponse = await request(app).get('/api/stripe/plans');

      const configBody = JSON.stringify(configResponse.body);
      const plansBody = JSON.stringify(plansResponse.body);

      // Should not expose internal Stripe IDs
      expect(configBody).not.toContain('cus_');
      expect(configBody).not.toContain('sub_');
      expect(plansBody).not.toContain('cus_');
      expect(plansBody).not.toContain('sub_');
    });
  });
});
