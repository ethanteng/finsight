import { PrismaClient } from '@prisma/client';

let testPrisma: PrismaClient;

beforeAll(async () => {
  // Connect to test database
  testPrisma = new PrismaClient({
    datasources: {
      db: { url: process.env.TEST_DATABASE_URL }
    }
  });
  
  // Verify connection
  try {
    await testPrisma.$connect();
    console.log('✅ Connected to test database:', process.env.TEST_DATABASE_URL);
  } catch (error) {
    console.error('❌ Failed to connect to test database:', error);
    throw error;
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
