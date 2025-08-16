import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
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

const router = Router();
const prisma = new PrismaClient();

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
        isActive: true
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
        tier: user.tier
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
    const { email, password, tier = 'starter', stripeSessionId } = req.body;

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
        subscriptionStatus: stripeSessionId ? 'active' : 'inactive'
      },
      select: {
        id: true,
        email: true,
        tier: true,
        createdAt: true
      }
    });

    // If coming from Stripe checkout, try to link to existing subscription
    if (stripeSessionId) {
      try {
        // First, find the Stripe session to get the subscription ID
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
        
        if (session.subscription) {
          // Find the subscription by Stripe subscription ID
          const subscription = await prisma.subscription.findFirst({
            where: {
              stripeSubscriptionId: session.subscription
            }
          });

          if (subscription) {
            // Link the user to the subscription
            await prisma.subscription.update({
              where: { id: subscription.id },
              data: { userId: user.id }
            });

            console.log(`Linked user ${user.email} to subscription ${subscription.id}`);
          }
        }
      } catch (subscriptionError) {
        console.error('Error linking user to subscription:', subscriptionError);
        // Don't fail registration if subscription linking fails
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
        tier: user.tier
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const validation = await validateUserCredentials(prisma, email, password);
    
    if (!validation.success) {
      return res.status(401).json({ error: validation.error });
    }

    const user = validation.user!;

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      tier: user.tier
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        tier: user.tier
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
    const { tier } = req.body;
    const allowedTiers = ['starter', 'standard', 'premium'];

    if (tier && !allowedTiers.includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    const updateData: any = {};
    if (tier) updateData.tier = tier;

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        tier: true,
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