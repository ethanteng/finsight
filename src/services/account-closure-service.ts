import { getPrismaClient } from '../prisma-client';
import { getFinancialSnapshotForAnalysis } from './financial-snapshot-persistence';

/**
 * Closed-account detection for the accounts list on the profile page.
 *
 * Plaid stops returning an account once it is closed at the institution, so a
 * live fetch simply drops it. The canonical snapshot behind the Finances page
 * is always built from live provider data, which is why closed accounts
 * disappear from Finances on their own. The profile page is different: it is
 * allowed to serve persisted Plaid rows (see loadPersistedPlaidData), and those
 * rows stay in the database forever. That is the gap this module closes -- an
 * account the user still sees on the profile page but that the latest snapshot
 * no longer contains is reported as closed instead of silently looking active.
 *
 * The snapshot is the reference set on purpose: it is exactly what Finances
 * shows, so "closed" here always means "not counted in your Finances totals".
 */

export interface ClosureAccountLike {
  account_id?: string | null;
  id?: string | null;
  plaidAccountId?: string | null;
  persistentAccountId?: string | null;
}

export interface PersistedAccountRecord {
  plaidAccountId: string;
  persistentAccountId?: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
}

export interface AccountClosure {
  isClosed: boolean;
  /** Last time a provider refresh touched the persisted row, when known. */
  lastSeenAt: string | null;
}

export interface ResolveAccountClosuresInput {
  accounts: ClosureAccountLike[];
  /** Accounts from the latest canonical snapshot, or null when none exists. */
  snapshotAccounts: ClosureAccountLike[] | null;
  snapshotComputedAt: Date | null;
  persistedRecords: PersistedAccountRecord[];
  /**
   * True when the snapshot was built while a provider fetch was failing, so a
   * whole connection's accounts may be missing from it for reasons that have
   * nothing to do with closure.
   */
  snapshotHasProviderGap?: boolean;
}

/** Every provider-side identifier an account can be recognised by. */
function providerIds(account: ClosureAccountLike): string[] {
  return [account.account_id, account.id, account.plaidAccountId, account.persistentAccountId]
    .map(value => (value == null ? '' : String(value).trim()))
    .filter(Boolean);
}

/**
 * Pure closure resolution. Returns a map keyed by every provider id an account
 * answers to, so callers can look a result up with whichever id they hold.
 *
 * An account is only reported closed when all of the following hold, which
 * keeps a stale or missing snapshot from mislabelling a live account:
 *  - a snapshot exists (otherwise there is nothing to compare against);
 *  - that snapshot was built without a provider fetch failure, so a missing
 *    account means the provider dropped it rather than that a connection was
 *    unreachable at the time;
 *  - none of the account's provider ids appear in that snapshot;
 *  - the account has a persisted row, so it was seen by a provider at least
 *    once (manual accounts and freshly fetched rows have none);
 *  - that row predates the snapshot, so the snapshot had a chance to include
 *    it. An account linked after the last refresh is not closed, just newer
 *    than the snapshot.
 */
export function resolveAccountClosures(input: ResolveAccountClosuresInput): Map<string, AccountClosure> {
  const closures = new Map<string, AccountClosure>();
  const {
    accounts,
    snapshotAccounts,
    snapshotComputedAt,
    persistedRecords,
    snapshotHasProviderGap,
  } = input;

  const open = (account: ClosureAccountLike) => {
    for (const id of providerIds(account)) {
      closures.set(id, { isClosed: false, lastSeenAt: null });
    }
  };

  if (snapshotHasProviderGap || !snapshotAccounts || snapshotAccounts.length === 0 || !snapshotComputedAt) {
    accounts.forEach(open);
    return closures;
  }

  const snapshotIds = new Set<string>();
  for (const snapshotAccount of snapshotAccounts) {
    for (const id of providerIds(snapshotAccount)) snapshotIds.add(id);
  }

  const recordsById = new Map<string, PersistedAccountRecord>();
  for (const record of persistedRecords) {
    for (const id of providerIds(record)) recordsById.set(id, record);
  }

  for (const account of accounts) {
    const ids = providerIds(account);
    if (ids.length === 0) continue;

    if (ids.some(id => snapshotIds.has(id))) {
      open(account);
      continue;
    }

    const record = ids.map(id => recordsById.get(id)).find(Boolean);
    if (!record || record.createdAt >= snapshotComputedAt) {
      open(account);
      continue;
    }

    const closure: AccountClosure = {
      isClosed: true,
      lastSeenAt: record.lastSeenAt ? record.lastSeenAt.toISOString() : null,
    };
    for (const id of ids) closures.set(id, closure);
  }

  return closures;
}

/**
 * A snapshot records one observation per failed provider fetch. Either kind
 * means whole connections could be absent from its account list, which is
 * indistinguishable from closure by comparison alone.
 */
export function snapshotHasProviderGap(sourceObservations: unknown): boolean {
  if (!Array.isArray(sourceObservations)) return false;
  return sourceObservations.some(observation => {
    const id = String((observation as { id?: unknown })?.id || '');
    return id.startsWith('plaid:error:') || id === 'financial-data:partial';
  });
}

/**
 * Loads the snapshot and persisted rows a user's closure check needs, then
 * resolves closures for the supplied accounts.
 */
export async function getAccountClosures(
  userId: string,
  accounts: ClosureAccountLike[]
): Promise<Map<string, AccountClosure>> {
  const prisma = getPrismaClient();
  const [snapshot, records] = await Promise.all([
    getFinancialSnapshotForAnalysis(userId, { includeAccounts: true }),
    prisma.account.findMany({
      where: { userId },
      select: {
        plaidAccountId: true,
        persistentAccountId: true,
        createdAt: true,
        balanceLastFetched: true,
        lastSynced: true,
        updatedAt: true,
      },
    }),
  ]);

  const snapshotAccounts = Array.isArray(snapshot?.accounts)
    ? (snapshot!.accounts as unknown as ClosureAccountLike[])
    : null;

  return resolveAccountClosures({
    accounts,
    snapshotAccounts,
    snapshotComputedAt: snapshot?.computedAt ? new Date(snapshot.computedAt) : null,
    snapshotHasProviderGap: snapshotHasProviderGap(snapshot?.sourceObservations),
    persistedRecords: records.map(record => ({
      plaidAccountId: record.plaidAccountId,
      persistentAccountId: record.persistentAccountId,
      createdAt: record.createdAt,
      lastSeenAt: record.balanceLastFetched || record.lastSynced || record.updatedAt || null,
    })),
  });
}

/** Convenience lookup that treats an unknown account as open. */
export function closureFor(
  closures: Map<string, AccountClosure>,
  account: ClosureAccountLike
): AccountClosure {
  for (const id of providerIds(account)) {
    const closure = closures.get(id);
    if (closure) return closure;
  }
  return { isClosed: false, lastSeenAt: null };
}
