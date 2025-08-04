const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function investigateUsers() {
  try {
    console.log('🔍 Investigating user accounts...');
    
    // Get all users with their details
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        lastLoginAt: true,
        createdAt: true,
        isActive: true,
        emailVerified: true,
        tier: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log('\n📊 All Users:');
    allUsers.forEach((user, index) => {
      const hasLogin = user.lastLoginAt ? '✅' : '❌';
      const verified = user.emailVerified ? '✅' : '❌';
      const active = user.isActive ? '✅' : '❌';
      
      console.log(`${index + 1}. ${user.email}`);
      console.log(`   - Login: ${hasLogin} ${user.lastLoginAt || 'Never logged in'}`);
      console.log(`   - Verified: ${verified}`);
      console.log(`   - Active: ${active}`);
      console.log(`   - Tier: ${user.tier}`);
      console.log(`   - Created: ${user.createdAt}`);
      console.log('');
    });
    
    // Analyze patterns
    const usersWithLogins = allUsers.filter(u => u.lastLoginAt);
    const usersWithoutLogins = allUsers.filter(u => !u.lastLoginAt);
    
    console.log('\n📈 Analysis:');
    console.log(`- Users with logins: ${usersWithLogins.length}`);
    console.log(`- Users without logins: ${usersWithoutLogins.length}`);
    console.log(`- Total users: ${allUsers.length}`);
    
    if (usersWithoutLogins.length > 0) {
      console.log('\n❓ Users without logins:');
      usersWithoutLogins.forEach(user => {
        console.log(`- ${user.email} (created: ${user.createdAt})`);
      });
    }
    
    // Check if any users have related data
    console.log('\n🔍 Checking for users with related data...');
    
    for (const user of allUsers) {
      const accounts = await prisma.account.count({ where: { userId: user.id } });
      const conversations = await prisma.conversation.count({ where: { userId: user.id } });
      const accessTokens = await prisma.accessToken.count({ where: { userId: user.id } });
      const transactions = await prisma.transaction.count({
        where: {
          account: { userId: user.id }
        }
      });
      
      if (accounts > 0 || conversations > 0 || accessTokens > 0 || transactions > 0) {
        console.log(`\n📊 ${user.email} has data:`);
        console.log(`   - Accounts: ${accounts}`);
        console.log(`   - Conversations: ${conversations}`);
        console.log(`   - Access Tokens: ${accessTokens}`);
        console.log(`   - Transactions: ${transactions}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

investigateUsers(); 