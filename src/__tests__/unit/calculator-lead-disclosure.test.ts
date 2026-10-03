/**
 * What a calculator lead token does at registration.
 *
 * Any resolved lead skips the verification code and seeds the run as the
 * account's first decision: the calculators send visitors into Ask Linc to see
 * their answer, and a code in front of it is where they leave.
 *
 * Only a token that reached the visitor inside a message to the address it
 * names records that address as verified. A token handed back to the
 * calculator page proves nothing about the inbox, because anyone can type a
 * stranger's address into a public calculator. The lead row is stamped before
 * the token is returned, and this is the test that the stamp is what
 * registration reads for `emailVerified`.
 */

import express from 'express';
import request from 'supertest';

const leads = {
  resolve: jest.fn(),
  seed: jest.fn(async () => undefined),
};
jest.mock('../../services/calculator-first-decision', () => ({
  resolveCalculatorLead: (...args: unknown[]) => leads.resolve(...(args as [])),
  seedFirstDecisionFromLead: (...args: unknown[]) => leads.seed(...(args as [])),
}));

const sendVerificationCode = jest.fn(async () => true);
jest.mock('../../auth/resend-email', () => ({
  ...jest.requireActual('../../auth/resend-email'),
  sendEmailVerificationCode: (...args: unknown[]) => sendVerificationCode(...(args as [])),
}));

jest.mock('../../services/mailerlite-subscribe', () => ({
  ...jest.requireActual('../../services/mailerlite-subscribe'),
  subscribeToMailerLite: jest.fn(async () => 'skipped'),
}));

const created = {
  id: 'user-1',
  email: 'reader@example.com',
  tier: 'premium',
  timeZone: 'UTC',
  emailVerified: false,
  createdAt: new Date('2026-09-17T05:00:00.000Z'),
};

const prisma = {
  user: {
    findUnique: jest.fn(async () => null),
    // Echo the verified bit the route wrote so the response body contract is
    // tested, not just the create args.
    create: jest.fn(async (args: { data: { emailVerified: boolean } }) => ({
      ...created,
      emailVerified: args.data.emailVerified,
    })),
    update: jest.fn(async () => created),
  },
  privacySettings: { create: jest.fn(async () => ({})) },
  emailVerificationCode: { create: jest.fn(async () => ({})) },
};
jest.mock('../../prisma-client', () => ({ getPrismaClient: () => prisma }));

const TOKEN = 'a'.repeat(48);

function retirementLead(tokenDisclosed: boolean) {
  return {
    kind: 'retirement' as const,
    lead: { token: TOKEN, email: 'reader@example.com', tokenDisclosed },
  };
}

function buildApp() {
  const router = require('../../auth/routes').default;
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  return app;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function register() {
  return request(buildApp())
    .post('/auth/register')
    .send({ email: 'reader@example.com', password: 'Password1', calculatorRef: TOKEN });
}

/** What the account was actually written with, rather than what was returned. */
function createdWithEmailVerified(): boolean {
  const [args] = prisma.user.create.mock.calls[0] as unknown as [{ data: { emailVerified: boolean } }];
  return args.data.emailVerified;
}

describe('a calculator lead token and the verification code', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(null as never);
    prisma.user.create.mockImplementation(async (args: { data: { emailVerified: boolean } }) => ({
      ...created,
      emailVerified: args.data.emailVerified,
    }));
  });

  it('accepts an emailed token as proof of the address', async () => {
    leads.resolve.mockResolvedValue(retirementLead(false));

    const res = await register();
    await settle();

    expect(res.status).toBe(201);
    expect(createdWithEmailVerified()).toBe(true);
    expect(res.body.user.emailVerified).toBe(true);
    expect(sendVerificationCode).not.toHaveBeenCalled();
    expect(res.body.firstDecisionPending).toBe(true);
    expect(leads.seed).toHaveBeenCalled();
  });

  /*
   * Every other signal is identical to the case above — a live token,
   * resolved, addressed to the person registering — so nothing but the stamp
   * can tell them apart. It decides only what the account records about the
   * address; the signup goes straight in either way.
   */
  it('skips the code for a token its own page was given, without recording the address as verified', async () => {
    leads.resolve.mockResolvedValue(retirementLead(true));

    const res = await register();
    await settle();

    expect(res.status).toBe(201);
    expect(createdWithEmailVerified()).toBe(false);
    expect(res.body.user.emailVerified).toBe(false);
    expect(sendVerificationCode).not.toHaveBeenCalled();
    expect(prisma.emailVerificationCode.create).not.toHaveBeenCalled();
    expect(res.body.firstDecisionPending).toBe(true);
    expect(leads.seed).toHaveBeenCalled();
  });

  it('still sends a code to a signup with no calculator lead', async () => {
    leads.resolve.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/auth/register')
      .send({ email: 'reader@example.com', password: 'Password1' });
    await settle();

    expect(res.status).toBe(201);
    expect(createdWithEmailVerified()).toBe(false);
    expect(sendVerificationCode).toHaveBeenCalled();
    expect(res.body.firstDecisionPending).toBe(false);
  });
});
