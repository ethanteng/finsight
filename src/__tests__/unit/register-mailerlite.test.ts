import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

/**
 * What a new account does to the marketing list.
 *
 * Registration used to do nothing here: every signup waited for the 3am sync
 * in `mailerlite-sync` before it existed on any list, which is too late for
 * anything meant to greet a new account. These cases pin when a signup joins
 * now (only after email ownership is proved), which groups it joins, and the
 * ones it must not.
 */

const list = {
  subscribe: jest.fn<Promise<'subscribed' | 'skipped' | 'failed'>, unknown[]>(
    async () => 'subscribed',
  ),
};
const leads = {
  resolve: jest.fn<Promise<unknown>, unknown[]>(async () => null),
  seed: jest.fn(async () => 'no-lead'),
};

jest.mock('../../services/mailerlite-subscribe', () => ({
  ...jest.requireActual('../../services/mailerlite-subscribe'),
  subscribeToMailerLite: (...args: unknown[]) => list.subscribe(...(args as [])),
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
  createdAt: new Date('2026-09-17T05:00:00.000Z'),
  subscriptionStatus: 'inactive',
};

const prisma = {
  user: {
    findUnique: jest.fn(async () => null),
    create: jest.fn(async () => created),
    update: jest.fn(async () => ({
      ...created,
      emailVerified: true,
    })) as jest.Mock,
  },
  privacySettings: { create: jest.fn(async () => ({})) },
  emailVerificationCode: {
    create: jest.fn(async () => ({})),
    findUnique: jest.fn(async (): Promise<unknown> => null),
    update: jest.fn(async () => ({})),
  },
};
jest.mock('../../prisma-client', () => ({ getPrismaClient: () => prisma }));

jest.mock('../../auth/middleware', () => ({
  authenticateUser: (req: { user?: { id: string } }, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1' };
    next();
  },
}));

const GROUPS = {
  MAILER_LITE_TRIAL_GROUP_ID: 'trial-group',
  MAILER_LITE_RETIREMENT_GROUP_ID: 'retirement-group',
  MAILER_LITE_COAST_FIRE_GROUP_ID: 'coast-fire-group',
};

function buildApp() {
  const router = require('../../auth/routes').default;
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  return app;
}

/** The subscribe is fired after the response and never awaited by the route. */
const settle = () => new Promise(resolve => setImmediate(resolve));

function register(body: Record<string, unknown>) {
  return request(buildApp())
    .post('/auth/register')
    .send({ email: 'new@example.com', password: 'Password1', ...body });
}

function verifyEmail(body: Record<string, unknown>) {
  return request(buildApp())
    .post('/auth/verify-email')
    .send(body);
}

/** The single `groups` array the route asked MailerLite for. */
function subscribedGroups(): string[] {
  const [params] = list.subscribe.mock.calls[0] as [{ groups: string[] }];
  return params.groups;
}

describe('registration and the marketing list', () => {
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.create.mockImplementation(async () => created);
    prisma.user.update.mockImplementation(async () => ({
      ...created,
      emailVerified: true,
      subscriptionStatus: 'inactive',
    }));
    prisma.emailVerificationCode.findUnique.mockResolvedValue(null);
    for (const [name, value] of Object.entries(GROUPS)) {
      previous.set(name, process.env[name]);
      process.env[name] = value;
    }
  });

  afterEach(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    previous.clear();
  });

  /*
   * An ordinary signup has not proved inbox control yet. The verification mail
   * promises the address will not be used for any other purpose until they
   * enter the code — so the list wait until `/auth/verify-email`.
   */
  it('does not put an unverified no-card signup on the list at register', async () => {
    const res = await register({});
    await settle();

    expect(res.status).toBe(201);
    expect(list.subscribe).not.toHaveBeenCalled();
  });

  it('does not trust signupOrigin alone to join a calculator group at register', async () => {
    await register({ signupOrigin: 'retirement_calculator' });
    await settle();

    expect(list.subscribe).not.toHaveBeenCalled();
  });

  it('subscribes immediately when a resolved lead already proved the address', async () => {
    leads.resolve.mockResolvedValueOnce({ kind: 'retirement', lead: { email: 'new@example.com' } });
    prisma.user.create.mockImplementationOnce(async () => ({
      ...created,
      emailVerified: true,
    }));

    const res = await register({ calculatorRef: 'd'.repeat(48) });
    await settle();

    expect(res.status).toBe(201);
    expect(list.subscribe).toHaveBeenCalledTimes(1);
    expect(subscribedGroups()).toEqual(['trial-group', 'retirement-group']);
    const [params] = list.subscribe.mock.calls[0] as [{ email: string; fields: Record<string, unknown> }];
    expect(params.email).toBe('new@example.com');
    // Field names the nightly sync already writes, so tonight's run updates
    // these rather than leaving a second set beside them.
    expect(params.fields).toEqual({ current_tier: 'premium', user_created_at: '2026-09-17' });
  });

  it('adds the Coast FIRE group when the proved lead is from that calculator', async () => {
    leads.resolve.mockResolvedValueOnce({ kind: 'coast-fire', lead: { email: 'new@example.com' } });

    await register({ calculatorRef: 'd'.repeat(48) });
    await settle();

    expect(subscribedGroups()).toEqual(['trial-group', 'coast-fire-group']);
  });

  it('believes the lead it resolved over a conflicting claim in the body', async () => {
    leads.resolve.mockResolvedValueOnce({ kind: 'coast-fire', lead: { email: 'new@example.com' } });

    await register({
      calculatorRef: 'd'.repeat(48),
      signupOrigin: 'retirement_calculator',
    });
    await settle();

    expect(subscribedGroups()).toEqual(['trial-group', 'coast-fire-group']);
  });

  /*
   * The trial group exists to convert someone who has not paid. A customer who
   * just completed checkout is left to the nightly sync and its all-users group.
   */
  it('leaves a paid checkout signup to the nightly sync', async () => {
    await register({ stripeSessionId: 'cs_test_123', tier: 'premium' });
    await settle();

    expect(list.subscribe).not.toHaveBeenCalled();
  });

  it('still registers the account when the list refuses the address', async () => {
    list.subscribe.mockResolvedValueOnce('failed');
    leads.resolve.mockResolvedValueOnce({ kind: 'retirement', lead: { email: 'new@example.com' } });

    const res = await register({ calculatorRef: 'd'.repeat(48) });
    await settle();

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
  });

  it('skips a group whose id is not configured rather than sending an empty one', async () => {
    delete process.env.MAILER_LITE_TRIAL_GROUP_ID;
    leads.resolve.mockResolvedValueOnce({ kind: 'retirement', lead: { email: 'new@example.com' } });

    await register({ calculatorRef: 'd'.repeat(48) });
    await settle();

    expect(subscribedGroups()).toEqual(['retirement-group']);
  });
});

describe('verify-email and the marketing list', () => {
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.emailVerificationCode.findUnique.mockResolvedValue({
      id: 'code-1',
      code: '123456',
      userId: 'user-1',
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
      user: created,
    });
    prisma.user.update.mockImplementation(async () => ({
      email: 'new@example.com',
      tier: 'premium',
      createdAt: created.createdAt,
      subscriptionStatus: 'inactive',
    }));
    for (const [name, value] of Object.entries(GROUPS)) {
      previous.set(name, process.env[name]);
      process.env[name] = value;
    }
  });

  afterEach(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    previous.clear();
  });

  it('puts a verified no-card signup in the trial group', async () => {
    const res = await verifyEmail({ code: '123456' });
    await settle();

    expect(res.status).toBe(200);
    expect(list.subscribe).toHaveBeenCalledTimes(1);
    expect(subscribedGroups()).toEqual(['trial-group']);
    const [params] = list.subscribe.mock.calls[0] as [{ fields: Record<string, unknown> }];
    expect(params.fields).toEqual({ current_tier: 'premium', user_created_at: '2026-09-17' });
  });

  it('adds the retirement group when verify carries that origin', async () => {
    await verifyEmail({ code: '123456', signupOrigin: 'retirement_calculator' });
    await settle();

    expect(subscribedGroups()).toEqual(['trial-group', 'retirement-group']);
  });

  it('adds the Coast FIRE group when verify carries that origin', async () => {
    await verifyEmail({ code: '123456', signupOrigin: 'coast_fire_calculator' });
    await settle();

    expect(subscribedGroups()).toEqual(['trial-group', 'coast-fire-group']);
  });

  it('falls back to the trial group alone for an origin it does not recognize', async () => {
    await verifyEmail({ code: '123456', signupOrigin: 'some_other_page' });
    await settle();

    expect(subscribedGroups()).toEqual(['trial-group']);
  });

  it('leaves a paid checkout verification to the nightly sync', async () => {
    prisma.user.update.mockImplementationOnce(async () => ({
      email: 'new@example.com',
      tier: 'premium',
      createdAt: created.createdAt,
      subscriptionStatus: 'incomplete',
    }));

    await verifyEmail({ code: '123456' });
    await settle();

    expect(list.subscribe).not.toHaveBeenCalled();
  });
});
