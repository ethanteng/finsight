import express from 'express';
import { stripeService } from '../services/stripe';
import { constructWebhookEvent } from '../config/stripe';
import { CreateCheckoutSessionRequest, CreatePortalSessionRequest } from '../types/stripe';
import { getPrismaClient } from '../prisma-client';
import { stripe } from '../config/stripe'; // Added for payment success endpoint
import { requireAuth } from '../auth/middleware';

const router = express.Router();

/**
 * GET /api/stripe/payment-success
 * Handle successful payment completion and redirect to signup
 * This endpoint is called by Stripe after successful payment
 */
router.get('/payment-success', async (req, res) => {
  try {
    const { session_id, subscription_id, customer_email, tier } = req.query;
    
    console.log('🎉 Payment success callback received:', {
      sessionId: session_id,
      subscriptionId: subscription_id,
      customerEmail: customer_email,
      tier
    });

    // Validate required parameters
    if (!session_id) {
      console.error('Missing required session_id parameter for payment success');
      return res.status(400).json({
        error: 'Missing required session_id parameter',
        code: 'MISSING_SESSION_ID'
      });
    }

    // Verify the session with Stripe to ensure it's legitimate
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id as string);
      
      if (session.payment_status !== 'paid') {
        console.error('Session payment status is not paid:', session.payment_status);
        return res.status(400).json({
          error: 'Payment not completed',
          code: 'PAYMENT_NOT_COMPLETED'
        });
      }

      // Get customer email from the session
      const customerEmail = session.customer_details?.email || (customer_email as string);
      console.log('Customer email from session:', customerEmail);

      // Check if user already exists
      const prisma = getPrismaClient();
      let existingUser = null;
      
      if (customerEmail) {
        existingUser = await prisma.user.findUnique({
          where: { email: customerEmail }
        });
      }

      if (existingUser) {
        // User exists - redirect to dashboard or profile
        console.log('User already exists, redirecting to dashboard');
        const redirectUrl = `http://localhost:3001/profile?subscription=active&tier=${tier || 'standard'}`;
        return res.redirect(redirectUrl);
      } else {
        // New user - redirect to register with subscription context
        console.log('New user, redirecting to register with subscription context');
        const registerUrl = `http://localhost:3001/register?` + 
          `subscription=success&tier=${tier || 'standard'}&email=${encodeURIComponent(customerEmail as string)}&session_id=${session_id}`;
        return res.redirect(registerUrl);
      }

    } catch (stripeError) {
      console.error('Error verifying Stripe session:', stripeError);
      // Fallback: redirect to register anyway
      const registerUrl = `http://localhost:3001/register?subscription=success&tier=${tier || 'standard'}`;
      return res.redirect(registerUrl);
    }

  } catch (error) {
    console.error('Error handling payment success:', error);
    // Fallback: redirect to register
    const registerUrl = `http://localhost:3001/register?subscription=success`;
    return res.redirect(registerUrl);
  }
});

/**
 * POST /api/stripe/create-checkout-session
 * Create a Stripe Checkout session for subscription
 */
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { tier, successUrl, cancelUrl, customerEmail } = req.body;
    
    // Validate required fields
    if (!tier || !successUrl || !cancelUrl) {
      return res.status(400).json({
        error: 'Missing required fields: tier, successUrl, cancelUrl'
      });
    }

    // Get the Stripe price ID for the tier
    const { getStripePriceId } = await import('../config/stripe');
    const priceId = getStripePriceId(tier as any);
    
    if (!priceId) {
      return res.status(400).json({
        error: `Invalid tier: ${tier}`
      });
    }

    // Create checkout session request
    const checkoutRequest = {
      priceId,
      successUrl,
      cancelUrl,
      customerEmail
    };

    // Create checkout session
    const response = await stripeService.createCheckoutSession(checkoutRequest);
    
    res.json(response);
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      error: 'Failed to create checkout session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/stripe/webhooks
 * Handle Stripe webhook events
 */
router.post('/webhooks', async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    
    if (!signature) {
      console.error('Missing Stripe signature header');
      return res.status(400).json({ error: 'Missing signature' });
    }

    // Get the webhook secret from environment
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    
    // For local testing, allow test signatures or bypass verification entirely
    if (signature === 'test_signature_for_local_testing' || !process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
      console.log('🔧 Local development mode - bypassing signature verification');
      console.log('🔧 NODE_ENV:', process.env.NODE_ENV);
      
      // Parse the raw body for development mode
      let parsedBody;
      try {
        parsedBody = JSON.parse(req.body.toString());
        console.log('🔧 Parsed webhook body:', { id: parsedBody.id, type: parsedBody.type });
      } catch (parseError) {
        console.error('🔧 Failed to parse webhook body:', parseError);
        return res.status(400).json({ error: 'Invalid JSON in webhook body' });
      }
      
      // In development mode, reconstruct the proper event structure that handlers expect
      event = {
        id: parsedBody.id,
        type: parsedBody.type,
        data: {
          object: parsedBody.data.object || parsedBody.data
        }
      };
    } else if (webhookSecret) {
      try {
        // Verify webhook signature for production
        event = constructWebhookEvent(req.body, signature, webhookSecret);
      } catch (err) {
        console.error('Webhook signature verification failed:', err);
        return res.status(400).json({ error: 'Invalid signature' });
      }
    } else {
      console.error('STRIPE_WEBHOOK_SECRET not configured and not in test mode');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    console.log(`Received webhook event: ${event.type}`);

    // Log the webhook event
    // Extract subscription ID safely from different event types
    let subscriptionId: string | undefined;
    let stripeSubscriptionId: string | undefined;
    
    if (event.data.object && typeof event.data.object === 'object') {
      const eventObject = event.data.object as any;
      
      // For invoice events, get the subscription ID from the invoice
      if (event.type.startsWith('invoice.')) {
        stripeSubscriptionId = eventObject.subscription;
      } else if (event.type.startsWith('customer.subscription.')) {
        // For subscription events, use the subscription ID
        stripeSubscriptionId = eventObject.id;
      }
      
      // Only try to find our internal subscription ID if we have a Stripe subscription ID
      if (stripeSubscriptionId) {
        try {
          const prisma = getPrismaClient();
          const existingSubscription = await prisma.subscription.findUnique({
            where: { stripeSubscriptionId: stripeSubscriptionId },
            select: { id: true }
          });
          
          if (existingSubscription) {
            subscriptionId = existingSubscription.id;
          } else {
            console.log(`Stripe subscription ${stripeSubscriptionId} not found in our database yet, logging event without subscription reference`);
          }
        } catch (dbError) {
          console.log(`Error looking up subscription ${stripeSubscriptionId}, logging event without subscription reference:`, dbError);
        }
      }
    }
    
    await stripeService.logWebhookEvent(
      event.id,
      event.type,
      event.data,
      subscriptionId
    );

    // Process the webhook event
    await stripeService.processWebhookEvent(event.type as any, event.data);

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      error: 'Failed to process webhook',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/stripe/create-portal-session
 * Create a Customer Portal session for subscription management
 */
router.post('/create-portal-session', async (req, res) => {
  try {
    const request: CreatePortalSessionRequest = req.body;
    const { customerId } = req.body;
    
    // Validate required fields
    if (!request.returnUrl || !customerId) {
      return res.status(400).json({
        error: 'Missing required fields: returnUrl, customerId'
      });
    }

    // Create portal session
    const response = await stripeService.createPortalSession(request, customerId);
    
    res.json(response);
  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({
      error: 'Failed to create portal session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/stripe/plans
 * Get available subscription plans
 */
router.get('/plans', async (req, res) => {
  try {
    // Import here to avoid circular dependency issues
    const { getLiveSubscriptionPlans } = require('../types/stripe');
    
    // Get live pricing from Stripe API
    const plans = await getLiveSubscriptionPlans();
    
    res.json({
      plans: plans,
      success: true
    });
  } catch (error) {
    console.error('Error getting subscription plans:', error);
    res.status(500).json({
      error: 'Failed to get subscription plans',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/stripe/subscription-status
 * Get current user's subscription status and access level
 */
router.get('/subscription-status', requireAuth, async (req, res) => {
  try {
    // Get user ID from auth middleware
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(400).json({
        error: 'User ID required',
        code: 'USER_ID_REQUIRED'
      });
    }

    // Get subscription status from Stripe service
    const subscriptionStatus = await stripeService.getUserSubscriptionStatus(userId);
    
    // Also get user's Stripe customer ID
    const { getPrismaClient } = await import('../prisma-client');
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true }
    });
    
    console.log('🔍 Subscription status response for user:', userId);
    console.log('🔍 Full subscription status object:', JSON.stringify(subscriptionStatus, null, 2));
    console.log('🔍 User stripeCustomerId:', user?.stripeCustomerId);
    
    res.json({
      success: true,
      ...subscriptionStatus,
      stripeCustomerId: user?.stripeCustomerId || null
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({
      error: 'Failed to get subscription status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/stripe/check-feature-access
 * Check if user can access a specific feature
 */
router.post('/check-feature-access', async (req, res) => {
  try {
    const { userId, requiredTier } = req.body;
    
    if (!userId || !requiredTier) {
      return res.status(400).json({
        error: 'Missing required fields: userId, requiredTier',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Check feature access
    const accessResult = await stripeService.canAccessFeature(userId, requiredTier);
    
    res.json({
      success: true,
      access: accessResult
    });
  } catch (error) {
    console.error('Error checking feature access:', error);
    res.status(500).json({
      error: 'Failed to check feature access',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/stripe/config
 * Get Stripe configuration for frontend
 */
router.get('/config', (req, res) => {
  try {
    const { getPublishableKey } = require('../config/stripe');
    
    res.json({
      publishableKey: getPublishableKey(),
      success: true
    });
  } catch (error) {
    console.error('Error getting Stripe config:', error);
    res.status(500).json({
      error: 'Failed to get Stripe configuration',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
