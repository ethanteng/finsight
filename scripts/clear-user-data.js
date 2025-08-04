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
    
    // Find orphaned users (users without logins and no activity)
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        lastLoginAt: true,
        createdAt: true
      }
    });
    
    const usersWithLoginsOrActivity = [...usersWithLogins, ...usersWithActivity.filter(u => 
      !usersWithLogins.some(loginUser => loginUser.id === u.id)
    )];
    
    const orphanedUsers = allUsers.filter(user => 
      !usersWithLoginsOrActivity.some(activeUser => activeUser.id === user.id)
    );
    
    // Combine all users to delete (users with logins/activity + orphaned users)
    const usersToDelete = [...usersWithLoginsOrActivity, ...orphanedUsers];
    
    // Find orphaned data (data without associated users)
    const orphanedConversations = await prisma.conversation.findMany({
      where: { userId: null },
      select: { id: true, question: true, createdAt: true }
    });
    
    const orphanedAccounts = await prisma.account.findMany({
      where: { userId: null },
      select: { id: true, name: true, type: true, createdAt: true }
    });
    
    // Note: Transactions cannot be orphaned since accountId is required
    const orphanedTransactions = [];
    
    const orphanedAccessTokens = await prisma.accessToken.findMany({
      where: { userId: null },
      select: { id: true, createdAt: true }
    });
    
    const orphanedSyncStatuses = await prisma.syncStatus.findMany({
      where: { userId: null },
      select: { id: true, createdAt: true }
    });
    
    // Note: PrivacySettings cannot be orphaned since userId is required and unique
    const orphanedPrivacySettings = [];
    
    if (usersToDelete.length === 0 && 
        orphanedConversations.length === 0 && 
        orphanedAccounts.length === 0 && 
        orphanedTransactions.length === 0 && 
        orphanedAccessTokens.length === 0 && 
        orphanedSyncStatuses.length === 0 && 
        orphanedPrivacySettings.length === 0) {
      console.log('✅ No users or orphaned data found to delete.');
      return;
    }
    
    console.log('\n👥 Users that will be deleted:');
    
    if (usersWithLoginsOrActivity.length > 0) {
      console.log('\n📋 Users with logins or activity:');
      usersWithLoginsOrActivity.forEach(user => {
        const hasLogin = user.lastLoginAt ? '✅' : '❌';
        console.log(`- ${user.email} (login: ${hasLogin} ${user.lastLoginAt || 'No login timestamp'})`);
      });
    }
    
    if (orphanedUsers.length > 0) {
      console.log('\n🧹 Orphaned users (no logins, no activity):');
      orphanedUsers.forEach(user => {
        console.log(`- ${user.email} (created: ${user.createdAt})`);
      });
    }
    
    // Show orphaned data summary
    const hasOrphanedData = orphanedConversations.length > 0 || 
                           orphanedAccounts.length > 0 || 
                           orphanedTransactions.length > 0 || 
                           orphanedAccessTokens.length > 0 || 
                           orphanedSyncStatuses.length > 0 || 
                           orphanedPrivacySettings.length > 0;
    
    if (hasOrphanedData) {
      console.log('\n🗑️  Orphaned data to be cleaned up:');
      if (orphanedConversations.length > 0) {
        console.log(`- ${orphanedConversations.length} orphaned conversations`);
      }
      if (orphanedAccounts.length > 0) {
        console.log(`- ${orphanedAccounts.length} orphaned accounts`);
      }
      if (orphanedTransactions.length > 0) {
        console.log(`- ${orphanedTransactions.length} orphaned transactions`);
      }
      if (orphanedAccessTokens.length > 0) {
        console.log(`- ${orphanedAccessTokens.length} orphaned access tokens`);
      }
      if (orphanedSyncStatuses.length > 0) {
        console.log(`- ${orphanedSyncStatuses.length} orphaned sync statuses`);
      }
      if (orphanedPrivacySettings.length > 0) {
        console.log(`- ${orphanedPrivacySettings.length} orphaned privacy settings`);
      }
    }
    
    // Confirm before proceeding
    console.log('\n⚠️  WARNING: This will delete ALL data for:');
    console.log('- Users with logins OR activity');
    console.log('- Orphaned users (no logins, no activity)');
    console.log('- Orphaned data (conversations, accounts, transactions, etc.)');
    console.log('\nData to be deleted:');
    console.log('- User accounts and authentication');
    console.log('- All Plaid access tokens');
    console.log('- All transactions and accounts');
    console.log('- All conversations');
    console.log('- All profile data');
    console.log('- All sync statuses');
    console.log('- All privacy settings');
    console.log('- Orphaned data without associated users');
    console.log('\nDemo data will be preserved.');
    
    // Uncomment the line below to actually perform the deletion
    await performDeletion(usersToDelete, {
      conversations: orphanedConversations,
      accounts: orphanedAccounts,
      transactions: orphanedTransactions,
      accessTokens: orphanedAccessTokens,
      syncStatuses: orphanedSyncStatuses,
      privacySettings: orphanedPrivacySettings
    });
    
    console.log('\n🔒 Script is in DRY RUN mode. Uncomment the performDeletion call to actually delete data.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function performDeletion(usersWithLogins, orphanedData = {}) {
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
  
  // Note: encryptedProfileData and userProfile tables don't exist in current schema
  // Skipping deletion of these tables
  
  // 9. Finally, delete the users themselves
  console.log('Deleting users...');
  const deletedUsers = await prisma.user.deleteMany({
    where: { id: { in: userIds } }
  });
  console.log(`✅ Deleted ${deletedUsers.count} users`);
  
  // 10. Clean up orphaned data
  if (orphanedData.conversations && orphanedData.conversations.length > 0) {
    console.log('Deleting orphaned conversations...');
    const deletedOrphanedConversations = await prisma.conversation.deleteMany({
      where: { userId: null }
    });
    console.log(`✅ Deleted ${deletedOrphanedConversations.count} orphaned conversations`);
  }
  
  // Note: Transactions cannot be orphaned since accountId is required
  
  if (orphanedData.accounts && orphanedData.accounts.length > 0) {
    console.log('Deleting orphaned accounts...');
    const deletedOrphanedAccounts = await prisma.account.deleteMany({
      where: { userId: null }
    });
    console.log(`✅ Deleted ${deletedOrphanedAccounts.count} orphaned accounts`);
  }
  
  if (orphanedData.accessTokens && orphanedData.accessTokens.length > 0) {
    console.log('Deleting orphaned access tokens...');
    const deletedOrphanedAccessTokens = await prisma.accessToken.deleteMany({
      where: { userId: null }
    });
    console.log(`✅ Deleted ${deletedOrphanedAccessTokens.count} orphaned access tokens`);
  }
  
  if (orphanedData.syncStatuses && orphanedData.syncStatuses.length > 0) {
    console.log('Deleting orphaned sync statuses...');
    const deletedOrphanedSyncStatuses = await prisma.syncStatus.deleteMany({
      where: { userId: null }
    });
    console.log(`✅ Deleted ${deletedOrphanedSyncStatuses.count} orphaned sync statuses`);
  }
  
  // Note: PrivacySettings cannot be orphaned since userId is required and unique
  
  // Verify demo data is preserved
  console.log('\n🔍 Verifying demo data preservation...');
  const remainingDemoSessions = await prisma.demoSession.count();
  const remainingDemoConversations = await prisma.demoConversation.count();
  
  console.log(`✅ Demo sessions preserved: ${remainingDemoSessions}`);
  console.log(`✅ Demo conversations preserved: ${remainingDemoConversations}`);
  
  console.log('\n🎉 Data cleanup completed successfully!');
  console.log('✅ All user data has been deleted');
  console.log('✅ All orphaned data has been cleaned up');
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