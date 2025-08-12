import { PrismaClient } from '@prisma/client';

// Mock fetch globally to prevent any real HTTP requests
global.fetch = jest.fn().mockImplementation(() => 
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    status: 200
  })
);

// Mock external dependencies for unit tests
jest.mock('../../openai', () => ({
  askOpenAI: jest.fn().mockResolvedValue('Mocked AI response'),
  askOpenAIForTests: jest.fn().mockResolvedValue('Mocked AI response for tests'),
  analyzeConversationContext: jest.fn().mockImplementation((conversationHistory: any[], currentQuestion: string) => {
    // Debug logging to see what's being received
    console.log('🔍 Mock analyzeConversationContext called with:');
    console.log('📚 History:', conversationHistory.map((conv: any) => conv.question));
    console.log('❓ Current question:', currentQuestion);
    
    // Mock implementation that returns context opportunities based on test data
    if (conversationHistory.length === 0) {
      console.log('❌ No history, returning false');
      return { hasContextOpportunities: false, instruction: '' };
    }
    
    // Check for portfolio context - look for various ways to ask about portfolio
    const hasPortfolioContext = conversationHistory.some((conv: any) => {
      const question = conv.question.toLowerCase();
      const result = question.includes('portfolio') || 
             question.includes('investment') ||
             question.includes('analyze my portfolio') ||
             question.includes('analyze my investment');
      console.log(`🔍 Portfolio context check for "${question}": ${result}`);
      return result;
    });
    
    // Check for planning context
    const hasPlanningContext = conversationHistory.some((conv: any) => {
      const question = conv.question.toLowerCase();
      const result = question.includes('plan') || 
             question.includes('retirement') ||
             question.includes('financial plan');
      console.log(`🔍 Planning context check for "${question}": ${result}`);
      return result;
    });
    
    // Check for debt context
    const hasDebtContext = conversationHistory.some((conv: any) => {
      const question = conv.question.toLowerCase();
      const result = question.includes('debt') || 
             question.includes('credit') ||
             question.includes('debt analysis') ||
             question.includes('debt situation');
      console.log(`🔍 Debt context check for "${question}": ${result}`);
      return result;
    });
    
    // Check for budget context
    const hasBudgetContext = conversationHistory.some((conv: any) => {
      const question = conv.question.toLowerCase();
      const result = question.includes('budget') || 
             question.includes('spending') ||
             question.includes('help me budget') ||
             question.includes('budgeting') ||
             question.includes('create a budget');
      console.log(`🔍 Budget context check for "${question}": ${result}`);
      return result;
    });
    
    console.log(`🔍 Context detection results:`);
    console.log(`  - Portfolio: ${hasPortfolioContext}`);
    console.log(`  - Planning: ${hasPlanningContext}`);
    console.log(`  - Debt: ${hasDebtContext}`);
    console.log(`  - Budget: ${hasBudgetContext}`);
    console.log(`  - Current question contains age: ${currentQuestion.toLowerCase().includes('age')}`);
    console.log(`  - Current question contains income: ${currentQuestion.toLowerCase().includes('income')}`);
    console.log(`  - Current question contains $: ${currentQuestion.toLowerCase().includes('$')}`);
    
    // Check for multiple context opportunities
    if (hasPortfolioContext && hasBudgetContext && (currentQuestion.includes('age') || currentQuestion.includes('income') || currentQuestion.includes('$'))) {
      console.log('✅ Multiple context opportunity detected (portfolio + budget)');
      return { 
        hasContextOpportunities: true, 
        instruction: 'User previously asked about portfolio analysis and budgeting and now provided key personal information. Offer to complete both analyses with this new context.' 
      };
    }
    
    if (hasPortfolioContext && (currentQuestion.includes('age') || currentQuestion.includes('income') || currentQuestion.includes('$'))) {
      console.log('✅ Portfolio context opportunity detected');
      return { 
        hasContextOpportunities: true, 
        instruction: 'User previously asked about portfolio analysis and now provided key personal information. Offer to complete the portfolio analysis with this new context.' 
      };
    }
    
    if (hasPlanningContext && (currentQuestion.includes('age') || currentQuestion.includes('years'))) {
      console.log('✅ Planning context opportunity detected');
      return { 
        hasContextOpportunities: true, 
        instruction: 'User previously asked about financial planning and now provided timeline or age information. Offer to create a comprehensive financial plan.' 
      };
    }
    
    if (hasDebtContext && (currentQuestion.includes('income') || currentQuestion.includes('$'))) {
      console.log('✅ Debt context opportunity detected');
      return { 
        hasContextOpportunities: true, 
        instruction: 'User previously asked about debt analysis and now provided income/expense information. Offer to complete the debt-to-income analysis.' 
      };
    }
    
    if (hasBudgetContext && (currentQuestion.includes('income') || currentQuestion.includes('children') || currentQuestion.includes('$'))) {
      console.log('✅ Budget context opportunity detected');
      return { 
        hasContextOpportunities: true, 
        instruction: 'User previously asked about budgeting and now provided income or family information. Offer to create a comprehensive budget plan.' 
      };
    }
    
    console.log('❌ No context opportunities detected');
    return { hasContextOpportunities: false, instruction: '' };
  })
}));

// Mock market news aggregator to prevent real API calls
jest.mock('../../market-news/aggregator', () => ({
  MarketNewsAggregator: jest.fn().mockImplementation(() => ({
    aggregateMarketData: jest.fn().mockResolvedValue([
      {
        title: 'Mock Market News',
        content: 'This is mock market news data for testing',
        source: 'mock',
        url: 'https://example.com/mock-news',
        publishedAt: new Date().toISOString(),
        category: 'general'
      }
    ]),
    initializePolygonClient: jest.fn().mockResolvedValue(undefined),
    fetchPolygonData: jest.fn().mockResolvedValue([]),
    fetchFREDData: jest.fn().mockResolvedValue([]),
    fetchBraveSearchData: jest.fn().mockResolvedValue([])
  }))
}));

jest.mock('../../data/providers/fred', () => ({
  FREDProvider: jest.fn().mockImplementation(() => ({
    getEconomicIndicators: jest.fn().mockResolvedValue({
      cpi: { value: 3.2, date: '2024-01-01', source: 'FRED' },
      fedRate: { value: 4.33, date: '2024-01-01', source: 'FRED' },
      mortgageRate: { value: 6.5, date: '2024-01-01', source: 'FRED' },
      creditCardAPR: { value: 15.5, date: '2024-01-01', source: 'FRED' }
    }),
    getLiveMarketData: jest.fn().mockResolvedValue({
      cdRates: { value: 5.25, date: '2024-01-01', source: 'FRED' },
      treasuryYields: { value: 4.5, date: '2024-01-01', source: 'FRED' },
      stockData: { value: 4500, date: '2024-01-01', source: 'FRED' }
    }),
    getDataPoint: jest.fn().mockResolvedValue({ value: 4.33, date: '2024-01-01', source: 'FRED' })
  }))
}));

jest.mock('../../data/providers/alpha-vantage', () => ({
  AlphaVantageProvider: jest.fn().mockImplementation(() => ({
    getEconomicIndicators: jest.fn().mockResolvedValue({
      cpi: { value: 3.2, date: '2024-01-01', source: 'Alpha Vantage' },
      fedRate: { value: 4.33, date: '2024-01-01', source: 'Alpha Vantage' },
      mortgageRate: { value: 6.5, date: '2024-01-01', source: 'Alpha Vantage' },
      creditCardAPR: { value: 15.5, date: '2024-01-01', source: 'Alpha Vantage' }
    }),
    getLiveMarketData: jest.fn().mockResolvedValue({
      cdRates: { value: 5.25, date: '2024-01-01', source: 'Alpha Vantage' },
      treasuryYields: { value: 4.5, date: '2024-01-01', source: 'Alpha Vantage' },
      stockData: { value: 4500, date: '2024-01-01', source: 'Alpha Vantage' }
    }),
    getDataPoint: jest.fn().mockResolvedValue({ value: 4.5, date: '2024-01-01', source: 'Alpha Vantage' })
  }))
}));

jest.mock('../../data/providers/search', () => ({
  SearchProvider: jest.fn().mockImplementation(() => ({
    search: jest.fn().mockResolvedValue([
      {
        title: 'Test Search Result',
        snippet: 'This is a test search result for financial data',
        url: 'https://example.com/test',
        source: 'Test Source',
        relevance: 0.9
      }
    ]),
    enhanceFinancialQuery: jest.fn().mockResolvedValue('enhanced query'),
    filterFinancialResults: jest.fn().mockImplementation((results) => results)
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