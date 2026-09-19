/**
 * The signed-in upgrade CTA opens `/subscribe` in a new tab. After checkout
 * succeeds, that original tab can still offer the button until it refetches
 * billing state — and `/subscribe` itself is a plain URL anyone can hit.
 *
 * Minting a second Checkout Session for an account that already holds an
 * active or trialing subscription creates a duplicate Stripe subscription
 * rather than converting the first. This covers the route-level refuse that
 * backs the header's `canUpgrade` hide.
 */
import express from 'express';
import request from 'supertest';

const createCheckoutSession = jest.fn();
const findUniqueUser = jest.fn();
const findFirstSubscription = jest.fn();
const countSubscriptions = jest.fn();

jest.mock('../../config/stripe', () => ({
  ...jest.requireActual('../../config/stripe'),
  stripe: { client: {} },
}));

jest.mock('../../config/stripe-pricing', () => ({
  ...jest.requireActual('../../config/stripe-pricing'),
  getDefaultPrice: jest.fn().mockResolvedValue({
    priceId: 'price_test_premium',
    amount: 19,
    currency: 'usd',
  }),
}));

jest.mock('../../services/stripe', () => ({
  stripeService: {
    createCheckoutSession: (...args: unknown[]) => createCheckoutSession(...args),
  },
}));

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({
    user: { findUnique: findUniqueUser },
    subscription: {
      findFirst: findFirstSubscription,
      count: countSubscriptions,
    },
  }),
}));

jest.mock('../../auth/middleware', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireAuthAllowLapsedSubscription: (_req: any, _res: any, next: any) => next(),
}));

import stripeRoutes from '../../routes/stripe';

function buildApp(userId?: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (userId) {
      (req as any).user = { id: userId, email: 'member@example.com' };
    }
    next();
  });
  app.use('/api/stripe', stripeRoutes);
  return app;
}

const checkoutBody = {
  tier: 'premium',
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
};

describe('POST /api/stripe/create-checkout-session already-subscribed guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findUniqueUser.mockResolvedValue({
      id: 'user_1',
      email: 'member@example.com',
      stripeCustomerId: 'cus_1',
    });
    countSubscriptions.mockResolvedValue(0);
    createCheckoutSession.mockResolvedValue({
      sessionId: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    });
  });

  it('refuses checkout when the signed-in account already has a trialing subscription', async () => {
    findFirstSubscription.mockResolvedValue({ id: 'sub_trial' });

    const response = await request(buildApp('user_1'))
      .post('/api/stripe/create-checkout-session')
      .send(checkoutBody);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'This account already has an active subscription.',
      code: 'ALREADY_SUBSCRIBED',
    });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('refuses checkout when the signed-in account already has an active subscription', async () => {
    findFirstSubscription.mockResolvedValue({ id: 'sub_active' });

    const response = await request(buildApp('user_1'))
      .post('/api/stripe/create-checkout-session')
      .send(checkoutBody);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ALREADY_SUBSCRIBED');
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('still mints checkout for a no-card signup with no working subscription', async () => {
    findFirstSubscription.mockResolvedValue(null);

    const response = await request(buildApp('user_1'))
      .post('/api/stripe/create-checkout-session')
      .send(checkoutBody);

    expect(response.status).toBe(200);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: 'member@example.com',
        customerId: 'cus_1',
        skipTrial: false,
      }),
    );
  });

  it('does not apply the guard to an anonymous marketing checkout', async () => {
    const response = await request(buildApp())
      .post('/api/stripe/create-checkout-session')
      .send(checkoutBody);

    expect(response.status).toBe(200);
    expect(findUniqueUser).not.toHaveBeenCalled();
    expect(findFirstSubscription).not.toHaveBeenCalled();
    expect(createCheckoutSession).toHaveBeenCalled();
  });
});
