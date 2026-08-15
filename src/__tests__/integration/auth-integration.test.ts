import request from 'supertest';
import { PrismaClient } from '@prisma/client';

// Lazy import app to avoid EPERM errors on macOS when tests are skipped
let app: any;
const getApp = async () => {
  if (!app) {
    const indexModule = await import('../../index');
    app = indexModule.app;
  }
  return app;
};

// Mock external dependencies used by the application entry point.
jest.mock('../../openai/analysis-pipeline', () => {
  const mockResponse = 'Mocked AI response';
  return {
    runAskLincAnalysis: jest.fn().mockResolvedValue({
      displayText: mockResponse,
      structuredResponse: { summary: mockResponse },
      showTheMathData: undefined,
    }),
  };
});

jest.mock('../../data/orchestrator', () => ({
  dataOrchestrator: {
    getMarketContext: jest.fn().mockResolvedValue({}),
  },
}));

const prisma = new PrismaClient();

describe('Authentication Integration', () => {
  // Check if we're actually in GitHub Actions (not just CI=true set locally)
  // Even if CI=true is set locally, we're still on macOS which has permission issues
  const isActuallyInGitHubActions = process.env.GITHUB_ACTIONS === 'true' &&
                                     process.env.GITHUB_RUN_ID !== undefined;

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


  const testUser = {
    email: 'test@example.com',
    password: 'TestPassword123',
    tier: 'starter'
  };

  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Skip database operations if we're skipping network tests locally
    if (shouldSkipNetworkTests) {
      return;
    }

    // Clean up any existing test user and related records
    try {
      await prisma.privacySettings.deleteMany({
        where: { user: { email: testUser.email } }
      });
      await prisma.conversation.deleteMany({
        where: { user: { email: testUser.email } }
      });
      await prisma.user.deleteMany({
        where: { email: testUser.email }
      });
    } catch (error) {
      // Ignore database errors if we're using mock database
      console.warn('⚠️ Database cleanup warning:', error);
    }
  });

  afterAll(async () => {
    // Skip database operations if we're skipping network tests locally
    if (shouldSkipNetworkTests) {
      return;
    }

    // Clean up test user and related records
    try {
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
    } catch (error) {
      // Ignore database errors if we're using mock database
      console.warn('⚠️ Database cleanup warning:', error);
    }
  });

  describe('User Registration', () => {
    itNetwork('should register a new user successfully', async () => {
      const testApp = await getApp();
      const response = await request(testApp)
        .post('/auth/register')
        .send(testUser);

      expect(response.status).toBe(201);
      expect(response.body.message).toContain('User registered successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.tier).toBe(testUser.tier);

      // Store token and user ID for later tests
      authToken = response.body.token;
      userId = response.body.user.id;
    });

    itNetwork('should reject duplicate email registration', async () => {
      const testApp = await getApp();
      const response = await request(testApp)
        .post('/auth/register')
        .send(testUser);

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error', 'User with this email already exists');
    });

    itNetwork('should reject invalid email format', async () => {
      const testApp = await getApp();
      const response = await request(testApp)
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          password: 'TestPassword123'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid email format');
    });

    itNetwork('should reject weak password', async () => {
      const testApp = await getApp();
      const response = await request(testApp)
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
    itNetwork('should login with correct credentials', async () => {
      // First ensure the user exists by registering
      const registerResponse = await request(app)
        .post('/auth/register')
        .send(testUser);

      // If user already exists, that's fine
      if (registerResponse.status !== 201 && registerResponse.status !== 409) {
        throw new Error(`Registration failed: ${registerResponse.status}`);
      }

      // Now try to login
      const testApp = await getApp();
      const response = await request(testApp)
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

    itNetwork('should reject incorrect password', async () => {
      const testApp = await getApp();
      const response = await request(testApp)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid email or password');
    });

    itNetwork('should reject non-existent email', async () => {
      const testApp = await getApp();
      const response = await request(testApp)
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
    itNetwork('should access protected endpoint with valid token', async () => {
      // First ensure we have a valid token by registering and logging in
      const registerResponse = await request(app)
        .post('/auth/register')
        .send(testUser);

      let token = authToken;
      if (registerResponse.status === 201) {
        token = registerResponse.body.token;
      } else if (registerResponse.status === 409) {
        // User exists, try to login to get token
        const loginResponse = await request(app)
          .post('/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password
          });

        if (loginResponse.status === 200) {
          token = loginResponse.body.token;
        }
      }

      const testApp = await getApp();
      const response = await request(testApp)
        .post('/ask/display-real')
        .set('Authorization', `Bearer ${token}`)
        .send({
          question: 'What is my account balance?'
        });

      // The AI pipeline is mocked in this config, so the request should succeed
      // outright. Asserting 200 also proves we got past authentication, which is
      // what this test is really about — a 500 would have satisfied the old
      // assertion just as well and told us nothing.
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('answer');
    });

    itNetwork('should reject access without token', async () => {
      const testApp = await getApp();
      const response = await request(testApp)
        .post('/ask/display-real')
        .send({
          question: 'What is my account balance?'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'No token provided');
    });

    itNetwork('should reject access with invalid token', async () => {
      const testApp = await getApp();
      const response = await request(testApp)
        .post('/ask/display-real')
        .set('Authorization', 'Bearer invalid.token.here')
        .send({
          question: 'What is my account balance?'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid or expired token');
    });
  });

  describe('User Profile', () => {
    itNetwork('should get user profile with valid token', async () => {
      // First ensure we have a valid token by registering and logging in
      const registerResponse = await request(app)
        .post('/auth/register')
        .send(testUser);

      let token = authToken;
      if (registerResponse.status === 201) {
        token = registerResponse.body.token;
      } else if (registerResponse.status === 409) {
        // User exists, try to login to get token
        const loginResponse = await request(app)
          .post('/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password
          });

        if (loginResponse.status === 200) {
          token = loginResponse.body.token;
        }
      }

      const testApp = await getApp();
      const response = await request(testApp)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.tier).toBe(testUser.tier);
    });

    itNetwork('should update user profile', async () => {
      // First ensure we have a valid token by registering and logging in
      const registerResponse = await request(app)
        .post('/auth/register')
        .send(testUser);

      let token = authToken;
      if (registerResponse.status === 201) {
        token = registerResponse.body.token;
      } else if (registerResponse.status === 409) {
        // User exists, try to login to get token
        const loginResponse = await request(app)
          .post('/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password
          });

        if (loginResponse.status === 200) {
          token = loginResponse.body.token;
        }
      }

      const testApp = await getApp();
      const response = await request(testApp)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tier: 'standard'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Profile updated successfully');
      expect(response.body.user.tier).toBe('standard');
    });
  });

});
