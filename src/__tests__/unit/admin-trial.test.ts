import { stripeService, AdminTrialError, resolveSubscriptionPeriod } from '../../services/stripe';
import { getPrismaClient } from '../../prisma-client';
import { stripe } from '../../config/stripe';

jest.mock('../../services/stripe-email', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendTierChangeEmail: jest.fn().mockResolvedValue(true),
  sendCancellationEmail: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../config/stripe', () => ({
  STRIPE_CONFIG: { subscriptionSettings: { trialPeriodDays: 30 } },
  stripe: {
    client: {
      customers: { create: jest.fn(), retrieve: jest.fn() },
      subscriptions: { create: jest.fn(), update: jest.fn(), retrieve: jest.fn(), cancel: jest.fn() }
    }
  },
  getStripePriceId: jest.fn().mockReturnValue('price_default'),
  getTierFromPriceId: jest.fn().mockReturnValue('premium'),
  constructWebhookEvent: jest.fn(),
  isStripeConfigured: jest.fn().mockReturnValue(true)
}));

jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn()
}));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Stripe timestamps are whole seconds, so a date it echoes back loses the ms. */
const whenSecondsFromNow = (ms: number) => new Date(Math.floor((Date.now() + ms) / 1000) * 1000);

const stripeMock = stripe.client as unknown as {
  customers: { create: jest.Mock; retrieve: jest.Mock };
  subscriptions: { create: jest.Mock; update: jest.Mock; retrieve: jest.Mock; cancel: jest.Mock };
};

/** An admin-created account: full access, no Stripe billing behind it. */
const adminCreatedUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user_1',
  email: 'comped@example.com',
  tier: 'premium',
  isActive: true,
  stripeCustomerId: null,
  subscriptionStatus: 'inactive',
  subscriptions: [],
  ...overrides
});

describe('admin-granted trials', () => {
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockPrisma = {
      // The grant writes the subscription row and the account in one
      // transaction; the mock runs the callback against the same client.
      $transaction: jest.fn(async (fn: any) => fn(mockPrisma)),
      user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      subscription: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({})
      }
    };
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('resolveSubscriptionPeriod', () => {
    it('reads the period off the subscription item when the top level omits it', () => {
      const end = Math.floor((Date.now() + 10 * DAY) / 1000);
      const start = Math.floor(Date.now() / 1000);

      const period = resolveSubscriptionPeriod({
        status: 'active',
        items: { data: [{ current_period_start: start, current_period_end: end }] }
      });

      expect(period.currentPeriodEnd.getTime()).toBe(end * 1000);
      expect(period.currentPeriodStart.getTime()).toBe(start * 1000);
    });

    it('uses trial_end for a trialing subscription', () => {
      const trialEnd = Math.floor((Date.now() + 14 * DAY) / 1000);

      const period = resolveSubscriptionPeriod({
        status: 'trialing',
        trial_end: trialEnd,
        items: { data: [{ current_period_end: Math.floor((Date.now() + 99 * DAY) / 1000) }] }
      });

      expect(period.currentPeriodEnd.getTime()).toBe(trialEnd * 1000);
    });
  });

  describe('grantAdminTrial', () => {
    const trialEndsAt = whenSecondsFromNow(14 * DAY);

    const stripeTrialSubscription = (endsAt: Date) => ({
      id: 'sub_admin_trial',
      status: 'trialing',
      trial_end: Math.floor(endsAt.getTime() / 1000),
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_default' } }] }
    });

    it('creates a Stripe trial that cancels itself when no card is added', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(adminCreatedUser());
      stripeMock.customers.create.mockResolvedValue({ id: 'cus_new' });
      stripeMock.subscriptions.create.mockResolvedValue(stripeTrialSubscription(trialEndsAt));

      const result = await stripeService.grantAdminTrial({
        userId: 'user_1',
        trialEndsAt,
        grantedBy: 'admin@example.com'
      });

      expect(stripeMock.customers.create).toHaveBeenCalledWith({
        email: 'comped@example.com',
        metadata: { userId: 'user_1', source: 'admin_trial' }
      });
      expect(stripeMock.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_new',
          items: [{ price: 'price_default' }],
          trial_end: Math.floor(trialEndsAt.getTime() / 1000),
          trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
          metadata: expect.objectContaining({ source: 'admin_trial', granted_by: 'admin@example.com' })
        }),
        // Keyed per account and date, so a double-click cannot buy two trials.
        { idempotencyKey: `admin-trial-user_1-${Math.floor(trialEndsAt.getTime() / 1000)}` }
      );

      // Customer id is stored before Stripe creates the subscription so the
      // webhook can resolve the account without an email-adoption race.
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { stripeCustomerId: 'cus_new' }
      });

      // The panel reads the local row, so it carries the chosen end date without
      // waiting for the webhook.
      expect(mockPrisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: 'sub_admin_trial' },
          create: expect.objectContaining({
            userId: 'user_1',
            status: 'trialing',
            currentPeriodEnd: trialEndsAt
          })
        })
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { stripeCustomerId: 'cus_new', subscriptionStatus: 'trialing', tier: 'premium' }
      });
      expect(result.trialEndsAt.getTime()).toBe(trialEndsAt.getTime());
    });

    it('reuses the account\'s existing Stripe customer', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(adminCreatedUser({ stripeCustomerId: 'cus_existing' }));
      stripeMock.customers.retrieve.mockResolvedValue({ id: 'cus_existing' });
      stripeMock.subscriptions.create.mockResolvedValue(stripeTrialSubscription(trialEndsAt));

      await stripeService.grantAdminTrial({ userId: 'user_1', trialEndsAt });

      expect(stripeMock.customers.create).not.toHaveBeenCalled();
      expect(stripeMock.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_existing' }),
        expect.anything()
      );
      // Existing customer id is already on the user row — no pre-create write.
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { stripeCustomerId: 'cus_existing', subscriptionStatus: 'trialing', tier: 'premium' }
      });
    });

    it('creates a customer when the stored one is gone from Stripe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(adminCreatedUser({ stripeCustomerId: 'cus_deleted' }));
      stripeMock.customers.retrieve.mockResolvedValue({ id: 'cus_deleted', deleted: true });
      stripeMock.customers.create.mockResolvedValue({ id: 'cus_new' });
      stripeMock.subscriptions.create.mockResolvedValue(stripeTrialSubscription(trialEndsAt));

      await stripeService.grantAdminTrial({ userId: 'user_1', trialEndsAt });

      expect(stripeMock.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_new' }),
        expect.anything()
      );
    });

    it('refuses an account that already has Stripe billing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        adminCreatedUser({
          subscriptionStatus: 'canceled',
          subscriptions: [{ stripeSubscriptionId: 'sub_old', status: 'canceled' }]
        })
      );

      await expect(
        stripeService.grantAdminTrial({ userId: 'user_1', trialEndsAt })
      ).rejects.toMatchObject({ name: 'AdminTrialError', statusCode: 409 });
      expect(stripeMock.subscriptions.create).not.toHaveBeenCalled();
    });

    it('refuses an account whose access has been revoked', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(adminCreatedUser({ isActive: false }));

      await expect(
        stripeService.grantAdminTrial({ userId: 'user_1', trialEndsAt })
      ).rejects.toBeInstanceOf(AdminTrialError);
      expect(stripeMock.subscriptions.create).not.toHaveBeenCalled();
    });

    it('refuses an end date Stripe would reject, before calling Stripe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(adminCreatedUser());

      await expect(
        stripeService.grantAdminTrial({ userId: 'user_1', trialEndsAt: new Date(Date.now() + 2 * HOUR) })
      ).rejects.toMatchObject({ statusCode: 400 });

      await expect(
        stripeService.grantAdminTrial({ userId: 'user_1', trialEndsAt: new Date(Date.now() - DAY) })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(stripeMock.subscriptions.create).not.toHaveBeenCalled();
      expect(stripeMock.customers.create).not.toHaveBeenCalled();
    });

    it('moves the account onto the tier the trial actually bills', async () => {
      // Single-tier pricing has one price and it is premium, and the webhooks
      // re-derive the tier from the price -- so the change happens here, where
      // the admin sees it, instead of silently on the first delivery.
      mockPrisma.user.findUnique.mockResolvedValue(adminCreatedUser({ tier: 'standard' }));
      stripeMock.customers.create.mockResolvedValue({ id: 'cus_new' });
      stripeMock.subscriptions.create.mockResolvedValue(stripeTrialSubscription(trialEndsAt));

      const result = await stripeService.grantAdminTrial({ userId: 'user_1', trialEndsAt });

      expect(result.tier).toBe('premium');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tier: 'premium' }) })
      );
      expect(mockPrisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ tier: 'premium' }) })
      );
    });

    it('cancels its own subscription when a concurrent grant won the account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(adminCreatedUser());
      stripeMock.customers.create.mockResolvedValue({ id: 'cus_new' });
      stripeMock.subscriptions.create.mockResolvedValue(stripeTrialSubscription(trialEndsAt));
      // A row that was not there during the account check has appeared.
      mockPrisma.subscription.findFirst.mockResolvedValue({ stripeSubscriptionId: 'sub_other' });

      await expect(
        stripeService.grantAdminTrial({ userId: 'user_1', trialEndsAt })
      ).rejects.toMatchObject({ name: 'AdminTrialError', statusCode: 409 });

      expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith('sub_admin_trial');
      expect(mockPrisma.subscription.upsert).not.toHaveBeenCalled();
      // The customer id is written before the create so the webhook can resolve
      // the account; the loser must not go on to claim the trial itself.
      expect(mockPrisma.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ subscriptionStatus: 'trialing' }) })
      );
    });

    it('refuses a trial longer than a year', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(adminCreatedUser());

      await expect(
        stripeService.grantAdminTrial({ userId: 'user_1', trialEndsAt: new Date(Date.now() + 400 * DAY) })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(stripeMock.subscriptions.create).not.toHaveBeenCalled();
    });
  });

  describe('updateTrialEnd', () => {
    it('moves the date at Stripe and mirrors what Stripe returns', async () => {
      const newEnd = whenSecondsFromNow(21 * DAY);
      mockPrisma.subscription.findFirst.mockResolvedValue({
        stripeSubscriptionId: 'sub_admin_trial',
        status: 'trialing'
      });
      stripeMock.subscriptions.update.mockResolvedValue({
        id: 'sub_admin_trial',
        status: 'trialing',
        trial_end: Math.floor(newEnd.getTime() / 1000),
        items: { data: [{}] }
      });

      const result = await stripeService.updateTrialEnd({ userId: 'user_1', trialEndsAt: newEnd });

      expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
        'sub_admin_trial',
        expect.objectContaining({ trial_end: Math.floor(newEnd.getTime() / 1000) })
      );
      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: 'sub_admin_trial' },
          data: expect.objectContaining({ currentPeriodEnd: newEnd, status: 'trialing' })
        })
      );
      expect(result.trialEndsAt.getTime()).toBe(newEnd.getTime());
    });

    it('refuses when no trial is running', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await expect(
        stripeService.updateTrialEnd({ userId: 'user_1', trialEndsAt: new Date(Date.now() + 7 * DAY) })
      ).rejects.toMatchObject({ name: 'AdminTrialError', statusCode: 409 });
      expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    });
  });
});
