import { Request, Response, NextFunction } from 'express';
import { 
  subscriptionAuthMiddleware, 
  requireStarterTier, 
  requireStandardTier, 
  requirePremiumTier,
  requireActiveSubscription,
  addSubscriptionContext,
  AuthenticatedRequest
} from '../../middleware/subscription-auth';
import { getPrismaClient } from '../../prisma-client';

// Mock Prisma
jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn()
}));

describe('Subscription Auth Middleware', () => {
  let mockRequest: AuthenticatedRequest;
  let mockResponse: Response;
  let mockNext: NextFunction;
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRequest = {
      user: {
        id: 'user123',
        email: 'test@example.com',
        tier: 'standard',
        subscriptionStatus: 'active'
      }
    } as AuthenticatedRequest;
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as any;
    
    mockNext = jest.fn();
    
    // Setup mock Prisma client
    mockPrisma = {
      user: {
        findUnique: jest.fn()
      }
    };
    
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
  });

  describe('subscriptionAuthMiddleware', () => {
    it('should allow access for users with sufficient tier', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        tier: 'premium',
        subscriptionStatus: 'active',
        subscriptions: [{
          id: 'sub123',
          status: 'active'
        }]
      });

      const middleware = subscriptionAuthMiddleware('standard');
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should deny access for users with insufficient tier', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        tier: 'starter',
        subscriptionStatus: 'active',
        subscriptions: [{
          id: 'sub123',
          status: 'active'
        }]
      });

      const middleware = subscriptionAuthMiddleware('premium');
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('requires premium tier'),
          code: 'SUBSCRIPTION_ACCESS_DENIED',
          reason: 'insufficient_tier'
        })
      );
    });

    it('should handle past due subscriptions with grace period', async () => {
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

      const middleware = subscriptionAuthMiddleware('starter');
      await middleware(mockRequest, mockResponse, mockNext);

      // Should allow starter tier access during grace period
      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access for expired subscriptions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        tier: 'premium',
        subscriptionStatus: 'canceled',

        subscriptions: []
      });

      const middleware = subscriptionAuthMiddleware('standard');
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'subscription_expired'
        })
      );
    });

    it('should require authentication', async () => {
      mockRequest.user = undefined;

      const middleware = subscriptionAuthMiddleware('starter');
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'AUTHENTICATION_REQUIRED'
        })
      );
    });
  });

  describe('Convenience Middleware', () => {
    it('should require starter tier', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        tier: 'starter',
        subscriptionStatus: 'active',
        subscriptions: [{
          id: 'sub123',
          status: 'active'
        }]
      });

      await requireStarterTier(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should require standard tier', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        tier: 'standard',
        subscriptionStatus: 'active',
        subscriptions: [{
          id: 'sub123',
          status: 'active'
        }]
      });

      await requireStandardTier(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should require premium tier', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        tier: 'premium',
        subscriptionStatus: 'active',
        subscriptions: [{
          id: 'sub123',
          status: 'active'
        }]
      });

      await requirePremiumTier(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireActiveSubscription', () => {
    it('should allow active subscriptions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        subscriptionStatus: 'active',
        subscriptions: [{
          id: 'sub123',
          status: 'active'
        }]
      });

      await requireActiveSubscription(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny inactive subscriptions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        subscriptionStatus: 'canceled',
        subscriptions: []
      });

      await requireActiveSubscription(mockRequest, mockResponse, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'ACTIVE_SUBSCRIPTION_REQUIRED'
        })
      );
    });
  });

  describe('addSubscriptionContext', () => {
    it('should add subscription context to request', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        tier: 'premium',
        subscriptionStatus: 'active',
        subscriptions: [{
          id: 'sub123',
          status: 'active'
        }]
      });

      await addSubscriptionContext(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user?.tier).toBe('premium');
      expect(mockRequest.user?.subscriptionStatus).toBe('active');
    });

    it('should continue without context if no user', async () => {
      mockRequest.user = undefined;

      await addSubscriptionContext(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await addSubscriptionContext(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database connection failed'));

      const middleware = subscriptionAuthMiddleware('starter');
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SUBSCRIPTION_VERIFICATION_ERROR'
        })
      );
    });

    it('should handle user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const middleware = subscriptionAuthMiddleware('starter');
      await middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'USER_NOT_FOUND'
        })
      );
    });
  });
});
