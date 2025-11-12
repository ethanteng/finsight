import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();

/**
 * Migration script to fix corrupted plaidAccountId values
 * 
 * Problem: Some accounts have plaidAccountId set to another account's database id
 * instead of the real Plaid account ID. This creates circular references and breaks deduplication.
 * 
 * Solution:
 * 1. Identify accounts with corrupted plaidAccountId (those that match another account's id)
 * 2. Find the correct Plaid account ID by following the chain or looking for records with real Plaid IDs
 * 3. Consolidate duplicate accounts, keeping only the one with the real Plaid account ID
 * 4. Delete corrupted duplicate records
 */
async function fixCorruptedPlaidAccountIds() {
  console.log('🔄 Starting migration: Fixing corrupted plaidAccountId values...');

  try {
    // Get all accounts
    const allAccounts = await prisma.account.findMany({
      orderBy: { lastSynced: 'desc' }, // Most recently synced first
    });

    console.log(`📊 Found ${allAccounts.length} total accounts`);

    // Create a map of database IDs to accounts (for quick lookup)
    const idMap = new Map<string, typeof allAccounts[0]>();
    allAccounts.forEach(acc => idMap.set(acc.id, acc));

    // Create a map of plaidAccountId to accounts (to detect duplicates)
    const plaidIdMap = new Map<string, typeof allAccounts[0][]>();
    allAccounts.forEach(acc => {
      if (!plaidIdMap.has(acc.plaidAccountId)) {
        plaidIdMap.set(acc.plaidAccountId, []);
      }
      plaidIdMap.get(acc.plaidAccountId)!.push(acc);
    });

    // Helper function to check if a plaidAccountId looks like a database ID (cuid format)
    // CUIDs start with 'c' and are 25 characters long
    function isDatabaseId(id: string): boolean {
      return id.length === 25 && id.startsWith('c');
    }

    // Helper function to check if a plaidAccountId is a real Plaid ID
    // Real Plaid IDs are typically longer (30+ chars) and don't match any account's database id
    function isRealPlaidId(plaidAccountId: string): boolean {
      // If it matches another account's database id, it's corrupted
      if (idMap.has(plaidAccountId)) {
        return false;
      }
      // Real Plaid IDs are typically longer than database IDs
      return plaidAccountId.length > 25 || !isDatabaseId(plaidAccountId);
    }

    // Group accounts by name, type, subtype, and institution to identify duplicates
    const accountGroups = new Map<string, typeof allAccounts[0][]>();
    allAccounts.forEach(acc => {
      // Skip SnapTrade accounts
      if (acc.plaidAccountId.startsWith('snaptrade-')) {
        return;
      }

      const key = `${acc.name}|${acc.type}|${acc.subtype || ''}|${acc.institution || ''}`;
      if (!accountGroups.has(key)) {
        accountGroups.set(key, []);
      }
      accountGroups.get(key)!.push(acc);
    });

    let fixedCount = 0;
    let deletedCount = 0;
    let errorCount = 0;

    // Process each group of potential duplicates
    for (const [key, accounts] of accountGroups.entries()) {
      if (accounts.length <= 1) {
        continue; // No duplicates
      }

      // Find the account with the real Plaid ID (or the most recent one if all are corrupted)
      let correctAccount: typeof accounts[0] | null = null;
      
      // First, try to find one with a real Plaid ID
      for (const acc of accounts) {
        if (isRealPlaidId(acc.plaidAccountId)) {
          correctAccount = acc;
          break;
        }
      }

      // If no real Plaid ID found, use the most recently synced one
      if (!correctAccount) {
        correctAccount = accounts[0]; // Already sorted by lastSynced desc
        console.warn(`⚠️  No real Plaid ID found for ${accounts[0].name}, using most recent: ${correctAccount.id}`);
      }

      // Process duplicates
      for (const acc of accounts) {
        if (acc.id === correctAccount.id) {
          continue; // Skip the correct account
        }

        try {
          // Check if this account's plaidAccountId is corrupted (points to another account's id)
          if (isDatabaseId(acc.plaidAccountId) && idMap.has(acc.plaidAccountId)) {
            // This is a corrupted record - delete it
            console.log(`  🗑️  Deleting corrupted account: ${acc.id} (${acc.name}) - plaidAccountId points to another account's id`);
            
            // First, update any transactions that reference this account
            await prisma.transaction.updateMany({
              where: { accountId: acc.id },
              data: { accountId: correctAccount.id },
            });

            // Then delete the corrupted account
            await prisma.account.delete({
              where: { id: acc.id },
            });
            
            deletedCount++;
          } else if (acc.plaidAccountId === correctAccount.plaidAccountId) {
            // Same plaidAccountId but different database record - consolidate
            console.log(`  🔄 Consolidating duplicate: ${acc.id} (${acc.name}) into ${correctAccount.id}`);
            
            // Update transactions to point to correct account
            await prisma.transaction.updateMany({
              where: { accountId: acc.id },
              data: { accountId: correctAccount.id },
            });

            // Delete the duplicate
            await prisma.account.delete({
              where: { id: acc.id },
            });
            
            deletedCount++;
          } else {
            // Different plaidAccountId - might be a different account or corrupted
            // Try to follow the chain to find the real Plaid ID
            let currentId = acc.plaidAccountId;
            const visited = new Set<string>();
            let realPlaidId: string | null = null;

            while (currentId && !visited.has(currentId)) {
              visited.add(currentId);
              
              if (isRealPlaidId(currentId)) {
                realPlaidId = currentId;
                break;
              }

              // Check if this ID points to another account
              const nextAccount = idMap.get(currentId);
              if (nextAccount) {
                currentId = nextAccount.plaidAccountId;
              } else {
                break;
              }
            }

            if (realPlaidId && realPlaidId !== acc.plaidAccountId) {
              // Found the real Plaid ID - update this account
              console.log(`  ✅ Fixing account ${acc.id} (${acc.name}): ${acc.plaidAccountId} → ${realPlaidId}`);
              
              // Check if an account with this real Plaid ID already exists
              const existingAccount = await prisma.account.findUnique({
                where: { plaidAccountId: realPlaidId },
              });

              if (existingAccount) {
                // Account already exists - consolidate
                await prisma.transaction.updateMany({
                  where: { accountId: acc.id },
                  data: { accountId: existingAccount.id },
                });

                await prisma.account.delete({
                  where: { id: acc.id },
                });
                
                deletedCount++;
              } else {
                // Update this account with the real Plaid ID
                await prisma.account.update({
                  where: { id: acc.id },
                  data: { plaidAccountId: realPlaidId },
                });
                
                fixedCount++;
              }
            } else {
              // Couldn't find real Plaid ID - might be a legitimate different account
              // Keep it for now, but log a warning
              console.warn(`  ⚠️  Could not resolve Plaid ID for account ${acc.id} (${acc.name}), plaidAccountId: ${acc.plaidAccountId}`);
            }
          }
        } catch (error) {
          errorCount++;
          console.error(`  ❌ Error processing account ${acc.id} (${acc.name}):`, error);
        }
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`  ✅ Fixed: ${fixedCount}`);
    console.log(`  🗑️  Deleted: ${deletedCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📝 Total processed: ${allAccounts.length}`);

    // Verify: Check for remaining duplicates
    const remainingAccounts = await prisma.account.findMany();
    const remainingPlaidIdMap = new Map<string, number>();
    remainingAccounts.forEach(acc => {
      remainingPlaidIdMap.set(acc.plaidAccountId, (remainingPlaidIdMap.get(acc.plaidAccountId) || 0) + 1);
    });

    const remainingDuplicates = Array.from(remainingPlaidIdMap.entries())
      .filter(([_, count]) => count > 1);

    if (remainingDuplicates.length > 0) {
      console.warn(`\n⚠️  Warning: ${remainingDuplicates.length} plaidAccountId values still have duplicates:`);
      remainingDuplicates.forEach(([plaidId, count]) => {
        console.warn(`  - ${plaidId}: ${count} accounts`);
      });
    } else {
      console.log('\n✅ All duplicates resolved!');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixCorruptedPlaidAccountIds()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

