import { describe, expect, it, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const ROUTE_MODULE = '../../routes/cash-flow-forecast';
const GROUP = '200613048015128101';

/**
 * The route is loaded inside `jest.isolateModules` so each case gets its own
 * rate-limit window; everything it calls delegates to these holders.
 */
const list = {
  subscribe: jest.fn<Promise<'subscribed' | 'skipped' | 'failed'>, [{ email: string; groups: string[] }]>(
    async () => 'subscribed',
  ),
};
const accounts = { exists: jest.fn<Promise<boolean>, [string]>(async () => false) };

jest.mock('../../services/mailerlite-subscribe', () => ({
  ...jest.requireActual('../../services/mailerlite-subscribe'),
  subscribeToMailerLite: (...args: unknown[]) => list.subscribe(...(args as [never])),
}));
jest.mock('../../services/calculator-account-lookup', () => ({
  accountExistsForEmail: (...args: unknown[]) => accounts.exists(...(args as [string])),
}));

function buildApp(env: Record<string, string | undefined> = {}) {
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  let router: express.Router;
  jest.isolateModules(() => {
    router = require(ROUTE_MODULE).default;
  });
  const app = express();
  app.use(express.json());
  app.use('/api/cash-flow-forecast', router!);
  return app;
}

describe('POST /api/cash-flow-forecast/sample-request', () => {
  beforeEach(() => {
    list.subscribe.mockClear().mockResolvedValue('subscribed');
    accounts.exists.mockClear().mockResolvedValue(false);
    process.env.MAILER_LITE_CASH_FLOW_GROUP_ID = GROUP;
  });

  it('puts a new address in the cash-flow group, which starts the sample sequence', async () => {
    const response = await request(buildApp())
      .post('/api/cash-flow-forecast/sample-request')
      .send({ email: '  Visitor@Example.com ' });

    expect(response.status).toBe(200);
    expect(list.subscribe).toHaveBeenCalledWith({ email: 'visitor@example.com', groups: [GROUP] });
  });

  /*
   * The sequence exists to get someone to start a trial. An account holder
   * gets sent to sign in instead, and stays off it.
   */
  it('keeps an existing account off the no-trial sequence', async () => {
    accounts.exists.mockResolvedValue(true);

    const response = await request(buildApp())
      .post('/api/cash-flow-forecast/sample-request')
      .send({ email: 'member@example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ existingAccount: true });
    expect(list.subscribe).not.toHaveBeenCalled();
  });

  it('rejects an address that is not one', async () => {
    const response = await request(buildApp())
      .post('/api/cash-flow-forecast/sample-request')
      .send({ email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe('email');
    expect(list.subscribe).not.toHaveBeenCalled();
  });

  /*
   * The list is the only record of the request, so a subscribe that did not
   * happen has to reach the visitor as something to retry.
   */
  it('reports a failed or skipped subscribe so the visitor retries', async () => {
    list.subscribe.mockResolvedValue('failed');
    const failed = await request(buildApp())
      .post('/api/cash-flow-forecast/sample-request')
      .send({ email: 'visitor@example.com' });
    expect(failed.status).toBe(503);

    list.subscribe.mockResolvedValue('skipped');
    const skipped = await request(buildApp())
      .post('/api/cash-flow-forecast/sample-request')
      .send({ email: 'visitor@example.com' });
    expect(skipped.status).toBe(503);
  });

  it('refuses rather than silently dropping the request when no group is configured', async () => {
    const response = await request(buildApp({ MAILER_LITE_CASH_FLOW_GROUP_ID: undefined }))
      .post('/api/cash-flow-forecast/sample-request')
      .send({ email: 'visitor@example.com' });

    expect(response.status).toBe(503);
    expect(list.subscribe).not.toHaveBeenCalled();
  });

  it('limits how many requests one client can make', async () => {
    const app = buildApp({ CASH_FLOW_SAMPLE_RATE_LIMIT: '2' });
    for (let i = 0; i < 2; i += 1) {
      await request(app).post('/api/cash-flow-forecast/sample-request').send({ email: `v${i}@example.com` });
    }
    const limited = await request(app)
      .post('/api/cash-flow-forecast/sample-request')
      .send({ email: 'v3@example.com' });

    expect(limited.status).toBe(429);
    delete process.env.CASH_FLOW_SAMPLE_RATE_LIMIT;
  });
});
