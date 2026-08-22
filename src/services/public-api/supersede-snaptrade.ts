import { isPublicInstitution } from './eligibility';

/**
 * Remove SnapTrade's Public accounts when direct Public data is present.
 *
 * Without this a user who configures a direct secret while still connected to
 * Public through SnapTrade has every Public account counted twice -- their
 * brokerage balance added to their net worth a second time, and Ask Linc
 * answering from a snapshot that doubles it. That is a far worse failure than the
 * missing balances this integration exists to fix, so the suppression runs
 * whenever direct data is present, not only when it is complete.
 *
 * Direct wins for ALL Public accounts, not merely the ones SnapTrade cannot sync.
 * Matching per-account across two providers means pairing a SnapTrade account id
 * against a Public one with no shared identifier, and a near-miss there
 * double-counts real money. Dropping the whole institution needs no matching.
 */

interface SuppressibleAccount {
  account_id?: string;
  id?: string;
  institution?: string | null;
  source?: string;
}

export interface SnapTradeDataShape {
  accounts?: SuppressibleAccount[];
  holdings?: Array<{ account_id?: string }>;
  securities?: unknown[];
  transactions?: Array<{ account_id?: string }>;
  [key: string]: unknown;
}

export interface SupersedeResult<T> {
  data: T;
  /** SnapTrade account ids dropped, for logging and provenance. */
  supersededAccountIds: string[];
}

function accountKey(account: SuppressibleAccount): string {
  return String(account.account_id || account.id || '');
}

/**
 * `hasDirectPublicData` is passed explicitly rather than inferred from a non-empty
 * account list. A pass that reached Public and legitimately found nothing must
 * still suppress: leaving SnapTrade's copies in place would show the user two
 * sources disagreeing about which accounts exist.
 */
export function supersedeSnapTradePublicAccounts<T extends SnapTradeDataShape | null | undefined>(
  snapTradeData: T,
  hasDirectPublicData: boolean,
): SupersedeResult<T> {
  if (!hasDirectPublicData || !snapTradeData || !Array.isArray(snapTradeData.accounts)) {
    return { data: snapTradeData, supersededAccountIds: [] };
  }

  const supersededAccountIds = snapTradeData.accounts
    .filter(account => isPublicInstitution(account?.institution))
    .map(accountKey)
    .filter(id => id.length > 0);

  if (supersededAccountIds.length === 0) {
    return { data: snapTradeData, supersededAccountIds: [] };
  }

  const dropped = new Set(supersededAccountIds);
  // Holdings and transactions go with their accounts. An orphaned holding still
  // counts toward investment totals, so leaving them behind would preserve the
  // double-count this function exists to prevent.
  const data = {
    ...snapTradeData,
    accounts: snapTradeData.accounts.filter(account => !dropped.has(accountKey(account))),
    holdings: Array.isArray(snapTradeData.holdings)
      ? snapTradeData.holdings.filter(holding => !dropped.has(String(holding?.account_id || '')))
      : snapTradeData.holdings,
    transactions: Array.isArray(snapTradeData.transactions)
      ? snapTradeData.transactions.filter(transaction => !dropped.has(String(transaction?.account_id || '')))
      : snapTradeData.transactions,
  } as T;

  return { data, supersededAccountIds };
}
