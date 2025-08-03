const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function clearUserData() {
  try {
    console.log('🔍 Starting user data cleanup...');
    
    // First, let's see what we're working with
    const totalUsers = await prisma.user.count();
    const usersWithLogins = await prisma.user.findMany({
      where: {
        lastLoginAt: { not: null }
      },
      select: {
        id: true,
        email: true,
        lastLoginAt: true,
        createdAt: true
      }
    });
    
    // Also find users with activity (conversations, accounts, etc.)
    const usersWithActivity = await prisma.user.findMany({
      where: {
        OR: [
          { conversations: { some: {} } },
          { accounts: { some: {} } },
          { accessTokens: { some: {} } }
        ]
      },
      select: {
        id: true,
        email: true,
        lastLoginAt: true,
        createdAt: true
      }
    });
    
    console.log(`📊 Database Overview:`);
    console.log(`- Total users: ${totalUsers}`);
    console.log(`- Users with logins: ${usersWithLogins.length}`);
    console.log(`- Users with activity: ${usersWithActivity.length}`);
    
    // Combine both sets (users with logins OR activity)
    const usersToDelete = [...usersWithLogins, ...usersWithActivity.filter(u => 
      !usersWithLogins.some(loginUser => loginUser.id === u.id)
    )];
    
    if (usersToDelete.length === 0) {
      console.log('✅ No users with logins or activity found. Nothing to delete.');
      return;
    }
    
    console.log('\n👥 Users that will be deleted:');
    usersToDelete.forEach(user => {
      const hasLogin = user.lastLoginAt ? '✅' : '❌';
      console.log(`- ${user.email} (login: ${hasLogin} ${user.lastLoginAt || 'No login timestamp'})`);
    });
    
    // Confirm before proceeding
    console.log('\n⚠️  WARNING: This will delete ALL data for users with logins OR activity:');
    console.log('- User accounts and authentication');
    console.log('- All Plaid access tokens');
    console.log('- All transactions and accounts');
    console.log('- All conversations');
    console.log('- All profile data');
    console.log('- All sync statuses');
    console.log('- All privacy settings');
    console.log('\nDemo data will be preserved.');
    
    // Uncomment the line below to actually perform the deletion
    // await performDeletion(usersToDelete);
    
    console.log('\n🔒 Script is in DRY RUN mode. Uncomment the performDeletion call to actually delete data.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function performDeletion(usersWithLogins) {
  console.log('\n🗑️  Starting deletion process...');
  
  const userIds = usersWithLogins.map(user => user.id);
  
  // Delete in the correct order to respect foreign key constraints
  
  // 1. Delete conversations (references users)
  console.log('Deleting conversations...');
  const deletedConversations = await prisma.conversation.deleteMany({
    where: { userId: { in: userIds } }
  });
  console.log(`✅ Deleted ${deletedConversations.count} conversations`);
  
  // 2. Delete transactions (references accounts)
  console.log('Deleting transactions...');
  const deletedTransactions = await prisma.transaction.deleteMany({
    where: {
      account: {
        userId: { in: userIds }
      }
    }
  });
  console.log(`✅ Deleted ${deletedTransactions.count} transactions`);
  
  // 3. Delete accounts (references users)
  console.log('Deleting accounts...');
  const deletedAccounts = await prisma.account.deleteMany({
    where: { userId: { in: userIds } }
  });
  console.log(`✅ Deleted ${deletedAccounts.count} accounts`);
  
  // 4. Delete access tokens (references users)
  console.log('Deleting access tokens...');
  const deletedAccessTokens = await prisma.accessToken.deleteMany({
    where: { userId: { in: userIds } }
  });
  console.log(`✅ Deleted ${deletedAccessTokens.count} access tokens`);
  
  // 5. Delete sync statuses (references users)
  console.log('Deleting sync statuses...');
  const deletedSyncStatuses = await prisma.syncStatus.deleteMany({
    where: { userId: { in: userIds } }
  });
  console.log(`✅ Deleted ${deletedSyncStatuses.count} sync statuses`);
  
  // 6. Delete privacy settings (references users)
  console.log('Deleting privacy settings...');
  const deletedPrivacySettings = await prisma.privacySettings.deleteMany({
    where: { userId: { in: userIds } }
  });
  console.log(`✅ Deleted ${deletedPrivacySettings.count} privacy settings`);
  
  // 7. Delete encrypted profile data (references user profiles)
  console.log('Deleting encrypted profile data...');
  const deletedEncryptedProfiles = await prisma.encryptedProfileData.deleteMany({
    where: {
      userProfile: {
        userId: { in: userIds }
      }
    }
  });
  console.log(`✅ Deleted ${deletedEncryptedProfiles.count} encrypted profile data records`);
  
  // 8. Delete user profiles (references users)
  console.log('Deleting user profiles...');
  const deletedUserProfiles = await prisma.userProfile.deleteMany({
    where: { userId: { in: userIds } }
  });
  console.log(`✅ Deleted ${deletedUserProfiles.count} user profiles`);
  
  // 9. Finally, delete the users themselves
  console.log('Deleting users...');
  const deletedUsers = await prisma.user.deleteMany({
    where: { id: { in: userIds } }
  });
  console.log(`✅ Deleted ${deletedUsers.count} users`);
  
  // Verify demo data is preserved
  console.log('\n🔍 Verifying demo data preservation...');
  const remainingDemoSessions = await prisma.demoSession.count();
  const remainingDemoConversations = await prisma.demoConversation.count();
  
  console.log(`✅ Demo sessions preserved: ${remainingDemoSessions}`);
  console.log(`✅ Demo conversations preserved: ${remainingDemoConversations}`);
  
  console.log('\n🎉 User data cleanup completed successfully!');
  console.log('✅ All authenticated user data has been deleted');
  console.log('✅ Demo data has been preserved');
}

// Helper function to show current database state
async function showDatabaseState() {
  console.log('\n📊 Current Database State:');
  
  const userCount = await prisma.user.count();
  const accountCount = await prisma.account.count();
  const transactionCount = await prisma.transaction.count();
  const conversationCount = await prisma.conversation.count();
  const accessTokenCount = await prisma.accessToken.count();
  const demoSessionCount = await prisma.demoSession.count();
  const demoConversationCount = await prisma.demoConversation.count();
  
  console.log(`- Users: ${userCount}`);
  console.log(`- Accounts: ${accountCount}`);
  console.log(`- Transactions: ${transactionCount}`);
  console.log(`- Conversations: ${conversationCount}`);
  console.log(`- Access Tokens: ${accessTokenCount}`);
  console.log(`- Demo Sessions: ${demoSessionCount}`);
  console.log(`- Demo Conversations: ${demoConversationCount}`);
}

// Run the script
clearUserData().then(() => {
  console.log('\n📋 Script completed. Review the output above before proceeding.');
  console.log('💡 To actually perform the deletion, uncomment the performDeletion call in the script.');
}); 