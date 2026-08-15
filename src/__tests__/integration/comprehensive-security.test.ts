import { describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
const request = require('supertest');
import { createTestUser, createTestAccessToken } from '../unit/factories/user.factory';
import { testPrisma } from '../setup/test-database-ci';
import { hashPassword } from '../../auth/utils';
import { testApp } from './test-app-setup';

// Use the test app instance that doesn't depend on external modules
const app = testApp;

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

// Mock the entire Stripe service module to ensure it's used by routes
jest.mock('../../config/stripe', () => ({
  stripe: {
    client: {
      checkout: {
        sessions: {
          retrieve: jest.fn().mockResolvedValue({
            payment_status: 'paid',
            customer_details: { email: 'test@example.com' }
          })
        }
      }
    }
  },
  constructWebhookEvent: jest.fn().mockReturnValue({ type: 'test' }),
  getPublishableKey: jest.fn().mockReturnValue('pk_test_mock_key'),
  getStripePriceId: jest.fn().mockImplementation((tier: string) => {
    const mockPriceIds = {
      starter: 'price_starter_test',
      standard: 'price_standard_test',
      premium: 'price_premium_test'
    };
    return mockPriceIds[tier as keyof typeof mockPriceIds] || 'price_default_test';
  }),
  isStripeConfigured: jest.fn().mockReturnValue(true)
}));

// Mock the Prisma client used by routes to return test users
jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn().mockReturnValue({
    user: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.email === 'user1@test.com') {
          return Promise.resolve({
            id: 'test-user-1',
            email: 'user1@test.com',
            tier: 'starter',
            stripeCustomerId: 'cus_test_user1'
          });
        }
        if (where.email === 'user2@test.com') {
          return Promise.resolve({
            id: 'test-user-2',
            email: 'user2@test.com',
            tier: 'starter',
            stripeCustomerId: 'cus_test_user2'
          });
        }
        return Promise.resolve(null);
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where.stripeCustomerId && where.stripeCustomerId.includes('user1')) {
          return Promise.resolve({
            id: 'test-user-1',
            email: 'user1@test.com',
            tier: 'starter',
            stripeCustomerId: where.stripeCustomerId
          });
        }
        if (where.stripeCustomerId && where.stripeCustomerId.includes('user2')) {
          return Promise.resolve({
            id: 'test-user-2',
            email: 'user2@test.com',
            tier: 'starter',
            stripeCustomerId: where.stripeCustomerId
          });
        }
        return Promise.resolve(null);
      })
    }
  })
}));

describe('Comprehensive Security Test Suite', () => {
  // Check if we're actually in GitHub Actions (not just CI=true set locally)
  // Even if CI=true is set locally, we're still on macOS which has permission issues
  const isActuallyInGitHubActions = process.env.GITHUB_ACTIONS === 'true' &&
                                     process.env.GITHUB_RUN_ID !== undefined;
  const isCiEnv = isActuallyInGitHubActions;

  /**
   * Skip network tests locally - these require special permissions on macOS
   *
   * Issue: macOS requires special permissions to bind to 0.0.0.0, which supertest
   * tries to do when creating a test server. This causes EPERM errors locally.
   *
   * Solution: Skip these tests locally (not in CI/CD) since they will run properly
   * in CI/CD environments where permissions are configured correctly.
   *
   * This is a local vs production mismatch, not a real code issue.
   */
  const shouldSkipNetworkTests = !isActuallyInGitHubActions;

  // Network-gated tests are registered through this alias so they report as
  // SKIPPED rather than PASSED when they cannot run. The previous pattern was an
  // `if (skipIfLocal()) return;` guard inside the body, which exited before any
  // assertion — so a test that never ran still counted as a passing test.
  const itNetwork = shouldSkipNetworkTests ? it.skip : it;


  let user1: any;
  let user2: any;
  let user1JWT: string;
  let user2JWT: string;
  let user1StripeCustomerId: string;
  let user2StripeCustomerId: string;

  beforeAll(async () => {
    // testPrisma is managed by the centralized test database setup
  });

  beforeEach(async () => {
    // Clean up before each test in proper order
    await testPrisma.encrypted_profile_data.deleteMany();
    await testPrisma.transaction.deleteMany();
    await testPrisma.account.deleteMany();
    await testPrisma.accessToken.deleteMany();
    await testPrisma.conversation.deleteMany();
    await testPrisma.syncStatus.deleteMany();
    await testPrisma.userProfile.deleteMany();
    await testPrisma.user.deleteMany();

    // Create test users with proper password hash
    const passwordHash = await hashPassword('password123');

    user1 = await testPrisma.user.create({
      data: createTestUser({
        email: `user1_${Date.now()}@test.com`, // Make email unique
        passwordHash: passwordHash
      })
    });

    user2 = await testPrisma.user.create({
      data: createTestUser({
        email: `user2_${Date.now()}@test.com`, // Make email unique
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
    await testPrisma.user.update({
      where: { id: user1.id },
      data: { stripeCustomerId: user1StripeCustomerId }
    });

    await testPrisma.user.update({
      where: { id: user2.id },
      data: { stripeCustomerId: user2StripeCustomerId }
    });

    // Create access tokens for Plaid testing
    await testPrisma.accessToken.create({
      data: createTestAccessToken({
        userId: user1.id,
        token: `user1_plaid_token_${Date.now()}`, // Make token unique
        itemId: `user1_item_id_${Date.now()}` // Make itemId unique
      })
    });

    await testPrisma.accessToken.create({
      data: createTestAccessToken({
        userId: user2.id,
        token: `user2_plaid_token_${Date.now()}`, // Make token unique
        itemId: `user2_item_id_${Date.now()}` // Make itemId unique
      })
    });
  });

  afterEach(async () => {
    // Clean up after each test in proper order
    await testPrisma.encrypted_profile_data.deleteMany();
    await testPrisma.transaction.deleteMany();
    await testPrisma.account.deleteMany();
    await testPrisma.accessToken.deleteMany();
    await testPrisma.conversation.deleteMany();
    await testPrisma.syncStatus.deleteMany();
    await testPrisma.userProfile.deleteMany();
    await testPrisma.user.deleteMany();
  });

  afterAll(async () => {
    // testPrisma is managed by the centralized test database setup
  });

  describe('🔒 Plaid Endpoint Security Tests', () => {
    itNetwork('should enforce authentication on /plaid/all-accounts', async () => {
      // Unauthenticated request should fail
      const unauthenticatedResponse = await request(app)
        .get('/plaid/all-accounts');

      expect(unauthenticatedResponse.status).toBe(401);
      expect(unauthenticatedResponse.body.error).toContain('No token provided');
    });

    itNetwork('should isolate user data on /plaid/all-accounts', async () => {
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

    itNetwork('should prevent cross-user data access on Plaid endpoints', async () => {
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
    itNetwork('should enforce authentication on /api/stripe/subscription-status', async () => {
      // Unauthenticated request should fail
      const unauthenticatedResponse = await request(app)
        .get('/api/stripe/subscription-status');

      expect(unauthenticatedResponse.status).toBe(401);
    });

    itNetwork('should enforce authentication on /api/stripe/check-feature-access', async () => {
      // Unauthenticated request should fail
      const unauthenticatedResponse = await request(app)
        .post('/api/stripe/check-feature-access')
        .send({ requiredTier: 'premium' });

      expect(unauthenticatedResponse.status).toBe(401);
    });

    itNetwork('should isolate user subscription data on /api/stripe/subscription-status', async () => {
      // User1 should only see their own subscription data
      const user1Response = await request(app)
        .get('/api/stripe/subscription-status')
        .set('Authorization', `Bearer ${user1JWT}`);

      expect(user1Response.status).toBe(200);
      expect(user1Response.body.tier).toBeDefined();
      expect(user1Response.body.status).toBeDefined();

      // User2 should only see their own subscription data
      const user2Response = await request(app)
        .get('/api/stripe/subscription-status')
        .set('Authorization', `Bearer ${user2JWT}`);

      expect(user2Response.status).toBe(200);
      expect(user2Response.body.tier).toBeDefined();
      expect(user2Response.body.status).toBeDefined();

      // Both users should get their own data (mocked as 'starter' tier)
      expect(user1Response.body.tier).toBe('starter');
      expect(user2Response.body.tier).toBe('starter');
      expect(user1Response.body.status).toBe('active');
      expect(user2Response.body.status).toBe('active');
    });

    itNetwork('should prevent cross-user feature access checks', async () => {
      // User1 should only check their own feature access
      const user1Response = await request(app)
        .post('/api/stripe/check-feature-access')
        .set('Authorization', `Bearer ${user1JWT}`)
        .send({ requiredTier: 'premium' });

      expect(user1Response.status).toBe(200);
      expect(user1Response.body.access).toBeDefined();
      expect(user1Response.body.currentTier).toBeDefined();

      // User2 should only check their own feature access
      const user2Response = await request(app)
        .post('/api/stripe/check-feature-access')
        .set('Authorization', `Bearer ${user2JWT}`)
        .send({ requiredTier: 'premium' });

      expect(user2Response.status).toBe(200);
      expect(user2Response.body.access).toBeDefined();
      expect(user2Response.body.currentTier).toBeDefined();

      // Both users should get their own access data (mocked as 'starter' tier)
      expect(user1Response.body.currentTier).toBe('starter');
      expect(user2Response.body.currentTier).toBe('starter');
      expect(user1Response.body.access).toBe(true); // Mocked to allow access
      expect(user2Response.body.access).toBe(true); // Mocked to allow access
    });

    itNetwork('should allow public access to /api/stripe/plans and /api/stripe/config', async () => {
      // Public endpoints should not require authentication
      const plansResponse = await request(app)
        .get('/api/stripe/plans');

      expect(plansResponse.status).toBe(200);
      expect(plansResponse.body).toBeDefined();

      const configResponse = await request(app)
        .get('/api/stripe/config');

      expect(configResponse.status).toBe(200);
      expect(configResponse.body).toBeDefined();

      // These endpoints should be accessible without authentication
      expect(plansResponse.body).not.toHaveProperty('error');
      expect(configResponse.body).not.toHaveProperty('error');
    });

    itNetwork('should handle webhook authentication properly', async () => {
      // Webhook endpoints should validate Stripe signatures
      const webhookPayload = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_123',
            customer: 'cus_test_user1'
          }
        }
      };

      // Request without proper Stripe signature should fail
      const invalidWebhookResponse = await request(app)
        .post('/api/stripe/webhook')
        .send(webhookPayload);

      // The endpoint answers 200 so Stripe does not retry, and reports the
      // verification outcome in the body. What matters for security is that an
      // unsigned payload is never treated as authentic — so assert that, not the
      // status code. The previous assertion accepted any of 200/400/401 and would
      // have passed even if the webhook had been processed as genuine.
      expect(invalidWebhookResponse.status).toBe(200);
      expect(invalidWebhookResponse.body).toHaveProperty('authenticated', false);

      // A forged signature must be rejected the same way. (This is not the
      // success path: a genuine signature requires an HMAC over the raw body with
      // the endpoint secret, which this suite does not have. So what is under test
      // here is specifically that a bogus signature does not authenticate.)
      const forgedSignatureResponse = await request(app)
        .post('/api/stripe/webhook')
        .set('stripe-signature', 'test-signature')
        .send(webhookPayload);

      expect(forgedSignatureResponse.status).toBe(200);
      expect(forgedSignatureResponse.body).toHaveProperty('authenticated', false);
    });
  });

  describe('🔒 Cross-Service Security Tests', () => {
    itNetwork('should maintain user isolation across Plaid and Stripe endpoints', async () => {
      // User1 should only access their own data across both services
      const user1PlaidResponse = await request(app)
        .get('/plaid/all-accounts')
        .set('Authorization', `Bearer ${user1JWT}`);

      const user1StripeResponse = await request(app)
        .get('/api/stripe/subscription-status')
        .set('Authorization', `Bearer ${user1JWT}`);

      expect(user1PlaidResponse.status).toBe(200);
      expect(user1StripeResponse.status).toBe(200);

      // User2 should only access their own data across both services
      const user2PlaidResponse = await request(app)
        .get('/plaid/all-accounts')
        .set('Authorization', `Bearer ${user2JWT}`);

      const user2StripeResponse = await request(app)
        .get('/api/stripe/subscription-status')
        .set('Authorization', `Bearer ${user2JWT}`);

      expect(user2PlaidResponse.status).toBe(200);
      expect(user2StripeResponse.status).toBe(200);

      // Both users should get isolated data across services
      expect(user1PlaidResponse.body.accounts).toEqual([]);
      expect(user2PlaidResponse.body.accounts).toEqual([]);
      expect(user1StripeResponse.body.tier).toBe('starter');
      expect(user2StripeResponse.body.tier).toBe('starter');
    });

    itNetwork('should prevent privilege escalation through endpoint manipulation', async () => {
      // User1 should not be able to access User2's data by manipulating requests
      const user1Response = await request(app)
        .get('/plaid/all-accounts')
        .set('Authorization', `Bearer ${user1JWT}`)
        .set('X-User-ID', user2.id); // Attempt to access User2's data

      expect(user1Response.status).toBe(200);
      // Should still only see User1's data (empty accounts)
      expect(user1Response.body.accounts).toEqual([]);

      // User2 should not be able to access User1's data by manipulating requests
      const user2Response = await request(app)
        .get('/api/stripe/subscription-status')
        .set('Authorization', `Bearer ${user2JWT}`)
        .set('X-User-ID', user1.id); // Attempt to access User1's data

      expect(user2Response.status).toBe(200);
      // Should still only see User2's data
      expect(user2Response.body.tier).toBe('starter');
    });
  });

  describe('🔒 Authentication Boundary Tests', () => {
    itNetwork('should reject invalid JWT tokens on all protected endpoints', async () => {
      const invalidToken = 'invalid.jwt.token';
      const protectedEndpoints = [
        { method: 'GET', path: '/plaid/all-accounts' },
        { method: 'GET', path: '/api/stripe/subscription-status' },
        { method: 'POST', path: '/api/stripe/check-feature-access', body: { requiredTier: 'premium' } }
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await (request(app) as any)[endpoint.method.toLowerCase()](endpoint.path)
           .set('Authorization', `Bearer ${invalidToken}`)
           .send(endpoint.body || {});

        expect(response.status).toBe(401);
      }
    });

    itNetwork('should reject expired JWT tokens', async () => {
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

    itNetwork('should reject requests without Authorization header', async () => {
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
    itNetwork('should not expose internal database IDs in responses', async () => {
      const user1Response = await request(app)
        .get('/plaid/all-accounts')
        .set('Authorization', `Bearer ${user1JWT}`);

      const responseBody = JSON.stringify(user1Response.body);

      // Should not expose internal database IDs
      expect(responseBody).not.toContain(user1.id);
      expect(responseBody).not.toContain(user2.id);
    });

    itNetwork('should not expose Stripe internal IDs in public endpoints', async () => {
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
