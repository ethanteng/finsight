/**
 * Home Value Refresh Service
 * Background job to periodically refresh home values for all users
 */

import { PrismaClient } from '@prisma/client';
import { ProfileManager } from '../profile/manager';
import { refreshEligibleSubscriptionWhere } from './subscription-refresh-eligibility';

/**
 * RentCast re-estimates slowly, so a value younger than this is not worth
 * spending an API call on. Kept below the 30-day staleness window so a value
 * that has gone stale is always eligible to be refreshed.
 */
export const HOME_VALUE_MIN_REFRESH_AGE_MS = 25 * 24 * 60 * 60 * 1000;

export type HomeValueRefreshOutcome =
  | 'refreshed'
  | 'skipped-manual-override'
  | 'skipped-recent'
  | 'skipped-no-address'
  /** RentCast answered and has no usable valuation for this address. Permanent
   *  for that address, so it must not be read as the integration being down. */
  | 'failed-address'
  /** The valuation could not be attempted: missing key, auth, quota, outage,
   *  or a failure persisting the result. Someone needs to act on this. */
  | 'failed-provider';

export interface HomeValueRefreshFailure {
  userId: string;
  error: string;
  kind: 'address' | 'provider';
}

export class HomeValueRefreshService {
  /**
   * Refresh home values for all users who have home data
   * This should be called periodically (e.g., monthly) via a cron job
   */
  async refreshAllHomeValues(): Promise<{
    total: number;
    successful: number;
    /** unvaluableAddresses + providerFailures, kept for callers that only log a total. */
    failed: number;
    /** Addresses RentCast has no usable valuation for. Expected to recur. */
    unvaluableAddresses: number;
    /** Users whose valuation could not be attempted. Actionable. */
    providerFailures: number;
    /**
     * Users whose stored value actually changed. Callers must recompute these
     * users' snapshots: the finances page reads the persisted snapshot and
     * ignores the live profile once meta.home exists, so a profile-only
     * update would never reach the page.
     */
    refreshedUserIds: string[];
    errors: HomeValueRefreshFailure[];
  }> {
    console.log('HomeValueRefresh: Starting home value refresh for all users');
    const prisma = new PrismaClient();
    
    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      unvaluableAddresses: 0,
      providerFailures: 0,
      refreshedUserIds: [] as string[],
      errors: [] as HomeValueRefreshFailure[]
    };

    try {
      // Get all user profiles that have home data, for users still entitled to
      // a refresh. A canceled subscriber keeps their profile and its home
      // address, so without the subscription clause this would keep paying
      // RentCast to re-value the home of someone who can no longer sign in.
      const profiles = await prisma.userProfile.findMany({
        where: {
          userId: { not: null },
          isActive: true,
          user: { is: refreshEligibleSubscriptionWhere() }
        },
        select: { userId: true }
      });

      console.log(`HomeValueRefresh: Found ${profiles.length} user profiles to check`);

      for (const profile of profiles) {
        if (!profile.userId) continue;

        try {
          // Single per-user path, so the batch job and an on-demand refresh
          // apply the same manual-override and freshness rules.
          const outcome = await this.refreshUserHomeValue(profile.userId);

          if (outcome === 'skipped-no-address') continue;

          results.total++;

          if (outcome === 'failed-address' || outcome === 'failed-provider') {
            results.failed++;
            if (outcome === 'failed-address') {
              results.unvaluableAddresses++;
              results.errors.push({
                userId: profile.userId,
                error: 'RentCast has no usable valuation for this address',
                kind: 'address'
              });
            } else {
              results.providerFailures++;
              results.errors.push({
                userId: profile.userId,
                error: 'Could not fetch an updated home value from RentCast',
                kind: 'provider'
              });
            }
          } else {
            results.successful++;
            if (outcome === 'refreshed') {
              results.refreshedUserIds.push(profile.userId);
            }
          }

          // Only pace requests that actually reached RentCast.
          if (outcome !== 'skipped-manual-override' && outcome !== 'skipped-recent') {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

        } catch (error) {
          // refreshUserHomeValue already absorbs its own failures, so reaching
          // here means something outside it broke. Treat that as actionable.
          results.failed++;
          results.providerFailures++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push({
            userId: profile.userId,
            error: errorMessage,
            kind: 'provider'
          });
          console.error(`HomeValueRefresh: Error refreshing home value for user ${profile.userId}:`, error);
        }
      }

      console.log('HomeValueRefresh: Completed home value refresh', {
        total: results.total,
        successful: results.successful,
        failed: results.failed,
        unvaluableAddresses: results.unvaluableAddresses,
        providerFailures: results.providerFailures,
        errorCount: results.errors.length
      });

      return results;

    } catch (error) {
      console.error('HomeValueRefresh: Fatal error during refresh process:', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Refresh home value for a specific user
   * @param userId - User ID to refresh
   */
  async refreshUserHomeValue(
    userId: string,
    options: { minAgeMs?: number } = {}
  ): Promise<HomeValueRefreshOutcome> {
    const minAgeMs = options.minAgeMs ?? HOME_VALUE_MIN_REFRESH_AGE_MS;

    try {
      const profileManager = new ProfileManager();

      const profileText = await profileManager.getOriginalProfile(userId);
      const homeData = profileManager.extractHomeData(profileText);

      if (!homeData.address) {
        console.log(`HomeValueRefresh: User ${userId} has no home data`);
        return 'skipped-no-address';
      }

      // A manual override is the user's own number. Overwriting it with a
      // provider estimate would silently discard what they entered.
      if (homeData.isManualOverride) {
        console.log(`HomeValueRefresh: User ${userId} has a manual home value override - leaving it untouched`);
        return 'skipped-manual-override';
      }

      if (homeData.lastUpdated && Date.now() - homeData.lastUpdated.getTime() < minAgeMs) {
        const days = Math.floor((Date.now() - homeData.lastUpdated.getTime()) / (24 * 60 * 60 * 1000));
        console.log(`HomeValueRefresh: Skipping user ${userId} - value is only ${days} day(s) old`);
        return 'skipped-recent';
      }

      console.log(`HomeValueRefresh: Refreshing home value for user ${userId}`);
      const updatedValue = await profileManager.updateHomeValue(userId, homeData.address);

      if (updatedValue) {
        console.log(`HomeValueRefresh: Successfully refreshed home value for user ${userId}: $${updatedValue}`);
        return 'refreshed';
      }

      // updateHomeValue returns null only when RentCast has nothing usable for
      // this address; anything it could not attempt is thrown and caught below.
      console.warn(`HomeValueRefresh: No usable valuation for user ${userId}'s address`);
      return 'failed-address';

    } catch (error) {
      console.error(`HomeValueRefresh: Could not refresh home value for user ${userId}:`, error);
      return 'failed-provider';
    }
  }
}

/**
 * Standalone function to run home value refresh
 * Can be called from a cron job or manually
 */
export async function runHomeValueRefresh(): Promise<void> {
  console.log('Starting scheduled home value refresh...');
  
  const service = new HomeValueRefreshService();
  
  try {
    const results = await service.refreshAllHomeValues();
    
    console.log('Home value refresh completed:', {
      total: results.total,
      successful: results.successful,
      failed: results.failed,
      unvaluableAddresses: results.unvaluableAddresses,
      providerFailures: results.providerFailures
    });

    if (results.errors.length > 0) {
      console.log('Errors encountered:', results.errors);
    }

    // Same rule the scheduled cron applies: an address RentCast cannot value is
    // reported, an integration we could not reach fails the run. Without this a
    // standalone invocation exits 0 through a total outage.
    if (results.providerFailures > 0) {
      throw new Error(
        `Home value refresh could not reach RentCast for ${results.providerFailures}/${results.total} eligible user(s)`
      );
    }
  } catch (error) {
    console.error('Home value refresh failed:', error);
    throw error;
  }
}

// If this script is run directly, execute the refresh
if (require.main === module) {
  runHomeValueRefresh()
    .then(() => {
      console.log('Home value refresh completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Home value refresh failed:', error);
      process.exit(1);
    });
}
