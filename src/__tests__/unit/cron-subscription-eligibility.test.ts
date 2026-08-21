import { describe, expect, it } from '@jest/globals';
import {
  REFRESH_ELIGIBLE_SUBSCRIPTION_STATUSES,
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
    // subscriptionAuthMiddleware still grants past_due users limited access,
    // so they can sign in and must not be shown frozen figures.
    expect(isRefreshEligibleSubscriptionStatus('past_due')).toBe(true);
  });

  // 'inactive' is what auth/routes.ts stamps on every new user, so it is the
  // permanent status of an admin-created account that never touches Stripe.
  // Treating it as "not a customer" would silently stop refreshing them.
  it('keeps admin-created accounts eligible', () => {
    expect(isRefreshEligibleSubscriptionStatus('inactive')).toBe(true);
  });

  // An allowlist, not a `!== 'canceled'` denylist: a subscription that never
  // started paying or has stopped is not owed nightly provider spend either.
  it('excludes subscriptions that never started paying or have stopped', () => {
    expect(isRefreshEligibleSubscriptionStatus('unpaid')).toBe(false);
    expect(isRefreshEligibleSubscriptionStatus('incomplete')).toBe(false);
    expect(isRefreshEligibleSubscriptionStatus('incomplete_expired')).toBe(false);
    expect(isRefreshEligibleSubscriptionStatus('paused')).toBe(false);
  });

  // A user row read without selecting subscriptionStatus, or a status Stripe
  // adds later, must not fall through as eligible.
  it('treats an unknown or missing status as ineligible', () => {
    expect(isRefreshEligibleSubscriptionStatus(null)).toBe(false);
    expect(isRefreshEligibleSubscriptionStatus(undefined)).toBe(false);
    expect(isRefreshEligibleSubscriptionStatus('something_new')).toBe(false);
  });

  it('exposes the same statuses as a Prisma where fragment', () => {
    expect(refreshEligibleSubscriptionWhere()).toEqual({
      subscriptionStatus: { in: [...REFRESH_ELIGIBLE_SUBSCRIPTION_STATUSES] },
    });
  });

  it('returns a fresh fragment per call so callers cannot mutate a shared one', () => {
    const first = refreshEligibleSubscriptionWhere();
    const second = refreshEligibleSubscriptionWhere();

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    // Spread into a larger `where` by several callers; a shared array would let
    // one caller's mutation silently change every other cron's population.
    expect(first.subscriptionStatus.in).not.toBe(second.subscriptionStatus.in);
  });
});
