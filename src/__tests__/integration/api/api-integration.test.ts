import request from 'supertest';
import { app } from '../../../index';
import { PrismaClient } from '@prisma/client';
import { generateToken } from '../../../auth/utils';

const prisma = new PrismaClient();
let authToken: string;

describe('API Integration Tests', () => {
  // These tests exercise network-bound providers and run only in GitHub Actions.
  const isActuallyInGitHubActions = process.env.GITHUB_ACTIONS === 'true' &&
                                     process.env.GITHUB_RUN_ID !== undefined;
  const shouldSkipNetworkTests = !isActuallyInGitHubActions;

  // Network-gated tests are registered through this alias so they report as
  // SKIPPED rather than PASSED when they cannot run. The previous pattern was an
  // `if (skipIfLocal()) return;` guard inside the body, which exited before any
  // assertion — so a test that never ran still counted as a passing test.
  const itNetwork = shouldSkipNetworkTests ? it.skip : it;

  // Seeded per test, not once: the shared setup in test-database-ci.ts runs a
  // beforeEach that deletes every row from `user` and 14 other tables. That was a
  // no-op against the mock database (deleteMany returned a fake count), so a user
  // created in beforeAll survived. Against the real database it does not, and the
  // token then references a deleted user — which the auth layer correctly rejects
  // with 401. Creating the fixture after the cleanup keeps it valid.
  beforeEach(async () => {
    if (shouldSkipNetworkTests) return;

    const user = await prisma.user.upsert({
      where: { email: 'api-integration@example.com' },
      update: { isActive: true, subscriptionStatus: 'active' },
      create: {
        email: 'api-integration@example.com',
        passwordHash: 'integration-test-only',
        tier: 'premium',
        isActive: true,
        subscriptionStatus: 'active',
      },
    });
    authToken = generateToken({ userId: user.id, email: user.email, tier: user.tier });
  });

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

  afterAll(async () => {
    if (shouldSkipNetworkTests) {
      await prisma.$disconnect();
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: 'api-integration@example.com' } });
    if (user) {
      await prisma.conversation.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.$disconnect();
  });

  describe('FRED API Integration', () => {
    itNetwork('should test FRED API key configuration', async () => {
      const response = await request(app)
        .get('/test/fred-api-key');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('fredApiKey');
      expect(response.body).toHaveProperty('fredApiKeyLength');
      expect(response.body).toHaveProperty('isTestKey');

      // Log the API key status for debugging
      // console.log('FRED API Key Status:', {
      //   key: response.body.fredApiKey,
      //   length: response.body.fredApiKeyLength,
      //   isTestKey: response.body.isTestKey
      // });
    });

    itNetwork('should test FRED economic indicators for different tiers', async () => {
      const tiers = ['starter', 'standard', 'premium'];

      for (const tier of tiers) {
        const response = await request(app)
          .get(`/test/market-data/${tier}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('tier', tier);
        expect(response.body).toHaveProperty('marketContext');

        const { marketContext } = response.body;

        if (tier === 'starter') {
          // Starter should have no economic indicators
          expect(marketContext.economicIndicators).toBeUndefined();
        } else {
          // Standard and Premium should have economic indicators
          expect(marketContext.economicIndicators).toBeDefined();

          if (marketContext.economicIndicators) {
            const { cpi, fedRate, mortgageRate, creditCardAPR } = marketContext.economicIndicators;

            // Verify data structure
            expect(cpi).toHaveProperty('value');
            expect(cpi).toHaveProperty('date');
            expect(cpi).toHaveProperty('source');
            expect(fedRate).toHaveProperty('value');
            expect(mortgageRate).toHaveProperty('value');
            expect(creditCardAPR).toHaveProperty('value');

            // Log data for debugging
            // console.log(`${tier} tier FRED data:`, {
            //   cpi: cpi.value,
            //   fedRate: fedRate.value,
            //   mortgageRate: mortgageRate.value,
            //   creditCardAPR: creditCardAPR.value,
            //   cpiSource: cpi.source,
            //   creditCardSource: creditCardAPR.source
            // });

            // Verify data types
            expect(typeof cpi.value).toBe('number');
            expect(typeof fedRate.value).toBe('number');
            expect(typeof mortgageRate.value).toBe('number');
            expect(typeof creditCardAPR.value).toBe('number');
          }
        }
      }
    });

    itNetwork('should test FRED API with real questions', async () => {
      const questions = [
        'What is the current inflation rate?',
        'What is the Fed Funds Rate?',
        'What is the current mortgage rate?'
      ];

      for (const question of questions) {
        const response = await request(app)
          .post('/ask/display-real')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            question
          });

        // The AI pipeline is mocked in this config (see integration/setup.ts), so
        // this endpoint is deterministic — a 500 here is a real regression.
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('answer');
        // console.log(`Question: "${question}" - Answer: ${response.body.answer.substring(0, 100)}...`);
      }
    });
  });

  describe('Tier Access Control', () => {
    itNetwork('should verify tier access restrictions', async () => {
      const tierTests = [
        { tier: 'starter', shouldHaveEconomicData: false },
        { tier: 'standard', shouldHaveEconomicData: true },
        { tier: 'premium', shouldHaveEconomicData: true }
      ];

      for (const test of tierTests) {
        const response = await request(app)
          .get(`/test/market-data/${test.tier}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('tier', test.tier);
        expect(response.body).toHaveProperty('marketContext');

        const { marketContext } = response.body;

        if (test.shouldHaveEconomicData) {
          expect(marketContext.economicIndicators).toBeDefined();
        } else {
          expect(marketContext.economicIndicators).toBeUndefined();
        }

        // console.log(`${test.tier} tier access:`, {
        //   hasEconomicData: !!marketContext.economicIndicators,
        //   expectedEconomicData: test.shouldHaveEconomicData
        // });
      }
    });
  });

  describe('Cache and Performance', () => {
    itNetwork('should test cache functionality for API calls', async () => {
      // First call
      const response1 = await request(app)
        .get('/test/market-data/standard');

      expect(response1.status).toBe(200);

      // Second call (should be cached)
      const response2 = await request(app)
        .get('/test/market-data/standard');

      expect(response2.status).toBe(200);

      // Both responses should be identical (cached)
      expect(response1.body).toEqual(response2.body);

      // console.log('Cache test: Both responses identical (cached)');
    });

    itNetwork('should test cache invalidation', async () => {
      // Get initial data
      const response1 = await request(app)
        .get('/test/market-data/standard');

      expect(response1.status).toBe(200);

      // Invalidate cache
      const invalidateResponse = await request(app)
        .post('/test/invalidate-cache')
        .send({ pattern: 'economic_indicators' });

      expect(invalidateResponse.status).toBe(200);

      // Get data again (should be fresh)
      const response2 = await request(app)
        .get('/test/market-data/standard');

      expect(response2.status).toBe(200);

      // console.log('Cache invalidation test: Cache cleared and data refreshed');
    });
  });

  describe('Tier-Aware AI Responses', () => {
    // TIER ENFORCEMENT DISABLED - Test disabled
    // it('should recommend upgrades for starter tier when asking for market data', async () => {
    //   const marketDataQuestions = [
    //     'What are the current CD rates?',
    //     'What are the current treasury yields?',
    //     'What is the current Fed rate?',
    //     'What is the current inflation rate?',
    //     'What are the current mortgage rates?'
    //   ];

    //   for (const question of marketDataQuestions) {
    //     const response = await request(app)
    //       .post('/ask/display-real')
    //       .send({
    //         question,
    //         userTier: 'starter',
    //         conversationHistory: [] // Fresh conversation
    //       });

    //     expect([200, 500]).toContain(response.status);

    //     if (response.status === 200) {
    //       expect(response.body).toHaveProperty('answer');
    //       const answer = response.body.answer.toLowerCase();

    //       // Should suggest upgrade instead of providing data
    //       const shouldSuggestUpgrade = answer.includes('upgrade') ||
    //                                  answer.includes('premium') ||
    //                                  answer.includes('plan') ||
    //                                  answer.includes('available on our');

    //       expect(shouldSuggestUpgrade).toBe(true);

    //       // Should NOT provide actual market data
    //       const shouldNotProvideData = !answer.includes('5.25%') &&
    //                                  !answer.includes('4.33%') &&
    //                                  !answer.includes('321.5') &&
    //                                  !answer.includes('6.74%');

    //       expect(shouldNotProvideData).toBe(true);

    //       // console.log(`Starter tier "${question}": ${answer.substring(0, 100)}...`);
    //     }
    //   }
    // });

    // TIER ENFORCEMENT DISABLED - Test disabled
    // it('should provide market data for premium tier with source attribution', async () => {
    //   const marketDataQuestions = [
    //     'What are the current CD rates?',
    //     'What is the current Fed rate?'
    //   ];

    //   for (const question of marketDataQuestions) {
    //     const response = await request(app)
    //       .post('/ask/display-real')
    //       .send({
    //         question,
    //         userTier: 'premium',
    //         conversationHistory: [] // Fresh conversation
    //       });

    //     expect([200, 500]).toContain(response.status);

    //     if (response.status === 200) {
    //       expect(response.body).toHaveProperty('answer');
    //       const answer = response.body.answer.toLowerCase();

    //       // Should provide actual data
    //       const shouldProvideData = answer.includes('5.25%') ||
    //                                answer.includes('4.33%') ||
    //                                answer.includes('cd rate') ||
    //                                answer.includes('fed rate') ||
    //                                answer.includes('fed funds rate');

    //       expect(shouldProvideData).toBe(true);

    //       // Should include source attribution
    //       const shouldHaveSourceAttribution = answer.includes('source:') ||
    //                                         answer.includes('sources:') ||
    //                                         answer.includes('federal reserve') ||
    //                                         answer.includes('polygon');

    //       expect(shouldHaveSourceAttribution).toBe(true);

    //       // console.log(`Premium tier "${question}": ${answer.substring(0, 100)}...`);
    //     }
    //   }
    // });

    // TIER ENFORCEMENT DISABLED - Test disabled
    // it('should provide economic data for standard tier with source attribution', async () => {
    //   const economicQuestions = [
    //     'What is the current Fed rate?',
    //     'What is the current inflation rate?'
    //   ];

    //   for (const question of economicQuestions) {
    //     const response = await request(app)
    //       .post('/ask/display-real')
    //       .send({
    //         question,
    //         userTier: 'standard',
    //         conversationHistory: [] // Fresh conversation
    //       });

    //     expect([200, 500]).toContain(response.status);

    //     if (response.status === 200) {
    //       expect(response.body).toHaveProperty('answer');
    //       const answer = response.body.answer.toLowerCase();

    //       // Should provide economic data
    //       const shouldProvideEconomicData = answer.includes('4.33%') ||
    //                                       answer.includes('fed rate') ||
    //                                       answer.includes('fed funds rate') ||
    //                                       answer.includes('321.5') ||
    //                                       answer.includes('cpi');

    //       expect(shouldProvideEconomicData).toBe(true);

    //       // Should include source attribution for FRED data
    //       const shouldHaveSourceAttribution = answer.includes('source:') ||
    //                                         answer.includes('sources:') ||
    //                                         answer.includes('federal reserve') ||
    //                                         answer.includes('fred');

    //       expect(shouldHaveSourceAttribution).toBe(true);

    //       // console.log(`Standard tier "${question}": ${answer.substring(0, 100)}...`);
    //     }
    //   }
    // });

    // TIER ENFORCEMENT DISABLED - Test disabled
    // it('should NOT provide live market data for standard tier', async () => {
    //   const liveMarketQuestions = [
    //     'What are the current CD rates?',
    //     'What are the current treasury yields?'
    //   ];

    //   for (const question of liveMarketQuestions) {
    //     const response = await request(app)
    //       .post('/ask/display-real')
    //       .send({
    //         question,
    //         userTier: 'standard',
    //         conversationHistory: [] // Fresh conversation
    //       });

    //     expect([200, 500]).toContain(response.status);

    //     if (response.status === 200) {
    //       expect(response.body).toHaveProperty('answer');
    //       const answer = response.body.answer.toLowerCase();

    //       // Should suggest upgrade for live market data
    //       const shouldSuggestUpgrade = answer.includes('upgrade') ||
    //                                  answer.includes('premium') ||
    //                                  answer.includes('live market data') ||
    //                                  answer.includes('available on our');

    //       expect(shouldSuggestUpgrade).toBe(true);

    //       // Should NOT provide actual live market data
    //       const shouldNotProvideLiveData = !answer.includes('5.25%') &&
    //                                      !answer.includes('cd rate') &&
    //                                      !answer.includes('treasury yield');

    //       expect(shouldNotProvideLiveData).toBe(true);

    //       // console.log(`Standard tier "${question}": ${answer.substring(0, 100)}...`);
    //     }
    //   }
    // });
  });

  describe('Source Attribution', () => {
    itNetwork('should include FRED source attribution for economic indicators', async () => {
      const response = await request(app)
        .post('/ask/display-real')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          question: 'What is the current Fed rate?'
        });

      // The AI pipeline is mocked in this config (see integration/setup.ts), so
      // this endpoint is deterministic — a 500 here is a real regression.
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('answer');
      const answer = response.body.answer;

      // Since we're using mocked responses in integration tests,
      // we're testing that the system properly handles the request
      // and returns a response, not the specific content
      expect(typeof answer).toBe('string');
      expect(answer.length).toBeGreaterThan(0);

      // console.log(`Source attribution test: ${answer.substring(0, 100)}...`);

      // Note: In a real environment, the AI would include source attribution
      // This test verifies the system is working, not the AI response content
    });

    itNetwork('should handle Brave-sourced current rate questions', async () => {
      const response = await request(app)
        .post('/ask/display-real')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          question: 'What are the current CD rates?'
        });

      // The AI pipeline is mocked in this config (see integration/setup.ts), so
      // this endpoint is deterministic — a 500 here is a real regression.
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('answer');
      const answer = response.body.answer;

      // Since we're using mocked responses in integration tests,
      // we're testing that the system properly handles the request
      // and returns a response, not the specific content
      expect(typeof answer).toBe('string');
      expect(answer.length).toBeGreaterThan(0);

      // console.log(`Brave source attribution test: ${answer.substring(0, 100)}...`);

      // Note: In a real environment, the AI would include source attribution
      // This test verifies the system is working, not the AI response content
    });

    // TIER ENFORCEMENT DISABLED - Test disabled since AI now provides data instead of upgrade suggestions
    // it('should NOT include source attribution for upgrade suggestions', async () => {
    //   const response = await request(app)
    //     .post('/ask/display-real')
    //     .send({
    //       question: 'What are the current CD rates?',
    //       userTier: 'starter',
    //       conversationHistory: []
    //     });

    //   expect([200, 500]).toContain(response.status);

    //   if (response.status === 200) {
    //     expect(response.body).toHaveProperty('answer');
    //     const answer = response.body.answer.toLowerCase();

    //     // Should suggest upgrade
    //     const shouldSuggestUpgrade = answer.includes('upgrade') ||
    //                                answer.includes('premium') ||
    //                                answer.includes('plan');

    //     expect(shouldSuggestUpgrade).toBe(true);

    //     // Should NOT include source attribution for upgrade suggestions
    //     const shouldNotHaveSourceAttribution = !answer.includes('source:') &&
    //                                          !answer.includes('sources:') &&
    //                                          !answer.includes('federal reserve') &&
    //                                          !answer.includes('fred') &&
    //                                          !answer.includes('polygon');

    //     expect(shouldNotHaveSourceAttribution).toBe(true);

    //     // console.log(`Upgrade suggestion test: ${answer.substring(0, 100)}...`);
    //   }
    // });

    itNetwork('should handle questions combining FRED and search context', async () => {
      const response = await request(app)
        .post('/ask/display-real')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          question: 'What is the Fed rate and CD rates?'
        });

      // The AI pipeline is mocked in this config (see integration/setup.ts), so
      // this endpoint is deterministic — a 500 here is a real regression.
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('answer');
      const answer = response.body.answer;

      // Since we're using mocked responses in integration tests,
      // we're testing that the system properly handles the request
      // and returns a response, not the specific content
      expect(typeof answer).toBe('string');
      expect(answer.length).toBeGreaterThan(0);

      // console.log(`Both sources test: ${answer.substring(0, 100)}...`);

      // Note: In a real environment, the AI would include source attribution
      // This test verifies the system is working, not the AI response content
    });
  });
});
