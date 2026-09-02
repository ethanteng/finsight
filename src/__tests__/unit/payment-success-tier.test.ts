/**
 * The tier in the /api/stripe/payment-success response drives the GA4 purchase
 * conversion, so it has to describe what the customer actually bought.
 *
 * resolveCheckoutSessionTier is unit-tested in stripe-config.test.ts; this
 * covers the route end to end, and specifically that the `tier` query parameter
 * on the return URL — which anyone can edit or omit — no longer reaches it.
 */
import express from 'express';
import request from 'supertest';

// Only the Stripe client is faked. resolveCheckoutSessionTier and
// getTierFromPriceId stay real, so this exercises the actual resolution.
jest.mock('../../config/stripe', () => ({
  ...jest.requireActual('../../config/stripe'),
  stripe: {
    client: {
      checkout: {
        sessions: { retrieve: jest.fn() }
      }
    }
  }
}));

jest.mock('../../config/stripe-pricing', () => ({
  ...jest.requireActual('../../config/stripe-pricing'),
  getDefaultPrice: jest.fn()
}));

jest.mock('../../services/stripe', () => ({
  stripeService: { linkCheckoutSessionToUser: jest.fn() }
}));

jest.mock('../../prisma-client', () => ({ getPrismaClient: jest.fn() }));

jest.mock('../../auth/middleware', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireAuthAllowLapsedSubscription: (_req: any, _res: any, next: any) => next()
}));

const { stripe } = require('../../config/stripe');
const { getDefaultPrice } = require('../../config/stripe-pricing');
const { getPrismaClient } = require('../../prisma-client');
import stripeRoutes from '../../routes/stripe';

const app = express();
app.use('/api/stripe', stripeRoutes);

/** A completed, paid checkout for the single subscription price. */
function paidSession(overrides: Record<string, unknown> = {}) {
  return {
    payment_status: 'paid',
    status: 'complete',
    currency: 'usd',
    amount_total: 1900,
    customer_details: { email: 'buyer@example.com' },
    metadata: { tier: 'premium', source: 'web_checkout' },
    line_items: { data: [{ price: { id: 'price_live_abc', unit_amount: 1900, currency: 'usd' } }] },
    ...overrides
  };
}

describe('GET /api/stripe/payment-success tier attribution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDefaultPrice.mockResolvedValue({ amount: 19, currency: 'usd' });
    stripe.client.checkout.sessions.retrieve.mockResolvedValue(paidSession());
    // No existing account, so the route takes the new-user branch.
    (getPrismaClient as jest.Mock).mockReturnValue({
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      subscription: { findFirst: jest.fn().mockResolvedValue(null) }
    });
  });

  it('ignores the tier on the return URL in favour of the session metadata', async () => {
    stripe.client.checkout.sessions.retrieve.mockResolvedValue(
      paidSession({ metadata: { tier: 'standard', source: 'web_checkout' } })
    );

    const response = await request(app)
      .get('/api/stripe/payment-success')
      .query({ session_id: 'cs_test_1', tier: 'starter' });

    expect(response.status).toBe(200);
    // The session says standard; the query string says starter and loses.
    expect(response.body.tier).toBe('standard');
  });

  it('maps the line-item price when the session carries no tier metadata', async () => {
    stripe.client.checkout.sessions.retrieve.mockResolvedValue(paidSession({ metadata: {} }));

    const response = await request(app)
      .get('/api/stripe/payment-success')
      .query({ session_id: 'cs_test_2', tier: 'starter' });

    expect(response.status).toBe(200);
    // Single-tier pricing maps every real price to premium.
    expect(response.body.tier).toBe('premium');
  });

  it('reports the sold tier when the return URL carries none at all', async () => {
    const response = await request(app)
      .get('/api/stripe/payment-success')
      .query({ session_id: 'cs_test_3' });

    expect(response.status).toBe(200);
    expect(response.body.tier).toBe('premium');
  });

  it('reports the amount and currency the session sold', async () => {
    const response = await request(app)
      .get('/api/stripe/payment-success')
      .query({ session_id: 'cs_test_4' });

    expect(response.body).toMatchObject({
      paid: true,
      amount: 19,
      currency: 'USD',
      session_id: 'cs_test_4'
    });
  });
});
