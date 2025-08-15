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

export class StripeService {
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
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: request.priceId,
            quantity: 1,
          },
        ],
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
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
      const session = await stripe.billingPortal.sessions.create({
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

    // Find user by Stripe customer ID
    const prisma = getPrismaClient();
    const user = await prisma.user.findFirst({
      where: { stripeCustomerId: customerId }
    });

    if (!user) {
      console.warn(`User not found for Stripe customer: ${customerId}`);
      return;
    }

    // Create subscription record
    await prisma.subscription.create({
      data: {
        userId: user.id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        tier: tier,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      }
    });

    // Update user subscription status
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: subscription.status,
        tier: tier,
        subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
      }
    });

    console.log(`Subscription ${subscriptionId} activated for user ${user.id}`);
  }

  /**
   * Handle subscription updated event
   */
  private async handleSubscriptionUpdated(eventData: any): Promise<void> {
    const subscription = eventData.object;
    const subscriptionId = subscription.id;
    const tier = subscription.metadata?.tier as SubscriptionTier || 'starter';

    console.log(`Subscription updated: ${subscriptionId} with tier: ${tier}`);

    // Update subscription record
    const prisma = getPrismaClient();
    await prisma.subscription.update({
      where: { stripeSubscriptionId: subscriptionId },
      data: {
        tier: tier,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      }
    });

    // Update user tier and subscription status
    const subscriptionRecord = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      include: { user: true }
    });

    if (subscriptionRecord?.user) {
      await prisma.user.update({
        where: { id: subscriptionRecord.user.id },
        data: {
          subscriptionStatus: subscription.status,
          tier: tier,
          subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
        }
      });
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
            tier: 'starter', // Reset to starter tier
            subscriptionExpiresAt: null,
          }
        });
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
        await prisma.user.update({
          where: { id: subscriptionRecord.user.id },
          data: {
            subscriptionStatus: 'past_due',
          }
        });
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

    // This is just a notification event, no action needed
    // The subscription will automatically transition to active when the trial ends
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
      await prisma.subscriptionEvent.create({
        data: {
          stripeEventId,
          eventType,
          eventData,
          subscriptionId,
        }
      });
    } catch (error) {
      console.error('Error logging webhook event:', error);
      // Don't throw here as this is just logging
    }
  }
}

// Export singleton instance
export const stripeService = new StripeService();
