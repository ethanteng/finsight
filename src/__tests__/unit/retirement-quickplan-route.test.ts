import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const ROUTE_MODULE = '../../routes/retirement-quickplan';

/**
 * The limit is read once at module load, so a test that wants a different one
 * has to reload the module with the environment already set.
 */
function buildApp(rateLimit?: string) {
  const previous = process.env.RETIREMENT_QUICKPLAN_RATE_LIMIT;
  if (rateLimit === undefined) {
    delete process.env.RETIREMENT_QUICKPLAN_RATE_LIMIT;
  } else {
    process.env.RETIREMENT_QUICKPLAN_RATE_LIMIT = rateLimit;
  }

  let router: express.Router;
  jest.isolateModules(() => {
    router = require(ROUTE_MODULE).default;
  });

  process.env.RETIREMENT_QUICKPLAN_RATE_LIMIT = previous;

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

  it('does not rate limit the options endpoint', async () => {
    const limited = buildApp('1');

    await request(limited).post('/api/retirement-quickplan').send({});
    const options = await request(limited).get('/api/retirement-quickplan/options');

    expect(options.status).toBe(200);
  });
});
