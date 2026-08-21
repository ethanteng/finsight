import type { Prisma } from '@prisma/client';

/**
 * Delete transactions together with the category overrides that point at them.
 *
 * `TransactionCategoryOverride.transactionId` holds a provider transaction id
 * (`Transaction.plaidTransactionId`) as a plain string, with no foreign key and
 * no cascade — its only cascade is from `User`. So deleting a transaction leaves
 * its override behind, keyed to an id nothing resolves any more. On the paths
 * that delete the user outright that is harmless, but every disconnect path
 * keeps the user, so the rows accumulate for the life of the account.
 *
 * The overrides have to be resolved *through* the transactions before those are
 * deleted, since they are keyed by transaction id rather than by account.
 */

export interface TransactionCleanupResult {
  transactions: number;
  categoryOverrides: number;
}

/**
 * `where` selects the transactions to remove; `userId` scopes the overrides, so
 * one user's override can never be removed by another user's disconnect even if
 * a provider transaction id were ever to collide.
 */
export async function deleteTransactionsWithOverrides(
  client: Prisma.TransactionClient,
  userId: string,
  where: Prisma.TransactionWhereInput,
): Promise<TransactionCleanupResult> {
  const doomedTransactions = await client.transaction.findMany({
    where,
    select: { plaidTransactionId: true },
  });
  const categoryOverrides = await client.transactionCategoryOverride.deleteMany({
    where: {
      userId,
      transactionId: { in: doomedTransactions.map(transaction => transaction.plaidTransactionId) },
    },
  });
  const transactions = await client.transaction.deleteMany({ where });
  return { transactions: transactions.count, categoryOverrides: categoryOverrides.count };
}
