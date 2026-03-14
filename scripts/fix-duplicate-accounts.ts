#!/usr/bin/env npx ts-node
/**
 * Fix duplicate accounts in database
 *
 * Identifies and removes duplicate account records caused by:
 * 1. Account chaining bug (account.id vs account.account_id)
 * 2. Re-linking same institution (e.g. Betterment) after Plaid connection expiry
 *    - Creates new Plaid Item with different account_ids for same logical accounts
 *
 * Deduplication uses stable identifiers only (no name-like fields):
 * - persistentAccountId: Plaid's stable ID (TAN institutions; same across re-links)
 * - institution + type + subtype + currentBalance: Matches re-linked accounts where
 *   the old record has no mask but the new one does (both share same balance)
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

/**
 * Build a name-independent key for deduplication grouping.
 * Uses only stable identifiers - never account name (user can rename).
 * Returns null when no stable identifier exists (cannot safely dedupe).
 */
function getDedupKey(account: {
  plaidAccountId: string;
  persistentAccountId: string | null;
  currentBalance: number | null;
  type: string;
  subtype: string | null;
  institution: string | null;
  userId: string | null;
}): string | null {
  const inst = (account.institution || '').trim();
  const type = (account.type || '').trim();
  const subtype = (account.subtype || '').trim();
  const userId = account.userId || '';

  // 1. persistentAccountId: Plaid's stable ID, same across re-links (TAN institutions)
  if (account.persistentAccountId && account.persistentAccountId !== account.plaidAccountId) {
    return `persistent:${account.persistentAccountId}|${userId}`;
  }

  // 2. institution + type + subtype + currentBalance: Matches accounts that share
  //    the same balance (e.g. re-linked account where old record has no mask,
  //    new one has mask - both have same balance so they group together)
  if (account.currentBalance != null && !Number.isNaN(account.currentBalance)) {
    const balance = Math.round(account.currentBalance * 100) / 100;
    return `balance:${inst}|${type}|${subtype}|${balance}|${userId}`;
  }

  // No stable identifier - cannot safely dedupe
  return null;
}

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

    // Group by name-independent key only (persistentAccountId or mask)
    // Accounts with no stable identifier are skipped (cannot safely dedupe)
    const accountGroups = new Map<string, typeof plaidAccounts>();
    let skippedNoKey = 0;

    for (const account of plaidAccounts) {
      const key = getDedupKey({
        plaidAccountId: account.plaidAccountId,
        persistentAccountId: account.persistentAccountId,
        currentBalance: account.currentBalance,
        type: account.type,
        subtype: account.subtype,
        institution: account.institution,
        userId: account.userId,
      });
      if (!key) {
        skippedNoKey++;
        continue;
      }
      if (!accountGroups.has(key)) {
        accountGroups.set(key, []);
      }
      accountGroups.get(key)!.push(account);
    }

    if (skippedNoKey > 0) {
      console.log(`   ℹ️  ${skippedNoKey} account(s) have no persistentAccountId or currentBalance - skipped`);
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
