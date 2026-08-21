/**
 * When we last actually observed an account at the provider.
 *
 * `balanceLastFetched` is written every time a balance is pulled. `lastSynced`
 * is written when an account row is created, and refreshed on an existing row
 * only by `GET /profile/tokens` — a user-triggered revalidation, not a
 * background sync. Balance is the better per-account signal: it is refreshed for
 * every account type, including investment accounts that may go long stretches
 * without a transaction. So balance wins, with `lastSynced` as the fallback for
 * a record that predates balance tracking.
 *
 * Connection-level callers should also pass `AccessToken.lastTransactionSync`.
 * The scheduled transaction sync records success there, and upserts account rows
 * with `update: {}` — so it never refreshes an existing row's `lastSynced`.
 * Omitting the token's timestamp would report a connection as never or long-ago
 * updated while its transactions arrived on schedule.
 *
 * This is the same per-account rule already applied in
 * `plaid-connection-supersede.ts`, `financial-source-persistence.ts` and
 * `account-closure-service.ts`; those inline it, and are worth moving onto this
 * helper separately.
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
 * The most recent observation across a connection's accounts (and optional
 * connection-level timestamps such as `lastTransactionSync`), or null when
 * none has ever been observed.
 *
 * The newest wins rather than the oldest: this answers "when did we last hear
 * from this bank", which is what a connection-level timestamp means. An account
 * that individually lags is a per-account concern, and the account rows carry
 * their own "as of" for that.
 */
export function latestObservedAt(
  accounts: ReadonlyArray<ObservableAccount>,
  ...connectionObservedAt: Array<Date | null | undefined>
): Date | null {
  let latest: Date | null = null;
  for (const account of accounts) {
    const observed = accountObservedAt(account);
    if (observed && (!latest || observed > latest)) latest = observed;
  }
  for (const observed of connectionObservedAt) {
    if (observed && (!latest || observed > latest)) latest = observed;
  }
  return latest;
}
