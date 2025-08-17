
import { stripe, STRIPE_CONFIG, getStripePriceId, getTierFromPriceId } from '../config/stripe';
import { 
  CreateCheckoutSessionRequest, 
  CreateCheckoutSessionResponse,
  CreatePortalSessionRequest,
  CreatePortalSessionResponse,
  StripeWebhookEventType,
  SubscriptionTier,
  getSubscriptionPlans
} from '../types/stripe';
import { getPrismaClient } from '../prisma-client';
import { sendWelcomeEmail, sendTierChangeEmail, sendCancellationEmail } from './stripe-email';

export class StripeService {
  /**
   * Generate success URL for checkout session
   * This URL will handle post-payment flow and redirect to register
   */
  private generateSuccessUrl(tier: string, customerEmail?: string): string {
    // Use the new config helper
    return STRIPE_CONFIG.checkout.successUrlWithParams(tier, customerEmail);
  }

  /**
   * Generate cancel URL for checkout session
   */
  private generateCancelUrl(): string {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    return `${baseUrl}${STRIPE_CONFIG.checkout.cancelUrl}`;
  }

  /**
   * Create a Stripe Checkout session for subscription
   */
  async createCheckoutSession(
    request: CreateCheckoutSessionRequest
  ): Promise<CreateCheckoutSessionResponse> {
    try {
      console.log(`Creating checkout session for price ID: ${request.priceId}`);
      
      // Validate the price ID and get the tier
      const tier = getTierFromPriceId(request.priceId);
      console.log(`Tier determined: ${tier}`);
      
      if (!tier) {
        console.error(`Price ID ${request.priceId} could not be mapped to a tier`);
        console.log('Available price IDs in static plans:');
        const plans = getSubscriptionPlans();
        Object.entries(plans).forEach(([tier, plan]) => {
          console.log(`  - ${tier}: ${plan.stripePriceId}`);
        });
        throw new Error(`Invalid price ID: ${request.priceId}`);
      }

      // Create checkout session
      const session = await stripe.client.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: request.priceId,
            quantity: 1,
          },
        ],
        success_url: request.successUrl, // Use the URL from the request
        cancel_url: request.cancelUrl,   // Use the URL from the request
        customer_email: request.customerEmail,
        metadata: {
          tier: tier,
          source: 'web_checkout'
        },
        subscription_data: {
          metadata: {
            tier: tier,
            source: 'web_checkout'
          }
        },
        billing_address_collection: 'required',
        allow_promotion_codes: true,
      });

      return {
        sessionId: session.id,
        url: session.url!,
      };
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw new Error(`Failed to create checkout session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a Customer Portal session for subscription management
   */
  async createPortalSession(
    request: CreatePortalSessionRequest,
    customerId: string
  ): Promise<CreatePortalSessionResponse> {
    try {
      const session = await stripe.client.billingPortal.sessions.create({
        customer: customerId,
        return_url: request.returnUrl,
      });

      return {
        url: session.url,
      };
    } catch (error) {
      console.error('Error creating portal session:', error);
      throw new Error(`Failed to create portal session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process webhook events from Stripe
   */
  async processWebhookEvent(
    eventType: StripeWebhookEventType,
    eventData: any
  ): Promise<void> {
    try {
      console.log(`Processing webhook event: ${eventType}`);

      switch (eventType) {
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(eventData);
          break;
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(eventData);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(eventData);
          break;
        case 'customer.subscription.paused':
          await this.handleSubscriptionPaused(eventData);
          break;
        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(eventData);
          break;
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(eventData);
          break;
        case 'invoice.payment_action_required':
          await this.handlePaymentActionRequired(eventData);
          break;
        case 'customer.subscription.trial_will_end':
          await this.handleTrialWillEnd(eventData);
          break;
        default:
          console.log(`Unhandled webhook event type: ${eventType}`);
      }
    } catch (error) {
      console.error(`Error processing webhook event ${eventType}:`, error);
      throw error;
    }
  }

  /**
   * Handle subscription created event
   */
  private async handleSubscriptionCreated(eventData: any): Promise<void> {
    const subscription = eventData.object;
    const customerId = subscription.customer as string;
    const subscriptionId = subscription.id;
    const tier = subscription.metadata?.tier as SubscriptionTier || 'starter';

    console.log(`New subscription created: ${subscriptionId} for customer: ${customerId} with tier: ${tier}`);

    // Auto-sync tier based on current price if metadata tier doesn't match
    await this.autoSyncSubscriptionTier(subscriptionId, tier);

    // Find user by Stripe customer ID
    const prisma = getPrismaClient();
    const user = await prisma.user.findFirst({
      where: { stripeCustomerId: customerId }
    });

    if (!user) {
      console.warn(`User not found for Stripe customer: ${customerId}`);
      return;
    }

    // Validate and convert dates safely
    const currentPeriodStart = subscription.current_period_start 
      ? new Date(subscription.current_period_start * 1000)
      : new Date();
    const currentPeriodEnd = subscription.current_period_end 
      ? new Date(subscription.current_period_end * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default to 30 days from now

    // Create subscription record
    await prisma.subscription.create({
      data: {
        userId: user.id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        tier: tier,
        status: subscription.status,
        currentPeriodStart: currentPeriodStart,
        currentPeriodEnd: currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      }
    });

    // Update user subscription status
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: subscription.status,
        tier: tier,
      }
    });

          // Send welcome email for new subscription
      try {
        await sendWelcomeEmail(user.email, tier);
        console.log(`Welcome email sent to ${user.email} for ${tier} plan`);
      } catch (emailError) {
        console.error(`Failed to send welcome email to ${user.email}:`, emailError);
        // Don't fail the webhook if email fails
      }

    console.log(`Subscription ${subscriptionId} activated for user ${user.id}`);
  }

  /**
   * Handle subscription updated event
   */
  private async handleSubscriptionUpdated(eventData: any): Promise<void> {
    const subscription = eventData.object;
    const subscriptionId = subscription.id;
    const tier = subscription.metadata?.tier as SubscriptionTier || 'starter';
    const customerId = subscription.customer as string;

    console.log(`Subscription updated: ${subscriptionId} with tier: ${tier} for customer: ${customerId}`);
    console.log(`Subscription data:`, {
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      status: subscription.status,
      metadata: subscription.metadata
    });

    const prisma = getPrismaClient();
    
    // Check if subscription exists, if not create it
    let subscriptionRecord = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      include: { user: true }
    });

    if (!subscriptionRecord) {
      console.log(`Subscription ${subscriptionId} not found, creating new record`);
      
      // Find user by Stripe customer ID
      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: customerId }
      });

      if (!user) {
        console.warn(`User not found for Stripe customer: ${customerId}`);
        return;
      }

      // Validate and convert dates safely
      const currentPeriodStart = subscription.current_period_start 
        ? new Date(subscription.current_period_start * 1000)
        : new Date();
      const currentPeriodEnd = subscription.current_period_end 
        ? new Date(subscription.current_period_end * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default to 30 days from now

      // Create new subscription record
      subscriptionRecord = await prisma.subscription.create({
        data: {
          userId: user.id,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          tier: tier,
          status: subscription.status,
          currentPeriodStart: currentPeriodStart,
          currentPeriodEnd: currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
        include: { user: true }
      });

      console.log(`Created new subscription record: ${subscriptionRecord.id}`);
    } else {
      // Validate and convert dates safely for update
      const currentPeriodStart = subscription.current_period_start 
        ? new Date(subscription.current_period_start * 1000)
        : new Date();
      const currentPeriodEnd = subscription.current_period_end 
        ? new Date(subscription.current_period_end * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default to 30 days from now

      // Update existing subscription record
      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          tier: tier,
          status: subscription.status,
          currentPeriodStart: currentPeriodStart,
          currentPeriodEnd: currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        }
      });
    }

    // Check if subscription was just cancelled (cancel_at_period_end set to true)
    const wasJustCancelled = subscription.cancel_at_period_end === true && 
                             subscriptionRecord.cancelAtPeriodEnd !== true;

    // Store the original tier before any auto-sync operations
    const originalTier = subscriptionRecord?.user?.tier || tier;

    // Auto-sync tier based on current price if metadata tier doesn't match
    // This will update the tier if needed, but we'll use the original tier for email comparison
    await this.autoSyncSubscriptionTier(subscriptionId, tier);

    // Get the final tier after auto-sync
    const finalTier = await this.getCurrentTierFromStripe(subscriptionId);

    // Update user tier and subscription status with the final tier
    if (subscriptionRecord?.user) {
      if (wasJustCancelled) {
        // For cancelled subscriptions, only update the tier, not the status
        await prisma.user.update({
          where: { id: subscriptionRecord.user.id },
          data: {
            tier: finalTier,
          }
        });
        console.log(`✅ Updated user ${subscriptionRecord.user.email} tier to ${finalTier} (subscription cancelled)`);
      } else {
        // For non-cancelled subscriptions, update both tier and status
        await prisma.user.update({
          where: { id: subscriptionRecord.user.id },
          data: {
            subscriptionStatus: subscription.status,
            tier: finalTier,
          }
        });
        console.log(`✅ Updated user ${subscriptionRecord.user.email} tier to ${finalTier} and status to ${subscription.status}`);
      }
      
      console.log(`🔍 Cancellation check for subscription ${subscriptionId}:`);
      console.log(`   - Webhook cancel_at_period_end: ${subscription.cancel_at_period_end}`);
      console.log(`   - Database cancelAtPeriodEnd: ${subscriptionRecord.cancelAtPeriodEnd}`);
      console.log(`   - Was just cancelled: ${wasJustCancelled}`);
      
      if (wasJustCancelled) {
        // Update the subscription record to reflect the cancellation
        console.log(`💾 Updating subscription ${subscriptionId} to mark as cancelled at period end`);
        await prisma.subscription.update({
          where: { stripeSubscriptionId: subscriptionId },
          data: {
            cancelAtPeriodEnd: true,
          }
        });
        console.log(`✅ Successfully updated subscription ${subscriptionId} cancelAtPeriodEnd to true`);
        
        // Send cancellation email when subscription is cancelled but still active until period end
        try {
          await sendCancellationEmail(
            subscriptionRecord.user.email,
            finalTier
          );
          console.log(`Cancellation email sent to ${subscriptionRecord.user.email} for ${finalTier} plan (cancelled at period end)`);
        } catch (emailError) {
          console.error(`Failed to send cancellation email to ${subscriptionRecord.user.email}:`, emailError);
          // Don't fail the webhook if email fails
        }
        
        // Skip tier change email since we just sent a cancellation email
        console.log(`Skipping tier change email - cancellation email was sent instead`);
      } else if (originalTier !== finalTier) {
        // Send tier change email if the tier actually changed (and no cancellation email was sent)
        try {
          await sendTierChangeEmail(
            subscriptionRecord.user.email, 
            finalTier, 
            originalTier
          );
          console.log(`Tier change email sent to ${subscriptionRecord.user.email}: ${originalTier} → ${finalTier}`);
        } catch (emailError) {
          console.error(`Failed to send tier change email to ${subscriptionRecord.user.email}:`, emailError);
          // Don't fail the webhook if email fails
        }
      } else {
        console.log(`Skipping tier change email - no tier change detected`);
      }
    }

    console.log(`Subscription ${subscriptionId} updated successfully`);
  }

  /**
   * Handle subscription deleted event
   */
  private async handleSubscriptionDeleted(eventData: any): Promise<void> {
    const subscription = eventData.object;
    const subscriptionId = subscription.id;

    console.log(`Subscription deleted: ${subscriptionId}`);

    // Find and update subscription record
    const prisma = getPrismaClient();
    const subscriptionRecord = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      include: { user: true }
    });

    if (subscriptionRecord) {
      // Store the old tier before updating
      const oldTier = subscriptionRecord.tier;
      
      // Update subscription status
      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          status: 'canceled',
        }
      });

      // Update user subscription status
      if (subscriptionRecord.user) {
        await prisma.user.update({
          where: { id: subscriptionRecord.user.id },
          data: {
            subscriptionStatus: 'canceled',
            // Keep the user's tier - they paid for it and should retain access
          }
        });

        console.log(`✅ Updated user ${subscriptionRecord.user.email} subscription status to 'canceled' (tier remains: ${subscriptionRecord.user.tier})`);

        // Send cancellation email
        try {
          await sendCancellationEmail(
            subscriptionRecord.user.email,
            oldTier
          );
          console.log(`Cancellation email sent to ${subscriptionRecord.user.email} for ${oldTier} plan`);
        } catch (emailError) {
          console.error(`Failed to send cancellation email to ${subscriptionRecord.user.email}:`, emailError);
          // Don't fail the webhook if email fails
        }
      }
    }

    console.log(`Subscription ${subscriptionId} deactivated successfully`);
  }

  /**
   * Handle subscription paused event
   */
  private async handleSubscriptionPaused(eventData: any): Promise<void> {
    const subscription = eventData.object;
    const subscriptionId = subscription.id;

    console.log(`Subscription paused: ${subscriptionId}`);

    // Auto-sync tier to ensure it's correct even when paused
    await this.autoSyncSubscriptionTier(subscriptionId, 'unknown');

    // Update subscription status
    const prisma = getPrismaClient();
    await prisma.subscription.update({
      where: { stripeSubscriptionId: subscriptionId },
      data: {
        status: 'paused',
      }
    });

    // Update user subscription status
    const subscriptionRecord = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      include: { user: true }
    });

    if (subscriptionRecord?.user) {
      await prisma.user.update({
        where: { id: subscriptionRecord.user.id },
        data: {
          subscriptionStatus: 'paused',
        }
      });
    }

    console.log(`Subscription ${subscriptionId} paused successfully`);
  }

  /**
   * Handle payment succeeded event
   */
  private async handlePaymentSucceeded(eventData: any): Promise<void> {
    const invoice = eventData.object;
    const subscriptionId = invoice.subscription as string;

    if (subscriptionId) {
      console.log(`Payment succeeded for subscription: ${subscriptionId}`);

      // Auto-sync tier to ensure it's correct after payment
      await this.autoSyncSubscriptionTier(subscriptionId, 'unknown');

      // Update subscription status to active
      const prisma = getPrismaClient();
      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          status: 'active',
        }
      });

      // Update user subscription status
      const subscriptionRecord = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
        include: { user: true }
      });

      if (subscriptionRecord?.user) {
        await prisma.user.update({
          where: { id: subscriptionRecord.user.id },
          data: {
            subscriptionStatus: 'active',
          }
        });
      }
    }
  }

  /**
   * Handle payment failed event
   */
  private async handlePaymentFailed(eventData: any): Promise<void> {
    const invoice = eventData.object;
    const subscriptionId = invoice.subscription as string;

    if (subscriptionId) {
      console.log(`Payment failed for subscription: ${subscriptionId}`);

      // Update subscription status to past_due
      const prisma = getPrismaClient();
      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          status: 'past_due',
        }
      });

      // Update user subscription status
      const subscriptionRecord = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
        include: { user: true }
      });

      if (subscriptionRecord?.user) {
        // Calculate grace period dates
        const now = new Date();
        const gracePeriodDays = 7; // Default grace period
        const gracePeriodEnd = new Date(now.getTime() + (gracePeriodDays * 24 * 60 * 60 * 1000));
        
        await prisma.user.update({
          where: { id: subscriptionRecord.user.id },
          data: {
            subscriptionStatus: 'past_due',
            // Grace period handled by Stripe status
          }
        });

        console.log(`User ${subscriptionRecord.user.id} entered grace period until ${gracePeriodEnd.toISOString()}`);
        
        // TODO: Send notification to user about payment failure
        // This could be an email notification or in-app alert
      }
    }
  }

  /**
   * Handle payment action required event
   */
  private async handlePaymentActionRequired(eventData: any): Promise<void> {
    const invoice = eventData.object;
    const subscriptionId = invoice.subscription as string;

    if (subscriptionId) {
      console.log(`Payment action required for subscription: ${subscriptionId}`);

      // Update subscription status to incomplete
      const prisma = getPrismaClient();
      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          status: 'incomplete',
        }
      });

      // Update user subscription status
      const subscriptionRecord = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
        include: { user: true }
      });

      if (subscriptionRecord?.user) {
        await prisma.user.update({
          where: { id: subscriptionRecord.user.id },
          data: {
            subscriptionStatus: 'incomplete',
          }
        });

        console.log(`User ${subscriptionRecord.user.id} requires payment action`);
        
        // TODO: Send notification to user about required payment action
        // This could be an email notification or in-app alert
      }
    }
  }

  /**
   * Handle trial will end event
   */
  private async handleTrialWillEnd(eventData: any): Promise<void> {
    const subscription = eventData.object;
    const subscriptionId = subscription.id;

    console.log(`Trial ending for subscription: ${subscriptionId}`);

    // Auto-sync tier to ensure it's correct before trial ends
    await this.autoSyncSubscriptionTier(subscriptionId, 'unknown');

    // This is just a notification event, no action needed
    // The subscription will automatically transition to active when the trial ends
    
    // TODO: Send notification to user about trial ending
    // This could be an email notification or in-app alert
  }

  /**
   * Log webhook event for debugging
   */
  async logWebhookEvent(
    stripeEventId: string,
    eventType: string,
    eventData: any,
    subscriptionId?: string
  ): Promise<void> {
    try {
      const prisma = getPrismaClient();
      
      // Only include subscriptionId if it's provided and valid
      const eventDataToSave: any = {
        stripeEventId,
        eventType,
        eventData,
      };
      
      // Only add subscriptionId if it's provided and we can verify it exists
      if (subscriptionId) {
        try {
          // Check if the subscription exists before trying to reference it
          const existingSubscription = await prisma.subscription.findUnique({
            where: { id: subscriptionId },
            select: { id: true }
          });
          
          if (existingSubscription) {
            eventDataToSave.subscriptionId = subscriptionId;
          } else {
            console.log(`Subscription ${subscriptionId} not found, logging event without subscription reference`);
          }
        } catch (checkError) {
          console.log(`Error checking subscription ${subscriptionId}, logging event without subscription reference:`, checkError);
        }
      }
      
      await prisma.subscriptionEvent.create({
        data: eventDataToSave
      });
    } catch (error) {
      console.error('Error logging webhook event:', error);
      // Don't throw here as this is just logging
    }
  }

  /**
   * Get user's current subscription status and access level
   */
  async getUserSubscriptionStatus(userId: string): Promise<{
    tier: string;
    status: string;
    expiresAt?: Date;
    gracePeriodDays?: number;
    accessLevel: 'full' | 'limited' | 'none';
    upgradeRequired: boolean;
    message: string;
  }> {
    try {
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          tier: true,
          subscriptionStatus: true,
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      const currentTier = user.tier;
      const subscriptionStatus = user.subscriptionStatus;
      const hasActiveSubscription = user.subscriptions.length > 0;
      
      // Debug logging
      console.log(`🔍 Stripe Service - User ${user.id}:`);
      console.log(`  - Tier: ${currentTier}`);
      console.log(`  - User.subscriptionStatus: ${subscriptionStatus}`);
      console.log(`  - User.subscriptions.length: ${user.subscriptions.length}`);
      console.log(`  - User.subscriptions:`, user.subscriptions);
      console.log(`  - Has active subscription:`, hasActiveSubscription);

      // Determine access level and status
      let accessLevel: 'full' | 'none' = 'none';
      let upgradeRequired = false;
      let message = '';
      
      // Get the actual subscription status from the subscription record if it exists
      let actualSubscriptionStatus = subscriptionStatus;
      if (user.subscriptions.length > 0) {
        const latestSubscription = user.subscriptions[0];
        actualSubscriptionStatus = latestSubscription.status;
        console.log(`  - Actual subscription status from record: ${actualSubscriptionStatus}`);
      }

      // Simplified logic: Trust Stripe status, no complex date logic
      if (actualSubscriptionStatus === 'active') {
        // Active subscription - full access (Stripe handles expiration)
        accessLevel = 'full';
        upgradeRequired = false;
        message = `Active ${currentTier} subscription`;
      } else if (subscriptionStatus === 'active' && user.subscriptions.length === 0) {
        // Payment completed but account setup incomplete
        accessLevel = 'none';
        upgradeRequired = false; // Not an upgrade issue
        message = 'Payment completed but account setup incomplete. Please complete your account setup to access Ask Linc.';
      } else if (user.subscriptions.length === 0 && subscriptionStatus === 'inactive') {
        // Admin-created user - no Stripe subscription records exist
        accessLevel = 'full';
        upgradeRequired = false;
        message = `Admin-created ${currentTier} user. Full access granted.`;
      } else {
        // User has subscription history but status is not active - access revoked
        accessLevel = 'none';
        upgradeRequired = true;
        
        // Generate appropriate message based on status
        switch (actualSubscriptionStatus) {
          case 'past_due':
            message = 'Payment past due. Please update payment method to restore access.';
            break;
          case 'canceled':
            message = 'Subscription canceled. Please renew to restore access.';
            break;
          case 'incomplete':
            message = 'Subscription setup incomplete. Please complete setup to restore access.';
            break;
          case 'incomplete_expired':
            message = 'Subscription setup expired. Please start over to restore access.';
            break;
          case 'trialing':
            message = 'Trial period ended. Please subscribe to restore access.';
            break;
          case 'unpaid':
            message = 'Payment failed. Please update payment method to restore access.';
            break;
          default:
            message = `Subscription status: ${actualSubscriptionStatus}. Please contact support to restore access.`;
        }
      }

      // Final debug logging
      console.log(`  - Final decision:`);
      console.log(`    - accessLevel: ${accessLevel}`);
      console.log(`    - upgradeRequired: ${upgradeRequired}`);
      console.log(`    - message: ${message}`);
      console.log(`    - actualStatus: ${actualSubscriptionStatus}`);

              return {
          tier: currentTier,
          status: actualSubscriptionStatus, // Use the actual status from subscription record
          accessLevel,
          upgradeRequired,
          message
        };
    } catch (error) {
      console.error('Error getting user subscription status:', error);
      throw error;
    }
  }

  /**
   * Check if user can access a specific feature based on tier and subscription status
   */
  async canAccessFeature(userId: string, requiredTier: string): Promise<{
    canAccess: boolean;
    reason: string;
    upgradeRequired: boolean;
    currentTier: string;
    requiredTier: string;
    subscriptionStatus: string;
  }> {
    try {
      const subscriptionStatus = await this.getUserSubscriptionStatus(userId);
      
      // Check tier access
      const tierHierarchy = ['starter', 'standard', 'premium'];
      const userTierIndex = tierHierarchy.indexOf(subscriptionStatus.tier);
      const requiredTierIndex = tierHierarchy.indexOf(requiredTier);
      
      const hasTierAccess = userTierIndex >= requiredTierIndex;
      const hasSubscriptionAccess = subscriptionStatus.accessLevel !== 'none';
      
      const canAccess = hasTierAccess && hasSubscriptionAccess;
      
      let reason = '';
      if (!hasTierAccess) {
        reason = `Feature requires ${requiredTier} tier or higher. Current tier: ${subscriptionStatus.tier}`;
      } else if (!hasSubscriptionAccess) {
        reason = subscriptionStatus.message;
      } else {
        reason = 'Access granted';
      }

      return {
        canAccess,
        reason,
        upgradeRequired: subscriptionStatus.upgradeRequired || !hasTierAccess,
        currentTier: subscriptionStatus.tier,
        requiredTier,
        subscriptionStatus: subscriptionStatus.status
      };
    } catch (error) {
      console.error('Error checking feature access:', error);
      throw error;
    }
  }

  /**
   * Get the current tier from Stripe based on the subscription's price
   */
  private async getCurrentTierFromStripe(subscriptionId: string): Promise<string> {
    try {
      const stripeSubscription = await stripe.client.subscriptions.retrieve(subscriptionId);
      
      const currentPrice = stripeSubscription.items.data[0]?.price?.id;
      
      // Use environment-aware price ID mapping
      const { getSubscriptionPlans } = await import('../types/stripe');
      const plans = getSubscriptionPlans();
      
      // Find tier by price ID
      for (const [tier, plan] of Object.entries(plans)) {
        if (plan.stripePriceId === currentPrice) {
          return tier;
        }
      }
      
      // Fallback to starter if no match found
      return 'starter';
    } catch (error) {
      console.error('Error getting current tier from Stripe:', error);
      return 'starter'; // fallback
    }
  }

  /**
   * Auto-sync subscription tier based on current Stripe price
   * This ensures the tier stays in sync even when metadata is out of date
   */
  private async autoSyncSubscriptionTier(subscriptionId: string, metadataTier: string): Promise<void> {
    try {
      // Use environment-aware price ID mapping
      const { getSubscriptionPlans } = await import('../types/stripe');
      const plans = getSubscriptionPlans();
      
      // Create reverse mapping from price ID to tier
      const PRICE_TO_TIER: Record<string, string> = {};
      for (const [tier, plan] of Object.entries(plans)) {
        PRICE_TO_TIER[plan.stripePriceId] = tier;
      }

      // Get current Stripe subscription to check price
      const stripeSubscription = await stripe.client.subscriptions.retrieve(subscriptionId);
      
      const currentPrice = stripeSubscription.items.data[0]?.price?.id;
      const correctTier = PRICE_TO_TIER[currentPrice] || 'starter';
      
      // If metadata is unknown, try to get the current tier from the database
      let currentMetadataTier = metadataTier;
      if (metadataTier === 'unknown') {
        try {
          const prisma = getPrismaClient();
          const dbSubscription = await prisma.subscription.findUnique({
            where: { stripeSubscriptionId: subscriptionId },
            select: { tier: true }
          });
          currentMetadataTier = dbSubscription?.tier || 'unknown';
        } catch (dbError) {
          console.log(`Auto-sync: Could not fetch current tier from database: ${dbError}`);
        }
      }
      
      console.log(`Auto-sync: Price ${currentPrice} maps to tier: ${correctTier}, metadata shows: ${currentMetadataTier}`);
      
      // If there's a mismatch or metadata is unknown, update both Stripe metadata and database
      if (correctTier !== currentMetadataTier || currentMetadataTier === 'unknown') {
        const action = currentMetadataTier === 'unknown' ? 'syncing' : 'fixing mismatch';
        console.log(`Auto-sync: ${action} from ${currentMetadataTier} to ${correctTier}`);
        
        // Update Stripe metadata
        await stripe.client.subscriptions.update(subscriptionId, {
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
      } else {
        console.log(`Auto-sync: Tier already in sync (${correctTier})`);
      }
    } catch (error) {
      console.error('Error in auto-sync:', error);
      // Don't throw - this is a background sync operation
    }
  }
}

// Export singleton instance
export const stripeService = new StripeService();

