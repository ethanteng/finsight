import Stripe from 'stripe';
import { getSubscriptionPlans, SubscriptionTier } from '../types/stripe';

// Initialize Stripe client
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
  typescript: true,
});

// Stripe configuration constants
export const STRIPE_CONFIG = {
  // Webhook endpoint secret for signature verification
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  
  // Success and cancel URLs for checkout
  successUrl: process.env.STRIPE_SUCCESS_URL || 'https://yourapp.com/register?session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: process.env.STRIPE_CANCEL_URL || 'https://yourapp.com/pricing',
  
  // Customer portal return URL
  portalReturnUrl: process.env.STRIPE_PORTAL_RETURN_URL || 'https://yourapp.com/profile',
  
  // Billing settings
  billingSettings: {
    collectionMethod: 'charge_automatically' as const,
    paymentBehavior: 'default_incomplete' as const,
    saveDefaultPaymentMethod: 'on_subscription' as const,
    expand: ['latest_invoice.payment_intent'],
  },
  
  // Subscription settings
  subscriptionSettings: {
    trialPeriodDays: undefined, // No trial for now
    prorationBehavior: 'create_prorations' as const,
    paymentSettings: {
      paymentMethodTypes: ['card'],
      saveDefaultPaymentMethod: 'on_subscription',
    },
  },
};

// Get Stripe price ID for a given tier
export function getStripePriceId(tier: SubscriptionTier): string {
  const plans = getSubscriptionPlans();
  const plan = plans[tier];
  if (!plan) {
    throw new Error(`Invalid subscription tier: ${tier}`);
  }
  return plan.stripePriceId;
}

// Get subscription tier from Stripe price ID
export function getTierFromPriceId(priceId: string): SubscriptionTier | null {
  const plans = getSubscriptionPlans();
  for (const [tier, plan] of Object.entries(plans)) {
    if (plan.stripePriceId === priceId) {
      return tier as SubscriptionTier;
    }
  }
  return null;
}

// Validate Stripe webhook signature
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

// Check if Stripe is properly configured
export function isStripeConfigured(): boolean {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_PUBLISHABLE_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

// Get Stripe publishable key for frontend
export function getPublishableKey(): string {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error('STRIPE_PUBLISHABLE_KEY is not configured');
  }
  return key;
}

// Log Stripe configuration status (for debugging)
export function logStripeConfig(): void {
  console.log('Stripe Configuration Status:');
  console.log(`- Secret Key: ${process.env.STRIPE_SECRET_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`- Publishable Key: ${process.env.STRIPE_PUBLISHABLE_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`- Webhook Secret: ${process.env.STRIPE_WEBHOOK_SECRET ? '✅ Configured' : '❌ Missing'}`);
  console.log(`- Price IDs:`);
  const plans = getSubscriptionPlans();
  Object.entries(plans).forEach(([tier, plan]) => {
    console.log(`  - ${tier}: ${plan.stripePriceId}`);
  });
}
