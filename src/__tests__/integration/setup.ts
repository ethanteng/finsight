import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Global setup for integration tests
beforeAll(async () => {
  // Ensure database is clean before running integration tests
  await prisma.demoConversation.deleteMany();
  await prisma.demoSession.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.account.deleteMany();
  await prisma.accessToken.deleteMany();
  await prisma.syncStatus.deleteMany();
  await prisma.privacySettings.deleteMany();
  await prisma.user.deleteMany();
  
  console.log('Integration test database cleaned');
});

// Global teardown for integration tests
afterAll(async () => {
  await prisma.$disconnect();
});

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/test_db';
process.env.PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || 'test_client_id';
process.env.PLAID_SECRET = process.env.PLAID_SECRET || 'test_secret';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test_openai_key';
process.env.FRED_API_KEY = process.env.FRED_API_KEY || 'test_fred_key';
process.env.ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'test_alpha_vantage_key'; 