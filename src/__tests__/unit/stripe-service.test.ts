import { stripeService } from '../../services/stripe';
import { getPrismaClient } from '../../prisma-client';

jest.mock('../../services/stripe-email', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendTierChangeEmail: jest.fn().mockResolvedValue(true),
  sendCancellationEmail: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../analytics/heycatch', () => ({
  analytics: {
    setIdentity: jest.fn().mockResolvedValue(undefined),
    trackEvent: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock Stripe
jest.mock('../../config/stripe', () => ({
  STRIPE_CONFIG: {
    subscriptionSettings: {
      trialPeriodDays: 30
    }
  },
  stripe: {
    client: {
      checkout: {
        sessions: {
          create: jest.fn()
        }
      },
      billingPortal: {
        sessions: {
        create: jest.fn()
        }
      },
      subscriptions: {
        retrieve: jest.fn(),
        update: jest.fn()
      }
    }
  },
  getStripePriceId: jest.fn(),
  getTierFromPriceId: jest.fn(),
  constructWebhookEvent: jest.fn(),
  getPublishableKey: jest.fn().mockReturnValue('pk_test_mock_key'),
  isStripeConfigured: jest.fn().mockReturnValue(true)
}));

// Mock Prisma
jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn()
}));

describe('StripeService', () => {
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock Prisma client
    mockPrisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn()
      },
      subscription: {
        create: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn()
      },
      subscriptionEvent: {
        create: jest.fn()
      }
    };
    
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
  });

  describe('createCheckoutSession', () => {
    it('should create a checkout session successfully', async () => {
      const mockStripe = require('../../config/stripe');
      const mockSession = {
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test'
      };
      
      mockStripe.stripe.client.checkout.sessions.create.mockResolvedValue(mockSession);
      mockStripe.getTierFromPriceId.mockReturnValue('standard');

      const request = {
        priceId: 'price_test_123',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        customerEmail: 'test@example.com'
      };

      const result = await stripeService.createCheckoutSession(request);

      expect(result).toEqual({
        sessionId: 'cs_test_123',
        url: 'https://checkout.stripe.com/test'
      });
      expect(mockStripe.stripe.client.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          payment_method_types: ['card'],
          line_items: [{ price: 'price_test_123', quantity: 1 }],
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
          customer_email: 'test@example.com',
          subscription_data: expect.objectContaining({
            trial_period_days: 30
          })
        })
      );
    });

    it('should throw error for invalid price ID', async () => {
      const mockStripe = require('../../config/stripe');
      mockStripe.getTierFromPriceId.mockReturnValue(null);

      const request = {
        priceId: 'invalid_price',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel'
      };

      await expect(stripeService.createCheckoutSession(request))
        .rejects
        .toThrow('Invalid price ID: invalid_price');
    });
  });

  describe('createPortalSession', () => {
    it('should create a portal session successfully', async () => {
      const mockStripe = require('../../config/stripe');
      const mockSession = {
        url: 'https://billing.stripe.com/test'
      };
      
      mockStripe.stripe.client.billingPortal.sessions.create.mockResolvedValue(mockSession);

      const request = {
        returnUrl: 'https://example.com/return'
      };

      const result = await stripeService.createPortalSession(request, 'cus_test_123');

      expect(result).toEqual({
        url: 'https://billing.stripe.com/test'
      });
      expect(mockStripe.stripe.client.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_test_123',
        return_url: 'https://example.com/return'
      });
    });
  });

  describe('logWebhookEvent', () => {
    it('should log webhook event successfully', async () => {
      const mockEventData = { test: 'data' };
      
      await stripeService.logWebhookEvent(
        'evt_test_123',
        'customer.subscription.created',
        mockEventData,
        'sub_test_123'
      );

      expect(mockPrisma.subscriptionEvent.create).toHaveBeenCalledWith({
        data: {
          stripeEventId: 'evt_test_123',
          eventType: 'customer.subscription.created',
          eventData: mockEventData
        }
      });
    });

    it('should handle logging errors gracefully', async () => {
      mockPrisma.subscriptionEvent.create.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(stripeService.logWebhookEvent(
        'evt_test_123',
        'customer.subscription.created',
        {},
        'sub_test_123'
      )).resolves.toBeUndefined();
    });
  });

  describe('processWebhookEvent', () => {
    it('should handle subscription created event', async () => {
      const { sendWelcomeEmail } = require('../../services/stripe-email');
      const { analytics } = require('../../analytics/heycatch');
      const mockUser = {
        id: 'user_123',
        email: 'test@example.com'
      };
      
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.subscription.findUnique.mockResolvedValue(null);
      mockPrisma.subscription.upsert.mockResolvedValue({ id: 'sub_123' });
      mockPrisma.user.update.mockResolvedValue({ id: 'user_123' });

      const eventData = {
        object: {
          id: 'sub_test_123',
          customer: 'cus_test_123',
          status: 'active',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          cancel_at_period_end: false,
          metadata: { tier: 'standard' }
        }
      };

      await stripeService.processWebhookEvent('customer.subscription.created', eventData);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_test_123' }
      });
      expect(mockPrisma.subscription.upsert).toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(sendWelcomeEmail).toHaveBeenCalledWith('test@example.com', 'standard');
      expect(analytics.trackEvent).toHaveBeenCalledWith(
        'subscription_started',
        { plan: 'standard' },
        { userId: 'user_123' }
      );
    });

    it('should skip one-time side effects when a subscription created event is replayed', async () => {
      const { sendWelcomeEmail } = require('../../services/stripe-email');
      const { analytics } = require('../../analytics/heycatch');

      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com'
      });
      mockPrisma.subscription.findUnique.mockResolvedValue({ id: 'sub_123' });
      mockPrisma.subscription.upsert.mockResolvedValue({ id: 'sub_123' });
      mockPrisma.user.update.mockResolvedValue({ id: 'user_123' });

      await stripeService.processWebhookEvent('customer.subscription.created', {
        object: {
          id: 'sub_test_123',
          customer: 'cus_test_123',
          status: 'trialing',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          cancel_at_period_end: false,
          metadata: { tier: 'premium' }
        }
      });

      expect(mockPrisma.subscription.upsert).toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(sendWelcomeEmail).not.toHaveBeenCalled();
      expect(analytics.setIdentity).not.toHaveBeenCalled();
      expect(analytics.trackEvent).not.toHaveBeenCalled();
    });

    it('should preserve trialing status on a successful trial invoice', async () => {
      const mockStripe = require('../../config/stripe');
      const subscriptionRecord = {
        id: 'sub_123',
        tier: 'premium',
        user: {
          id: 'user_123',
          email: 'test@example.com',
          tier: 'premium'
        }
      };

      mockStripe.stripe.client.subscriptions.retrieve.mockResolvedValue({
        status: 'trialing',
        items: { data: [{ price: { id: 'price_test_123' } }] }
      });
      mockStripe.getTierFromPriceId.mockReturnValue('premium');
      mockPrisma.subscription.findUnique.mockResolvedValue(subscriptionRecord);
      mockPrisma.subscription.update.mockResolvedValue(subscriptionRecord);
      mockPrisma.user.update.mockResolvedValue(subscriptionRecord.user);

      await stripeService.processWebhookEvent('invoice.payment_succeeded', {
        object: { subscription: 'sub_test_123' }
      });

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_test_123' },
        data: { status: 'trialing' }
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_123' },
        data: { subscriptionStatus: 'trialing' }
      });
    });

    it('should handle subscription updated event', async () => {
      const mockSubscription = {
        id: 'sub_123',
        user: { id: 'user_123' }
      };
      
      mockPrisma.subscription.update.mockResolvedValue({ id: 'sub_123' });
      mockPrisma.subscription.findUnique.mockResolvedValue(mockSubscription);
      mockPrisma.user.update.mockResolvedValue({ id: 'user_123' });

      const eventData = {
        object: {
          id: 'sub_test_123',
          status: 'active',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          cancel_at_period_end: false,
          metadata: { tier: 'premium' }
        }
      };

      await stripeService.processWebhookEvent('customer.subscription.updated', eventData);

      expect(mockPrisma.subscription.update).toHaveBeenCalled();
      expect(mockPrisma.subscription.findUnique).toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('should handle subscription deleted event', async () => {
      const mockSubscription = {
        id: 'sub_123',
        user: { id: 'user_123' }
      };
      
      mockPrisma.subscription.findUnique.mockResolvedValue(mockSubscription);
      mockPrisma.subscription.update.mockResolvedValue({ id: 'sub_123' });
      mockPrisma.user.update.mockResolvedValue({ id: 'user_123' });

      const eventData = {
        object: {
          id: 'sub_test_123'
        }
      };

      await stripeService.processWebhookEvent('customer.subscription.deleted', eventData);

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_test_123' },
        data: { status: 'canceled' }
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_123' },
        data: {
          subscriptionStatus: 'canceled'
        }
      });
    });
  });

  describe('getUserSubscriptionStatus', () => {
    it('should return active subscription status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        tier: 'premium',
        subscriptionStatus: 'active',
        subscriptions: [{
          id: 'sub123',
          status: 'active'
        }]
      });

      const result = await stripeService.getUserSubscriptionStatus('user123');

      expect(result).toEqual({
        tier: 'premium',
        status: 'active',
        accessLevel: 'full',
        upgradeRequired: false,
        message: 'Active premium subscription'
      });
    });

    it('should handle past due subscription with grace period', async () => {
      const gracePeriodEnd = new Date(Date.now() + (5 * 24 * 60 * 60 * 1000)); // 5 days from now
      
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        tier: 'standard',
        subscriptionStatus: 'past_due',
        subscriptions: [{
          id: 'sub123',
          status: 'past_due'
        }]
      });

      const result = await stripeService.getUserSubscriptionStatus('user123');

      expect(result.accessLevel).toBe('none');
      expect(result.upgradeRequired).toBe(true);
      expect(result.message).toContain('Payment past due');
    });

    it('should grant full access while a subscription is trialing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        tier: 'premium',
        subscriptionStatus: 'trialing',
        subscriptions: [{
          id: 'sub123',
          status: 'trialing'
        }]
      });

      const result = await stripeService.getUserSubscriptionStatus('user123');

      expect(result).toEqual({
        tier: 'premium',
        status: 'trialing',
        accessLevel: 'full',
        upgradeRequired: false,
        message: 'premium trial is active'
      });
    });

    it('should handle expired subscription', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        tier: 'premium',
        subscriptionStatus: 'canceled',
        subscriptions: []
      });

      const result = await stripeService.getUserSubscriptionStatus('user123');

      expect(result.accessLevel).toBe('none');
      expect(result.upgradeRequired).toBe(true);
      expect(result.message).toContain('Subscription canceled');
    });

    it('should handle inactive subscription', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        tier: 'starter',
        subscriptionStatus: 'inactive',
        subscriptions: []
      });

      const result = await stripeService.getUserSubscriptionStatus('user123');

      expect(result.accessLevel).toBe('full');
      expect(result.upgradeRequired).toBe(false);
      expect(result.message).toContain('Admin-created starter user');
    });
  });

  describe('canAccessFeature', () => {
    it('should allow access for sufficient tier and active subscription', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        tier: 'premium',
        subscriptionStatus: 'active',
        subscriptions: [{
          id: 'sub123',
          status: 'active'
        }]
      });

      const result = await stripeService.canAccessFeature('user123', 'standard');

      expect(result.canAccess).toBe(true);
      expect(result.reason).toBe('Access granted');
      expect(result.upgradeRequired).toBe(false);
    });

    it('should deny access for insufficient tier', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        tier: 'starter',
        subscriptionStatus: 'active',
        subscriptions: [{
          id: 'sub123',
          status: 'active'
        }]
      });

      const result = await stripeService.canAccessFeature('user123', 'premium');

      expect(result.canAccess).toBe(false);
      expect(result.reason).toContain('requires premium tier');
      expect(result.upgradeRequired).toBe(true);
    });

    it('should deny access for inactive subscription', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        tier: 'premium',
        subscriptionStatus: 'canceled',
        subscriptions: []
      });

      const result = await stripeService.canAccessFeature('user123', 'starter');

      expect(result.canAccess).toBe(false);
      expect(result.reason).toContain('Subscription canceled');
      expect(result.upgradeRequired).toBe(true);
    });
  });
});
