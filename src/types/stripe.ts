// Stripe Subscription Types and Interfaces

export interface StripeSubscription {
  id: string;
  customerId: string;
  status: StripeSubscriptionStatus;
  tier: SubscriptionTier;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  metadata?: Record<string, string>;
}

export type StripeSubscriptionStatus = 
  | 'active'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'trialing'
  | 'unpaid'
  | 'paused';

export type SubscriptionTier = 'starter' | 'standard' | 'premium';

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
  created: number;
  livemode: boolean;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
  customer: string;
  subscription: string;
  metadata: Record<string, string>;
}

export interface StripeCustomerPortalSession {
  url: string;
}

// Webhook Event Types
export type StripeWebhookEventType = 
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'customer.subscription.paused'
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed'
  | 'invoice.payment_action_required'
  | 'customer.subscription.trial_will_end';

// Database Models
export interface Subscription {
  id: string;
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  tier: SubscriptionTier;
  status: StripeSubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionEvent {
  id: string;
  subscriptionId?: string;
  stripeEventId: string;
  eventType: StripeWebhookEventType;
  eventData: any;
  processedAt: Date;
}

// API Request/Response Types
export interface CreateCheckoutSessionRequest {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}

export interface CreateCheckoutSessionResponse {
  sessionId: string;
  url: string;
}

export interface CreatePortalSessionRequest {
  returnUrl: string;
}

export interface CreatePortalSessionResponse {
  url: string;
}

// Tier Access Control
export interface TierAccess {
  starter: string[];
  standard: string[];
  premium: string[];
}

export const TIER_ACCESS: TierAccess = {
  starter: ['basic-analysis', 'account-balances'],
  standard: ['basic-analysis', 'account-balances', 'economic-indicators', 'rag-system'],
  premium: ['basic-analysis', 'account-balances', 'economic-indicators', 'rag-system', 'live-market-data']
};

// Subscription Plan Configuration
export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'day' | 'week' | 'month' | 'year';
  features: string[];
  stripePriceId: string;
}

export function getSubscriptionPlans(): Record<SubscriptionTier, SubscriptionPlan> {
  return {
    starter: {
      id: 'starter',
      name: 'Starter',
      price: 9.99,
      currency: 'usd',
      interval: 'month',
      features: ['Basic financial analysis', 'Account balances', 'Transaction history'],
      stripePriceId: process.env.STRIPE_PRICE_STARTER || 'price_starter'
    },
    standard: {
      id: 'standard',
      name: 'Standard',
      price: 19.99,
      currency: 'usd',
      interval: 'month',
      features: [
        'Basic financial analysis',
        'Account balances', 
        'Transaction history',
        'Economic indicators',
        'RAG system access'
      ],
      stripePriceId: process.env.STRIPE_PRICE_STANDARD || 'price_standard'
    },
    premium: {
      id: 'premium',
      name: 'Premium',
      price: 39.99,
      currency: 'usd',
      interval: 'month',
      features: [
        'Basic financial analysis',
        'Account balances',
        'Transaction history', 
        'Economic indicators',
        'RAG system access',
        'Live market data',
        'Advanced analytics'
      ],
      stripePriceId: process.env.STRIPE_PRICE_PREMIUM || 'price_premium'
    }
  };
}

export const SUBSCRIPTION_PLANS = getSubscriptionPlans();

// Function to fetch live pricing from Stripe API
export async function getLiveSubscriptionPlans(): Promise<Record<SubscriptionTier, SubscriptionPlan>> {
  try {
    // Import Stripe client dynamically to avoid circular dependencies
    const { stripe } = await import('../config/stripe');
    
    const plans = getSubscriptionPlans();
    const livePlans: Record<SubscriptionTier, SubscriptionPlan> = {} as Record<SubscriptionTier, SubscriptionPlan>;
    
    // Fetch live pricing for each plan
    for (const [tier, plan] of Object.entries(plans)) {
      try {
        if (plan.stripePriceId && plan.stripePriceId.startsWith('price_')) {
          const price = await stripe.client.prices.retrieve(plan.stripePriceId);
          
          livePlans[tier as SubscriptionTier] = {
            ...plan,
            price: (price.unit_amount || 0) / 100, // Convert from cents
            currency: price.currency,
            interval: price.recurring?.interval || 'month'
          };
        } else {
          // Fallback to static plan if no valid Stripe price ID
          livePlans[tier as SubscriptionTier] = plan;
        }
      } catch (error) {
        console.warn(`Failed to fetch live pricing for ${tier}:`, error);
        // Fallback to static plan
        livePlans[tier as SubscriptionTier] = plan;
      }
    }
    
    return livePlans;
  } catch (error) {
    console.error('Failed to fetch live subscription plans:', error);
    // Fallback to static plans
    return getSubscriptionPlans();
  }
}
