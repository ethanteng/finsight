import { describe, expect, it, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const ROUTE_MODULE = '../../routes/coast-fire';

/**
 * The route is loaded inside `jest.isolateModules` so each case gets its own
 * rate-limit window, which means a spy taken in this file would be on a
 * different copy of each dependency than the route sees. Everything delegates
 * to these holders instead.
 */
const email = { send: jest.fn(async () => true) };
const list = {
  subscribe: jest.fn<Promise<'subscribed' | 'skipped' | 'failed'>, unknown[]>(
    async () => 'subscribed',
  ),
};
const leads = {
  record: jest.fn(async () => true),
  read: jest.fn(async () => null as unknown),
  mark: jest.fn(async () => undefined),
};

jest.mock('../../auth/resend-email', () => ({
  sendCoastFireResultsEmail: (...args: unknown[]) => email.send(...(args as [])),
}));
jest.mock('../../services/mailerlite-subscribe', () => ({
  ...jest.requireActual('../../services/mailerlite-subscribe'),
  subscribeToMailerLite: (...args: unknown[]) => list.subscribe(...(args as [])),
}));
jest.mock('../../services/coast-fire-leads', () => ({
  ...jest.requireActual('../../services/coast-fire-leads'),
  recordCoastFireLead: (...args: unknown[]) => leads.record(...(args as [])),
  readCoastFireLead: (...args: unknown[]) => leads.read(...(args as [])),
  markCoastFireLeadDelivery: (...args: unknown[]) => leads.mark(...(args as [])),
}));

/** Both limits are read once at module load, so the env has to be set first. */
function buildApp(overrides: Record<string, string | undefined> = {}) {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(overrides)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  let router: express.Router;
  jest.isolateModules(() => {
    router = require(ROUTE_MODULE).default;
  });

  for (const [name, value] of previous) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  const app = express();
  app.use(express.json());
  app.use('/api/coast-fire', router!);
  return app;
}

const SCENARIO = {
  currentAge: 40,
  retirementAge: 65,
  currentSavings: 400_000,
  annualRetirementSpending: 80_000,
  annualRetirementIncome: 30_000,
  realReturnRate: 5,
  withdrawalRate: 4,
};

/** The send is fired, then MailerLite is called after the response. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('POST /api/coast-fire/email-results', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    email.send.mockResolvedValue(true);
    list.subscribe.mockResolvedValue('subscribed');
    leads.record.mockResolvedValue(true);
  });

  it('emails figures it computed rather than figures it was handed', async () => {
    const response = await request(buildApp())
      .post('/api/coast-fire/email-results')
      // A caller-supplied result must not be able to reach an inbox under our
      // branding. Only the seven inputs are read.
      .send({ ...SCENARIO, email: 'Reader@Example.com', coastFireNumber: 1 });

    expect(response.status).toBe(200);
    const [address, result] = email.send.mock.calls[0] as unknown as [string, { coastFireNumber: number }];
    expect(address).toBe('reader@example.com');
    expect(result.coastFireNumber).toBeCloseTo(369_128, 0);
  });

  it('links the email at an opaque token and never at the figures', async () => {
    await request(buildApp()).post('/api/coast-fire/email-results').send({ ...SCENARIO, email: 'reader@example.com' });

    const ctaUrl = (email.send.mock.calls[0] as unknown as [string, unknown, string])[2];
    expect(ctaUrl).toMatch(/\/getstarted\?source=coast-fire-calculator&ref=[a-f0-9]{48}$/);
    expect(ctaUrl).not.toMatch(/400000|369|80000/);
  });

  /* Personalization is worth a database row; the results are not. */
  it('still sends when the lead could not be stored, minus the personalization', async () => {
    leads.record.mockResolvedValue(false);

    const response = await request(buildApp())
      .post('/api/coast-fire/email-results')
      .send({ ...SCENARIO, email: 'reader@example.com' });

    expect(response.status).toBe(200);
    const ctaUrl = (email.send.mock.calls[0] as unknown as [string, unknown, string])[2];
    expect(ctaUrl).toBe('http://localhost:3001/getstarted?source=coast-fire-calculator');
  });

  it('adds the address to the Coast FIRE group after answering', async () => {
    // Read when the subscribe runs, not at module load, so a group added in
    // MailerLite takes effect on a restart-free config change.
    const previous = process.env.MAILER_LITE_COAST_FIRE_GROUP_ID;
    process.env.MAILER_LITE_COAST_FIRE_GROUP_ID = '12345678';

    const app = buildApp();
    await request(app).post('/api/coast-fire/email-results').send({ ...SCENARIO, email: 'reader@example.com' });
    await settle();

    if (previous === undefined) delete process.env.MAILER_LITE_COAST_FIRE_GROUP_ID;
    else process.env.MAILER_LITE_COAST_FIRE_GROUP_ID = previous;

    expect(list.subscribe).toHaveBeenCalledWith(expect.objectContaining({
      email: 'reader@example.com',
      groups: ['12345678'],
      fields: expect.objectContaining({ coast_fire_status: 'reached' }),
    }));
  });

  /* The list is a nice-to-have; the results the visitor asked for are not. */
  it('reports success even when the list rejects the address', async () => {
    list.subscribe.mockResolvedValue('failed');

    const response = await request(buildApp())
      .post('/api/coast-fire/email-results')
      .send({ ...SCENARIO, email: 'reader@example.com' });
    await settle();

    expect(response.status).toBe(200);
    expect(leads.mark).toHaveBeenCalledWith(expect.any(String), {
      emailSent: true,
      mailerliteSynced: false,
    });
  });

  it('says so when the send itself failed, rather than claiming it sent', async () => {
    email.send.mockResolvedValue(false);

    const response = await request(buildApp())
      .post('/api/coast-fire/email-results')
      .send({ ...SCENARIO, email: 'reader@example.com' });

    expect(response.status).toBe(502);
    expect(list.subscribe).not.toHaveBeenCalled();
  });

  it.each([
    ['not-an-email', 'email'],
    ['', 'email'],
  ])('refuses %p without sending anything', async (address, field) => {
    const response = await request(buildApp())
      .post('/api/coast-fire/email-results')
      .send({ ...SCENARIO, email: address });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe(field);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('names the figure it refused so the form can point at the box', async () => {
    const response = await request(buildApp())
      .post('/api/coast-fire/email-results')
      .send({ ...SCENARIO, email: 'reader@example.com', retirementAge: 30 });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe('retirementAge');
    expect(email.send).not.toHaveBeenCalled();
  });

  /*
   * Every accepted request puts mail in an address the caller chose, so the
   * window here is far tighter than the quick plan's.
   */
  it('rejects a caller past the per-window limit', async () => {
    const limited = buildApp({ COAST_FIRE_EMAIL_RATE_LIMIT: '1' });

    const first = await request(limited).post('/api/coast-fire/email-results').send({ ...SCENARIO, email: 'reader@example.com' });
    const second = await request(limited).post('/api/coast-fire/email-results').send({ ...SCENARIO, email: 'reader@example.com' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it('keeps a low default limit when the environment value is malformed', async () => {
    const response = await request(buildApp({ COAST_FIRE_EMAIL_RATE_LIMIT: 'not-a-number' }))
      .post('/api/coast-fire/email-results')
      .send({ ...SCENARIO, email: 'reader@example.com' });

    expect(response.headers['x-ratelimit-limit']).toBe('5');
  });
});

describe('GET /api/coast-fire/signup-context/:token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    leads.read.mockResolvedValue(null);
  });

  it('returns the scenario behind a live token', async () => {
    leads.read.mockResolvedValue({
      token: 'a'.repeat(48),
      email: 'reader@example.com',
      inputs: SCENARIO,
    });

    const response = await request(buildApp()).get(`/api/coast-fire/signup-context/${'a'.repeat(48)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ email: 'reader@example.com', inputs: SCENARIO });
    // Personal to one link, so no intermediary may hold a copy.
    expect(response.headers['cache-control']).toBe('no-store');
  });

  /* Unknown and expired are the same answer, so neither can be probed for. */
  it('answers an expired or unknown token with a bare 404', async () => {
    const response = await request(buildApp()).get(`/api/coast-fire/signup-context/${'b'.repeat(48)}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
  });

  it('refuses a malformed token before it reaches the database', async () => {
    const response = await request(buildApp()).get('/api/coast-fire/signup-context/short');

    expect(response.status).toBe(404);
    expect(leads.read).not.toHaveBeenCalled();
  });

  /* Opening the link is a read the recipient performs; the send preceding it
   * must not have spent their window. */
  it('counts against its own window, not the send limit', async () => {
    const limited = buildApp({ COAST_FIRE_EMAIL_RATE_LIMIT: '1' });

    await request(limited).post('/api/coast-fire/email-results').send({ ...SCENARIO, email: 'reader@example.com' });
    const context = await request(limited).get(`/api/coast-fire/signup-context/${'c'.repeat(48)}`);

    expect(context.status).toBe(404);
  });
});
