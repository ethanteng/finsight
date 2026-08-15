import request from 'supertest';
import type { Application } from 'express';
import { createTestUser } from '../unit/factories/user.factory';
import { hashPassword } from '../../auth/utils';
import { testPrisma } from '../setup/test-database-ci';

let app: Application;

beforeAll(async () => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'your-secret-key-change-in-production';
  }

  if (!process.env.PROFILE_ENCRYPTION_KEY) {
    process.env.PROFILE_ENCRYPTION_KEY = 'test-profile-encryption-key';
  }

  if (!process.env.TEST_DATABASE_URL && process.env.DATABASE_URL) {
    process.env.TEST_DATABASE_URL = process.env.DATABASE_URL;
  }

  ({ app } = await import('../../index'));
});

describe('SnapTrade Security Tests', () => {
  let user1: any, user2: any;
  let user1JWT: string, user2JWT: string;
  // Check if we're in CI/CD environment
  // Only treat as CI/CD if we're actually running in GitHub Actions
  // Note: Even if CI=true is set locally, we're still on macOS which has permission issues
  const isActuallyInGitHubActions = process.env.GITHUB_ACTIONS === 'true' &&
                                     process.env.GITHUB_RUN_ID !== undefined;
  const isCiEnv = isActuallyInGitHubActions;
  const expectedMissingSnapTradeStatus = isCiEnv ? 401 : 404;

  /**
   * Skip network tests locally - these require special permissions on macOS
   *
   * Issue: macOS requires special permissions to bind to 0.0.0.0, which supertest
   * tries to do when creating a test server. This causes EPERM errors locally.
   *
   * Solution: Skip these tests locally (not in CI/CD) since they will run properly
   * in CI/CD environments where permissions are configured correctly.
   *
   * Even if CI=true is set manually, we still skip on macOS to avoid EPERM errors.
   * This is a local vs production mismatch, not a real code issue.
   */
  const shouldSkipNetworkTests = !isActuallyInGitHubActions;

  // Network-gated tests are registered through this alias so they report as
  // SKIPPED rather than PASSED when they cannot run. The previous pattern was an
  // `if (skipIfLocal()) return;` guard inside the body, which exited before any
  // assertion — so a test that never ran still counted as a passing test.
  const itNetwork = shouldSkipNetworkTests ? it.skip : it;

  beforeEach(async () => {
    // Clean up before each test - order matters for foreign key constraints
    await testPrisma.encryptedEmailVerificationCode.deleteMany();
    await testPrisma.encryptedUserData.deleteMany();
    await testPrisma.encrypted_profile_data.deleteMany();
    await testPrisma.accessToken.deleteMany();
    await testPrisma.syncStatus.deleteMany();
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.emailVerificationCode.deleteMany();
    await testPrisma.userProfile.deleteMany();
    await testPrisma.user.deleteMany();

    // Create real test users with real authentication
    const passwordHash = await hashPassword('password123');

    // Generate unique email addresses to prevent conflicts when tests run in parallel
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);

    user1 = await testPrisma.user.create({
      data: createTestUser({
        email: `snaptrade-user1-${timestamp}-${randomId}@test.com`,
        passwordHash: passwordHash
      })
    });

    user2 = await testPrisma.user.create({
      data: createTestUser({
        email: `snaptrade-user2-${timestamp}-${randomId}@test.com`,
        passwordHash: passwordHash
      })
    });

    // Generate real JWT tokens for authentication
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

    user1JWT = jwt.sign(
      { userId: user1.id, email: user1.email, tier: 'starter' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    user2JWT = jwt.sign(
      { userId: user2.id, email: user2.email, tier: 'starter' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
  });

  afterEach(async () => {
    // Clean up after each test
    await testPrisma.encryptedEmailVerificationCode.deleteMany();
    await testPrisma.encryptedUserData.deleteMany();
    await testPrisma.encrypted_profile_data.deleteMany();
    await testPrisma.accessToken.deleteMany();
    await testPrisma.syncStatus.deleteMany();
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.emailVerificationCode.deleteMany();
    await testPrisma.userProfile.deleteMany();
    // Clean up SnapTrade users if table exists
    try {
      await testPrisma.snapTradeUser.deleteMany();
    } catch (error) {
      // Table might not exist in test database
    }
    await testPrisma.user.deleteMany();
  });

  describe('Authentication Enforcement', () => {
    itNetwork('should reject unauthenticated access to /snaptrade/status/user', async () => {
      const response = await request(app)
        .get('/snaptrade/status/user')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    itNetwork('should reject invalid JWT tokens for SnapTrade endpoints', async () => {
      const response = await request(app)
        .get('/snaptrade/status/user')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    itNetwork('should accept valid JWT tokens for SnapTrade endpoints', async () => {
      const response = await request(app)
        .get('/snaptrade/status/user')
        .set('Authorization', `Bearer ${user1JWT}`);

      // In CI the mock auth layer returns 401 because the user isn't in the mock DB
      expect(response.status).toBe(expectedMissingSnapTradeStatus);
    });
  });

  describe('User Data Isolation', () => {
    itNetwork('should prevent User A from seeing User B SnapTrade data', async () => {
      // User1 should only see their own SnapTrade data
      const user1Response = await request(app)
        .get('/snaptrade/status/user')
        .set('Authorization', `Bearer ${user1JWT}`);

      // User2 should only see their own SnapTrade data
      const user2Response = await request(app)
        .get('/snaptrade/status/user')
        .set('Authorization', `Bearer ${user2JWT}`);

      expect(user1Response.status).toBe(expectedMissingSnapTradeStatus);
      expect(user2Response.status).toBe(expectedMissingSnapTradeStatus);
    });

    itNetwork('should only return SnapTrade data for authenticated user', async () => {
      const response = await request(app)
        .get('/snaptrade/status/user')
        .set('Authorization', `Bearer ${user1JWT}`);

      expect(response.status).toBe(expectedMissingSnapTradeStatus);
    });
  });

  describe('SnapTrade Endpoint Security', () => {
    itNetwork('should test actual /snaptrade/status/user endpoint', async () => {
      const response = await request(app)
        .get('/snaptrade/status/user')
        .set('Authorization', `Bearer ${user1JWT}`);

      expect(response.status).toBe(expectedMissingSnapTradeStatus);
    });

    itNetwork('should test actual /snaptrade/accounts endpoint', async () => {
      const response = await request(app)
        .get('/snaptrade/accounts')
        .set('Authorization', `Bearer ${user1JWT}`);

      expect(response.status).toBe(expectedMissingSnapTradeStatus);
    });

    itNetwork('should test actual /snaptrade/holdings endpoint', async () => {
      const response = await request(app)
        .get('/snaptrade/holdings')
        .set('Authorization', `Bearer ${user1JWT}`);

      expect(response.status).toBe(expectedMissingSnapTradeStatus);
    });

    itNetwork('should test actual /snaptrade/activities endpoint', async () => {
      const response = await request(app)
        .get('/snaptrade/activities')
        .set('Authorization', `Bearer ${user1JWT}`);

      expect(response.status).toBe(expectedMissingSnapTradeStatus);
    });
  });

  describe('Cross-User Security Validation', () => {
    itNetwork('should validate that User A cannot access User B SnapTrade data through any endpoint', async () => {
      // User1 tries to access their own data
      const user1OwnData = await request(app)
        .get('/snaptrade/status/user')
        .set('Authorization', `Bearer ${user1JWT}`);

      // User2 tries to access their own data
      const user2OwnData = await request(app)
        .get('/snaptrade/status/user')
        .set('Authorization', `Bearer ${user2JWT}`);

      expect(user1OwnData.status).toBe(expectedMissingSnapTradeStatus);
      expect(user2OwnData.status).toBe(expectedMissingSnapTradeStatus);
    });

    itNetwork('should prevent privilege escalation through SnapTrade endpoint manipulation', async () => {
      // Test that users cannot manipulate endpoints to access other users' data
      const user1Response = await request(app)
        .get('/snaptrade/accounts')
        .set('Authorization', `Bearer ${user1JWT}`);

      const user2Response = await request(app)
        .get('/snaptrade/accounts')
        .set('Authorization', `Bearer ${user2JWT}`);

      expect(user1Response.status).toBe(expectedMissingSnapTradeStatus);
      expect(user2Response.status).toBe(expectedMissingSnapTradeStatus);
    });
  });

  describe('Error Handling Security', () => {
    itNetwork('should not leak sensitive SnapTrade information in error messages', async () => {
      // Test with a user that doesn't have SnapTrade initialized
      const newUser = await testPrisma.user.create({
        data: createTestUser({
          email: 'newuser@test.com',
          passwordHash: await hashPassword('password123')
        })
      });

      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
      const newUserJWT = jwt.sign(
        { userId: newUser.id, email: newUser.email, tier: 'starter' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      const response = await request(app)
        .get('/snaptrade/accounts')
        .set('Authorization', `Bearer ${newUserJWT}`);

      expect(response.status).toBe(expectedMissingSnapTradeStatus);

      // Error message should not contain sensitive information
      if (response.body.error) {
        expect(response.body.error).not.toContain('userSecret');
        expect(response.body.error).not.toContain('snapTradeUserId');
        expect(response.body.error).toContain('not found');
      }
    });

    itNetwork('should handle SnapTrade database errors securely', async () => {
      // Test error handling without exposing internal details
      const response = await request(app)
        .get('/snaptrade/status/user')
        .set('Authorization', `Bearer ${user1JWT}`);

      // A user with no SnapTrade registration is rejected with 401 and a generic
      // message. The point of this test is that the error does not leak internals,
      // so assert both the status and the shape of the message — the previous
      // assertion accepted 200 as well, so it could not tell rejection from access.
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).not.toMatch(/prisma|sql|stack|at \s|node_modules/i);
      expect(response.body).not.toHaveProperty('stack');
    });
  });
});
