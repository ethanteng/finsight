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
  /** Connection the row belongs to. Legacy rows were stored without one. */
  accessTokenId?: string | null;
  institution?: string | null;
}

/** The Plaid connections a snapshot rebuild would actually have queried. */
export interface ActiveConnections {
  ids: string[];
  /** Institution names, for legacy rows stored without a connection id. */
  institutions: string[];
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
  /**
   * Connections that were active when the snapshot was built. An account whose
   * connection is inactive was never queried, so its absence from the snapshot
   * proves nothing.
   */
  activeConnections?: ActiveConnections;
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
 *    than the snapshot;
 *  - the row's connection is still active. A snapshot rebuild only queries
 *    active connections, so an account behind an expired one is absent from
 *    the snapshot no matter what the institution did with it.
 */
export function resolveAccountClosures(input: ResolveAccountClosuresInput): Map<string, AccountClosure> {
  const closures = new Map<string, AccountClosure>();
  const {
    accounts,
    snapshotAccounts,
    snapshotComputedAt,
    persistedRecords,
    snapshotHasProviderGap,
    activeConnections,
  } = input;

  const open = (account: ClosureAccountLike) => {
    for (const id of providerIds(account)) {
      closures.set(id, { isClosed: false, lastSeenAt: null });
    }
  };

  if (snapshotHasProviderGap || snapshotAccounts === null || !snapshotComputedAt) {
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

  const activeConnectionIds = new Set((activeConnections?.ids || []).map(id => id.trim()).filter(Boolean));
  const activeInstitutions = new Set(
    (activeConnections?.institutions || []).map(name => name.trim().toLowerCase()).filter(Boolean)
  );
  // A row stored before accounts carried a connection id can still be placed by
  // institution; without either, the connection behind it is unknown.
  const hasActiveConnection = (record: PersistedAccountRecord): boolean => {
    if (record.accessTokenId) return activeConnectionIds.has(record.accessTokenId.trim());
    const institution = (record.institution || '').trim().toLowerCase();
    return institution ? activeInstitutions.has(institution) : false;
  };

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

    // A provider refresh can touch a row without rebuilding the snapshot (the
    // balance refresh endpoint does exactly that), and a sighting that recent
    // outranks the snapshot's silence.
    if (record.lastSeenAt && record.lastSeenAt > snapshotComputedAt) {
      open(account);
      continue;
    }

    if (!hasActiveConnection(record)) {
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
  const [snapshot, records, activeTokens] = await Promise.all([
    getFinancialSnapshotForAnalysis(userId, { includeAccounts: true }),
    prisma.account.findMany({
      where: { userId },
      select: {
        plaidAccountId: true,
        persistentAccountId: true,
        createdAt: true,
        balanceLastFetched: true,
        lastSynced: true,
        accessTokenId: true,
        institution: true,
      },
    }),
    // The same filter a snapshot rebuild applies when it queries Plaid.
    prisma.accessToken.findMany({
      where: { userId, isActive: true },
      select: { id: true, institutionName: true },
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
    activeConnections: {
      ids: activeTokens.map(token => token.id),
      institutions: activeTokens
        .map(token => token.institutionName)
        .filter((name): name is string => Boolean(name)),
    },
    persistedRecords: records.map(record => ({
      plaidAccountId: record.plaidAccountId,
      persistentAccountId: record.persistentAccountId,
      createdAt: record.createdAt,
      // Provider-backed timestamps only. `updatedAt` also moves for local edits
      // such as a rename, which is no evidence that the account still exists.
      lastSeenAt: record.balanceLastFetched || record.lastSynced || null,
      accessTokenId: record.accessTokenId,
      institution: record.institution,
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
