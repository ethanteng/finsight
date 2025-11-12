import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();

/**
 * Migration script to ensure all accounts have plaidAccountId set
 * This handles accounts that were created before plaidAccountId was consistently set
 */
async function migrateAccountPlaidIds() {
  console.log('🔄 Starting migration: Setting plaidAccountId for existing accounts...');

  try {
    // Find accounts where plaidAccountId might be missing or inconsistent
    // Note: Since plaidAccountId is @unique in schema, we can't have null values
    // But we check for accounts that might need updating based on other fields
    
    // Get all accounts
    const allAccounts = await prisma.account.findMany({
      select: {
        id: true,
        plaidAccountId: true,
        persistentAccountId: true,
        name: true,
        type: true,
        subtype: true
      }
    });

    console.log(`📊 Found ${allAccounts.length} total accounts`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const account of allAccounts) {
      try {
        // Skip SnapTrade accounts (they don't have plaidAccountId)
        if (account.plaidAccountId && account.plaidAccountId.startsWith('snaptrade-')) {
          skippedCount++;
          continue;
        }

        // If plaidAccountId exists and matches persistentAccountId, skip
        if (account.plaidAccountId && account.persistentAccountId && 
            account.plaidAccountId === account.persistentAccountId) {
          skippedCount++;
          continue;
        }

        // If persistentAccountId exists but plaidAccountId doesn't match, update it
        if (account.persistentAccountId && account.plaidAccountId !== account.persistentAccountId) {
          // Check if another account already has this plaidAccountId
          const existing = await prisma.account.findUnique({
            where: { plaidAccountId: account.persistentAccountId }
          });

          if (existing && existing.id !== account.id) {
            console.warn(`⚠️  Account ${account.id} (${account.name}) has persistentAccountId ${account.persistentAccountId} but another account already uses it. Skipping.`);
            errorCount++;
            continue;
          }

          // Update plaidAccountId to match persistentAccountId
          await prisma.account.update({
            where: { id: account.id },
            data: { plaidAccountId: account.persistentAccountId }
          });

          console.log(`✅ Updated account ${account.id} (${account.name}): plaidAccountId = ${account.persistentAccountId}`);
          updatedCount++;
        } else {
          skippedCount++;
        }
      } catch (error: any) {
        console.error(`❌ Error processing account ${account.id}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`  ✅ Updated: ${updatedCount}`);
    console.log(`  ⏭️  Skipped: ${skippedCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📝 Total: ${allAccounts.length}`);

    // Verify migration: Check for accounts where plaidAccountId doesn't match persistentAccountId
    const inconsistentAccounts = await prisma.account.findMany({
      where: {
        AND: [
          { persistentAccountId: { not: null } },
          { plaidAccountId: { not: { equals: prisma.account.fields.persistentAccountId } } }
        ]
      }
    });

    if (inconsistentAccounts.length > 0) {
      console.warn(`⚠️  Warning: ${inconsistentAccounts.length} accounts have inconsistent plaidAccountId and persistentAccountId`);
    } else {
      console.log('✅ All accounts have consistent plaidAccountId');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateAccountPlaidIds()
  .then(() => {
    console.log('✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });

