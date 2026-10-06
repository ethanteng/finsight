import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

/**
 * A new no-card account gets exactly what "Convert to trial" in the admin
 * panel does, with the picker's 30-day default, started by registration
 * instead of by an admin. The grant finishes before the 201 so the client's
 * first billing fetch sees the trial; Stripe can still never fail the signup.
 */

const trials = {
  grant: jest.fn<Promise<unknown>, unknown[]>(async () => ({ status: 'trialing' })),
};
const leads = {
  resolve: jest.fn<Promise<unknown>, unknown[]>(async () => null),
  seed: jest.fn(async () => 'no-lead'),
};

jest.mock('../../services/stripe', () => ({
  stripeService: {
    grantAdminTrial: (...args: unknown[]) => trials.grant(...(args as [])),
    linkCheckoutSessionToUser: jest.fn(async () => ({ linked: true })),
  },
}));
jest.mock('../../services/mailerlite-subscribe', () => ({
  ...jest.requireActual('../../services/mailerlite-subscribe'),
  subscribeToMailerLite: jest.fn(async () => 'subscribed'),
}));
jest.mock('../../services/calculator-first-decision', () => ({
  resolveCalculatorLead: (...args: unknown[]) => leads.resolve(...(args as [])),
  seedFirstDecisionFromLead: (...args: unknown[]) => leads.seed(...(args as [])),
}));
jest.mock('../../auth/resend-email', () => ({
  ...jest.requireActual('../../auth/resend-email'),
  sendEmailVerificationCode: jest.fn(async () => true),
}));

const created = {
  id: 'user-1',
  email: 'new@example.com',
  tier: 'premium',
  timeZone: 'UTC',
  emailVerified: false,
  createdAt: new Date('2026-10-06T05:00:00.000Z'),
};

const prisma = {
  user: {
    findUnique: jest.fn(async () => null),
    create: jest.fn(async (args: { data: { email: string } }) => ({ ...created, email: args.data.email })),
    update: jest.fn(async () => created),
  },
  privacySettings: { create: jest.fn(async () => ({})) },
  emailVerificationCode: { create: jest.fn(async () => ({})) },
};
jest.mock('../../prisma-client', () => ({ getPrismaClient: () => prisma }));

function buildApp() {
  const router = require('../../auth/routes').default;
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  return app;
}

const DAY = 24 * 60 * 60 * 1000;

function register(body: Record<string, unknown>) {
  return request(buildApp())
    .post('/auth/register')
    .send({ email: 'new@example.com', password: 'Password1', ...body });
}

describe('registration and the signup trial', () => {
  const ENV = ['STRIPE_SECRET_KEY'] as const;
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    for (const name of ENV) previous.set(name, process.env[name]);
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  });

  afterEach(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    previous.clear();
    jest.restoreAllMocks();
  });

  it('converts a plain no-card signup to a 30-day trial', async () => {
    const before = Date.now();
    const res = await register({});
    const after = Date.now();

    expect(res.status).toBe(201);
    // Awaited before the 201, so the grant has finished by the time we return.
    expect(trials.grant).toHaveBeenCalledTimes(1);
    const [params] = trials.grant.mock.calls[0] as [{ userId: string; trialEndsAt: Date }];
    expect(params.userId).toBe('user-1');
    expect(params.trialEndsAt.getTime()).toBeGreaterThanOrEqual(before + 30 * DAY);
    expect(params.trialEndsAt.getTime()).toBeLessThanOrEqual(after + 30 * DAY);
  });

  it('starts a trial on a signup continuing from a calculator', async () => {
    leads.resolve.mockResolvedValueOnce({
      kind: 'coast-fire',
      lead: { email: 'new@example.com', tokenDisclosed: false },
    });

    const res = await register({ calculatorRef: 'd'.repeat(48) });

    expect(res.status).toBe(201);
    expect(trials.grant).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
  });

  // The checkout already made a subscription; a second would bill beside it.
  it('leaves a paid checkout signup alone', async () => {
    await register({ stripeSessionId: 'cs_test_123', tier: 'premium' });

    expect(trials.grant).not.toHaveBeenCalled();
  });

  it('does nothing when Stripe is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const res = await register({});

    expect(res.status).toBe(201);
    expect(trials.grant).not.toHaveBeenCalled();
  });

  // A failed grant leaves the account Admin Created; the signup must not notice.
  it('still registers the account when Stripe refuses the trial', async () => {
    trials.grant.mockRejectedValueOnce(new Error('Stripe is down'));

    const res = await register({});

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Signup trial not started for user user-1'),
      expect.any(Error)
    );
  });

  // An unknown tier has no Stripe price, so the grant would throw and leave
  // the account open-ended. Refused up front, as PUT /profile does.
  it('refuses a tier with no Stripe price before creating the account', async () => {
    const res = await register({ tier: 'free' });

    expect(res.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(trials.grant).not.toHaveBeenCalled();
  });

  /*
   * Each signup now costs Stripe calls. Its own forwarded address keeps this
   * window apart from the other cases', which share the socket address.
   */
  it('stops a single caller after 20 attempts in the window', async () => {
    const app = buildApp();
    const attempt = () => request(app)
      .post('/auth/register')
      .set('X-Forwarded-For', '203.0.113.9')
      .send({ email: 'new@example.com' });

    for (let i = 0; i < 20; i += 1) {
      expect((await attempt()).status).toBe(400);
    }
    const res = await attempt();

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/Too many signup attempts/);
  });
});
