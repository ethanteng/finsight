const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('Checking database...');
    
    // Check all accounts
    const allAccounts = await prisma.account.findMany();
    console.log('All accounts:', allAccounts.length);
    allAccounts.forEach(acc => {
      console.log(`- ${acc.name} (userId: ${acc.userId || 'null'})`);
    });
    
    // Check specific user's accounts
    const userId = 'cmdpkh1mc0000rzopyhr9h0xd';
    const userAccounts = await prisma.account.findMany({
      where: { userId: userId }
    });
    console.log(`\nAccounts for user ${userId}:`, userAccounts.length);
    userAccounts.forEach(acc => {
      console.log(`- ${acc.name}`);
    });
    
    // Check transactions
    const allTransactions = await prisma.transaction.findMany({
      include: { account: true }
    });
    console.log('\nAll transactions:', allTransactions.length);
    allTransactions.slice(0, 5).forEach(t => {
      console.log(`- ${t.name} (account: ${t.account.name}, userId: ${t.account.userId || 'null'})`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase(); 