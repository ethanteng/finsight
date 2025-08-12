import { PrismaClient } from '@prisma/client';

// Mock external dependencies for integration tests to prevent real API calls
jest.mock('../../openai', () => ({
  askOpenAI: jest.fn().mockResolvedValue('Mocked AI response for integration tests'),
  askOpenAIWithEnhancedContext: jest.fn().mockResolvedValue('Mocked enhanced AI response for integration tests'),
  askOpenAIForTests: jest.fn().mockResolvedValue('Mocked AI response for integration tests'),
  openai: {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Mocked OpenAI response' } }]
        })
      }
    }
  }
}));

jest.mock('../../plaid', () => ({
  setupPlaidRoutes: jest.fn(),
  getPlaidClient: jest.fn().mockReturnValue({
    accountsGet: jest.fn().mockResolvedValue({
      data: {
        accounts: [
          {
            account_id: 'test-account-1',
            name: 'Test Checking',
            type: 'depository',
            subtype: 'checking',
            balances: { current: 1000.00 }
          }
        ]
      }
    }),
    transactionsGet: jest.fn().mockResolvedValue({
      data: {
        transactions: [
          {
            transaction_id: 'test-transaction-1',
            account_id: 'test-account-1',
            amount: 100.00,
            name: 'Test Transaction',
            date: '2024-01-01'
          }
        ]
      }
    }),
    linkTokenCreate: jest.fn().mockResolvedValue({
      data: { link_token: 'test-link-token' }
    }),
    itemPublicTokenExchange: jest.fn().mockResolvedValue({
      data: { access_token: 'test-access-token' }
    })
  })
}));

jest.mock('../../market-news/synthesizer', () => ({
  MarketNewsSynthesizer: jest.fn().mockImplementation(() => ({
    synthesizeNews: jest.fn().mockResolvedValue('Mocked market news synthesis'),
    generateEmailContent: jest.fn().mockResolvedValue('Mocked email content')
  }))
}));

const prisma = new PrismaClient();

beforeAll(async () => {
  // ✅ Setup test environment
  process.env.NODE_ENV = 'test';
  
  // ✅ Force test API keys for integration tests to avoid hitting live APIs
  process.env.FRED_API_KEY = 'test_fred_key';
  process.env.ALPHA_VANTAGE_API_KEY = 'test_alpha_vantage_key';
  process.env.SEARCH_API_KEY = 'test_search_key';
  
  // ✅ Verify API keys are available for integration tests
  const requiredKeys = [
    'OPENAI_API_KEY',
    'FRED_API_KEY', 
    'ALPHA_VANTAGE_API_KEY',
    'SEARCH_API_KEY'
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
  // Only run cleanup in test environment
  if (process.env.NODE_ENV !== 'test') {
    return;
  }
  
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
  // Only run cleanup in test environment
  if (process.env.NODE_ENV !== 'test') {
    return;
  }
  
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

// Export prisma instance for tests
export { prisma }; 