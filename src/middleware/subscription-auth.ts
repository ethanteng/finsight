import { Request, Response, NextFunction } from 'express';
import { getPrismaClient } from '../prisma-client';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    tier: string;
    subscriptionStatus: string;
  };
}

/**
 * Middleware to check subscription status and enforce tier-based access
 */
export const subscriptionAuthMiddleware = (requiredTier: string, requiredStatus: string = 'active') => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Check if user is authenticated
      if (!req.user?.id) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED'
        });
      }

      const prisma = getPrismaClient();
      
      // Get current user with subscription info
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          subscriptions: {
            where: {
              status: { in: ['active', 'trialing'] }
            },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Check subscription status
      const hasActiveSubscription = user.subscriptions.length > 0;
      const currentTier = user.tier;
      const subscriptionStatus = user.subscriptionStatus;
      
      // Check if subscription has expired by looking at the subscription record
      const activeSubscription = user.subscriptions.find(sub => sub.status === 'active');
      const isExpired = activeSubscription ? 
        (activeSubscription.currentPeriodEnd && new Date() > activeSubscription.currentPeriodEnd) : 
        false;

      // Determine access level
      let hasAccess = false;
      let accessReason = '';

      if (subscriptionStatus === 'active' && !isExpired) {
        // Check tier access
        const tierHierarchy = ['starter', 'standard', 'premium'];
        const userTierIndex = tierHierarchy.indexOf(currentTier);
        const requiredTierIndex = tierHierarchy.indexOf(requiredTier);
        
        hasAccess = userTierIndex >= requiredTierIndex;
        accessReason = hasAccess ? 'tier_access_granted' : 'insufficient_tier';
      } else if (subscriptionStatus === 'past_due') {
        // Grace period access (limited features)
        hasAccess = requiredTier === 'starter'; // Only basic features
        accessReason = 'grace_period_limited';
      } else if (subscriptionStatus === 'canceled' || isExpired) {
        // No access
        hasAccess = false;
        accessReason = 'subscription_expired';
      } else if (subscriptionStatus === 'inactive') {
        // No subscription
        hasAccess = requiredTier === 'starter'; // Only basic features
        accessReason = 'no_subscription';
      }

      if (!hasAccess) {
        // Determine appropriate error response
        let errorMessage = '';
        let upgradeRequired = false;

        switch (accessReason) {
          case 'insufficient_tier':
            errorMessage = `This feature requires ${requiredTier} tier or higher. Your current tier is ${currentTier}.`;
            upgradeRequired = true;
            break;
          case 'grace_period_limited':
            errorMessage = 'Your subscription payment is past due. Please update your payment method to restore full access.';
            upgradeRequired = false;
            break;
          case 'subscription_expired':
            errorMessage = 'Your subscription has expired. Please renew to continue accessing premium features.';
            upgradeRequired = true;
            break;
          case 'no_subscription':
            errorMessage = 'This feature requires an active subscription. Please subscribe to continue.';
            upgradeRequired = true;
            break;
          default:
            errorMessage = 'Access denied. Please check your subscription status.';
            upgradeRequired = true;
        }

        return res.status(403).json({
          error: errorMessage,
          code: 'SUBSCRIPTION_ACCESS_DENIED',
          reason: accessReason,
          currentTier,
          requiredTier,
          subscriptionStatus,
          upgradeRequired
        });
      }

      // Add subscription info to request for downstream use
      req.user = {
        ...req.user,
        tier: currentTier,
        subscriptionStatus
      };

      next();
    } catch (error) {
      console.error('Subscription auth middleware error:', error);
      return res.status(500).json({
        error: 'Internal server error during subscription verification',
        code: 'SUBSCRIPTION_VERIFICATION_ERROR'
      });
    }
  };
};

/**
 * Convenience middleware for specific tiers
 */
export const requireStarterTier = subscriptionAuthMiddleware('starter');
export const requireStandardTier = subscriptionAuthMiddleware('standard');
export const requirePremiumTier = subscriptionAuthMiddleware('premium');

/**
 * Middleware to check if user has any active subscription
 */
export const requireActiveSubscription = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }

    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        subscriptions: {
          where: { status: 'active' },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const activeSubscription = user.subscriptions[0];
    const isActive = user.subscriptionStatus === 'active' && activeSubscription;

    if (!isActive) {
      return res.status(403).json({
        error: 'Active subscription required',
        code: 'ACTIVE_SUBSCRIPTION_REQUIRED',
        subscriptionStatus: user.subscriptionStatus
      });
    }

    next();
  } catch (error) {
    console.error('Active subscription middleware error:', error);
    return res.status(500).json({
      error: 'Internal server error during subscription verification',
      code: 'SUBSCRIPTION_VERIFICATION_ERROR'
    });
  }
};

/**
 * Middleware to add subscription context to request
 */
export const addSubscriptionContext = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return next();
    }

    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        subscriptions: {
          where: {
            status: { in: ['active', 'trialing', 'past_due'] }
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (user) {
      const activeSubscription = user.subscriptions[0];
      req.user = {
        ...req.user,
        tier: user.tier,
        subscriptionStatus: user.subscriptionStatus
      };
    }

    next();
  } catch (error) {
    console.error('Add subscription context middleware error:', error);
    // Don't block the request, just continue without subscription context
    next();
  }
};
