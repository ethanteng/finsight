const { PrismaClient } = require('@prisma/client');

async function fixAccessToken() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Fixing access token association...\n');
    
    // Get the user ID for the test user
    const user = await prisma.user.findUnique({
      where: { email: 'plaidtest@example.com' }
    });
    
    if (!user) {
      console.log('User not found');
      return;
    }
    
    console.log('User found:', user.id);
    
    // Update the access token to associate it with the user
    const updatedToken = await prisma.accessToken.update({
      where: { id: 'cmdwa6rnx0003rz0pryrw0423' },
      data: { userId: user.id }
    });
    
    console.log('Updated access token:', updatedToken);
    
    // Verify the fix by checking accounts
    console.log('\nVerifying fix...');
    const accessTokens = await prisma.accessToken.findMany({
      where: { userId: user.id }
    });
    
    console.log('Access tokens for user:', accessTokens);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAccessToken(); 