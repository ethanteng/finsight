import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../prisma-client';
import { recordSignupAcquisition } from '../services/product-milestones';
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
import { createFixedWindowRateLimit, positiveIntFromEnv } from '../routes/fixed-window-rate-limit';
import { isValidTimeZone, normalizeTimeZone } from '../domain/time-zone';
import {
  attachCalculatorLeadToAccount,
  resolveCalculatorLead,
  seedFirstDecisionFromLead,
} from '../services/calculator-first-decision';
import {
  normalizeSignupOrigin,
  signupGroupIds,
  subscribeToMailerLite,
  type SignupOrigin,
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
  origin: SignupOrigin | null;
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

/*
 * Every no-card signup starts a Stripe trial, so an unmetered public endpoint
 * would let a script spend the Stripe API capacity checkout and billing need.
 * Set far above what a person signing up, and retrying a rejected password,
 * ever reaches.
 */
const registerRateLimit = createFixedWindowRateLimit({
  limit: positiveIntFromEnv('REGISTER_RATE_LIMIT', 20),
  windowMs: 10 * 60 * 1000,
  trustedHops: positiveIntFromEnv('TRUSTED_PROXY_HOPS', 1),
  message: 'Too many signup attempts. Please wait a few minutes and try again.',
});

// Register new user
router.post('/register', registerRateLimit, async (req: Request, res: Response) => {
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
      /*
       * Set by a signup page that opens the workspace on
       * `firstDecisionPending`. A page from before that field reads only
       * `emailVerified` and sends every other signup to /verify-email, so it
       * must still be mailed a code: without one, a backend shipped ahead of
       * the frontend would strand calculator signups waiting for mail that
       * never comes. Skipping the code is friction, not security (see below),
       * so a client is allowed to say this about itself.
       */
      acceptsFirstDecisionHandoff,
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

    // As `PUT /profile` checks. An unknown tier has no Stripe price, so the
    // trial grant below would fail and leave the account open-ended.
    if (!['starter', 'standard', 'premium'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
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
     * Resolved here, before the account exists, because the answer decides
     * three things: what the first decision is written from, whether the
     * address is recorded as verified, and whether this signup is asked for a
     * code at all.
     *
     * A lead token is forty-eight random characters. When the only place it
     * ever went is an email to the lead's own address, presenting one *and*
     * registering that address demonstrates control of the inbox — the same
     * thing the code demonstrates, established the same way, one round trip
     * earlier. The check is made on the server from the token alone, so a
     * client cannot declare itself verified by sending a flag.
     *
     * `tokenDisclosed` is the case where that argument does not hold. The
     * calculator page asks for the token back so it can take the visitor
     * straight to signup rather than making them wait on their inbox, and a
     * token handed to a page proves nothing about who owns the address —
     * anyone can type someone else's into the form. Such a lead still writes
     * the run as the first decision, because the figures are the figures, but
     * the account is not recorded as verified. The server decides this from
     * the row, never from anything the client sends.
     */
    const calculatorLead = await resolveCalculatorLead({
      token: calculatorRef,
      email: email.toLowerCase(),
    });
    const emailProvenByLink = calculatorLead !== null && !calculatorLead.lead.tokenDisclosed;
    /*
     * Any resolved lead, disclosed or not, skips the code step. The calculators
     * exist to get a visitor into Ask Linc to see their answer, and a code
     * standing between the password and that answer is where they leave.
     *
     * This is a choice about friction, not about proof. The disclosed case
     * still proves nothing about the inbox, which is why `emailVerified` above
     * stays false for it. The code was never what guarded the workspace
     * either: nothing server-side checks `emailVerified`, and the verify page
     * has always offered "Skip for now". What a stranger could do with someone
     * else's address here they could already do through that skip, and the
     * owner of the address can still take the account back by resetting the
     * password from their own inbox.
     */
    const firstDecisionPending = calculatorLead !== null;
    const skipsVerificationCode = emailProvenByLink
      || (firstDecisionPending && acceptsFirstDecisionHandoff === true);

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
     * Skipped entirely for a calculator signup (see `firstDecisionPending` and
     * `acceptsFirstDecisionHandoff`). No row is created for it either: an
     * unused code is one more live credential for an account that will never
     * be asked for it.
     */
    if (!skipsVerificationCode) {
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
    const signupEntryOrigin = calculatorLead
      ? (calculatorLead.kind === 'retirement'
        ? 'retirement_calculator' as const
        : 'coast_fire_calculator' as const)
      : normalizeSignupOrigin(signupOrigin);

    await recordSignupAcquisition({
      userId: user.id, email: user.email, lead: calculatorLead,
      signupOrigin: signupEntryOrigin ?? undefined, attribution: req.body.attribution,
    });

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      tier: user.tier
    });

    /*
     * Exactly what "Convert to trial" in the admin panel does, with the
     * picker's default end date, so a new no-card account no longer waits
     * for someone to click it.
     *
     * Awaited before the 201 — but caught, so Stripe can never fail the
     * signup. Fire-and-forget after the response left a window where the
     * account was still Admin Created (`upgradeAction: checkout`) while the
     * grant was in flight. The header caches that action for the session, and
     * `/subscribe` can mint a Checkout Session before the trial row exists;
     * finishing that Checkout beside the trial would bill twice. Finishing the
     * grant first means the first subscription-status fetch already sees
     * `billing_portal` (or Admin Created if Stripe refused).
     */
    if (!stripeSessionIdToUse && process.env.STRIPE_SECRET_KEY) {
      try {
        await stripeService.grantAdminTrial({
          userId: user.id,
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
      } catch (error) {
        console.error(`Signup trial not started for user ${user.id}:`, error);
      }
    }

    res.status(201).json({
      message: skipsVerificationCode
        ? 'User registered successfully. Your calculator result is waiting in your account.'
        : 'User registered successfully. Please check your email for verification code.',
      user: {
        id: user.id,
        email: user.email,
        tier: user.tier,
        timeZone: user.timeZone,
        // Whether the address was proved, which an emailed calculator link
        // does. Reported, never accepted: the server decided.
        emailVerified: user.emailVerified,
        createdAt: user.createdAt
      },
      /*
       * The run is being written as this account's first decision, after this
       * response. The client skips the code step and opens the workspace,
       * which waits for that write. Reported, never accepted: the server
       * resolved the lead.
       */
      firstDecisionPending: firstDecisionPending && skipsVerificationCode,
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
     * registration can receive one. `/auth/register` is limited only per address. The
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
        origin: signupEntryOrigin,
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

/*
 * Attach a calculator run to the signed-in account.
 *
 * The other half of registration's seeding, for an address that already has an
 * account and so cannot register: the calculator sends that visitor to sign
 * in, and the sign-in page posts the lead token here once it has a session. A
 * visitor already signed in on the calculator page posts it directly. The run
 * becomes a new decision in the account, and `/app` opens on it.
 *
 * The lead must name this account's address — see
 * `attachCalculatorLeadToAccount` — so a token for anyone else attaches nothing.
 */
router.post('/calculator-lead', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const outcome = await attachCalculatorLeadToAccount({
    userId: req.user.id,
    email: req.user.email,
    token: req.body?.calculatorRef,
  });
  if (outcome === 'failed') {
    return res.status(500).json({ error: 'Could not save that calculator run to your account.' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.json({ attached: outcome === 'attached' || outcome === 'already-attached' });
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
