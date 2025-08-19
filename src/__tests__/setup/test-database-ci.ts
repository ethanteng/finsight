import { PrismaClient } from '@prisma/client';

let testPrisma: PrismaClient;

beforeAll(async () => {
  // Connect to CI/CD test database
  // In CI/CD, we use the PostgreSQL service container
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL environment variable is required for CI/CD tests');
  }
  
  testPrisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl }
    }
  });
  
  // Verify connection
  try {
    await testPrisma.$connect();
    console.log('✅ Connected to CI/CD test database:', databaseUrl);
  } catch (error) {
    console.error('❌ Failed to connect to CI/CD test database:', error);
    throw error;
  }
});

afterAll(async () => {
  if (testPrisma) {
    await testPrisma.$disconnect();
    console.log('✅ Disconnected from CI/CD test database');
  }
});

beforeEach(async () => {
  // Clean test data before each test
  // Order matters: delete child tables before parent tables
  try {
    // Clean up tables in proper order to avoid foreign key constraints
    // Use try-catch for each table in case some don't exist yet
    const tables = [
      'demoConversation',
      'demoSession', 
      'encrypted_profile_data',
      'transaction',
      'account',
      'accessToken',
      'conversation',
      'syncStatus',
      'userProfile',
      'user',
      'encryptedEmailVerificationCode',
      'encryptedUserData',
      'marketNewsHistory',
      'marketNewsContext'
    ];
    
    for (const table of tables) {
      try {
        await (testPrisma as any)[table].deleteMany();
      } catch (error: any) {
        // Table might not exist yet, which is fine
        if (error.message.includes('relation') && error.message.includes('does not exist')) {
          console.log(`ℹ️ Table ${table} not ready for cleanup yet`);
        } else {
          console.warn(`⚠️ Warning cleaning up table ${table}:`, error.message);
        }
      }
    }
    
    console.log('🧹 CI/CD test data cleaned up');
  } catch (error: any) {
    // Log errors but don't fail the test setup
    console.warn('⚠️ Warning during CI/CD test cleanup:', error.message);
  }
});

// Export for use in tests
export { testPrisma };
