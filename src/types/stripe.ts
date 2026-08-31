// Stripe Subscription Types and Interfaces

import {
  FALLBACK_PRICE_CURRENCY,
  FALLBACK_PRICE_UNIT_AMOUNT,
  getDefaultStripePriceId,
  minorToMajor,
} from '../config/stripe-pricing';

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
  // Reuse the Stripe customer we already know about instead of letting Checkout
  // mint a second one for the same person.
  customerId?: string;
  // A returning subscriber has already used the introductory trial.
  skipTrial?: boolean;
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
  premium: ['basic-analysis', 'account-balances', 'economic-indicators', 'rag-system', 'advanced-market-context']
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

// Single price ID for all tiers (single-tier pricing model).
// The ID comes from STRIPE_PRICE_DEFAULT; nothing is hardcoded, so the price we
// charge follows the environment rather than a literal in this file.
function singlePriceId(): string {
  return getDefaultStripePriceId();
}

// Only used when Stripe cannot be reached. Real amounts come from
// getLiveSubscriptionPlans(), which reads them back from the Stripe price.
export const FALLBACK_MONTHLY_PRICE = minorToMajor(
  FALLBACK_PRICE_UNIT_AMOUNT,
  FALLBACK_PRICE_CURRENCY
);

export function getSubscriptionPlans(): Record<SubscriptionTier, SubscriptionPlan> {
  return {
    starter: {
      id: 'starter',
      name: 'Starter',
      price: FALLBACK_MONTHLY_PRICE,
      currency: 'usd',
      interval: 'month',
      features: ['Basic financial analysis', 'Account balances', 'Transaction history'],
      stripePriceId: singlePriceId()
    },
    standard: {
      id: 'standard',
      name: 'Standard',
      price: FALLBACK_MONTHLY_PRICE,
      currency: 'usd',
      interval: 'month',
      features: [
        'Basic financial analysis',
        'Account balances', 
        'Transaction history',
        'Economic indicators',
        'RAG system access'
      ],
      stripePriceId: singlePriceId()
    },
    premium: {
      id: 'premium',
      name: 'Premium',
      price: FALLBACK_MONTHLY_PRICE,
      currency: 'usd',
      interval: 'month',
      features: [
        'Basic financial analysis',
        'Account balances',
        'Transaction history', 
        'Economic indicators',
        'RAG system access',
        'Advanced market context',
        'Advanced analytics'
      ],
      stripePriceId: singlePriceId()
    }
  };
}


// Single-tier pricing configuration.
// All subscription tiers (starter/standard/premium) resolve to the same price,
// read from STRIPE_PRICE_DEFAULT at call time so a price change needs no deploy.
export function getSingleTierPriceId(): string | null {
  return getDefaultStripePriceId();
}

// Fetch live pricing from Stripe. Every tier resolves to the same price, so
// this reads it once through the shared cache instead of once per tier.
export async function getLiveSubscriptionPlans(): Promise<Record<SubscriptionTier, SubscriptionPlan>> {
  const plans = getSubscriptionPlans();

  // Never throws: falls back to the advertised default when Stripe is down.
  const { getDefaultPrice } = await import('../config/stripe-pricing');
  const resolved = await getDefaultPrice();

  const livePlans = {} as Record<SubscriptionTier, SubscriptionPlan>;
  for (const [tier, plan] of Object.entries(plans)) {
    livePlans[tier as SubscriptionTier] = {
      ...plan,
      price: resolved.amount,
      currency: resolved.currency,
      interval: resolved.interval,
      stripePriceId: resolved.priceId,
    };
  }
  return livePlans;
}
