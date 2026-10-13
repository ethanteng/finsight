/**
 * `/auth/login` and `/auth/verify` tell an operator's own browser that it is
 * one, so it can leave itself out of analytics (frontend
 * `lib/internal-analytics.ts`). Every other account hears `false`.
 */

import express from 'express';
import request from 'supertest';

const user = {
  id: 'user-1',
  email: 'reader@example.com',
  tier: 'premium',
  isActive: true,
  timeZone: 'America/New_York',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: jest.fn(async () => user),
      update: jest.fn(async () => user),
    },
  }),
}));

jest.mock('../../auth/utils', () => ({
  ...jest.requireActual('../../auth/utils'),
  verifyToken: () => ({ userId: user.id, email: user.email, tier: user.tier }),
  validateUserCredentials: async () => ({ success: true, user }),
  generateToken: () => 'session-token',
}));

function buildApp() {
  const router = require('../../auth/routes').default;
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  return app;
}

describe('operator flag on sign-in', () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS;
  // Login refreshes the financial summary in the background; nothing to wait on here.
  beforeAll(() => jest.spyOn(global, 'setImmediate').mockImplementation((() => undefined) as never));
  afterAll(() => jest.restoreAllMocks());

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalAdminEmails;
    user.email = 'reader@example.com';
  });

  it('is false for an ordinary account', async () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    const app = buildApp();

    const login = await request(app).post('/auth/login').send({ email: user.email, password: 'secret' });
    expect(login.status).toBe(200);
    expect(login.body.operator).toBe(false);

    const verify = await request(app).get('/auth/verify').set('Authorization', 'Bearer session-token');
    expect(verify.status).toBe(200);
    expect(verify.body.operator).toBe(false);
  });

  it('is true for an address in ADMIN_EMAILS', async () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    user.email = 'Admin@Example.com';
    const app = buildApp();

    const login = await request(app).post('/auth/login').send({ email: user.email, password: 'secret' });
    expect(login.body).toMatchObject({ token: 'session-token', operator: true });

    const verify = await request(app).get('/auth/verify').set('Authorization', 'Bearer session-token');
    expect(verify.body).toMatchObject({ valid: true, operator: true });
  });
});
