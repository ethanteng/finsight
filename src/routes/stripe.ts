import express from 'express';
import { stripeService } from '../services/stripe';
import { constructWebhookEvent } from '../config/stripe';
import { CreateCheckoutSessionRequest, CreatePortalSessionRequest } from '../types/stripe';
import { getPrismaClient } from '../prisma-client';
import { stripe } from '../config/stripe'; // Added for payment success endpoint
import { requireAuth, requireAuthAllowLapsedSubscription } from '../auth/middleware';
import { getDefaultPrice, minorToMajor } from '../config/stripe-pricing';

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

    // Catalog price, used as the last resort for the Google Ads conversion value
    // when the session itself does not carry an amount.
    const resolvedPrice = await getDefaultPrice();

    // Verify the session with Stripe to ensure it's legitimate. line_items is
    // expanded so the conversion value can come from what this session actually
    // sold rather than from the current catalog price.
    try {
      const session = await stripe.client.checkout.sessions.retrieve(session_id as string, {
        expand: ['line_items']
      });

      const isPaid = session.payment_status === 'paid';
      const isTrial = session.payment_status === 'no_payment_required' && session.status === 'complete';

      if (!isPaid && !isTrial) {
        console.error('Checkout session is not complete:', {
          paymentStatus: session.payment_status,
          sessionStatus: session.status
        });
        return res.status(400).json({
          error: 'Checkout not completed',
          code: 'CHECKOUT_NOT_COMPLETED'
        });
      }

      // Get customer email from the session. Accounts store emails lowercased
      // (see /auth/register); Stripe may return mixed case, so normalize before
      // lookup or a returning subscriber is treated as brand-new and never linked.
      const customerEmailRaw = session.customer_details?.email || (customer_email as string);
      const customerEmail = typeof customerEmailRaw === 'string'
        ? customerEmailRaw.toLowerCase()
        : undefined;
      console.log('Customer email from session:', customerEmail);

      // Determine tier and value for Google Ads tracking. Prefer what this
      // session sold: the subscription line item, then the amount actually
      // charged. A trial charges 0 up front, so fall through to the recurring
      // price rather than reporting a 0-value signup; the catalog price is the
      // last resort, and can differ from what this customer was sold.
      const tierName = (tier as string) || 'premium';
      const soldUnitAmount = session.line_items?.data?.[0]?.price?.unit_amount;
      const soldCurrency = session.line_items?.data?.[0]?.price?.currency || session.currency;
      const conversionCurrency = soldCurrency || resolvedPrice.currency;

      let conversionValue: number;
      if (typeof soldUnitAmount === 'number' && soldUnitAmount > 0) {
        conversionValue = minorToMajor(soldUnitAmount, conversionCurrency);
      } else if (typeof session.amount_total === 'number' && session.amount_total > 0) {
        conversionValue = minorToMajor(session.amount_total, conversionCurrency);
      } else {
        conversionValue = resolvedPrice.amount;
      }

      // Check if user already exists
      const prisma = getPrismaClient();
      let existingUser = null;
      
      if (customerEmail) {
        existingUser = await prisma.user.findUnique({
          where: { email: customerEmail }
        });
      }

      // Prepare response with tracking data
      const responseData: any = {
        success: true,
        paid: isPaid,
        trialing: isTrial,
        amount: conversionValue,
        currency: conversionCurrency.toUpperCase(),
        session_id: session_id as string,
        tier: tierName
      };

      if (existingUser) {
        // Returning subscriber. Checkout created a fresh Stripe customer, so the
        // webhook alone may not reach this account - link the session here too,
        // or they pay and stay locked out of the account they paid for.
        console.log('User already exists, linking checkout session to their account');

        // Anyone can run a checkout with someone else's email, so never let one
        // repoint an account that is already subscribed: cancelling the planted
        // subscription would lock the real subscriber out.
        const workingSubscription = await prisma.subscription.findFirst({
          where: {
            userId: existingUser.id,
            status: { in: ['active', 'trialing'] }
          }
        });

        let linked = false;
        let skippedForExistingSubscription = false;
        if (workingSubscription) {
          console.warn(`User ${existingUser.id} already has a working subscription; not relinking from checkout`);
          skippedForExistingSubscription = true;
        } else {
          try {
            const linkResult = await stripeService.linkCheckoutSessionToUser({
              userId: existingUser.id,
              email: existingUser.email,
              checkoutSessionId: session_id as string
            });
            linked = linkResult.linked;
            // Linker re-checks for a concurrent activation; treat that the same
            // as the pre-check so we never claim success for an orphaned checkout.
            if (linkResult.skippedForExistingSubscription) {
              skippedForExistingSubscription = true;
            }
          } catch (linkError) {
            console.error('Failed to link checkout session to existing user:', linkError);
          }
        }

        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
        // Send them to sign in rather than to /profile: they are not
        // authenticated here, and every page behind /app needs a session.
        const loginParams = new URLSearchParams({ email: existingUser.email });

        if (skippedForExistingSubscription) {
          // This checkout was deliberately not attached, so it is now an
          // orphaned Stripe subscription that somebody is paying for. Say so
          // instead of showing the "your subscription is ready" banner over a
          // payment that never landed on this account.
          loginParams.set(
            'message',
            'This account already has an active subscription, so this checkout was not applied to it. Please contact support so the duplicate can be refunded.'
          );
        } else {
          loginParams.set('subscription', 'success');
          loginParams.set('tier', tierName);
          if (!linked) {
            loginParams.set(
              'message',
              'Your payment went through. If you still cannot sign in a few minutes from now, please contact support.'
            );
          }
        }
        const redirectUrl = `${baseUrl}/login?${loginParams.toString()}`;
        responseData.linked = linked;
        if (skippedForExistingSubscription) {
          responseData.code = 'ACCOUNT_ALREADY_SUBSCRIBED';
        }
        responseData.redirectUrl = redirectUrl;
        responseData.redirect = redirectUrl;
        responseData.message = 'Existing user, redirecting to sign in';
        return res.json(responseData);
      } else {
        // New user - redirect to register with subscription context
        console.log('New user, redirecting to register with subscription context');
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
        // Build query parameters, only including email if it exists
        const queryParams = new URLSearchParams({
          subscription: 'success',
          tier: tierName,
          session_id: session_id as string
        });
        if (customerEmail) {
          queryParams.set('email', customerEmail);
        }
        const registerUrl = `${baseUrl}/register?${queryParams.toString()}`;
        responseData.redirectUrl = registerUrl;
        responseData.redirect = registerUrl;
        responseData.message = 'New user, redirecting to registration';
        return res.json(responseData);
      }

    } catch (stripeError) {
      console.error('Error verifying Stripe session:', stripeError);
      // Fallback: redirect to register anyway
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const registerUrl = `${baseUrl}/register?subscription=success&tier=${tier || 'premium'}`;
      return res.json({ 
        success: true,
        paid: false,
        redirectUrl: registerUrl,
        redirect: registerUrl,
        message: 'Fallback redirect due to Stripe verification error'
      });
    }

  } catch (error) {
    console.error('Error handling payment success:', error);
    // Fallback: redirect to register
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const registerUrl = `${baseUrl}/register?subscription=success`;
    return res.json({ 
      success: true,
      paid: false,
      redirectUrl: registerUrl,
      redirect: registerUrl,
      message: 'Fallback redirect due to general error'
    });
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

    // Validate the tier, then charge the same price ID the marketing site
    // advertises (live Stripe lookup, or the paired $19 fallback). Using the
    // env price ID here while /api/stripe/price served the fallback amount
    // would let checkout charge a different price than the page showed.
    const { getStripePriceId } = await import('../config/stripe');
    try {
      getStripePriceId(tier as any);
    } catch {
      return res.status(400).json({
        error: `Invalid tier: ${tier}`
      });
    }
    const priceId = (await getDefaultPrice()).priceId;

    // Create checkout session request
    const checkoutRequest: CreateCheckoutSessionRequest = {
      priceId,
      successUrl,
      cancelUrl,
      customerEmail
    };

    // A signed-in user (including a lapsed one renewing) already has a Stripe
    // customer. Reusing it keeps their billing history on one customer instead
    // of scattering it across a new one per checkout. The identity comes from
    // the session, never from the request body - an email in the body would let
    // a caller attach their checkout to somebody else's customer.
    const authenticatedUserId = req.user?.id;
    if (authenticatedUserId) {
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({
        where: { id: authenticatedUserId },
        select: { id: true, email: true, stripeCustomerId: true }
      });

      if (user) {
        checkoutRequest.customerEmail = user.email;
        if (user.stripeCustomerId) {
          checkoutRequest.customerId = user.stripeCustomerId;
        }

        // Anyone who has held a subscription before has already used the
        // introductory trial.
        const priorSubscriptions = await prisma.subscription.count({
          where: { userId: user.id }
        });
        checkoutRequest.skipTrial = priorSubscriptions > 0;
      }
    }

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
router.post('/create-portal-session', requireAuthAllowLapsedSubscription, async (req, res) => {
  try {
    const request: CreatePortalSessionRequest = req.body;

    // Validate required fields
    if (!request.returnUrl) {
      return res.status(400).json({
        error: 'Missing required fields: returnUrl'
      });
    }

    // 🔒 SECURITY: the customer comes from the session, never from the request.
    // A caller-supplied customer ID would hand anyone the billing portal for
    // any account.
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { stripeCustomerId: true }
    });

    if (!user?.stripeCustomerId) {
      return res.status(404).json({
        error: 'No billing account found for this user',
        code: 'NO_STRIPE_CUSTOMER'
      });
    }

    // Create portal session
    const response = await stripeService.createPortalSession(request, user.stripeCustomerId);

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
 * GET /api/stripe/price
 * Public: the single subscription price we charge, resolved live from Stripe
 * using STRIPE_PRICE_DEFAULT. The marketing site reads this so displayed and
 * charged prices can never disagree.
 */
router.get('/price', async (req, res) => {
  try {
    // Never throws: returns the fallback price when Stripe is unreachable.
    const price = await getDefaultPrice();
    // Short-lived shared cache: a price change should show up quickly, but a
    // burst of marketing traffic should not become a burst of Stripe calls.
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    res.json({ success: true, price });
  } catch (error) {
    console.error('Error resolving default Stripe price:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve subscription price',
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
router.get('/subscription-status', requireAuthAllowLapsedSubscription, async (req, res) => {
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
 * 🔒 SECURITY: Requires authentication to prevent cross-user access checks
 */
router.post('/check-feature-access', requireAuth, async (req, res) => {
  try {
    const { requiredTier } = req.body;
    const userId = req.user?.id; // Get user ID from authenticated session
    
    if (!userId || !requiredTier) {
      return res.status(400).json({
        error: 'Missing required fields: requiredTier',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // 🔒 SECURITY: Users can only check their own feature access
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
