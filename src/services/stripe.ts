
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
import { analytics } from '../analytics/heycatch';

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

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

      // Checkout rejects customer and customer_email together, and a stale
      // customer ID fails the whole session, so verify before reusing one.
      const reusableCustomerId = request.customerId
        ? await this.getReusableCustomerId(request.customerId)
        : undefined;

      // A returning subscriber already consumed the introductory trial. Handing
      // out another one on every resubscribe makes cancelling and re-checking-out
      // a way to stay free forever.
      const trialPeriodDays = request.skipTrial
        ? undefined
        : STRIPE_CONFIG.subscriptionSettings.trialPeriodDays;

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
        ...(reusableCustomerId
          ? { customer: reusableCustomerId }
          : { customer_email: request.customerEmail }),
        metadata: {
          tier: tier,
          source: 'web_checkout'
        },
        subscription_data: {
          ...(trialPeriodDays === undefined ? {} : { trial_period_days: trialPeriodDays }),
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
   * Return the customer ID only if Stripe still has a usable customer for it.
   * A deleted or unknown customer would otherwise fail the whole checkout.
   */
  private async getReusableCustomerId(customerId: string): Promise<string | undefined> {
    try {
      const customer = await stripe.client.customers.retrieve(customerId);
      if ((customer as { deleted?: boolean }).deleted) {
        console.warn(`Stripe customer ${customerId} is deleted; letting Checkout create a new one`);
        return undefined;
      }
      return customer.id;
    } catch (error) {
      console.warn(`Could not reuse Stripe customer ${customerId}:`, error);
      return undefined;
    }
  }

  /**
   * Resolve the account a Stripe customer belongs to.
   *
   * Checkout mints a brand-new Customer whenever a session starts without one,
   * so a returning subscriber arrives under a customer ID no user row points at.
   * Matching on the customer's email recovers the account and adopts the new ID,
   * without which the resubscription never links to the person who paid for it.
   */
  private async resolveUserForCustomer(customerId: string) {
    const prisma = getPrismaClient();

    const userByCustomerId = await prisma.user.findFirst({
      where: { stripeCustomerId: customerId }
    });

    if (userByCustomerId) {
      return userByCustomerId;
    }

    let customerEmail: string | undefined;
    try {
      const customer = await stripe.client.customers.retrieve(customerId);
      if (!(customer as { deleted?: boolean }).deleted) {
        customerEmail = (customer as { email?: string | null }).email?.toLowerCase() || undefined;
      }
    } catch (error) {
      console.error(`Could not retrieve Stripe customer ${customerId}:`, error);
      return null;
    }

    if (!customerEmail) {
      return null;
    }

    const userByEmail = await prisma.user.findUnique({
      where: { email: customerEmail }
    });

    if (!userByEmail) {
      return null;
    }

    // Only adopt a customer for an account that is not currently subscribed.
    // Anyone can start a checkout with somebody else's email, and repointing a
    // paying subscriber at that customer would hand a stranger control of their
    // billing - cancelling it would lock the real subscriber out.
    const workingSubscription = await prisma.subscription.findFirst({
      where: {
        userId: userByEmail.id,
        status: { in: ['active', 'trialing'] }
      }
    });

    if (workingSubscription) {
      console.warn(
        `Not adopting Stripe customer ${customerId} for ${userByEmail.email}: the account already has a working subscription`
      );
      return null;
    }

    // Point the account at the customer that now carries its billing, so later
    // events on this subscription resolve on the first lookup.
    await prisma.user.update({
      where: { id: userByEmail.id },
      data: { stripeCustomerId: customerId }
    });

    console.log(`Adopted Stripe customer ${customerId} for returning user ${userByEmail.email}`);

    return { ...userByEmail, stripeCustomerId: customerId };
  }

  /**
   * Attach a completed Checkout session to an existing account.
   *
   * Used by registration (brand-new account) and by the payment-success callback
   * (returning subscriber who already has one), so both paths link a paid
   * checkout the same way instead of drifting apart.
   *
   * Throws when the session is not a completed checkout for this account.
   */
  async linkCheckoutSessionToUser(params: {
    userId: string;
    email: string;
    checkoutSessionId: string;
    tier?: SubscriptionTier;
  }): Promise<{ linked: boolean; isNewSubscription: boolean; status?: string }> {
    const { userId, email, checkoutSessionId } = params;

    const session = await stripe.client.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ['subscription']
    });

    const checkoutIsComplete = session.status === 'complete' &&
      (session.payment_status === 'paid' || session.payment_status === 'no_payment_required');
    if (!checkoutIsComplete) {
      throw new Error('Stripe Checkout session is not complete');
    }

    const checkoutEmail = session.customer_details?.email?.toLowerCase();
    if (checkoutEmail && checkoutEmail !== email.toLowerCase()) {
      throw new Error('Stripe Checkout email does not match the registered account');
    }

    if (!session.subscription || !session.customer) {
      return { linked: false, isNewSubscription: false };
    }

    const customerId = typeof session.customer === 'string'
      ? session.customer
      : session.customer.id;

    const subscription: any = typeof session.subscription === 'string'
      ? await stripe.client.subscriptions.retrieve(session.subscription)
      : session.subscription;

    if (!subscription) {
      return { linked: false, isNewSubscription: false };
    }

    const tier = params.tier
      || (getTierFromPriceId(subscription.items?.data?.[0]?.price?.id) as SubscriptionTier | null)
      || 'premium';
    const status = subscription.status || 'incomplete';
    const currentPeriodStart = subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000)
      : new Date();
    const currentPeriodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const subscriptionData = {
      userId,
      stripeCustomerId: customerId,
      tier,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    };

    // Claim first delivery with an atomic insert so a concurrent webhook, a
    // retried registration, or a reloaded success page cannot repeat the
    // welcome email and start analytics.
    const prisma = getPrismaClient();
    let isNewSubscription = false;
    try {
      await prisma.subscription.create({
        data: {
          ...subscriptionData,
          stripeSubscriptionId: subscription.id,
        },
      });
      isNewSubscription = true;
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscription.id },
        data: subscriptionData,
      });
    }

    // Persist the subscription before exposing the Stripe customer ID. The
    // webhook cannot find this user until the record it would update already
    // exists, preventing both paths from claiming first delivery.
    await prisma.user.update({
      where: { id: userId },
      data: {
        stripeCustomerId: customerId,
        subscriptionStatus: status,
        tier,
      }
    });

    console.log(`Linked user ${email} to Stripe customer ${customerId} and subscription ${subscription.id}`);

    if (isNewSubscription) {
      try {
        await sendWelcomeEmail(email, tier);
        console.log(`Welcome email sent to ${email} for ${tier} plan`);
      } catch (emailError) {
        console.error(`Failed to send welcome email to ${email}:`, emailError);
        // Don't fail the caller if email fails
      }

      try {
        await analytics.setIdentity(userId, { email, plan: tier });
        await analytics.trackEvent('subscription_started', { plan: tier }, { userId });
      } catch (analyticsError) {
        console.error(`Failed to record subscription_started for ${email}:`, analyticsError);
      }
    }

    return { linked: true, isNewSubscription, status };
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
    const tier = subscription.metadata?.tier as SubscriptionTier || 'premium';

    console.log(`New subscription created: ${subscriptionId} for customer: ${customerId} with tier: ${tier}`);

    // Auto-sync tier based on current price if metadata tier doesn't match
    await this.autoSyncSubscriptionTier(subscriptionId, tier);

    // Find the account this customer belongs to
    const prisma = getPrismaClient();
    const user = await this.resolveUserForCustomer(customerId);

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

    const subscriptionData = {
      userId: user.id,
      stripeCustomerId: customerId,
      tier,
      status: subscription.status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };

    // Claim first delivery with an atomic insert. A separate read followed by
    // upsert lets concurrent Stripe deliveries both run one-time side effects.
    let isNewSubscription = false;
    try {
      await prisma.subscription.create({
        data: {
          ...subscriptionData,
          stripeSubscriptionId: subscriptionId,
        }
      });
      isNewSubscription = true;
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      // Registration or another delivery created the record first. Continue
      // syncing current Stripe state, but do not repeat welcome/analytics.
      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscriptionId },
        data: subscriptionData
      });
    }

    // Update user subscription status
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: subscription.status,
        tier: tier,
      }
    });

    if (isNewSubscription) {
      try {
        await sendWelcomeEmail(user.email, tier);
        console.log(`Welcome email sent to ${user.email} for ${tier} plan`);
      } catch (emailError) {
        console.error(`Failed to send welcome email to ${user.email}:`, emailError);
        // Don't fail the webhook if email fails
      }

      await analytics.setIdentity(user.id, { email: user.email, plan: tier });
      await analytics.trackEvent(
        'subscription_started',
        { plan: tier },
        { userId: user.id },
      );
    } else {
      console.log(`Subscription ${subscriptionId} already exists; skipped welcome and start analytics`);
    }

    console.log(`Subscription ${subscriptionId} activated for user ${user.id}`);
  }

  /**
   * Handle subscription updated event
   */
  private async handleSubscriptionUpdated(eventData: any): Promise<void> {
    const subscription = eventData.object;
    const subscriptionId = subscription.id;
    const tier = subscription.metadata?.tier as SubscriptionTier || 'premium';
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
      
      // Find the account this customer belongs to
      const user = await this.resolveUserForCustomer(customerId);

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
      } else if (subscription.status === 'active' || subscription.status === 'trialing') {
        // For non-cancelled subscriptions, update both tier and status
        await prisma.user.update({
          where: { id: subscriptionRecord.user.id },
          data: {
            subscriptionStatus: subscription.status,
            tier: finalTier,
          }
        });
        console.log(`✅ Updated user ${subscriptionRecord.user.email} tier to ${finalTier} and status to ${subscription.status}`);
      } else {
        // A downgrade arriving on an update event has the same hazard as one
        // arriving on a delete: after a resubscribe it may belong to the old
        // subscription, and must not overwrite the working replacement.
        await this.applyUserSubscriptionStatusIfNoWorkingReplacement(
          subscriptionRecord.user.id,
          subscription.status,
          finalTier
        );
        console.log(`✅ Applied ${subscription.status} for user ${subscriptionRecord.user.email} (tier ${finalTier})`);
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

      if (wasJustCancelled) {
        await analytics.setIdentity(subscriptionRecord.user.id, {
          email: subscriptionRecord.user.email,
          plan: finalTier,
        });
        await analytics.trackEvent(
          'subscription_cancelled',
          { plan: finalTier },
          { userId: subscriptionRecord.user.id },
        );
      } else if (originalTier !== finalTier) {
        await analytics.setIdentity(subscriptionRecord.user.id, {
          email: subscriptionRecord.user.email,
          plan: finalTier,
        });
        await analytics.trackEvent(
          'subscription_updated',
          { plan: finalTier, previous_plan: originalTier },
          { userId: subscriptionRecord.user.id },
        );
      }
    }

    console.log(`Subscription ${subscriptionId} updated successfully`);
  }

  /**
   * After a subscription is canceled/paused/past_due/incomplete, only mirror that
   * onto the user row when they have no other working subscription.
   *
   * Resubscribe leaves the old canceled row in place. A delayed or replayed
   * webhook for that old subscription must not overwrite a fresh active/trialing
   * replacement — authenticateUser gates on user.subscriptionStatus, so doing so
   * would lock a paying subscriber out again.
   */
  private async applyUserSubscriptionStatusIfNoWorkingReplacement(
    userId: string,
    proposedStatus: string,
    proposedTier?: string
  ): Promise<{ applied: boolean; workingStatus?: string }> {
    const prisma = getPrismaClient();
    const workingSubscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ['active', 'trialing'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (workingSubscription) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: workingSubscription.status,
          tier: workingSubscription.tier,
        },
      });
      console.log(
        `Preserved user ${userId} at ${workingSubscription.status}: another working subscription exists (${workingSubscription.stripeSubscriptionId})`
      );
      return { applied: false, workingStatus: workingSubscription.status };
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: proposedStatus,
        ...(proposedTier ? { tier: proposedTier } : {}),
      },
    });
    return { applied: true };
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
        const { applied } = await this.applyUserSubscriptionStatusIfNoWorkingReplacement(
          subscriptionRecord.user.id,
          'canceled'
        );

        if (!applied) {
          console.log(
            `✅ Subscription ${subscriptionId} canceled but user ${subscriptionRecord.user.email} kept access via a replacement subscription`
          );
          console.log(`Subscription ${subscriptionId} deactivated successfully`);
          return;
        }

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

        await analytics.setIdentity(subscriptionRecord.user.id, {
          email: subscriptionRecord.user.email,
          plan: oldTier,
        });
        await analytics.trackEvent(
          'subscription_cancelled',
          { plan: oldTier },
          { userId: subscriptionRecord.user.id },
        );
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
      await this.applyUserSubscriptionStatusIfNoWorkingReplacement(
        subscriptionRecord.user.id,
        'paused'
      );
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

      const prisma = getPrismaClient();
      const existingSubscription = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
        select: { id: true }
      });

      if (!existingSubscription) {
        console.log(
          `Subscription ${subscriptionId} not found in database yet; skipping payment succeeded update`
        );
        return;
      }

      // Auto-sync tier to ensure it's correct after payment
      await this.autoSyncSubscriptionTier(subscriptionId, 'unknown');

      // Use Stripe as the source of truth so $0 trial invoices do not
      // prematurely mark a still-trialing subscription as active.
      const stripeSubscription = await stripe.client.subscriptions.retrieve(subscriptionId);
      const subscriptionStatus = stripeSubscription.status;

      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          status: subscriptionStatus,
        }
      });

      // Update user subscription status
      const subscriptionRecord = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
        include: { user: true }
      });

      if (subscriptionRecord?.user) {
        if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
          await prisma.user.update({
            where: { id: subscriptionRecord.user.id },
            data: {
              subscriptionStatus,
            }
          });
        } else {
          // A late invoice can settle on a subscription that has since been
          // superseded, and Stripe then reports that subscription's status.
          await this.applyUserSubscriptionStatusIfNoWorkingReplacement(
            subscriptionRecord.user.id,
            subscriptionStatus
          );
        }

        const plan = subscriptionRecord.tier || subscriptionRecord.user.tier || 'unknown';
        await analytics.setIdentity(subscriptionRecord.user.id, {
          email: subscriptionRecord.user.email,
          plan,
        });
        await analytics.trackEvent(
          'payment_succeeded',
          { plan },
          { userId: subscriptionRecord.user.id },
        );
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

        const { applied } = await this.applyUserSubscriptionStatusIfNoWorkingReplacement(
          subscriptionRecord.user.id,
          'past_due'
        );

        if (applied) {
          console.log(`User ${subscriptionRecord.user.id} entered grace period until ${gracePeriodEnd.toISOString()}`);
        }

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
        const { applied } = await this.applyUserSubscriptionStatusIfNoWorkingReplacement(
          subscriptionRecord.user.id,
          'incomplete'
        );

        if (applied) {
          console.log(`User ${subscriptionRecord.user.id} requires payment action`);
        }

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
            take: 5
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
      let expiresAt: Date | undefined;
      if (user.subscriptions.length > 0) {
        // An account can hold more than one subscription after a resubscribe, and
        // the newest row is not always the working one (a replacement checkout can
        // land incomplete while the previous subscription still runs). Read the
        // status off the subscription that actually carries access, so this never
        // contradicts what authentication sees.
        const latestSubscription =
          user.subscriptions.find(
            (subscription: { status: string }) =>
              subscription.status === 'active' || subscription.status === 'trialing'
          ) || user.subscriptions[0];
        actualSubscriptionStatus = latestSubscription.status;
        if (actualSubscriptionStatus === 'trialing') {
          expiresAt = latestSubscription.currentPeriodEnd;
        }
        console.log(`  - Actual subscription status from record: ${actualSubscriptionStatus}`);
      }

      // Simplified logic: Trust Stripe status, no complex date logic
      if (actualSubscriptionStatus === 'active' || actualSubscriptionStatus === 'trialing') {
        // Active and trialing subscriptions both receive full access. Stripe
        // remains responsible for transitioning the status when the trial ends.
        accessLevel = 'full';
        upgradeRequired = false;
        message = actualSubscriptionStatus === 'trialing'
          ? `${currentTier} trial is active`
          : `Active ${currentTier} subscription`;
      } else if (
        (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') &&
        user.subscriptions.length === 0
      ) {
        // Checkout completed but subscription record not linked yet
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
          ...(expiresAt && { expiresAt }),
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
   * Get the current tier from Stripe based on the subscription's price.
   * Uses getTierFromPriceId() which correctly handles single-tier pricing
   * (where all tiers share one price ID and map to 'premium').
   */
  private async getCurrentTierFromStripe(subscriptionId: string): Promise<string> {
    try {
      const stripeSubscription = await stripe.client.subscriptions.retrieve(subscriptionId);

      const currentPrice = stripeSubscription.items.data[0]?.price?.id;

      // Use getTierFromPriceId for consistent single-tier pricing logic.
      // The old loop approach incorrectly returned 'starter' because all tiers
      // share the same price ID and iteration order is not guaranteed to be premium-first.
      const { getTierFromPriceId } = await import('../config/stripe');
      const tier = getTierFromPriceId(currentPrice);

      return tier || 'premium'; // Default to premium, not starter
    } catch (error) {
      console.error('Error getting current tier from Stripe:', error);
      return 'premium'; // fallback to premium, not starter
    }
  }

  /**
   * Auto-sync subscription tier based on current Stripe price
   * This ensures the tier stays in sync even when metadata is out of date
   */
  private async autoSyncSubscriptionTier(subscriptionId: string, metadataTier: string): Promise<void> {
    try {
      // Use getTierFromPriceId to map price ID to tier (handles single-tier pricing)
      const { getTierFromPriceId } = await import('../config/stripe');
      
      // Get current Stripe subscription to check price
      const stripeSubscription = await stripe.client.subscriptions.retrieve(subscriptionId);
      
      const currentPrice = stripeSubscription.items.data[0]?.price?.id;
      const correctTier = getTierFromPriceId(currentPrice) || 'premium';
      
      // If metadata is unknown, try to get the current tier from the database
      let currentMetadataTier: SubscriptionTier | 'unknown' = metadataTier as SubscriptionTier | 'unknown';
      if (metadataTier === 'unknown') {
        try {
          const prisma = getPrismaClient();
          const dbSubscription = await prisma.subscription.findUnique({
            where: { stripeSubscriptionId: subscriptionId },
            select: { tier: true }
          });
          currentMetadataTier = (dbSubscription?.tier as SubscriptionTier) || 'unknown';
        } catch (dbError) {
          console.log(`Auto-sync: Could not fetch current tier from database: ${dbError}`);
        }
      }
      
      console.log(`Auto-sync: Price ${currentPrice} maps to tier: ${correctTier}, metadata shows: ${currentMetadataTier}`);
      
      // If there's a mismatch or metadata is unknown, update both Stripe metadata and database
      const needsUpdate = currentMetadataTier === 'unknown' || correctTier !== currentMetadataTier;
      if (needsUpdate) {
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
