import { PrismaClient } from '@prisma/client';

let testPrisma: PrismaClient;

beforeAll(async () => {
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

  // Connect to test database
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    if (isCI) {
      throw new Error(
        'No TEST_DATABASE_URL/DATABASE_URL in CI. These suites must run against the ' +
        'real database; falling back to a mock would report false confidence.'
      );
    }
    console.log('⚠️ No database URL found - using mock database');
    const { createEnhancedMockDatabase } = await import('./enhanced-mock-database');
    testPrisma = createEnhancedMockDatabase();
    console.log('✅ Using mock database for local development');
    return;
  }

  testPrisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl }
    }
  });

  // Verify connection with fallback when database unavailable
  try {
    await testPrisma.$connect();
    console.log('✅ Connected to test database:', databaseUrl);
  } catch (error: any) {
    // Never silently degrade to a mock in CI — an unreachable database must fail the
    // run, not turn it green against fabricated data. Mirrors the guard in
    // test-database-ci.ts, which is where these suites actually get testPrisma from.
    if (isCI) {
      throw new Error(`Could not reach the test database: ${error?.message ?? error}`);
    }
    console.log('⚠️ Database connection failed - using mock database');
    const { createEnhancedMockDatabase } = await import('./enhanced-mock-database');
    testPrisma = createEnhancedMockDatabase();
    console.log('✅ Using mock database for security tests');
  }
});

afterAll(async () => {
  if (testPrisma) {
    await testPrisma.$disconnect();
    console.log('✅ Disconnected from test database');
  }
});

beforeEach(async () => {
  // Clean test data before each test
  // Order matters: delete child tables before parent tables
  try {
    // Clean up tables in proper order to avoid foreign key constraints
    await testPrisma.encrypted_profile_data.deleteMany();
    await testPrisma.transaction.deleteMany();
    await testPrisma.account.deleteMany();
    await testPrisma.accessToken.deleteMany();
    await testPrisma.conversation.deleteMany();
    await testPrisma.syncStatus.deleteMany();
    await testPrisma.userProfile.deleteMany();
    await testPrisma.privacySettings.deleteMany();
    await testPrisma.user.deleteMany();
    await testPrisma.encryptedEmailVerificationCode.deleteMany();
    await testPrisma.encryptedUserData.deleteMany();
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.emailVerificationCode.deleteMany();
    await testPrisma.marketNewsHistory.deleteMany();
    await testPrisma.marketNewsContext.deleteMany();
    await testPrisma.snapTradeUser.deleteMany();

    console.log('🧹 Test data cleaned up');
  } catch (error: any) {
    // Log errors but don't fail the test setup
    console.warn('⚠️ Warning during test cleanup:', error.message);
  }
});

// Export for use in tests
export { testPrisma };
