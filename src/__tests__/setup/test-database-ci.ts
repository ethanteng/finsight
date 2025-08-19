import { PrismaClient } from '@prisma/client';

let testPrisma: PrismaClient;

beforeAll(async () => {
  // Connect to CI/CD test database
  // In CI/CD, we use the PostgreSQL service container
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  
  console.log('🔧 Test Database Setup - Environment Variables:');
  console.log('  TEST_DATABASE_URL:', process.env.TEST_DATABASE_URL ? '✅ Set' : '❌ Not set');
  console.log('  DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Not set');
  console.log('  NODE_ENV:', process.env.NODE_ENV);
  console.log('  CI:', process.env.CI);
  console.log('  GITHUB_ACTIONS:', process.env.GITHUB_ACTIONS);
  
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL environment variable is required for CI/CD tests');
  }
  
  console.log('🔧 Attempting to connect to database:', databaseUrl);
  
  testPrisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl }
    }
  });
  
  // Verify connection with retry logic
  let connected = false;
  let attempts = 0;
  const maxAttempts = 5;
  
  while (!connected && attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`🔧 Database connection attempt ${attempts}/${maxAttempts}`);
      
      await testPrisma.$connect();
      console.log('✅ Connected to CI/CD test database:', databaseUrl);
      
      // Test a simple query to verify the connection works
      const result = await testPrisma.$queryRaw`SELECT 1 as test`;
      console.log('✅ Database query test successful:', result);
      
      connected = true;
    } catch (error: any) {
      console.error(`❌ Database connection attempt ${attempts} failed:`, error.message);
      
      if (attempts < maxAttempts) {
        console.log(`⏳ Waiting 2 seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.error('❌ Failed to connect to CI/CD test database after all attempts');
        throw error;
      }
    }
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
