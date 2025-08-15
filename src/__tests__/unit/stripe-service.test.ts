import { stripeService } from '../../services/stripe';
import { getPrismaClient } from '../../prisma-client';

// Mock Stripe
jest.mock('../../config/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: jest.fn()
      }
    },
    billingPortal: {
      sessions: {
        create: jest.fn()
      }
    }
  },
  getStripePriceId: jest.fn(),
  getTierFromPriceId: jest.fn(),
  constructWebhookEvent: jest.fn()
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
        update: jest.fn()
      },
      subscription: {
        create: jest.fn(),
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
      
      mockStripe.stripe.checkout.sessions.create.mockResolvedValue(mockSession);
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
      expect(mockStripe.stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          payment_method_types: ['card'],
          line_items: [{ price: 'price_test_123', quantity: 1 }],
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
          customer_email: 'test@example.com'
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
      
      mockStripe.stripe.billingPortal.sessions.create.mockResolvedValue(mockSession);

      const request = {
        returnUrl: 'https://example.com/return'
      };

      const result = await stripeService.createPortalSession(request, 'cus_test_123');

      expect(result).toEqual({
        url: 'https://billing.stripe.com/test'
      });
      expect(mockStripe.stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
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
          eventData: mockEventData,
          subscriptionId: 'sub_test_123'
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
      const mockUser = {
        id: 'user_123',
        email: 'test@example.com'
      };
      
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.subscription.create.mockResolvedValue({ id: 'sub_123' });
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
      expect(mockPrisma.subscription.create).toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalled();
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
          subscriptionStatus: 'canceled',
          tier: 'starter',
          subscriptionExpiresAt: null
        }
      });
    });
  });
});
