#!/usr/bin/env npx ts-node
/**
 * Fix duplicate accounts in database
 *
 * Identifies and removes duplicate account records caused by:
 * 1. Account chaining bug (account.id vs account.account_id)
 * 2. Re-linking same institution (e.g. Betterment) after Plaid connection expiry
 *    - Creates new Plaid Item with different account_ids for same logical accounts
 *
 * For each set of duplicates:
 * 1. Prefer keeping account from active token (via Plaid accountsGet)
 * 2. Fallback: keep most recently synced account
 * 3. Migrate transactions from duplicates to the kept account
 * 4. Delete duplicate records
 * 5. Refresh financial caches (FinancialSummarySnapshot, FinancialSummary) for affected users
 */

import { getPrismaClient } from '../src/prisma-client';
import { plaidClient } from '../src/plaid';
import { SummaryCacheService } from '../src/services/summary-cache-service';
import { FinancialSummaryService } from '../src/services/financial-summary-service';

const prisma = getPrismaClient();

async function getPlaidAccountIdsFromActiveTokens(userId: string): Promise<Set<string>> {
  const validAccountIds = new Set<string>();
  const activeTokens = await prisma.accessToken.findMany({
    where: { userId, isActive: true },
    select: { token: true }
  });

  for (const { token } of activeTokens) {
    try {
      const accountsResponse = await plaidClient.accountsGet({
        access_token: token
      });
      for (const acc of accountsResponse.data.accounts) {
        validAccountIds.add(acc.account_id);
      }
    } catch (err) {
      console.warn(`   ⚠️  Plaid accountsGet failed for token:`, (err as Error).message);
    }
  }
  return validAccountIds;
}

async function fixDuplicateAccounts() {
  console.log('🔍 Starting duplicate account cleanup...\n');

  try {
    const allAccounts = await prisma.account.findMany({
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true } } }
    });

    // Filter to Plaid accounts only (exclude SnapTrade, manual)
    const plaidAccounts = allAccounts.filter(
      (a) =>
        a.plaidAccountId &&
        !a.plaidAccountId.startsWith('snaptrade-') &&
        !a.plaidAccountId.startsWith('manual-')
    );

    console.log(`📊 Total Plaid accounts in database: ${plaidAccounts.length}`);

    // Group by logical identity: name + type + subtype + institution + userId
    const accountGroups = new Map<string, typeof plaidAccounts>();

    for (const account of plaidAccounts) {
      const key = `${account.name}|${account.type}|${account.subtype || ''}|${account.institution || ''}|${account.userId || ''}`;
      if (!accountGroups.has(key)) {
        accountGroups.set(key, []);
      }
      accountGroups.get(key)!.push(account);
    }

    let totalDuplicatesRemoved = 0;
    let totalTransactionsMigrated = 0;
    const affectedUserIds = new Set<string>();

    for (const [key, accounts] of accountGroups) {
      if (accounts.length <= 1) continue;

      console.log(`\n🔗 Found ${accounts.length} duplicates for: ${accounts[0].name} (${accounts[0].institution})`);

      const userId = accounts[0].userId;
      let validPlaidIds: Set<string> = new Set();
      if (userId) {
        validPlaidIds = await getPlaidAccountIdsFromActiveTokens(userId);
      }

      // Prefer account whose plaidAccountId is from an active token
      // Fallback: most recently synced (lastSynced desc, then createdAt desc)
      const sorted = [...accounts].sort((a, b) => {
        const aValid = validPlaidIds.has(a.plaidAccountId);
        const bValid = validPlaidIds.has(b.plaidAccountId);
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;
        const aTime = a.lastSynced?.getTime() ?? a.createdAt.getTime();
        const bTime = b.lastSynced?.getTime() ?? b.createdAt.getTime();
        return bTime - aTime;
      });

      const originalAccount = sorted[0];
      const duplicates = accounts.filter((acc) => acc.id !== originalAccount.id);

      console.log(`   ✅ Keeping: ${originalAccount.id} (plaidAccountId: ${originalAccount.plaidAccountId})`);

      for (const duplicate of duplicates) {
        console.log(`   🗑️  Removing duplicate: ${duplicate.id} (plaidAccountId: ${duplicate.plaidAccountId})`);

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

        await prisma.account.delete({
          where: { id: duplicate.id }
        });
        totalDuplicatesRemoved++;
        if (userId) affectedUserIds.add(userId);
      }
    }

    // Refresh financial caches for affected users so /profile and /finances show correct data
    if (affectedUserIds.size > 0) {
      console.log(`\n🔄 Refreshing financial caches for ${affectedUserIds.size} affected user(s)...`);
      const summaryService = new FinancialSummaryService();
      for (const userId of affectedUserIds) {
        try {
          await SummaryCacheService.computeForUser(userId, { categorize: false });
          await summaryService.refreshUserSummary(userId);
          console.log(`   ✅ Refreshed caches for user ${userId}`);
        } catch (err) {
          console.error(`   ❌ Failed to refresh caches for user ${userId}:`, (err as Error).message);
        }
      }
    }

    console.log(`\n✅ Cleanup complete!`);
    console.log(`   - Removed ${totalDuplicatesRemoved} duplicate accounts`);
    console.log(`   - Migrated ${totalTransactionsMigrated} transactions`);
    console.log(`   - ${plaidAccounts.length - totalDuplicatesRemoved} unique Plaid accounts remaining`);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixDuplicateAccounts()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
