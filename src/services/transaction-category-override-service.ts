import { getPrismaClient } from '../prisma-client';

/**
 * User-chosen transaction categories.
 *
 * The category a user picks has to survive two very different reads:
 *  - the snapshot the profile UI fetches, which is a stored JSON blob and is only
 *    rebuilt by a full revision (tens of seconds), and
 *  - every later revision, which re-reads provider payloads and would otherwise
 *    hand back Plaid's category again.
 *
 * So a save does both: it patches the stored snapshot in place for an immediate
 * read-back, and `applyCategoryOverrides` re-applies the override during ingestion
 * so the choice sticks across recomputes.
 */

/** Same resolution order the snapshot builder uses, so ids line up on both sides. */
export function resolveProviderTransactionId(transaction: any): string | null {
  const id =
    transaction?.transaction_id ||
    transaction?.investment_transaction_id ||
    transaction?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function normalizeCategory(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(entry => entry !== '' && entry !== '0');
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return value
      .split(',')
      .map(entry => entry.trim())
      .filter(entry => entry !== '' && entry !== '0');
  }
  return [];
}

export async function getCategoryOverrides(userId: string): Promise<Map<string, string[]>> {
  const rows = await getPrismaClient().transactionCategoryOverride.findMany({
    where: { userId },
    select: { transactionId: true, category: true },
  });
  return new Map(rows.map(row => [row.transactionId, row.category]));
}

/**
 * Stamps user categories onto in-memory transactions. `category_source` lets the UI
 * label the chip as the user's own choice rather than the provider's.
 */
export function applyOverridesToTransactions(
  transactions: any[] | undefined,
  overrides: Map<string, string[]>
): number {
  if (!Array.isArray(transactions) || overrides.size === 0) return 0;
  let applied = 0;
  for (const transaction of transactions) {
    const id = resolveProviderTransactionId(transaction);
    if (!id) continue;
    const category = overrides.get(id);
    if (!category) continue;
    transaction.category = [...category];
    transaction.category_source = 'user';
    applied += 1;
  }
  return applied;
}

/** Re-applies stored overrides to freshly ingested provider data. */
export async function applyCategoryOverrides(userId: string, data: any): Promise<void> {
  const overrides = await getCategoryOverrides(userId);
  if (overrides.size === 0) return;
  applyOverridesToTransactions(data?.bankingTransactions, overrides);
  applyOverridesToTransactions(data?.investments?.transactions, overrides);
}

/**
 * Patches one transaction inside the stored snapshot so the next read reflects the
 * change without waiting for a revision. Scoped by `computedAt` so a revision that
 * lands mid-write wins instead of being silently overwritten with stale rows.
 *
 * Returns true when the snapshot was updated.
 */
export async function patchSnapshotTransactionCategory(
  userId: string,
  transactionId: string,
  category: string[],
  source: 'user' | 'provider'
): Promise<boolean> {
  const prisma = getPrismaClient();
  const snapshot = await prisma.financialSummarySnapshot.findUnique({
    where: { userId },
    select: { computedAt: true, transactions: true },
  });
  if (!snapshot || !Array.isArray(snapshot.transactions)) return false;

  let found = false;
  const transactions = (snapshot.transactions as any[]).map(transaction => {
    if (resolveProviderTransactionId(transaction) !== transactionId) return transaction;
    found = true;
    const patched = { ...transaction, category: [...category] };
    if (source === 'user') {
      patched.category_source = 'user';
    } else {
      delete patched.category_source;
    }
    return patched;
  });
  if (!found) return false;

  const update = await prisma.financialSummarySnapshot.updateMany({
    where: { userId, computedAt: snapshot.computedAt },
    data: { transactions: transactions as any },
  });
  return update.count > 0;
}

/**
 * Provider category currently on the transaction, used as the restore point when the
 * user later clears their override. Reads the snapshot rather than the Transaction
 * table because the snapshot is what the UI showed them.
 */
export async function findSnapshotTransactionCategory(
  userId: string,
  transactionId: string
): Promise<string[] | null> {
  const snapshot = await getPrismaClient().financialSummarySnapshot.findUnique({
    where: { userId },
    select: { transactions: true },
  });
  if (!snapshot || !Array.isArray(snapshot.transactions)) return null;

  const match = (snapshot.transactions as any[]).find(
    transaction => resolveProviderTransactionId(transaction) === transactionId
  );
  if (!match) return null;
  return normalizeCategory(match.category);
}
