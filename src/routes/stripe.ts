import express from 'express';
import { stripeService } from '../services/stripe';
import { constructWebhookEvent } from '../config/stripe';
import { CreateCheckoutSessionRequest, CreatePortalSessionRequest } from '../types/stripe';

const router = express.Router();

/**
 * POST /api/stripe/create-checkout-session
 * Create a Stripe Checkout session for subscription
 */
router.post('/create-checkout-session', async (req, res) => {
  try {
    const request: CreateCheckoutSessionRequest = req.body;
    
    // Validate required fields
    if (!request.priceId || !request.successUrl || !request.cancelUrl) {
      return res.status(400).json({
        error: 'Missing required fields: priceId, successUrl, cancelUrl'
      });
    }

    // Create checkout session
    const response = await stripeService.createCheckoutSession(request);
    
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
router.post('/webhooks', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    
    if (!signature) {
      console.error('Missing Stripe signature header');
      return res.status(400).json({ error: 'Missing signature' });
    }

    // Get the webhook secret from environment
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    let event;
    try {
      // Verify webhook signature
      event = constructWebhookEvent(req.body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    console.log(`Received webhook event: ${event.type}`);

    // Log the webhook event
    // Extract subscription ID safely from different event types
    let subscriptionId: string | undefined;
    if (event.data.object && typeof event.data.object === 'object') {
      const eventObject = event.data.object as any;
      subscriptionId = eventObject.subscription || eventObject.id;
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
