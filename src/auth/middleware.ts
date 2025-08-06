import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from './utils';
import { getPrismaClient } from '../prisma-client';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    tier: string;
  };
  headers: Request['headers'];
  body: any;
}

export async function authenticateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Verify user still exists and is active
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        tier: true,
        isActive: true
      }
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'User not found or account deactivated' });
      return;
    }

    // Attach user to request
    req.user = {
      id: payload.userId,
      email: user.email,
      tier: user.tier
    };

    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
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
    const payload = verifyToken(token);
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