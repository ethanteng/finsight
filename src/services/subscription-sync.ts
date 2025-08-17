import { getPrismaClient } from '../prisma-client';

export class SubscriptionSyncService {
  /**
   * Auto-sync a specific subscription's tier based on its current Stripe price
   */
  static async syncSubscription(subscriptionId: string): Promise<{
    success: boolean;
    oldTier?: string;
    newTier?: string;
    message: string;
  }> {
    try {
      console.log(`Auto-sync: Starting sync for subscription ${subscriptionId}`);
      
      // Get current Stripe subscription to check price
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      const currentPrice = stripeSubscription.items.data[0]?.price?.id;
      
      // Use environment-aware price ID mapping
      const { getSubscriptionPlans } = await import('../types/stripe');
      const plans = getSubscriptionPlans();
      
      // Create reverse mapping from price ID to tier
      const PRICE_TO_TIER: Record<string, string> = {};
      for (const [tier, plan] of Object.entries(plans)) {
        PRICE_TO_TIER[plan.stripePriceId] = tier;
      }
      
      const correctTier = PRICE_TO_TIER[currentPrice] || 'starter';
      const metadataTier = stripeSubscription.metadata?.tier || 'unknown';
      
      console.log(`Auto-sync: Price ${currentPrice} maps to tier: ${correctTier}, metadata shows: ${metadataTier}`);
      
      // If there's a mismatch, update both Stripe metadata and database
      if (correctTier !== metadataTier) {
        console.log(`Auto-sync: Tier mismatch detected. Updating from ${metadataTier} to ${correctTier}`);
        
        // Update Stripe metadata
        await stripe.subscriptions.update(subscriptionId, {
          metadata: {
            source: 'web_checkout',
            tier: correctTier
          }
        });
        
        // Update database subscription
        const prisma = getPrismaClient();
        await prisma.subscription.update({
          where: { stripeSubscriptionId: subscriptionId },
          data: { tier: correctTier }
        });
        
        // Update user tier
        const subscription = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId: subscriptionId },
          include: { user: true }
        });
        
        if (subscription?.user) {
          await prisma.user.update({
            where: { id: subscription.user.id },
            data: { tier: correctTier }
          });
          
          console.log(`Auto-sync: Updated user ${subscription.user.email} tier to ${correctTier}`);
        }
        
        console.log(`Auto-sync: Successfully synced subscription ${subscriptionId} to tier ${correctTier}`);
        
        return {
          success: true,
          oldTier: metadataTier,
          newTier: correctTier,
          message: `Successfully synced from ${metadataTier} to ${correctTier}`
        };
      } else {
        console.log(`Auto-sync: Tier already in sync (${correctTier})`);
        return {
          success: true,
          oldTier: correctTier,
          newTier: correctTier,
          message: `Tier already in sync (${correctTier})`
        };
      }
    } catch (error) {
      console.error('Error in auto-sync:', error);
      return {
        success: false,
        message: `Error syncing subscription: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Sync all subscriptions for a specific user
   */
  static async syncUserSubscriptions(userId: string): Promise<{
    success: boolean;
    syncedCount: number;
    message: string;
  }> {
    try {
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { subscriptions: true }
      });
      
      if (!user) {
        return {
          success: false,
          syncedCount: 0,
          message: 'User not found'
        };
      }
      
      let syncedCount = 0;
      for (const subscription of user.subscriptions) {
        const result = await this.syncSubscription(subscription.stripeSubscriptionId);
        if (result.success) {
          syncedCount++;
        }
      }
      
      return {
        success: true,
        syncedCount,
        message: `Synced ${syncedCount} subscription(s) for user ${user.email}`
      };
    } catch (error) {
      console.error('Error syncing user subscriptions:', error);
      return {
        success: false,
        syncedCount: 0,
        message: `Error syncing user subscriptions: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Sync all active subscriptions in the system
   */
  static async syncAllSubscriptions(): Promise<{
    success: boolean;
    syncedCount: number;
    message: string;
  }> {
    try {
      const prisma = getPrismaClient();
      const subscriptions = await prisma.subscription.findMany({
        where: { status: 'active' }
      });
      
      let syncedCount = 0;
      for (const subscription of subscriptions) {
        const result = await this.syncSubscription(subscription.stripeSubscriptionId);
        if (result.success) {
          syncedCount++;
        }
      }
      
      return {
        success: true,
        syncedCount,
        message: `Synced ${syncedCount} active subscription(s)`
      };
    } catch (error) {
      console.error('Error syncing all subscriptions:', error);
      return {
        success: false,
        syncedCount: 0,
        message: `Error syncing all subscriptions: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}
