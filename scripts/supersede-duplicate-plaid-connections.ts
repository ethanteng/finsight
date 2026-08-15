#!/usr/bin/env npx ts-node
/**
 * Supersede duplicate Plaid connections left behind by re-linking.
 *
 * Re-linking an institution through a fresh Link flow mints a new Plaid Item. Before the
 * reconciliation added to /plaid/exchange_public_token, the previous Item's AccessToken stayed
 * active, so the same logical accounts appeared twice in account lists, net worth, and AI context.
 *
 * For every (user, institution) that has more than one active connection, this script keeps the
 * most recently refreshed connection and supersedes the older ones - but ONLY when the surviving
 * connection's accounts fully cover the older one's. Partial coverage means two genuinely
 * different logins at the same institution (personal vs business, say), and both are left alone.
 *
 * Superseding a connection migrates its transactions onto the matched surviving accounts, deletes
 * the duplicate Account rows, and marks the AccessToken isActive=false with
 * lastError='SUPERSEDED_BY_RELINK'.
 *
 * Usage:
 *   npx ts-node scripts/supersede-duplicate-plaid-connections.ts            # dry run (default)
 *   npx ts-node scripts/supersede-duplicate-plaid-connections.ts --apply    # perform changes
 *   npx ts-node scripts/supersede-duplicate-plaid-connections.ts --apply --user <userId>
 *   npx ts-node scripts/supersede-duplicate-plaid-connections.ts --apply --institution Betterment
 */

import { getPrismaClient } from '../src/prisma-client';
import {
  matchAccountsAcrossConnections,
  supersedeDuplicateInstitutionConnections
} from '../src/services/plaid-connection-supersede';
import { SummaryCacheService } from '../src/services/summary-cache-service';

const prisma = getPrismaClient();

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const flagValue = (flag: string): string | null => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
};
const userFilter = flagValue('--user');
const institutionFilter = flagValue('--institution');

type TokenWithAccounts = {
  id: string;
  itemId: string | null;
  userId: string | null;
  institutionName: string | null;
  lastRefreshed: Date | null;
  createdAt: Date;
  accounts: Array<{
    id: string;
    plaidAccountId: string;
    persistentAccountId: string | null;
    institution: string | null;
    name: string;
    type: string;
    subtype: string | null;
    mask: string | null;
    currentBalance: number | null;
  }>;
};

/**
 * A token's institution is whatever its accounts say, falling back to the (lazily backfilled)
 * institutionName column.
 */
function resolveInstitution(token: TokenWithAccounts): string | null {
  const fromAccounts = token.accounts
    .map(account => account.institution)
    .find((institution): institution is string => Boolean(institution));
  return fromAccounts ?? token.institutionName ?? null;
}

async function main() {
  console.log(apply ? '⚙️  Running in APPLY mode - changes will be written\n' : '🔎 Dry run - no changes will be written (pass --apply to execute)\n');

  const tokens = (await prisma.accessToken.findMany({
    where: {
      isActive: true,
      userId: userFilter ?? { not: null }
    },
    select: {
      id: true,
      itemId: true,
      userId: true,
      institutionName: true,
      lastRefreshed: true,
      createdAt: true,
      accounts: {
        select: {
          id: true, plaidAccountId: true, persistentAccountId: true, institution: true,
          name: true, type: true, subtype: true, mask: true, currentBalance: true
        }
      }
    }
  })) as TokenWithAccounts[];

  // Group active connections by user + institution.
  const groups = new Map<string, TokenWithAccounts[]>();
  for (const token of tokens) {
    if (!token.userId) continue;
    const institution = resolveInstitution(token);
    if (!institution) continue;
    if (institutionFilter && institution.toLowerCase() !== institutionFilter.toLowerCase()) continue;
    const key = `${token.userId}::${institution}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(token);
  }

  const duplicateGroups = [...groups.entries()].filter(([, group]) => group.length > 1);
  if (duplicateGroups.length === 0) {
    console.log('✅ No user has more than one active connection to the same institution.');
    return;
  }

  console.log(`📊 Found ${duplicateGroups.length} (user, institution) pair(s) with multiple active connections\n`);

  const affectedUserIds = new Set<string>();
  let totalAccountsRemoved = 0;
  let totalTransactionsMigrated = 0;
  let totalSkipped = 0;

  for (const [key, group] of duplicateGroups) {
    const [userId, institution] = key.split('::');
    console.log(`🏦 ${institution} (user ${userId}) - ${group.length} active connections`);

    // Keep the most recently refreshed connection, falling back to the newest.
    const sorted = [...group].sort((a, b) => {
      const aTime = (a.lastRefreshed ?? a.createdAt).getTime();
      const bTime = (b.lastRefreshed ?? b.createdAt).getTime();
      return bTime - aTime;
    });
    const keeper = sorted[0];
    console.log(`   ✅ Keeping ${keeper.id} (item ${keeper.itemId}, ${keeper.accounts.length} accounts, last refreshed ${(keeper.lastRefreshed ?? keeper.createdAt).toISOString()})`);

    if (!apply) {
      // Preview exactly what the apply run would decide, using the same matcher.
      for (const candidate of sorted.slice(1)) {
        const previous = candidate.accounts.filter(a => (a.institution ?? institution) === institution);
        const result = matchAccountsAcrossConnections(previous as any, keeper.accounts as any);
        if (result.fullyCovered) {
          const txCount = await prisma.transaction.count({
            where: { accountId: { in: previous.map(a => a.id) } }
          });
          const strategies = [...new Set(result.matches.map(m => m.strategy))].join(', ');
          console.log(`   🔻 Would supersede ${candidate.id} (item ${candidate.itemId}): remove ${result.matches.length} account(s), migrate ${txCount} transaction(s) [matched by ${strategies}]`);
          for (const match of result.matches) {
            console.log(`        "${match.previous.name}" → "${match.current.name}" (${match.strategy})`);
          }
          totalAccountsRemoved += result.matches.length;
          totalTransactionsMigrated += txCount;
        } else {
          console.log(`   ⏭️  Would KEEP ${candidate.id} (item ${candidate.itemId}) - ${result.unmatchedPrevious.length}/${previous.length} accounts unmatched: ${result.unmatchedPrevious.map(a => a.name).join(', ')}`);
          totalSkipped++;
        }
      }
      console.log('');
      continue;
    }

    const report = await supersedeDuplicateInstitutionConnections({
      prisma: prisma as any,
      userId,
      keepTokenId: keeper.id,
      institutionName: institution,
      log: message => console.log(message)
    });

    for (const superseded of report.superseded) {
      totalAccountsRemoved += superseded.accountsRemoved;
      totalTransactionsMigrated += superseded.transactionsMigrated;
      affectedUserIds.add(userId);
    }
    totalSkipped += report.skipped.length;
    console.log('');
  }

  if (apply && affectedUserIds.size > 0) {
    console.log(`🔄 Refreshing financial caches for ${affectedUserIds.size} affected user(s)...`);
    for (const userId of affectedUserIds) {
      try {
        await SummaryCacheService.computeForUser(userId, { categorize: false });
        console.log(`   ✅ Refreshed caches for user ${userId}`);
      } catch (err) {
        console.error(`   ❌ Failed to refresh caches for user ${userId}:`, (err as Error).message);
      }
    }
    console.log('');
  }

  console.log(apply ? '✅ Cleanup complete!' : '✅ Dry run complete!');
  console.log(`   - ${apply ? 'Removed' : 'Would remove'} ${totalAccountsRemoved} duplicate account(s)`);
  console.log(`   - ${apply ? 'Migrated' : 'Would migrate'} ${totalTransactionsMigrated} transaction(s)`);
  console.log(`   - ${totalSkipped} connection(s) left active (separate logins at the same institution)`);
  if (!apply) console.log('\nRe-run with --apply to write these changes.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async error => {
    console.error('\n❌ Script failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
