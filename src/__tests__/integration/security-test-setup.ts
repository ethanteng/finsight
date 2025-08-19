import { PrismaClient } from '@prisma/client';

// 🔒 SECURITY TEST SETUP - NO MOCKING OF SECURITY LOGIC
// This setup allows us to test the REAL security implementation
// as required by our security testing improvement plan

// Mock external dependencies that are NOT security-related
jest.mock('../../openai', () => ({
  askOpenAI: jest.fn().mockResolvedValue('Mocked AI response for security tests'),
  askOpenAIWithEnhancedContext: jest.fn().mockResolvedValue('Mocked enhanced AI response for security tests'),
  askOpenAIForTests: jest.fn().mockResolvedValue('Mocked AI response for security tests'),
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

// Mock market news (not security-related)
jest.mock('../../market-news/synthesizer', () => ({
  MarketNewsSynthesizer: jest.fn().mockImplementation(() => ({
    synthesizeNews: jest.fn().mockResolvedValue('Mocked market news synthesis'),
    generateEmailContent: jest.fn().mockResolvedValue('Mocked email content')
  }))
}));

// 🔒 CRITICAL: DO NOT MOCK PLAID ROUTES FOR SECURITY TESTS
// We need to test the REAL security implementation, not mocked versions
// This is exactly what our security testing improvement plan requires

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
    console.error(`❌ Missing API keys for security tests: ${missingKeys.join(', ')}`);
    console.error('Security tests require API keys to be set (even test keys)');
    throw new Error(`Missing required API keys for security tests: ${missingKeys.join(', ')}`);
  }

  // ✅ Verify database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection verified for security tests');
  } catch (error) {
    console.error('❌ Database connection failed for security tests:', error);
    throw new Error('Database connection required for security tests');
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

  // ✅ Clean up test data before each test
  // Order matters: delete child tables before parent tables
  try {
    await prisma.encryptedEmailVerificationCode.deleteMany();
    await prisma.encryptedUserData.deleteMany();
    await prisma.encrypted_profile_data.deleteMany(); // Clean encrypted profile data first
    await prisma.demoConversation.deleteMany();  // Clean demo conversations first
    await prisma.demoSession.deleteMany();       // Clean demo sessions
    await prisma.accessToken.deleteMany();
    await prisma.user.deleteMany();
    
    console.log('🧹 Security test data cleaned up');
  } catch (error: any) {
    // Log errors but don't fail the test setup
    console.warn('⚠️ Warning during security test cleanup:', error.message);
  }
});

export { prisma };
