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
import { stripeService } from '../services/stripe';
import { SubscriptionTier } from '../types/stripe';
import { isValidTimeZone, normalizeTimeZone } from '../domain/time-zone';
import {
  resolveCalculatorLead,
  seedFirstDecisionFromLead,
} from '../services/calculator-first-decision';
import {
  normalizeCalculatorSignupOrigin,
  signupGroupIds,
  subscribeToMailerLite,
  type CalculatorSignupOrigin,
} from '../services/mailerlite-subscribe';

const router = Router();
const prisma = getPrismaClient();

/**
 * Fire-and-forget list join for a no-card account. Callers must only invoke
 * this as the account is created, verified or not. Skips entirely when every
 * group id is unset, so an unconfigured trial group does not create a
 * no-group subscriber ahead of the nightly sync that would have added it.
 */
function enqueueTrialSignupMailerLite(params: {
  email: string;
  tier: string;
  createdAt: Date;
  origin: CalculatorSignupOrigin | null;
}): void {
  const groups = signupGroupIds(params.origin);
  if (groups.length === 0) {
    return;
  }

  void subscribeToMailerLite({
    email: params.email,
    groups,
    // Names the nightly sync already writes, so tonight's run updates these
    // rather than leaving a second set of fields beside them.
    fields: {
      current_tier: params.tier,
      user_created_at: params.createdAt.toISOString().split('T')[0],
    },
  }).then((outcome) => {
    if (outcome === 'failed') {
      console.warn(`New account not added to MailerLite: ${params.email}`);
    }
  }).catch((error) => {
    console.warn('MailerLite subscribe rejected:', error);
  });
}

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
    const {
      email,
      password,
      tier = 'premium',
      stripeSessionId,
      session_id,
      timeZone,
      // The lead token from a calculator results email, when the signup came
      // from one. Optional everywhere and never trusted on its own — see
      // `resolveCalculatorLead` for why the address has to match it.
      calculatorRef,
      /*
       * Which calculator the signup page was reached from, for the marketing
       * group below and nothing else. The page CTA carries no token — nothing
       * was emailed — so this is the only way that arrival can be attributed.
       * Unverified by nature and treated that way: it is run through an
       * allowlist, a resolved lead outranks it, and the worst a forged value
       * can do is put the registrant in one of our own groups.
       */
      signupOrigin,
    } = req.body;
    
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

    /*
     * Resolved here, before the account exists, because the answer decides two
     * things: what the first decision is written from, and whether this address
     * still needs a verification code.
     *
     * A lead token is forty-eight random characters that only ever left this
     * system inside an email to the lead's own address. Presenting one *and*
     * registering that address demonstrates control of the inbox — the same
     * thing the code demonstrates, established the same way, one round trip
     * earlier. The check is made on the server from the token alone, so a
     * client cannot declare itself verified by sending a flag.
     */
    const calculatorLead = await resolveCalculatorLead({
      token: calculatorRef,
      email: email.toLowerCase(),
    });
    const emailProvenByLink = calculatorLead !== null;

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        tier,
        timeZone: normalizeTimeZone(timeZone),
        emailVerified: emailProvenByLink,
        subscriptionStatus: 'inactive'
      },
      select: {
        id: true,
        email: true,
        tier: true,
        timeZone: true,
        emailVerified: true,
        createdAt: true
      }
    });

    // If coming from Stripe checkout, link the paid subscription to this account.
    // Shared with the payment-success callback so a new signup and a returning
    // subscriber link a completed checkout through exactly the same path.
    if (stripeSessionIdToUse) {
      let linkedStripeSubscription = false;
      try {
        const linkResult = await stripeService.linkCheckoutSessionToUser({
          userId: user.id,
          email: user.email,
          checkoutSessionId: stripeSessionIdToUse,
          tier: tier as SubscriptionTier
        });
        linkedStripeSubscription = linkResult.linked;
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

    /*
     * Skipped entirely when the emailed link already proved the address. A
     * code sent to an inbox we just demonstrated control of asks the visitor
     * to do the same thing twice, and no row is created for it either — an
     * unused code is one more live credential for an account that does not
     * need it.
     */
    if (!emailProvenByLink) {
      const verificationCode = generateRandomCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await prisma.emailVerificationCode.create({
        data: {
          code: verificationCode,
          userId: user.id,
          expiresAt
        }
      });

      await sendEmailVerificationCode(user.email, verificationCode);
    }

    /*
     * The lead the server resolved outranks whatever the client said: it was
     * proved against this address a moment ago, while `signupOrigin` is just a
     * query parameter that survived a page load. They agree in the ordinary
     * case; when they do not, the verified one is the true story.
     */
    const calculatorOrigin = calculatorLead
      ? (calculatorLead.kind === 'retirement'
        ? 'retirement_calculator' as const
        : 'coast_fire_calculator' as const)
      : normalizeCalculatorSignupOrigin(signupOrigin);

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      tier: user.tier
    });

    res.status(201).json({
      message: emailProvenByLink
        ? 'User registered successfully. Your email was already confirmed by the link you followed.'
        : 'User registered successfully. Please check your email for verification code.',
      user: {
        id: user.id,
        email: user.email,
        tier: user.tier,
        timeZone: user.timeZone,
        // Lets the client skip the verification step it would otherwise send
        // every new account to. Reported, never accepted: the server decided.
        emailVerified: user.emailVerified,
        createdAt: user.createdAt
      },
      token
    });

    // After the response, and unawaited. Someone who saved a calculator run
    // should find it waiting as their first decision, but a signup must never
    // wait on that write, and must never fail for it: the function returns a
    // reason rather than throwing, and the account is already created.
    void seedFirstDecisionFromLead({
      userId: user.id,
      lead: calculatorLead,
    }).then((outcome) => {
      if (outcome !== 'seeded' && outcome !== 'no-lead') {
        console.warn(`First decision not seeded for new account: ${outcome}`);
      }
    }).catch(error => {
      // It handles its own failures; this guards the unawaited promise so
      // nothing escapes as an unhandled rejection.
      console.warn('First-decision seeding rejected:', error);
    });

    /*
     * Put a no-card signup on the marketing list now rather than whenever the
     * nightly sync next runs.
     *
     * `mailerlite-sync` walks the whole user table at 3am into its own group,
     * so these addresses were never lost — they were just up to a day late,
     * which is too late for anything that should greet a new account. A
     * visitor who only used a calculator and left an address was on a list
     * within eight seconds; someone who created an account waited until
     * morning.
     *
     * This does not wait for the verification code, and that is a decision
     * rather than an oversight: the address joins the list before anyone has
     * proved they own it, which is the same set of addresses `mailerlite-sync`
     * has always sent, just sooner. What it adds is that the trial group can
     * carry a welcome sequence, so an unintended recipient of a forged
     * registration can receive one. `/auth/register` has no rate limit. The
     * verification mail's security note is written to match — it says the
     * address was subscribed and points at the unsubscribe link — rather than
     * promising something this no longer honours.
     *
     * Paid checkouts are left to the nightly sync. The trial group exists to
     * convert someone who has not paid.
     *
     * After the response and unawaited, for the same reason as the seed above:
     * the account exists, and an email list must never be able to fail or
     * delay a registration.
     */
    if (!stripeSessionIdToUse) {
      enqueueTrialSignupMailerLite({
        email: user.email,
        tier: user.tier,
        createdAt: user.createdAt,
        origin: calculatorOrigin,
      });
    }
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
        const { FinancialRevisionService } = await import('../services/financial-revision-service');
        await FinancialRevisionService.recomputeIfStale(
          user.id,
          24 * 60 * 60 * 1000,
          { categorize: false }
        );
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
