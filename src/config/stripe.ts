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
  
  // Checkout session URLs
  checkout: {
    successUrl: process.env.STRIPE_CHECKOUT_SUCCESS_URL || '/api/stripe/payment-success',
    cancelUrl: process.env.STRIPE_CHECKOUT_CANCEL_URL || '/pricing',
    // Add query parameters for better tracking
    successUrlWithParams: (tier: string, email?: string) => {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      let url = `${baseUrl}/api/stripe/payment-success?tier=${encodeURIComponent(tier)}`;
      if (email) {
        url += `&customer_email=${encodeURIComponent(email)}`;
      }
      return url;
    }
  },
  
  // Customer portal URLs
  portal: {
    returnUrl: process.env.STRIPE_PORTAL_RETURN_URL || '/profile',
    // URL after subscription cancellation
    cancelReturnUrl: process.env.STRIPE_PORTAL_CANCEL_RETURN_URL || '/profile?subscription=canceled',
    // URL after subscription update
    updateReturnUrl: process.env.STRIPE_PORTAL_UPDATE_RETURN_URL || '/profile?subscription=updated'
  },
  
  // Account link URLs (for Connect accounts if needed)
  account: {
    refreshUrl: process.env.STRIPE_ACCOUNT_REFRESH_URL || '/stripe/account/refresh',
    returnUrl: process.env.STRIPE_ACCOUNT_RETURN_URL || '/stripe/account/return'
  },
  
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
  // First check against static plans
  const plans = getSubscriptionPlans();
  for (const [tier, plan] of Object.entries(plans)) {
    if (plan.stripePriceId === priceId) {
      return tier as SubscriptionTier;
    }
  }
  
  // If not found in static plans, try to determine tier from Stripe API
  // This handles cases where price IDs are real Stripe IDs
  if (priceId.startsWith('price_')) {
    try {
      // For now, return a default tier based on common patterns
      // You can enhance this by making an API call to Stripe to get product details
      console.log(`Price ID ${priceId} not found in static plans, using default tier mapping`);
      
      // You could make this configurable via environment variables
      // For now, we'll need to add the real price IDs to the environment
      return null;
    } catch (error) {
      console.error('Error determining tier from Stripe price ID:', error);
      return null;
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
