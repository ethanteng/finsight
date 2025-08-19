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
    // console.log('✅ All required API keys available for integration tests');
  }

  // ✅ Note: Database connection is handled by test-database-ci.ts
  // console.log('✅ Integration test setup complete - database handled by test-database-ci.ts');
});

// Note: Database cleanup is handled by test-database-ci.ts
// No need for afterAll, beforeEach, or afterEach here

// Integration test utilities
export const waitForDatabase = async (timeout = 5000) => {
  // This function now relies on the testPrisma instance from test-database-ci.ts
  // For now, we'll just return a placeholder or throw an error if testPrisma is not available
  // A more robust solution would involve passing testPrisma to this function
  console.warn('waitForDatabase is deprecated and relies on testPrisma. This function needs to be refactored.');
  return;
};

export const createTestSession = async (sessionId = 'test-session-id') => {
  // This function now relies on the testPrisma instance from test-database-ci.ts
  // For now, we'll just return a placeholder or throw an error if testPrisma is not available
  // A more robust solution would involve passing testPrisma to this function
  console.warn('createTestSession is deprecated and relies on testPrisma. This function needs to be refactored.');
  return;
};

export const createTestConversation = async (sessionId: string, question: string, answer: string) => {
  // This function now relies on the testPrisma instance from test-database-ci.ts
  // For now, we'll just return a placeholder or throw an error if testPrisma is not available
  // A more robust solution would involve passing testPrisma to this function
  console.warn('createTestConversation is deprecated and relies on testPrisma. This function needs to be refactored.');
  return;
};

// Export prisma instance for tests
export { PrismaClient }; 