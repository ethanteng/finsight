import { getPrismaClient } from '../../prisma-client';
import { isPublicInstitution } from './eligibility';
import { getStatus } from './credential-store';

/**
 * Show the direct Public accounts in the connections list, in place of
 * SnapTrade's copies of them.
 *
 * `GET /snaptrade/accounts` asks SnapTrade what accounts a user has, which is the
 * right question everywhere except Public: SnapTrade's holdings sync for Public's
 * managed-yield products never completes, so it reports those accounts with no
 * balance at all. Meanwhile the direct feed has a real figure for them, and the
 * finances page — which reads the snapshot — shows it. Left alone, the two pages
 * disagree about the same account, and the page a user goes to in order to check
 * their connections is the one showing the broken number.
 *
 * The substitution mirrors supersedeSnapTradePublicAccounts(), which does the
 * same thing to the financial data used for totals. This is the display-side
 * counterpart: that one prevents double counting, this one prevents a stale
 * second opinion being the only thing the user sees.
 *
 * Read from the snapshot rather than calling Public. This renders a settings
 * page, and the snapshot is the same source the finances page draws from — so
 * the two agree by construction, and no provider request is billed to draw a
 * list. It also means an account only appears here once ingestion has actually
 * seen it.
 */

export interface ConnectionListAccount {
  id?: string;
  name?: string;
  type?: string;
  subtype?: string;
  institution?: string | null;
  balance?: number | null;
  [key: string]: unknown;
}

export interface DirectPublicSubstitution {
  accounts: ConnectionListAccount[];
  /** SnapTrade account ids removed, for logging and provenance. */
  supersededAccountIds: string[];
}

function accountKey(account: ConnectionListAccount): string {
  return String(account?.id || account?.account_id || '');
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toConnectionListAccount(snapshotAccount: any): ConnectionListAccount {
  return {
    id: String(snapshotAccount?.id || snapshotAccount?.account_id || ''),
    name: String(snapshotAccount?.name || 'Public Account'),
    type: String(snapshotAccount?.type || 'investment'),
    subtype: snapshotAccount?.subtype ? String(snapshotAccount.subtype) : undefined,
    institution: snapshotAccount?.institution ? String(snapshotAccount.institution) : 'Public',
    // Absent rather than null when Public reports no value — High Yield Cash has
    // no endpoint that exposes one. The card renders a balance only for a number,
    // so an unknown value shows as unknown instead of as a confident zero.
    balance: finiteNumber(snapshotAccount?.balance?.current),
    // Marks these as not belonging to a SnapTrade authorization. Without it the
    // list applies SnapTrade's connection health to them, and a user whose
    // SnapTrade link is broken would see the direct feed — which is working, and
    // is the reason these accounts have a balance at all — reported as failing.
    source: 'public',
    // A sum of tax lots is a floor, not a total the institution reported: it
    // cannot see uninvested cash. Passed through so the card can say so, the same
    // caveat the finances page carries.
    balanceDerivedFromPositions: snapshotAccount?.balanceDerivedFromPositions === true,
  };
}

export async function substituteDirectPublicAccounts(
  userId: string,
  snapTradeAccounts: ConnectionListAccount[],
): Promise<DirectPublicSubstitution> {
  if (!Array.isArray(snapTradeAccounts)) {
    return { accounts: snapTradeAccounts, supersededAccountIds: [] };
  }
  // An empty list is not a reason to stop: a user who has unlinked every
  // brokerage from SnapTrade but kept the direct secret still owns the Public
  // accounts, and they are then the only accounts there are to show.

  const prisma = getPrismaClient();
  const [status, snapshot] = await Promise.all([
    getStatus(userId),
    prisma.financialSummarySnapshot.findFirst({
      where: { userId },
      select: { accounts: true },
    }),
  ]);

  // No direct credential means SnapTrade is still the only source for Public.
  if (!status.configured) {
    return { accounts: snapTradeAccounts, supersededAccountIds: [] };
  }

  // A credential with a current error is not a working direct feed. Auth/list
  // failures set lastError and observed:false, but SummaryCacheService can retain
  // the prior snapshot (with source:'public' rows) for up to 48 hours. Substituting
  // from that retained JSON would hide freshly fetched SnapTrade Public rows and
  // present stale balances under a healthy "Read directly from Public" checkmark —
  // the same class of failure supersedeSnapTradePublicAccounts avoids by requiring
  // hasDirectPublicData (observed:true) rather than merely a configured secret.
  if (status.lastError) {
    return { accounts: snapTradeAccounts, supersededAccountIds: [] };
  }

  const snapshotAccounts = Array.isArray(snapshot?.accounts) ? (snapshot!.accounts as any[]) : [];
  const directAccounts = snapshotAccounts
    .filter(account => account?.source === 'public')
    .map(toConnectionListAccount)
    .filter(account => accountKey(account).length > 0);

  // A configured secret that has not yet produced any account is not a reason to
  // hide SnapTrade's copies: the credential may be new, or the first fetch has not
  // landed. Removing them here would leave the user looking at no Public accounts
  // at all, which is worse than the stale balance this replaces.
  if (directAccounts.length === 0) {
    return { accounts: snapTradeAccounts, supersededAccountIds: [] };
  }

  const supersededAccountIds = snapTradeAccounts
    .filter(account => isPublicInstitution(account?.institution))
    .map(accountKey)
    .filter(id => id.length > 0);

  // Substitute in place rather than appending, so the direct accounts land where
  // SnapTrade's sat and the list does not reshuffle when the feed turns on.
  const superseded = new Set(supersededAccountIds);
  const accounts: ConnectionListAccount[] = [];
  let inserted = false;
  for (const account of snapTradeAccounts) {
    if (!superseded.has(accountKey(account))) {
      accounts.push(account);
      continue;
    }
    if (!inserted) {
      accounts.push(...directAccounts);
      inserted = true;
    }
  }
  // The user removed the SnapTrade link but kept the direct feed, so there was no
  // Public row to substitute for. The accounts are still theirs; show them.
  if (!inserted) accounts.push(...directAccounts);

  return { accounts, supersededAccountIds };
}
