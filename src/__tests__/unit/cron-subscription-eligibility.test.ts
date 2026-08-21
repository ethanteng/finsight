import { describe, expect, it } from '@jest/globals';
import {
  ACCESS_BLOCKING_SUBSCRIPTION_STATUSES,
  blocksProductAccess,
  isRefreshEligibleSubscriptionStatus,
  refreshEligibleSubscriptionWhere,
} from '../../services/subscription-refresh-eligibility';

describe('scheduled refresh subscription eligibility', () => {
  // The whole point of the predicate: a canceled customer stops costing Plaid,
  // SnapTrade and RentCast calls. None of the request-time gates
  // (authenticateUser, subscriptionAuthMiddleware) run on a cron, so this is
  // the only thing standing between cancellation and a nightly provider bill.
  it('excludes a canceled subscriber', () => {
    expect(isRefreshEligibleSubscriptionStatus('canceled')).toBe(false);
  });

  it('keeps paying, trialing and grace-period subscribers eligible', () => {
    expect(isRefreshEligibleSubscriptionStatus('active')).toBe(true);
    expect(isRefreshEligibleSubscriptionStatus('trialing')).toBe(true);
    // past_due users can still sign in, so they must not be shown frozen
    // figures while Stripe retries their payment.
    expect(isRefreshEligibleSubscriptionStatus('past_due')).toBe(true);
  });

  // 'inactive' is what auth/routes.ts stamps on every new user, so it is the
  // permanent status of an admin-created account that never touches Stripe.
  // Treating it as "not a customer" would silently stop refreshing them.
  it('keeps admin-created accounts eligible', () => {
    expect(isRefreshEligibleSubscriptionStatus('inactive')).toBe(true);
  });

  // These are not paying, but authenticateUser still admits them, so they can
  // sign in. Excluding them from the refresh would leave a logged-in user
  // reading transactions, balances and a home value that silently stopped
  // updating -- strictly worse than spending the provider call.
  it('keeps every status that authentication still admits', () => {
    expect(isRefreshEligibleSubscriptionStatus('unpaid')).toBe(true);
    expect(isRefreshEligibleSubscriptionStatus('incomplete')).toBe(true);
    expect(isRefreshEligibleSubscriptionStatus('incomplete_expired')).toBe(true);
    expect(isRefreshEligibleSubscriptionStatus('paused')).toBe(true);
  });

  // The invariant the whole module exists to hold: nobody may be admitted to
  // the product and denied a refresh. Anything blocked must be ineligible and
  // anything ineligible must be blocked.
  it('is the exact complement of what blocks product access', () => {
    const statuses = [
      'active', 'trialing', 'past_due', 'inactive', 'canceled',
      'unpaid', 'incomplete', 'incomplete_expired', 'paused', 'something_new',
    ];

    for (const status of statuses) {
      expect(isRefreshEligibleSubscriptionStatus(status)).toBe(!blocksProductAccess(status));
    }
  });

  // A status Stripe adds later defaults to "still a customer" on both sides at
  // once, so it keeps refreshing *and* keeps its access. Failing open here is
  // only safe because it fails open there too.
  it('treats an unknown or missing status as still eligible', () => {
    expect(isRefreshEligibleSubscriptionStatus(null)).toBe(true);
    expect(isRefreshEligibleSubscriptionStatus(undefined)).toBe(true);
    expect(isRefreshEligibleSubscriptionStatus('something_new')).toBe(true);
    expect(blocksProductAccess('something_new')).toBe(false);
  });

  it('excludes exactly the access-blocking statuses as a Prisma where fragment', () => {
    expect(refreshEligibleSubscriptionWhere()).toEqual({
      subscriptionStatus: { notIn: [...ACCESS_BLOCKING_SUBSCRIPTION_STATUSES] },
    });
  });

  it('returns a fresh fragment per call so callers cannot mutate a shared one', () => {
    const first = refreshEligibleSubscriptionWhere();
    const second = refreshEligibleSubscriptionWhere();

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    // Spread into a larger `where` by several callers; a shared array would let
    // one caller's mutation silently change every other cron's population.
    expect(first.subscriptionStatus.notIn).not.toBe(second.subscriptionStatus.notIn);
  });
});
