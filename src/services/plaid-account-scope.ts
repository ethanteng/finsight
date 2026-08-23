/**
 * Which accounts belong to the Plaid-scoped views.
 *
 * `/plaid/all-accounts` backs the profile page's "Your Connected Accounts
 * (Plaid)" list, but it reads from the unified financial data, which carries
 * every source: Plaid, SnapTrade, manual entries, and direct Public.com reads.
 *
 * Match on the source tag each provider sets rather than on an account-ID
 * prefix. A negative "is not SnapTrade" test passes anything a later source
 * adds — that is how Public.com accounts ended up listed under Plaid.
 */
export function filterPlaidOnlyAccounts<T extends { source?: string }>(accounts: T[]): T[] {
  return accounts.filter(account => account.source === 'plaid');
}

/**
 * Account IDs are namespaced by the provider that minted them, and the Account
 * table has no source column — so for a persisted row the namespace is the only
 * thing that says where it came from.
 *
 * Keep every non-Plaid namespace in one list. They were previously tested one
 * `startsWith` at a time in the persisted loader, which is how direct Public.com
 * rows (`public-…`) came back stamped `source: 'plaid'` and turned up under
 * "Your Connected Accounts (Plaid)": the loader knew about `snaptrade-` and
 * `manual-` and nothing had taught it the third namespace existed.
 */
const NON_PLAID_ACCOUNT_ID_PREFIXES = ['snaptrade-', 'manual-', 'public-'] as const;

export function isNonPlaidAccountId(plaidAccountId: string): boolean {
  return NON_PLAID_ACCOUNT_ID_PREFIXES.some(prefix => plaidAccountId.startsWith(prefix));
}
