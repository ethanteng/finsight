import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const ROUTE_MODULE = '../../routes/retirement-quickplan';

/**
 * Both settings are read once at module load, so a test that wants different
 * ones has to reload the module with the environment already in place.
 */
function buildApp(rateLimit?: string, trustedProxies?: string) {
  const previousLimit = process.env.RETIREMENT_QUICKPLAN_RATE_LIMIT;
  const previousProxies = process.env.RETIREMENT_QUICKPLAN_TRUSTED_PROXIES;
  const apply = (name: string, value?: string) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };

  apply('RETIREMENT_QUICKPLAN_RATE_LIMIT', rateLimit);
  apply('RETIREMENT_QUICKPLAN_TRUSTED_PROXIES', trustedProxies);

  let router: express.Router;
  jest.isolateModules(() => {
    router = require(ROUTE_MODULE).default;
  });

  apply('RETIREMENT_QUICKPLAN_RATE_LIMIT', previousLimit);
  apply('RETIREMENT_QUICKPLAN_TRUSTED_PROXIES', previousProxies);

  const app = express();
  app.use(express.json());
  app.use('/api/retirement-quickplan', router!);
  return app;
}

/** Short horizon: this suite is about the route, not the simulation. */
const SHORT_PLAN = {
  currentAge: 68,
  retirementAge: 70,
  investableAssets: 500_000,
  annualSpending: 60_000,
  annualContributions: 5_000,
  socialSecurityAnnual: 30_000,
  socialSecurityStartAge: 70,
  lifeExpectancy: 85,
  allocation: 'balanced',
};

describe('retirement quick plan route', () => {
  let app: express.Express;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('serves the form options without authentication', async () => {
    const response = await request(app).get('/api/retirement-quickplan/options');

    expect(response.status).toBe(200);
    expect(response.body.allocations.map((a: { id: string }) => a.id))
      .toEqual(['conservative', 'balanced', 'growth']);
    expect(response.body.defaults).toEqual({
      allocation: 'balanced',
      lifeExpectancy: 95,
      socialSecurityStartAge: 67,
    });
  });

  it('returns 400 and names the offending field for a bad plan', async () => {
    const response = await request(app)
      .post('/api/retirement-quickplan')
      .send({ ...SHORT_PLAN, investableAssets: 0 });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe('investableAssets');
    expect(response.body.error).toMatch(/Investment assets/);
  });

  it('runs a plan and returns the result unauthenticated', async () => {
    const response = await request(app).post('/api/retirement-quickplan').send(SHORT_PLAN);

    expect(response.status).toBe(200);
    expect(response.body.primary.survivalRate).toBeGreaterThanOrEqual(0);
    expect(response.body.primary.survivalRate).toBeLessThanOrEqual(1);
    expect(response.body.history.sequencesTested).toBeGreaterThan(0);
    expect(response.body.limitations.length).toBeGreaterThan(0);
    expect(response.headers['x-ratelimit-limit']).toBe('20');
  }, 60_000);

  it('rejects a request past the per-IP window', async () => {
    const limited = buildApp('1');

    // Rejected on validation, but the limiter runs first and still spends the
    // window — so this costs no simulation.
    const first = await request(limited).post('/api/retirement-quickplan').send({});
    const second = await request(limited).post('/api/retirement-quickplan').send({});

    expect(first.status).toBe(400);
    expect(second.status).toBe(429);
    expect(second.body.error).toMatch(/Too many requests/);
    expect(second.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('ignores a caller-supplied X-Forwarded-For prefix', async () => {
    const limited = buildApp('1');

    // One trusted hop: supertest's own connection is that hop, so the entry it
    // appends is the caller. A spoofed prefix must not mint a second window.
    const first = await request(limited)
      .post('/api/retirement-quickplan')
      .set('X-Forwarded-For', '9.9.9.9, 203.0.113.7')
      .send({});
    const second = await request(limited)
      .post('/api/retirement-quickplan')
      .set('X-Forwarded-For', '1.1.1.1, 203.0.113.7')
      .send({});

    expect(first.status).toBe(400);
    expect(second.status).toBe(429);
  });

  it('separates callers the trusted proxy reports as different', async () => {
    const limited = buildApp('1');

    const first = await request(limited)
      .post('/api/retirement-quickplan')
      .set('X-Forwarded-For', '203.0.113.7')
      .send({});
    const second = await request(limited)
      .post('/api/retirement-quickplan')
      .set('X-Forwarded-For', '198.51.100.4')
      .send({});

    expect(first.status).toBe(400);
    expect(second.status).toBe(400);
  });

  it('falls back to the socket address when the header is shorter than the proxy chain', async () => {
    // Two trusted hops declared, one entry supplied: the expected chain did not
    // write this header, so it is not evidence about the caller.
    const strict = buildApp('1', '2');

    const first = await request(strict)
      .post('/api/retirement-quickplan')
      .set('X-Forwarded-For', '9.9.9.9')
      .send({});
    const second = await request(strict)
      .post('/api/retirement-quickplan')
      .set('X-Forwarded-For', '1.1.1.1')
      .send({});

    expect(first.status).toBe(400);
    // Both collapse onto the same socket address rather than each getting a window.
    expect(second.status).toBe(429);
  });

  it('keeps the default limit when the environment value is malformed', async () => {
    // NaN would make every "over the limit" comparison false and quietly leave
    // the endpoint unmetered.
    const misconfigured = buildApp('not-a-number');

    const response = await request(misconfigured)
      .post('/api/retirement-quickplan')
      .send({ ...SHORT_PLAN, investableAssets: 0 });

    expect(response.headers['x-ratelimit-limit']).toBe('20');
  });

  it('does not rate limit the options endpoint', async () => {
    const limited = buildApp('1');

    await request(limited).post('/api/retirement-quickplan').send({});
    const options = await request(limited).get('/api/retirement-quickplan/options');

    expect(options.status).toBe(200);
  });
});
