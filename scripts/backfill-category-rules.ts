import * as dotenv from 'dotenv';

// A DATABASE_URL already in the environment wins, so a production run is explicit.
dotenv.config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { inferCategoryRules } from '../src/services/transaction-category-override-service';

/**
 * Backfill payee category rules from categories users chose before rules existed.
 *
 * Applying a category to a payee's other transactions used to save each one on its
 * own, with nothing for the payee, so new transactions from it were not categorized.
 * For each user, this finds the payees whose transactions the user gave one category
 * (at least two, none different; see `inferCategoryRules`) and saves that as the
 * payee's rule. Ingestion then gives new transactions from the payee the category.
 * Transactions already categorized are not touched.
 *
 * Dry run by default: it lists what it would create and writes nothing.
 *
 *   npm run backfill:category-rules                         # dry run, every user
 *   npm run backfill:category-rules -- --user you@x.com     # dry run, one user (email or id)
 *   npm run backfill:category-rules -- --apply              # create the rules
 *
 * --apply needs the transaction_category_rules migration deployed. A dry run
 * works before it, with no rules to compare against, so it can be checked first.
 * A rule a user already has is left alone, so running it twice creates nothing new.
 */

const prisma = new PrismaClient();

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const only = argument('--user');
  console.log(apply ? 'Creating category rules.' : 'Dry run: nothing will be written. Pass --apply to create these rules.');

  let userIds: string[];
  if (only) {
    const user = await prisma.user.findFirst({ where: { OR: [{ id: only }, { email: { equals: only, mode: 'insensitive' } }] }, select: { id: true } });
    if (!user) throw new Error(`No user ${only}`);
    userIds = [user.id];
  } else {
    const rows = await prisma.transactionCategoryOverride.findMany({ distinct: ['userId'], select: { userId: true } });
    userIds = rows.map(row => row.userId);
  }

  // Before the migration there is no rules table; a dry run reads that as no rules.
  const rulesTableExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('public.transaction_category_rules') IS NOT NULL AS exists`
    .then(rows => rows[0]?.exists === true);
  if (!rulesTableExists) {
    if (apply) throw new Error('The transaction_category_rules table does not exist yet. Deploy its migration, then run with --apply.');
    console.log('The rules table does not exist yet, so no user has a rule to compare against.');
  }

  let totalRules = 0;
  let totalCreated = 0;
  let totalSetAside = 0;
  for (const userId of userIds) {
    const [snapshot, overrides, existingRules] = await Promise.all([
      prisma.financialSummarySnapshot.findUnique({ where: { userId }, select: { transactions: true } }),
      prisma.transactionCategoryOverride.findMany({
        where: { userId },
        select: { transactionId: true, category: true, originalCategory: true },
      }),
      rulesTableExists
        ? prisma.transactionCategoryRule.findMany({
          where: { userId },
          select: { counterpartyKey: true, direction: true, investment: true },
        })
        : Promise.resolve([]),
    ]);
    const transactions = Array.isArray(snapshot?.transactions) ? snapshot!.transactions as any[] : [];
    const { rules, setAside } = inferCategoryRules(
      transactions,
      overrides,
      existingRules.map(rule => ({ ...rule, direction: rule.direction === 'in' ? 'in' as const : 'out' as const })),
    );
    totalSetAside += setAside;
    if (rules.length === 0) continue;
    totalRules += rules.length;

    console.log(`\nUser ${userId}: ${rules.length} rule${rules.length === 1 ? '' : 's'}`);
    for (const rule of rules) {
      const way = rule.direction === 'out' ? 'money out' : 'money in';
      // The provider's category on record didn't say which way: check these before applying.
      const check = rule.directionFrom === 'user_category' ? '  (direction read from the chosen category)' : '';
      console.log(`  ${rule.label} (${way}${rule.investment ? ', investment' : ''}) → ${rule.category.join(' › ')}  [${rule.transactionCount} transactions]${check}`);
    }
    if (apply) {
      const created = await prisma.transactionCategoryRule.createMany({
        data: rules.map(rule => ({
          userId,
          counterpartyKey: rule.counterpartyKey,
          direction: rule.direction,
          investment: rule.investment,
          label: rule.label.slice(0, 120),
          category: rule.category,
        })),
        // A rule the user made since this run read theirs stands.
        skipDuplicates: true,
      });
      totalCreated += created.count;
      console.log(`  Created ${created.count}.`);
    }
  }

  const total = apply ? totalCreated : totalRules;
  console.log(`\n${total} rule${total === 1 ? '' : 's'} ${apply ? 'created' : 'would be created'} across ${userIds.length} user${userIds.length === 1 ? '' : 's'}.`);
  if (totalSetAside > 0) {
    console.log(`${totalSetAside} categorized transaction${totalSetAside === 1 ? ' was' : 's were'} set aside: no longer in the snapshot, no payee name, or no way to tell which way the money moved.`);
  }
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
