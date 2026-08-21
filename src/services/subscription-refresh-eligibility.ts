/**
 * Which subscription states a scheduled data refresh is allowed to run for.
 *
 * The nightly crons talk to Prisma and the providers directly, so none of the
 * request-time subscription gates reach them: `authenticateUser` rejects a
 * canceled subscriber (auth/middleware.ts) and `subscriptionAuthMiddleware`
 * denies them access, but neither runs on a cron. Without this predicate a
 * canceled customer keeps costing Plaid, SnapTrade and RentCast calls every
 * night for data nobody can log in to see.
 *
 * `inactive` is eligible and is not an oversight. It is the status a user is
 * created with (auth/routes.ts sets it at registration), so it is what
 * admin-created accounts that never go through Stripe checkout keep forever.
 * Those users are real and their data must stay current, so eligibility is an
 * allowlist of states that mean "still a customer" rather than a denylist of
 * `canceled`.
 *
 * Everything absent from the list is deliberately excluded: `canceled` per the
 * above, and `unpaid` / `incomplete` / `incomplete_expired` / `paused` because
 * each of those means the subscription never started paying or has stopped.
 */
export const REFRESH_ELIGIBLE_SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  // Retained because subscriptionAuthMiddleware grants past_due users
  // grace-period access. They can still sign in, so their data must keep
  // moving or they would read stale figures during the grace period.
  'past_due',
  'inactive',
] as const;

export function isRefreshEligibleSubscriptionStatus(status: string | null | undefined): boolean {
  return (REFRESH_ELIGIBLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status ?? '');
}

/**
 * The eligibility clause as a Prisma `where` fragment on User.
 *
 * Returns a fresh object per call so no caller can mutate a shared literal,
 * matching `refreshEligibleUserWhere` in summary-cache-service.
 */
export function refreshEligibleSubscriptionWhere() {
  return { subscriptionStatus: { in: [...REFRESH_ELIGIBLE_SUBSCRIPTION_STATUSES] } };
}
