/**
 * Home Value Refresh Service
 * Background job to periodically refresh home values for all users
 */

import { PrismaClient } from '@prisma/client';
import { ProfileManager } from '../profile/manager';

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
  | 'failed';

export class HomeValueRefreshService {
  /**
   * Refresh home values for all users who have home data
   * This should be called periodically (e.g., monthly) via a cron job
   */
  async refreshAllHomeValues(): Promise<{
    total: number;
    successful: number;
    failed: number;
    /**
     * Users whose stored value actually changed. Callers must recompute these
     * users' snapshots: the finances page reads the persisted snapshot and
     * ignores the live profile once meta.home exists, so a profile-only
     * update would never reach the page.
     */
    refreshedUserIds: string[];
    errors: Array<{ userId: string; error: string }>;
  }> {
    console.log('HomeValueRefresh: Starting home value refresh for all users');
    const prisma = new PrismaClient();
    
    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      refreshedUserIds: [] as string[],
      errors: [] as Array<{ userId: string; error: string }>
    };

    try {
      // Get all user profiles that have home data
      const profiles = await prisma.userProfile.findMany({
        where: {
          userId: { not: null },
          isActive: true
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

          if (outcome === 'failed') {
            results.failed++;
            results.errors.push({
              userId: profile.userId,
              error: 'Failed to fetch updated home value from RentCast'
            });
          } else {
            results.successful++;
            if (outcome === 'refreshed') {
              results.refreshedUserIds.push(profile.userId);
            }
          }

          // Only pace requests that actually reached RentCast.
          if (outcome === 'refreshed' || outcome === 'failed') {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

        } catch (error) {
          results.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push({
            userId: profile.userId,
            error: errorMessage
          });
          console.error(`HomeValueRefresh: Error refreshing home value for user ${profile.userId}:`, error);
        }
      }

      console.log('HomeValueRefresh: Completed home value refresh', {
        total: results.total,
        successful: results.successful,
        failed: results.failed,
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

      console.error(`HomeValueRefresh: Failed to refresh home value for user ${userId}`);
      return 'failed';

    } catch (error) {
      console.error(`HomeValueRefresh: Error refreshing home value for user ${userId}:`, error);
      return 'failed';
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
      failed: results.failed
    });

    if (results.errors.length > 0) {
      console.log('Errors encountered:', results.errors);
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
