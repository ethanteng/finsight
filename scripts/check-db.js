const { PrismaClient } = require('@prisma/client');

async function checkDatabase() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Checking database state...\n');
    
    // Check users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        tier: true,
        createdAt: true
      }
    });
    console.log('Users:', users);
    
    // Check access tokens
    const accessTokens = await prisma.accessToken.findMany({
      select: {
        id: true,
        itemId: true,
        userId: true,
        lastRefreshed: true
      }
    });
    console.log('Access Tokens:', accessTokens);
    
    // Check accounts
    const accounts = await prisma.account.findMany({
      select: {
        id: true,
        plaidAccountId: true,
        name: true,
        userId: true
      }
    });
    console.log('Accounts:', accounts);
    
  } catch (error) {
    console.error('Database error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase(); 