/**
 * Which subscription states a scheduled data refresh is allowed to run for.
 *
 * The nightly crons talk to Prisma and the providers directly, so no
 * request-time check reaches them. Without a gate here a canceled customer
 * keeps costing Plaid, SnapTrade and RentCast calls every night for data
 * nobody can log in to see.
 *
 * Eligibility is defined as the exact complement of
 * ACCESS_BLOCKING_SUBSCRIPTION_STATUSES rather than as its own allowlist, and
 * that is the whole design. A status excluded here but admitted at login
 * produces the worst outcome available: the user signs in and reads a snapshot
 * whose transactions, balances and home value silently stopped updating, with
 * nothing on the page saying so. Refreshing a user we would not let in only
 * wastes provider calls; freezing a user we do let in shows them stale money.
 * So the two sets are derived from one list and cannot drift apart.
 *
 * To stop refreshing a status, block it in authenticateUser first -- adding it
 * below is what makes both true at once.
 */
export const ACCESS_BLOCKING_SUBSCRIPTION_STATUSES = ['canceled'] as const;

/**
 * Whether this status bars a user from the product.
 *
 * Shared with `authenticateUser` (src/auth/middleware.ts), which is the only
 * live subscription gate: `subscriptionAuthMiddleware` and its
 * requireStarterTier / requirePremiumTier / requireActiveSubscription
 * derivatives are defined but mounted on no route, and the financial endpoints
 * (auth/finances-routes.ts, /api/summaries) all use plain `requireAuth`.
 */
export function blocksProductAccess(status: string | null | undefined): boolean {
  return (ACCESS_BLOCKING_SUBSCRIPTION_STATUSES as readonly string[]).includes(status ?? '');
}

/**
 * Whether a scheduled refresh should run for a user in this subscription state.
 *
 * Deliberately true for every status that is not access-blocking, including
 * ones that are not paying: `unpaid` and `paused` subscriptions belong to users
 * with real linked accounts who can still sign in, and `incomplete` /
 * `incomplete_expired` to users mid-checkout. `inactive` matters most -- it is
 * the status every user is created with (auth/routes.ts), so it is what an
 * admin-created account that never goes through Stripe keeps permanently.
 */
export function isRefreshEligibleSubscriptionStatus(status: string | null | undefined): boolean {
  return !blocksProductAccess(status);
}

/**
 * The eligibility clause as a Prisma `where` fragment on User.
 *
 * `notIn` rather than `in` so the query keeps matching the complement above.
 * User.subscriptionStatus is non-nullable with a default, so there is no NULL
 * row for `notIn` to drop.
 *
 * Returns a fresh object per call so no caller can mutate a shared literal,
 * matching `refreshEligibleUserWhere` in summary-cache-service.
 */
export function refreshEligibleSubscriptionWhere() {
  return { subscriptionStatus: { notIn: [...ACCESS_BLOCKING_SUBSCRIPTION_STATUSES] } };
}
