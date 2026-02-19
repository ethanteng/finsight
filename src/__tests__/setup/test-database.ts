import { PrismaClient } from '@prisma/client';

let testPrisma: PrismaClient;

beforeAll(async () => {
  // Check if we're in CI/CD environment
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  
  // Connect to test database
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
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
  } catch (error) {
    // Fall back to mock database when connection fails (local CI simulation or DB unavailable)
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
    await testPrisma.demoConversation.deleteMany();
    await testPrisma.demoSession.deleteMany();
    await testPrisma.encrypted_profile_data.deleteMany();
    await testPrisma.transaction.deleteMany();
    await testPrisma.account.deleteMany();
    await testPrisma.accessToken.deleteMany();
    await testPrisma.conversation.deleteMany();
    await testPrisma.syncStatus.deleteMany();
    await testPrisma.userProfile.deleteMany();
    await testPrisma.user.deleteMany();
    
    console.log('🧹 Test data cleaned up');
  } catch (error: any) {
    // Log errors but don't fail the test setup
    console.warn('⚠️ Warning during test cleanup:', error.message);
  }
});

// Export for use in tests
export { testPrisma };
