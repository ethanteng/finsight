import { getPrismaClient } from '../prisma-client';

interface MailerLiteSubscriber {
  email: string;
  groups: string[];
  fields: {
    active_user: number;
    current_tier: string;
    conversation_count: number;
    user_created_at: string;
    last_login_at: string;
  };
}

interface MailerLiteSyncResult {
  success: boolean;
  usersProcessed: number;
  usersSynced: number;
  errors: string[];
  timestamp: Date;
}

export class MailerLiteSyncService {
  private apiKey: string;
  private groupId: string;
  private baseUrl = 'https://connect.mailerlite.com/api';

  constructor() {
    const apiKey = process.env.MAILER_LITE_API_KEY;
    const groupId = process.env.MAILER_LITE_GROUP_ID;

    if (!apiKey) {
      throw new Error('MAILER_LITE_API_KEY environment variable is required');
    }
    if (!groupId) {
      throw new Error('MAILER_LITE_GROUP_ID environment variable is required');
    }

    this.apiKey = apiKey;
    this.groupId = groupId;
  }

  async syncAllUsers(): Promise<MailerLiteSyncResult> {
    const startTime = new Date();
    const result: MailerLiteSyncResult = {
      success: false,
      usersProcessed: 0,
      usersSynced: 0,
      errors: [],
      timestamp: startTime
    };

    try {
      console.log('🔄 Starting MailerLite user sync...');
      
      const prisma = getPrismaClient();
      
      // Get all production users (excluding demo sessions)
      const users = await prisma.user.findMany({
        where: {
          // Only include real users, not demo sessions
          email: {
            not: {
              contains: 'demo'
            }
          }
        },
        select: {
          id: true,
          email: true,
          tier: true,
          createdAt: true,
          lastLoginAt: true,
          subscriptionStatus: true,
          conversations: {
            select: {
              id: true
            }
          },
          subscriptions: {
            orderBy: {
              currentPeriodEnd: 'desc'
            },
            take: 1,
            select: {
              id: true,
              tier: true,
              status: true
            }
          }
        }
      });

      console.log(`📊 Found ${users.length} users to sync`);

      for (const user of users) {
        try {
          result.usersProcessed++;
          
          // Determine if user has active subscription using the SAME logic as admin dashboard
          // This ensures consistency between admin view and MailerLite sync
          let hasActiveSubscription = false;
          
          if (user.subscriptionStatus === 'active') {
            // Active subscription - full access
            hasActiveSubscription = true;
          } else if (user.subscriptions.length === 0 && user.subscriptionStatus === 'inactive') {
            // Admin-created user - no Stripe subscription records exist
            hasActiveSubscription = true;
          } else {
            // Check if any subscription is active
            hasActiveSubscription = user.subscriptions.some(sub => sub.status === 'active');
          }
          
          // Get current tier (from subscription or user default)
          const currentTier = hasActiveSubscription 
            ? user.subscriptions[0].tier 
            : user.tier;
          
          // Get conversation count
          const conversationCount = user.conversations.length;
          
          // Prepare subscriber data
          const subscriber: MailerLiteSubscriber = {
            email: user.email,
            groups: [this.groupId],
            fields: {
              active_user: hasActiveSubscription ? 1 : 0,
              current_tier: currentTier,
              conversation_count: conversationCount,
              user_created_at: this.formatDateForMailerLite(user.createdAt),
              last_login_at: user.lastLoginAt ? this.formatDateForMailerLite(user.lastLoginAt) : ''
            }
          };

          // Sync to MailerLite
          await this.syncSubscriber(subscriber);
          result.usersSynced++;
          
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          const errorMessage = `Failed to sync user ${user.email}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(errorMessage);
          result.errors.push(errorMessage);
        }
      }

      result.success = result.errors.length === 0;
      
      const duration = Date.now() - startTime.getTime();
      console.log(`✅ MailerLite sync completed in ${duration}ms`);
      console.log(`📊 Sync Results: ${result.usersSynced}/${result.usersProcessed} users synced, ${result.errors.length} errors`);
      
      return result;

    } catch (error) {
      const errorMessage = `MailerLite sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMessage);
      result.errors.push(errorMessage);
      return result;
    }
  }

  private formatDateForMailerLite(date: Date): string {
    // Convert Date to YYYY-MM-DD format for MailerLite
    return date.toISOString().split('T')[0];
  }

  private async syncSubscriber(subscriber: MailerLiteSubscriber): Promise<void> {
    const response = await fetch(`${this.baseUrl}/subscribers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(subscriber)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MailerLite API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Log success (201 for new subscriber, 200 for updated subscriber)
    const status = response.status;
    if (status === 201) {
      console.log(`✅ Created new subscriber: ${subscriber.email}`);
    } else if (status === 200) {
      console.log(`✅ Updated existing subscriber: ${subscriber.email}`);
    }
  }

  // Method to sync a single user by ID or email (useful for testing or manual sync)
  async syncSingleUser(userIdentifier: string): Promise<boolean> {
    try {
      const prisma = getPrismaClient();
      
      // Determine if the identifier is an email or user ID
      const isEmail = userIdentifier.includes('@');
      
      const user = await prisma.user.findFirst({
        where: isEmail ? { email: userIdentifier } : { id: userIdentifier },
        select: {
          id: true,
          email: true,
          tier: true,
          createdAt: true,
          lastLoginAt: true,
          subscriptionStatus: true,
          conversations: {
            select: {
              id: true
            }
          },
          subscriptions: {
            orderBy: {
              currentPeriodEnd: 'desc'
            },
            take: 1,
            select: {
              id: true,
              tier: true,
              status: true
            }
          }
        }
      });

      if (!user) {
        const identifierType = isEmail ? 'email' : 'user ID';
        throw new Error(`User not found with ${identifierType}: ${userIdentifier}`);
      }

      // Check both the subscriptionStatus field and if there are active subscriptions
      const hasActiveSubscription = user.subscriptionStatus === 'active' || 
        user.subscriptions.some(sub => sub.status === 'active');
      const currentTier = hasActiveSubscription 
        ? user.subscriptions[0].tier 
        : user.tier;
      const conversationCount = user.conversations.length;

      const subscriber: MailerLiteSubscriber = {
        email: user.email,
        groups: [this.groupId],
        fields: {
          active_user: hasActiveSubscription ? 1 : 0,
          current_tier: currentTier,
          conversation_count: conversationCount,
          user_created_at: this.formatDateForMailerLite(user.createdAt),
          last_login_at: user.lastLoginAt ? this.formatDateForMailerLite(user.lastLoginAt) : ''
        }
      };

      await this.syncSubscriber(subscriber);
      console.log(`✅ Successfully synced user: ${user.email} (ID: ${user.id})`);
      return true;

    } catch (error) {
      console.error(`Failed to sync single user ${userIdentifier}:`, error);
      return false;
    }
  }
}
