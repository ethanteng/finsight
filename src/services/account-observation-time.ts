/**
 * When we last actually observed an account at the provider.
 *
 * `balanceLastFetched` is written every time a balance is pulled; `lastSynced`
 * is written by the transaction sync. Balance is the better signal — it is
 * refreshed for every account type, including investment accounts that may go
 * long stretches without a transaction — so it wins, with `lastSynced` as the
 * fallback for a record that predates balance tracking.
 *
 * This is the same rule already applied in `plaid-connection-supersede.ts`,
 * `financial-source-persistence.ts` and `account-closure-service.ts`; those
 * inline it, and are worth moving onto this helper separately.
 *
 * Deliberately NOT `AccessToken.lastRefreshed`. Despite the name, that column is
 * written in exactly one place — the `exchange_public_token` handler — so it
 * records when a connection was linked or re-linked, never when data was last
 * pulled through it. Reporting it as freshness told users their balances were a
 * year old when they were hours old.
 */

interface ObservableAccount {
  balanceLastFetched?: Date | null;
  lastSynced?: Date | null;
}

export function accountObservedAt(account: ObservableAccount): Date | null {
  return account.balanceLastFetched ?? account.lastSynced ?? null;
}

/**
 * The most recent observation across a connection's accounts, or null when none
 * has ever been observed.
 *
 * The newest wins rather than the oldest: this answers "when did we last hear
 * from this bank", which is what a connection-level timestamp means. An account
 * that individually lags is a per-account concern, and the account rows carry
 * their own "as of" for that.
 */
export function latestObservedAt(accounts: ReadonlyArray<ObservableAccount>): Date | null {
  let latest: Date | null = null;
  for (const account of accounts) {
    const observed = accountObservedAt(account);
    if (observed && (!latest || observed > latest)) latest = observed;
  }
  return latest;
}
