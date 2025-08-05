import { PrismaClient } from '@prisma/client';

// Mock external dependencies for unit tests
jest.mock('../../openai', () => ({
  askOpenAI: jest.fn().mockResolvedValue('Mocked AI response'),
  askOpenAIForTests: jest.fn().mockResolvedValue('Mocked AI response for tests')
}));

jest.mock('../../data/providers/fred', () => ({
  FREDProvider: jest.fn().mockImplementation(() => ({
    getEconomicIndicators: jest.fn().mockResolvedValue({
      cpi: { value: 3.2, date: '2024-01-01', source: 'FRED' },
      fedRate: { value: 4.33, date: '2024-01-01', source: 'FRED' },
      mortgageRate: { value: 6.5, date: '2024-01-01', source: 'FRED' },
      creditCardAPR: { value: 15.5, date: '2024-01-01', source: 'FRED' }
    })
  }))
}));

jest.mock('../../data/providers/alpha-vantage', () => ({
  AlphaVantageProvider: jest.fn().mockImplementation(() => ({
    getMarketData: jest.fn().mockResolvedValue({
      cdRates: { value: 5.25, date: '2024-01-01', source: 'Alpha Vantage' },
      treasuryYields: { value: 4.5, date: '2024-01-01', source: 'Alpha Vantage' },
      stockData: { value: 4500, date: '2024-01-01', source: 'Alpha Vantage' }
    })
  }))
}));

jest.mock('../../plaid', () => ({
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
    })
  })
}));

// Export factories for use in tests
export * from './factories/user.factory';
export * from './factories/account.factory';
export * from './factories/transaction.factory';

// Database setup for unit tests
const prisma = new PrismaClient();

beforeAll(async () => {
  // Only run in test environment
  if (process.env.NODE_ENV !== 'test') {
    return;
  }
  
  // Setup test environment
  process.env.NODE_ENV = 'test';
  
  // Verify database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection verified for unit tests');
  } catch (error) {
    console.warn('⚠️  Database not available for unit tests, using mocks only');
  }
});

afterAll(async () => {
  // Only run in test environment
  if (process.env.NODE_ENV !== 'test') {
    return;
  }
  
  // Cleanup
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Only run cleanup in test environment
  if (process.env.NODE_ENV !== 'test') {
    return;
  }
  
  // Clean up test data in correct order to respect foreign key constraints
  try {
    // Delete in order: child tables first, then parent tables
    await prisma.demoConversation.deleteMany();
    await prisma.demoSession.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.account.deleteMany();
    await prisma.accessToken.deleteMany();
    await prisma.privacySettings.deleteMany();
    await prisma.userProfile.deleteMany(); // Add UserProfile cleanup
    await prisma.syncStatus.deleteMany(); // Add SyncStatus cleanup
    await prisma.user.deleteMany();
  } catch (error) {
    // Ignore cleanup errors in unit tests
    console.log('Test cleanup error (ignored):', error);
  }
});

afterEach(async () => {
  // Reset all mocks
  jest.clearAllMocks();
});

// Export prisma instance for tests
export { prisma };

// Helper function to generate unique test emails
export const generateUniqueEmail = (prefix: string = 'test') => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`;
}; 