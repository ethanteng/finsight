import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma-client';
import { 
  hashPassword, 
  generateToken, 
  validateUserCredentials,
  validateEmail,
  validatePassword,
  verifyToken
} from './utils';
import { authenticateUser, AuthenticatedRequest } from './middleware';
import { 
  sendEmailVerificationCode, 
  sendPasswordResetEmail, 
  generateRandomCode, 
  generateRandomToken 
} from './resend-email';
import { sendContactEmail } from './resend-email';
import { stripe } from '../config/stripe';
import { sendWelcomeEmail } from '../services/stripe-email';
import { analytics } from '../analytics/heycatch';
import { isValidTimeZone, normalizeTimeZone } from '../domain/time-zone';

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

const router = Router();
const prisma = getPrismaClient();

// Verify token endpoint
router.get('/verify', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        tier: true,
        isActive: true,
        timeZone: true,
        createdAt: true
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or account deactivated' });
    }

    // Update lastLoginAt when token is verified (this tracks active usage)
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        tier: user.tier,
        timeZone: user.timeZone,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Token verification failed' });
  }
});

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, tier = 'premium', stripeSessionId, session_id, timeZone } = req.body;
    
    // Handle both parameter names for Stripe session ID
    const stripeSessionIdToUse = stripeSessionId || session_id;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        tier,
        timeZone: normalizeTimeZone(timeZone),
        subscriptionStatus: 'inactive'
      },
      select: {
        id: true,
        email: true,
        tier: true,
        timeZone: true,
        createdAt: true
      }
    });

    // If coming from Stripe checkout, create Stripe customer and link subscription
    if (stripeSessionIdToUse) {
      let linkedStripeSubscription = false;
      try {
        // First, find the Stripe session to get the subscription ID
        const session = await stripe.client.checkout.sessions.retrieve(stripeSessionIdToUse, {
          expand: ['subscription']
        });

        const checkoutIsComplete = session.status === 'complete' &&
          (session.payment_status === 'paid' || session.payment_status === 'no_payment_required');
        if (!checkoutIsComplete) {
          throw new Error('Stripe Checkout session is not complete');
        }

        const checkoutEmail = session.customer_details?.email?.toLowerCase();
        if (checkoutEmail && checkoutEmail !== user.email.toLowerCase()) {
          throw new Error('Stripe Checkout email does not match the registered account');
        }
        
        if (session.subscription && session.customer) {
          // Create or get Stripe customer
          let customer;
          if (typeof session.customer === 'string') {
            // Customer ID already exists
            customer = await stripe.client.customers.retrieve(session.customer);
          } else {
            // Customer object from session
            customer = session.customer;
          }
          
          const stripeSubscription = typeof session.subscription === 'string'
            ? await stripe.client.subscriptions.retrieve(session.subscription)
            : session.subscription;

          if (stripeSubscription) {
            const subscription = stripeSubscription as any;
            const subscriptionStatus = subscription.status || 'incomplete';
            const currentPeriodStart = subscription.current_period_start
              ? new Date(subscription.current_period_start * 1000)
              : new Date();
            const currentPeriodEnd = subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000)
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            const subscriptionData = {
              userId: user.id,
              stripeCustomerId: customer.id,
              tier,
              status: subscriptionStatus,
              currentPeriodStart,
              currentPeriodEnd,
              cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
            };

            // Persist the subscription before exposing the Stripe customer ID.
            // The webhook cannot find this user until the record it would update
            // already exists, preventing both paths from claiming first delivery.
            // Claim first delivery with an atomic insert so concurrent registration
            // retries or webhook replay cannot repeat welcome/analytics side effects.
            let isNewSubscription = false;
            try {
              await prisma.subscription.create({
                data: {
                  ...subscriptionData,
                  stripeSubscriptionId: subscription.id,
                },
              });
              isNewSubscription = true;
            } catch (error) {
              if (!isUniqueConstraintError(error)) {
                throw error;
              }

              await prisma.subscription.update({
                where: { stripeSubscriptionId: subscription.id },
                data: subscriptionData,
              });
            }

            await prisma.user.update({
              where: { id: user.id },
              data: {
                stripeCustomerId: customer.id,
                subscriptionStatus
              }
            });

            linkedStripeSubscription = true;
            console.log(`Linked user ${user.email} to Stripe customer ${customer.id} and subscription ${subscription.id}`);
            
            // Only send when registration creates the subscription record first. If the
            // webhook already linked it, skip to avoid duplicate welcome emails.
            if (isNewSubscription) {
              try {
                await sendWelcomeEmail(user.email, tier);
                console.log(`Welcome email sent to ${user.email} for ${tier} plan during registration`);
              } catch (emailError) {
                console.error(`Failed to send welcome email to ${user.email} during registration:`, emailError);
                // Don't fail registration if email fails
              }

              try {
                await analytics.setIdentity(user.id, { email: user.email, plan: tier });
                await analytics.trackEvent(
                  'subscription_started',
                  { plan: tier },
                  { userId: user.id },
                );
              } catch (analyticsError) {
                console.error(`Failed to record subscription_started for ${user.email} during registration:`, analyticsError);
              }
            }
          }
        }
      } catch (subscriptionError) {
        console.error('Error linking user to subscription:', subscriptionError);
        // Don't fail registration if subscription linking fails
      }

      if (!linkedStripeSubscription) {
        await prisma.user.update({
          where: { id: user.id },
          data: { subscriptionStatus: 'incomplete' }
        });
      }
    }

    // Create default privacy settings
    await prisma.privacySettings.create({
      data: {
        userId: user.id,
        allowDataStorage: true,
        allowAITraining: false,
        anonymizeData: true,
        dataRetentionDays: 30
      }
    });

    // Generate verification code
    const verificationCode = generateRandomCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Create verification code
    await prisma.emailVerificationCode.create({
      data: {
        code: verificationCode,
        userId: user.id,
        expiresAt
      }
    });

    // Send verification email
    await sendEmailVerificationCode(user.email, verificationCode);

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      tier: user.tier
    });

    res.status(201).json({
      message: 'User registered successfully. Please check your email for verification code.',
      user: {
        id: user.id,
        email: user.email,
        tier: user.tier,
        timeZone: user.timeZone,
        createdAt: user.createdAt
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login user
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, timeZone } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const validation = await validateUserCredentials(prisma, email, password);
    
    if (!validation.success) {
      return res.status(401).json({ error: validation.error });
    }

    const user = validation.user!;

    // Update last login
    const validTimeZone = isValidTimeZone(timeZone) ? timeZone.trim() : undefined;
    const effectiveTimeZone = validTimeZone || normalizeTimeZone(user.timeZone);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(validTimeZone ? { timeZone: validTimeZone } : {}) }
    });

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      tier: user.tier
    });

    // Trigger non-blocking financial summary refresh if stale
    setImmediate(async () => {
      try {
        const { SummaryCacheService } = await import('../services/summary-cache-service');
        const snapshot = await SummaryCacheService.getLatestSnapshot(user.id, 'summary');
        const computedAt = snapshot?.computedAt ? new Date(snapshot.computedAt) : null;
        const cacheExpired = !computedAt || Date.now() - computedAt.getTime() > 24 * 60 * 60 * 1000;
        if (!snapshot || snapshot.status !== 'current' || cacheExpired) {
          await SummaryCacheService.computeForUser(user.id, { categorize: false });
        }
      } catch (error) {
        console.error(`Failed to refresh summary on login for user ${user.id}:`, error);
        // Don't throw - this is a background operation
      }
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        tier: user.tier,
        timeZone: effectiveTimeZone,
        createdAt: user.createdAt
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user profile
router.get('/profile', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        tier: true,
        timeZone: true,
        isActive: true,
        emailVerified: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tier, timeZone } = req.body;
    const allowedTiers = ['starter', 'standard', 'premium'];

    if (tier && !allowedTiers.includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }
    if (timeZone !== undefined && !isValidTimeZone(timeZone)) {
      return res.status(400).json({ error: 'Invalid IANA time zone' });
    }

    const updateData: any = {};
    if (tier) updateData.tier = tier;
    if (timeZone) updateData.timeZone = timeZone.trim();

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        tier: true,
        timeZone: true,
        isActive: true,
        emailVerified: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({ 
      message: 'Profile updated successfully',
      user 
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.put('/change-password', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    // Get current user with password hash
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { passwordHash: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const { comparePassword } = await import('./utils');
    const isValidCurrentPassword = await comparePassword(currentPassword, user.passwordHash);
    
    if (!isValidCurrentPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { passwordHash: newPasswordHash }
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Logout (client-side token removal, but we can track it)
router.post('/logout', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // In a more sophisticated system, you might want to blacklist the token
    // For now, we'll just return success and let the client remove the token
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Forgot password - send reset email
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({ message: 'If an account with that email exists, a password reset link has been sent' });
    }

    if (!user.isActive) {
      return res.status(400).json({ error: 'Account is deactivated' });
    }

    // Generate reset token
    const resetToken = generateRandomToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Delete any existing reset tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id }
    });

    // Create new reset token
    await prisma.passwordResetToken.create({
      data: {
        token: resetToken,
        userId: user.id,
        expiresAt
      }
    });

    // Send reset email
    const emailSent = await sendPasswordResetEmail(email, resetToken);

    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send password reset email' });
    }
    res.json({ message: 'If an account with that email exists, a password reset link has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Reset password with token
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    // Find reset token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (resetToken.used) {
      return res.status(400).json({ error: 'Reset token has already been used' });
    }

    if (resetToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update user password
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: newPasswordHash }
    });

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true }
    });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Send email verification code
router.post('/send-verification', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Generate verification code
    const verificationCode = generateRandomCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Delete any existing verification codes for this user
    await prisma.emailVerificationCode.deleteMany({
      where: { userId: user.id }
    });

    // Create new verification code
    await prisma.emailVerificationCode.create({
      data: {
        code: verificationCode,
        userId: user.id,
        expiresAt
      }
    });

    // Send verification email
    const emailSent = await sendEmailVerificationCode(user.email, verificationCode);

    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send verification email' });
    }

    res.json({ message: 'Verification code sent to your email' });
  } catch (error) {
    console.error('Send verification error:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// Verify email with code
router.post('/verify-email', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    // Find verification code
    const verificationCode = await prisma.emailVerificationCode.findUnique({
      where: { code },
      include: { user: true }
    });

    if (!verificationCode) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    if (verificationCode.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Verification code does not belong to this user' });
    }

    if (verificationCode.used) {
      return res.status(400).json({ error: 'Verification code has already been used' });
    }

    if (verificationCode.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Verification code has expired' });
    }

    // Mark email as verified
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { emailVerified: true }
    });

    // Mark code as used
    await prisma.emailVerificationCode.update({
      where: { id: verificationCode.id },
      data: { used: true }
    });

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

// Resend verification code
router.post('/resend-verification', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Check if there's a recent verification code (rate limiting)
    const recentCode = await prisma.emailVerificationCode.findFirst({
      where: { 
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - 60 * 1000) } // Within last minute
      }
    });

    if (recentCode) {
      return res.status(429).json({ error: 'Please wait before requesting another verification code' });
    }

    // Generate new verification code
    const verificationCode = generateRandomCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Delete any existing verification codes for this user
    await prisma.emailVerificationCode.deleteMany({
      where: { userId: user.id }
    });

    // Create new verification code
    await prisma.emailVerificationCode.create({
      data: {
        code: verificationCode,
        userId: user.id,
        expiresAt
      }
    });

    // Send verification email
    const emailSent = await sendEmailVerificationCode(user.email, verificationCode);

    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send verification email' });
    }

    res.json({ message: 'Verification code resent to your email' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification code' });
  }
});

// Contact form endpoint
router.post('/contact', async (req: Request, res: Response) => {
  try {
    const { email, message } = req.body;

    // Validate input
    if (!email || !message) {
      return res.status(400).json({ error: 'Email and message are required' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (message.trim().length < 10) {
      return res.status(400).json({ error: 'Message must be at least 10 characters long' });
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message is too long (maximum 2000 characters)' });
    }

    // Send email to admins
    const emailSent = await sendContactEmail(email, message);

    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send contact message' });
    }

    res.json({ message: 'Contact message sent successfully' });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ error: 'Failed to process contact form' });
  }
});

export default router;
