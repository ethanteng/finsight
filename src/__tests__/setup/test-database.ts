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
    // Only clean tables that exist to avoid errors
    const tablesToClean = [
      'transaction',
      'account', 
      'accessToken',
      'conversation',
      'syncStatus',
      'userProfile',
      'user'
    ];
    
    for (const table of tablesToClean) {
      try {
        await (testPrisma as any)[table].deleteMany();
      } catch (error: any) {
        // Ignore errors for tables that don't exist
        if (error.code !== 'P2021') {
          console.warn(`⚠️ Warning cleaning ${table}:`, error.message);
        }
      }
    }
    
    console.log('🧹 Test data cleaned up');
  } catch (error) {
    console.error('⚠️ Error cleaning test data:', error);
    // Don't throw - some tables might not exist yet
  }
});

// Export for use in tests
export { testPrisma };
