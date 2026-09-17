/**
 * Whether a calculator lead token may stand in for the emailed verification
 * code.
 *
 * It may when the token reached the visitor the only way it used to: inside a
 * message to the address the lead names. Holding one then means having read
 * that inbox, which is the same thing the code demonstrates.
 *
 * It may not when the calculator page was handed the token so it could take
 * the visitor straight to signup. Anyone can type a stranger's address into a
 * public calculator, and returning the token to whoever did would let them
 * register that address with the code skipped — the lead's own address check
 * does not catch it, because the address matches by construction. The lead row
 * is stamped before the token is returned, and this is the test that the stamp
 * is what registration reads.
 *
 * Either way the run is still written as the account's first decision. The
 * figures are the figures; it is only the claim about the address that fails.
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
    create: jest.fn(async () => created),
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
    prisma.user.create.mockResolvedValue(created as never);
  });

  it('accepts an emailed token as proof of the address', async () => {
    leads.resolve.mockResolvedValue(retirementLead(false));

    const res = await register();
    await settle();

    expect(res.status).toBe(201);
    expect(createdWithEmailVerified()).toBe(true);
    expect(sendVerificationCode).not.toHaveBeenCalled();
    expect(leads.seed).toHaveBeenCalled();
  });

  /*
   * The bypass this column exists to stop. Every other signal is identical to
   * the case above — a live token, resolved, addressed to the person
   * registering — so nothing but the stamp can tell them apart.
   */
  it('refuses a token its own page was given, and still saves the run', async () => {
    leads.resolve.mockResolvedValue(retirementLead(true));

    const res = await register();
    await settle();

    expect(res.status).toBe(201);
    expect(createdWithEmailVerified()).toBe(false);
    expect(sendVerificationCode).toHaveBeenCalled();
    // The figures are not in question. Only the claim about the address was.
    expect(leads.seed).toHaveBeenCalled();
  });
});
