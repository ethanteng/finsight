/**
 * Home Value Refresh Service
 * Background job to periodically refresh home values for all users
 */

import { PrismaClient } from '@prisma/client';
import { ProfileManager } from '../profile/manager';

export class HomeValueRefreshService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Refresh home values for all users who have home data
   * This should be called periodically (e.g., monthly) via a cron job
   */
  async refreshAllHomeValues(): Promise<{
    total: number;
    successful: number;
    failed: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    console.log('HomeValueRefresh: Starting home value refresh for all users');
    
    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      errors: [] as Array<{ userId: string; error: string }>
    };

    try {
      // Get all user profiles that have home data
      const profiles = await this.prisma.userProfile.findMany({
        where: {
          userId: { not: null },
          isActive: true
        },
        include: {
          encrypted_profile_data: true
        }
      });

      console.log(`HomeValueRefresh: Found ${profiles.length} user profiles to check`);

      const profileManager = new ProfileManager();

      for (const profile of profiles) {
        if (!profile.userId) continue;

        try {
          // Get decrypted profile text
          const profileText = await profileManager.getOriginalProfile(profile.userId);
          
          // Check if profile has home data
          const homeData = profileManager.extractHomeData(profileText);
          
          if (!homeData.address) {
            // Skip users without home data
            continue;
          }

          results.total++;
          console.log(`HomeValueRefresh: Refreshing home value for user ${profile.userId}, address: ${homeData.address}`);

          // Check if last update was recent (within 25 days)
          if (homeData.lastUpdated) {
            const daysSinceUpdate = (Date.now() - homeData.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceUpdate < 25) {
              console.log(`HomeValueRefresh: Skipping user ${profile.userId} - last updated ${Math.floor(daysSinceUpdate)} days ago`);
              results.successful++;
              continue;
            }
          }

          // Refresh home value from RentCast
          const updatedValue = await profileManager.updateHomeValue(profile.userId, homeData.address);

          if (updatedValue) {
            results.successful++;
            console.log(`HomeValueRefresh: Successfully refreshed home value for user ${profile.userId}: $${updatedValue}`);
          } else {
            results.failed++;
            results.errors.push({
              userId: profile.userId,
              error: 'Failed to fetch updated home value from RentCast'
            });
            console.error(`HomeValueRefresh: Failed to refresh home value for user ${profile.userId}`);
          }

          // Add a small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));

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
      await this.prisma.$disconnect();
    }
  }

  /**
   * Refresh home value for a specific user
   * @param userId - User ID to refresh
   */
  async refreshUserHomeValue(userId: string): Promise<boolean> {
    console.log(`HomeValueRefresh: Refreshing home value for user ${userId}`);

    try {
      const profileManager = new ProfileManager();
      
      const profileText = await profileManager.getOriginalProfile(userId);
      const homeData = profileManager.extractHomeData(profileText);
      
      if (!homeData.address) {
        console.log(`HomeValueRefresh: User ${userId} has no home data`);
        return false;
      }

      const updatedValue = await profileManager.updateHomeValue(userId, homeData.address);

      if (updatedValue) {
        console.log(`HomeValueRefresh: Successfully refreshed home value for user ${userId}: $${updatedValue}`);
        return true;
      } else {
        console.error(`HomeValueRefresh: Failed to refresh home value for user ${userId}`);
        return false;
      }

    } catch (error) {
      console.error(`HomeValueRefresh: Error refreshing home value for user ${userId}:`, error);
      return false;
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

