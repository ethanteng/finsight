import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(async () => {
  // ✅ Setup test environment
  process.env.NODE_ENV = 'test';
  
  // ✅ Force test API keys for integration tests to avoid hitting live APIs
  process.env.FRED_API_KEY = 'test_fred_key';
  process.env.ALPHA_VANTAGE_API_KEY = 'test_alpha_vantage_key';
  
  // ✅ Verify API keys are available for integration tests
  const requiredKeys = [
    'OPENAI_API_KEY',
    'FRED_API_KEY', 
    'ALPHA_VANTAGE_API_KEY'
  ];
  
  const missingKeys = requiredKeys.filter(key => !process.env[key]);
  
  if (missingKeys.length > 0) {
    console.error(`❌ Missing API keys for integration tests: ${missingKeys.join(', ')}`);
    console.error('Integration tests require API keys to be set (even test keys)');
    throw new Error(`Missing required API keys for integration tests: ${missingKeys.join(', ')}`);
  } else {
    console.log('✅ All required API keys available for integration tests');
  }

  // ✅ Verify database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection verified for integration tests');
  } catch (error) {
    console.error('❌ Database connection failed for integration tests:', error);
    throw new Error('Database connection required for integration tests');
  }
});

afterAll(async () => {
  // ✅ Cleanup
  await prisma.$disconnect();
});

beforeEach(async () => {
  // ✅ Reset test data
  try {
    // Delete in correct order to avoid foreign key constraints
    await prisma.demoConversation.deleteMany();
    await prisma.demoSession.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.account.deleteMany();
    await prisma.accessToken.deleteMany();
    await prisma.syncStatus.deleteMany();
    await prisma.privacySettings?.deleteMany();
    await prisma.user.deleteMany();
    console.log('✅ Test data cleaned up');
  } catch (error) {
    console.warn('⚠️  Test data cleanup failed:', error);
  }
});

afterEach(async () => {
  // ✅ Clean up after each test to prevent session conflicts
  try {
    // Small delay to ensure all database operations complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Delete in correct order to avoid foreign key constraints
    await prisma.demoConversation.deleteMany();
    await prisma.demoSession.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.account.deleteMany();
    await prisma.accessToken.deleteMany();
    await prisma.syncStatus.deleteMany();
    await prisma.privacySettings?.deleteMany();
    await prisma.user.deleteMany();
    
    // ✅ Verify cleanup
    const sessionCount = await prisma.demoSession.count();
    const conversationCount = await prisma.demoConversation.count();
    
    if (sessionCount > 0 || conversationCount > 0) {
      console.warn(`⚠️  Test data not fully cleaned up: ${sessionCount} sessions, ${conversationCount} conversations`);
    }
  } catch (error) {
    console.warn('⚠️  Test cleanup failed:', error);
  }
});

// Integration test utilities
export const waitForDatabase = async (timeout = 5000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error('Database not ready within timeout');
};

export const createTestSession = async (sessionId = 'test-session-id') => {
  return await prisma.demoSession.create({
    data: {
      sessionId,
      userAgent: 'test-agent'
    }
  });
};

export const createTestConversation = async (sessionId: string, question: string, answer: string) => {
  const session = await prisma.demoSession.findUnique({
    where: { sessionId }
  });
  
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  
  return await prisma.demoConversation.create({
    data: {
      question,
      answer,
      sessionId: session.id
    }
  });
}; 