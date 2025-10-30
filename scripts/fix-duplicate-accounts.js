#!/usr/bin/env node
/**
 * Fix duplicate accounts in database
 * 
 * This script identifies and removes duplicate account records that were created
 * due to the account chaining bug where account.id (database ID) was used instead
 * of account.account_id (Plaid ID).
 * 
 * For each set of duplicates:
 * 1. Find the original account (one with real Plaid ID)
 * 2. Update all transactions to point to the original account
 * 3. Delete the duplicate records
 */

import { getPrismaClient } from '../src/prisma-client.js';

const prisma = getPrismaClient();

async function fixDuplicateAccounts() {
  console.log('🔍 Starting duplicate account cleanup...\n');

  try {
    // Get all accounts
    const allAccounts = await prisma.account.findMany({
      orderBy: { createdAt: 'asc' }
    });

    console.log(`📊 Total accounts in database: ${allAccounts.length}`);

    // Group accounts by name + type + subtype + institution
    const accountGroups = new Map();

    for (const account of allAccounts) {
      const key = `${account.name}|${account.type}|${account.subtype}|${account.institution}|${account.userId}`;
      
      if (!accountGroups.has(key)) {
        accountGroups.set(key, []);
      }
      accountGroups.get(key).push(account);
    }

    // Find and fix duplicates
    let totalDuplicatesRemoved = 0;
    let totalTransactionsMigrated = 0;

    for (const [key, accounts] of accountGroups) {
      if (accounts.length > 1) {
        console.log(`\n🔗 Found ${accounts.length} duplicates for: ${accounts[0].name}`);
        
        // Find the original account (the one with a real Plaid ID that doesn't match any database ID)
        const allDbIds = new Set(accounts.map(a => a.id));
        const originalAccount = accounts.find(acc => !allDbIds.has(acc.plaidAccountId));

        if (!originalAccount) {
          console.log(`⚠️  Could not determine original account for ${accounts[0].name} - skipping`);
          continue;
        }

        console.log(`✅ Original account: ${originalAccount.id} (plaidAccountId: ${originalAccount.plaidAccountId})`);

        // Get all duplicates (except the original)
        const duplicates = accounts.filter(acc => acc.id !== originalAccount.id);

        for (const duplicate of duplicates) {
          console.log(`   🗑️  Duplicate: ${duplicate.id} (plaidAccountId: ${duplicate.plaidAccountId})`);

          // Migrate transactions from duplicate to original
          const transactionCount = await prisma.transaction.count({
            where: { accountId: duplicate.id }
          });

          if (transactionCount > 0) {
            console.log(`   📦 Migrating ${transactionCount} transactions...`);
            await prisma.transaction.updateMany({
              where: { accountId: duplicate.id },
              data: { accountId: originalAccount.id }
            });
            totalTransactionsMigrated += transactionCount;
          }

          // Delete the duplicate account
          await prisma.account.delete({
            where: { id: duplicate.id }
          });
          
          totalDuplicatesRemoved++;
        }
      }
    }

    console.log(`\n✅ Cleanup complete!`);
    console.log(`   - Removed ${totalDuplicatesRemoved} duplicate accounts`);
    console.log(`   - Migrated ${totalTransactionsMigrated} transactions`);
    console.log(`   - ${allAccounts.length - totalDuplicatesRemoved} unique accounts remaining`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixDuplicateAccounts()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

