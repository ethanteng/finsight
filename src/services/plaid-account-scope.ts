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
