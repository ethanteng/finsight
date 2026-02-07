const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Cleanup script to remove orphaned manual accounts from the Account table.
 * 
 * Manual accounts should only exist in the ManualAccount table, but sometimes
 * they get persisted to the Account table as well. This script finds accounts
 * with plaidAccountId starting with "manual-" that don't have a corresponding
 * ManualAccount entry, and removes them along with their transactions.
 */
async function cleanupOrphanedManualAccounts() {
  try {
    console.log('🔍 Starting cleanup of orphaned manual accounts...');
    
    // Find all accounts with plaidAccountId starting with "manual-"
    const manualAccountsInAccountTable = await prisma.account.findMany({
      where: {
        plaidAccountId: {
          startsWith: 'manual-'
        }
      },
      select: {
        id: true,
        plaidAccountId: true,
        name: true,
        userId: true,
      }
    });

    console.log(`📊 Found ${manualAccountsInAccountTable.length} accounts with manual- prefix in Account table`);

    if (manualAccountsInAccountTable.length === 0) {
      console.log('✅ No orphaned manual accounts found. Exiting.');
      return;
    }

    let deletedCount = 0;
    let transactionCount = 0;

    for (const account of manualAccountsInAccountTable) {
      // Extract the manual account ID from plaidAccountId (format: "manual-{id}")
      const manualAccountId = account.plaidAccountId.replace('manual-', '');
      
      // Check if a corresponding ManualAccount exists
      const manualAccount = await prisma.manualAccount.findUnique({
        where: { id: manualAccountId }
      });

      if (!manualAccount) {
        // This is an orphaned account - delete it
        console.log(`🗑️  Found orphaned account: ${account.name} (${account.plaidAccountId})`);
        
        // First, delete any transactions associated with this account
        const deletedTransactions = await prisma.transaction.deleteMany({
          where: { accountId: account.id }
        });
        
        transactionCount += deletedTransactions.count;
        if (deletedTransactions.count > 0) {
          console.log(`   Deleted ${deletedTransactions.count} associated transactions`);
        }

        // Then delete the account
        await prisma.account.delete({
          where: { id: account.id }
        });

        deletedCount++;
        console.log(`   ✅ Deleted orphaned account: ${account.name}`);
      } else {
        console.log(`✓ Account ${account.name} has corresponding ManualAccount entry - keeping it`);
      }
    }

    console.log('\n📊 Cleanup Summary:');
    console.log(`   Orphaned accounts deleted: ${deletedCount}`);
    console.log(`   Associated transactions deleted: ${transactionCount}`);
    console.log(`   Accounts kept (have ManualAccount entry): ${manualAccountsInAccountTable.length - deletedCount}`);
    
    if (deletedCount > 0) {
      console.log('\n✅ Cleanup completed successfully!');
    } else {
      console.log('\n✅ No orphaned accounts found - all manual accounts have corresponding ManualAccount entries.');
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupOrphanedManualAccounts()
  .then(() => {
    console.log('\n✨ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
