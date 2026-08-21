import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from './utils';
import { getPrismaClient } from '../prisma-client';
import { blocksProductAccess } from '../services/subscription-refresh-eligibility';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    tier: string;
  };
  headers: Request['headers'];
  body: any;
}

interface AuthenticateOptions {
  // Billing and renewal endpoints have to stay reachable after a subscription
  // lapses: a locked-out user cannot pay to come back if every authenticated
  // route rejects them first.
  allowLapsedSubscription?: boolean;
}

export async function authenticateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  await authenticate(req, res, next, {});
}

async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  options: AuthenticateOptions
): Promise<void> {
  try {
    console.log('🔐 authenticateUser called');
    const token = extractTokenFromHeader(req.headers.authorization);
    console.log('🔐 Token extracted:', token ? 'yes' : 'no');
    
    if (!token) {
      console.log('🔐 No token provided');
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const payload = verifyToken(token);
    console.log('🔐 Token verified:', payload ? 'yes' : 'no');
    if (!payload) {
      console.log('🔐 Invalid or expired token');
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    console.log('🔐 Payload userId:', payload.userId);
    console.log('🔐 Payload userId type:', typeof payload.userId, 'length:', payload.userId.length, 'contains dlf:', payload.userId.includes('dlf'), 'contains d1f:', payload.userId.includes('d1f'));

    // Verify user still exists and is active
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    });

    console.log('🔐 User found:', user ? 'yes' : 'no');

    if (!user || !user.isActive) {
      console.log('🔐 User not found or deactivated');
      res.status(401).json({ error: 'User not found or account deactivated' });
      return;
    }

    // Check if subscription has expired (same treatment as failed payments).
    // Shared with the scheduled refresh gate, which is defined as the exact
    // complement of this set: a status blocked here but still refreshed only
    // wastes provider calls, whereas one admitted here but not refreshed shows
    // the user silently frozen figures. Keeping both off one list makes the
    // second case unrepresentable.
    if (blocksProductAccess(user.subscriptionStatus) && !options.allowLapsedSubscription) {
      console.log('🔐 User subscription expired - blocking access');
      res.status(401).json({ error: 'Subscription expired. Please renew to continue.' });
      return;
    }

    // Attach user to request
    req.user = {
      id: payload.userId,
      email: user.email,
      tier: user.tier
    };

    console.log('🔐 req.user set:', req.user);

    next();
  } catch (error) {
    console.error('🔐 Authentication middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  console.log('🔒 requireAuth called');
  // authenticateUser is async, so we need to await it
  await authenticateUser(req, res, next);
}

/**
 * Authenticate without rejecting a lapsed subscriber.
 *
 * Mount this only on routes a canceled user must reach to resubscribe —
 * reading their own subscription status and opening the billing portal.
 * Checkout stays on optionalAuth so anonymous marketing checkouts keep
 * working; a Bearer token there is enough to reuse their Stripe customer.
 * Everything the subscription actually pays for keeps using requireAuth.
 */
export async function requireAuthAllowLapsedSubscription(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  console.log('🔒 requireAuthAllowLapsedSubscription called');
  await authenticate(req, res, next, { allowLapsedSubscription: true });
}

export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // This middleware doesn't block the request if no user is present
  // It just populates req.user if a valid token is provided
  const token = extractTokenFromHeader(req.headers.authorization);
  
  console.log('OptionalAuth middleware - headers:', req.headers);
  console.log('OptionalAuth middleware - token:', token ? token.substring(0, 20) + '...' : 'none');
  
  if (token) {
    // verifyToken throws when JWT_SECRET is unset/public in production (resolved
    // outside its jwt.verify catch). This middleware is mounted on every route, so
    // an uncaught throw would turn a misconfiguration into an unhandled crash on
    // any request that merely presents a Bearer token.
    let payload: ReturnType<typeof verifyToken>;
    try {
      payload = verifyToken(token);
    } catch (error) {
      console.error('OptionalAuth middleware error:', error);
      res.status(500).json({ error: 'Authentication error' });
      return;
    }
    console.log('OptionalAuth middleware - payload:', payload);
    if (payload) {
      (req as AuthenticatedRequest).user = {
        id: payload.userId,
        email: payload.email,
        tier: payload.tier
      };
      console.log('OptionalAuth middleware - user set:', (req as AuthenticatedRequest).user);
    } else {
      console.log('OptionalAuth middleware - token verification failed');
    }
  } else {
    console.log('OptionalAuth middleware - no token found');
    // Explicitly clear req.user when no token is provided
    (req as any).user = undefined;
  }
  
  next();
} 

export function adminAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // First, ensure user is authenticated
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required for admin access' });
    return;
  }

  // Get allowed admin emails from environment variable
  const allowedAdminEmails = process.env.ADMIN_EMAILS?.split(',').map(email => email.trim().toLowerCase()).filter(email => email.length > 0) || [];
  
  if (allowedAdminEmails.length === 0) {
    console.warn('ADMIN_EMAILS environment variable not set - admin access disabled');
    res.status(403).json({ error: 'Admin access not configured' });
    return;
  }

  // Check if user's email is in the allowed list
  const userEmail = req.user.email.toLowerCase();
  if (!allowedAdminEmails.includes(userEmail)) {
    console.warn(`Admin access denied for email: ${req.user.email}`);
    res.status(403).json({ error: 'Admin access denied' });
    return;
  }

  console.log(`Admin access granted for email: ${req.user.email}`);
  next();
}

export async function requireSubscriptionAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // First, ensure user is authenticated
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Check subscription status using Stripe service
    const { stripeService } = await import('../services/stripe');
    const subscriptionStatus = await stripeService.getUserSubscriptionStatus(req.user.id);
    
    if (subscriptionStatus.accessLevel !== 'full') {
      res.status(403).json({ 
        error: 'Access denied',
        message: subscriptionStatus.message,
        status: subscriptionStatus.status,
        upgradeRequired: subscriptionStatus.upgradeRequired
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Subscription access check error:', error);
    res.status(500).json({ error: 'Failed to verify subscription access' });
  }
} 