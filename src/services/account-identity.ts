/**
 * Stable provider identity for account records inside one user's data set.
 * Mutable display fields and balances must never participate in this key.
 */
export function financialAccountIdentityKey(account: any): string | null {
  const source = String(account?.source || 'unknown');
  const accountId = String(
    account?.account_id || account?.plaidAccountId || account?.persistentAccountId || ''
  ).trim();
  if (!accountId) return null;

  const persistentId = String(account?.persistentAccountId || '').trim();
  if (source === 'plaid' && persistentId && persistentId !== accountId) {
    return `plaid:persistent:${persistentId}`;
  }

  const connectionId = String(account?.sourceConnectionId || 'legacy').trim();
  return `${source}:${connectionId}:${accountId}`;
}

export function accountSnapshotTimestamp(account: any): number | null {
  const raw =
    account?.snapshotTimestamp ||
    account?.lastSyncedAt ||
    account?.persistedAsOf ||
    account?.lastSynced ||
    account?.updatedAt ||
    null;
  if (!raw) return null;
  if (raw instanceof Date) return raw.getTime();
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Missing timestamps are not guessed from balance magnitude. */
export function isNewerAccountSnapshot(existing: any, candidate: any): boolean {
  const existingTimestamp = accountSnapshotTimestamp(existing);
  const candidateTimestamp = accountSnapshotTimestamp(candidate);
  return (
    candidateTimestamp !== null &&
    (existingTimestamp === null || candidateTimestamp > existingTimestamp)
  );
}
