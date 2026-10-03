/**
 * `POST /auth/calculator-lead`: attach a calculator run to the signed-in
 * account.
 *
 * An address that already has an account cannot register, so the calculator
 * sends it to sign in, and the sign-in page posts the lead token here. What
 * matters is that the account comes from the session, never the body, and
 * that the page can tell an attached run from one that was not.
 */

import express from 'express';
import request from 'supertest';

const attach = jest.fn<Promise<string>, [Record<string, unknown>]>(async () => 'attached');
jest.mock('../../services/calculator-first-decision', () => ({
  ...jest.requireActual('../../services/calculator-first-decision'),
  attachCalculatorLeadToAccount: (params: Record<string, unknown>) => attach(params),
}));

let signedIn = true;
jest.mock('../../auth/middleware', () => ({
  ...jest.requireActual('../../auth/middleware'),
  authenticateUser: (
    req: { user?: unknown },
    res: { status: (code: number) => { json: (body: unknown) => void } },
    next: () => void,
  ) => {
    if (!signedIn) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    req.user = { id: 'user-1', email: 'reader@example.com', tier: 'premium' };
    next();
  },
}));

jest.mock('../../prisma-client', () => ({ getPrismaClient: () => ({}) }));

const TOKEN = 'a'.repeat(48);

function buildApp() {
  const router = require('../../auth/routes').default;
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  return app;
}

describe('POST /auth/calculator-lead', () => {
  beforeEach(() => {
    signedIn = true;
    attach.mockReset();
    attach.mockResolvedValue('attached');
  });

  it('attaches the run to the account the session belongs to', async () => {
    const response = await request(buildApp())
      .post('/auth/calculator-lead')
      // An address in the body is ignored: the session names the account.
      .send({ calculatorRef: TOKEN, email: 'someone-else@example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ attached: true });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(attach).toHaveBeenCalledWith({ userId: 'user-1', email: 'reader@example.com', token: TOKEN });
  });

  it('counts a run the account already holds as attached', async () => {
    attach.mockResolvedValue('already-attached');

    const response = await request(buildApp()).post('/auth/calculator-lead').send({ calculatorRef: TOKEN });

    expect(response.body).toEqual({ attached: true });
  });

  it('says so when the lead does not belong to this account', async () => {
    attach.mockResolvedValue('no-lead');

    const response = await request(buildApp()).post('/auth/calculator-lead').send({ calculatorRef: TOKEN });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ attached: false });
  });

  it('reports a failed write as an error', async () => {
    attach.mockResolvedValue('failed');

    const response = await request(buildApp()).post('/auth/calculator-lead').send({ calculatorRef: TOKEN });

    expect(response.status).toBe(500);
  });

  it('refuses without a session', async () => {
    signedIn = false;

    const response = await request(buildApp()).post('/auth/calculator-lead').send({ calculatorRef: TOKEN });

    expect(response.status).toBe(401);
    expect(attach).not.toHaveBeenCalled();
  });
});
