import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const ROUTE_MODULE = '../../routes/retirement-quickplan';

/**
 * `buildApp` loads the route inside `jest.isolateModules`, so a spy taken in
 * this file would be on a different copy of the log module than the route
 * sees, and a factory returning fresh `jest.fn()`s would hand each registry
 * its own. Both delegate to this one holder instead. The reader is kept real
 * because these cases assert on what it read back; whether the writers
 * swallow their own failures is covered where they are defined.
 */
const log = { run: jest.fn(async () => undefined), reject: jest.fn(async () => undefined) };
jest.mock('../../services/retirement-quickplan-log', () => ({
  ...jest.requireActual('../../services/retirement-quickplan-log'),
  recordQuickPlanRun: (...args: unknown[]) => log.run(...(args as [])),
  recordQuickPlanRejection: (...args: unknown[]) => log.reject(...(args as [])),
}));

/** The results-email dependencies, held the same way and for the same reason. */
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
  sendRetirementResultsEmail: (...args: unknown[]) => email.send(...(args as [])),
}));
jest.mock('../../services/mailerlite-subscribe', () => ({
  ...jest.requireActual('../../services/mailerlite-subscribe'),
  subscribeToMailerLite: (...args: unknown[]) => list.subscribe(...(args as [])),
}));
jest.mock('../../services/retirement-leads', () => ({
  ...jest.requireActual('../../services/retirement-leads'),
  recordRetirementLead: (...args: unknown[]) => leads.record(...(args as [])),
  readRetirementLead: (...args: unknown[]) => leads.read(...(args as [])),
  markRetirementLeadDelivery: (...args: unknown[]) => leads.mark(...(args as [])),
}));

/**
 * Both settings are read once at module load, so a test that wants different
 * ones has to reload the module with the environment already in place.
 */
function buildApp(
  rateLimit?: string,
  trustedProxies?: string,
  overrides: Record<string, string | undefined> = {},
) {
  const settings: Record<string, string | undefined> = {
    RETIREMENT_QUICKPLAN_RATE_LIMIT: rateLimit,
    RETIREMENT_QUICKPLAN_TRUSTED_PROXIES: trustedProxies,
    ...overrides,
  };
  const previous = new Map(
    Object.keys(settings).map((name) => [name, process.env[name]] as const),
  );
  const apply = (name: string, value?: string) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };

  for (const [name, value] of Object.entries(settings)) apply(name, value);

  let router: express.Router;
  jest.isolateModules(() => {
    router = require(ROUTE_MODULE).default;
  });

  for (const [name, value] of previous) apply(name, value);

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

/**
 * A request the limiter counts but the simulator never runs. An empty body no
 * longer serves: blanks are assumed now, so `{}` is a valid plan and each of
 * these tests would pay for a full run. An out-of-range figure is still a
 * rejection, and it is rejected before any simulation.
 */
const REJECTED_PLAN = { ...SHORT_PLAN, investableAssets: 0 };

describe('retirement quick plan route', () => {
  let app: express.Express;

  beforeEach(() => {
    app = buildApp();
  });

  beforeEach(() => {
    log.run.mockClear();
    log.reject.mockClear();
    email.send.mockClear();
    email.send.mockResolvedValue(true);
    list.subscribe.mockClear();
    list.subscribe.mockResolvedValue('subscribed');
    leads.record.mockClear();
    leads.record.mockResolvedValue(true);
    leads.read.mockClear();
    leads.read.mockResolvedValue(null);
    leads.mark.mockClear();
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
      .send(REJECTED_PLAN);

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
    const first = await request(limited).post('/api/retirement-quickplan').send(REJECTED_PLAN);
    const second = await request(limited).post('/api/retirement-quickplan').send(REJECTED_PLAN);

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
      .send(REJECTED_PLAN);
    const second = await request(limited)
      .post('/api/retirement-quickplan')
      .set('X-Forwarded-For', '1.1.1.1, 203.0.113.7')
      .send(REJECTED_PLAN);

    expect(first.status).toBe(400);
    expect(second.status).toBe(429);
  });

  it('separates callers the trusted proxy reports as different', async () => {
    const limited = buildApp('1');

    const first = await request(limited)
      .post('/api/retirement-quickplan')
      .set('X-Forwarded-For', '203.0.113.7')
      .send(REJECTED_PLAN);
    const second = await request(limited)
      .post('/api/retirement-quickplan')
      .set('X-Forwarded-For', '198.51.100.4')
      .send(REJECTED_PLAN);

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
      .send(REJECTED_PLAN);
    const second = await request(strict)
      .post('/api/retirement-quickplan')
      .set('X-Forwarded-For', '1.1.1.1')
      .send(REJECTED_PLAN);

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
      .send(REJECTED_PLAN);

    expect(response.headers['x-ratelimit-limit']).toBe('20');
  });

  it('records an answer and a refusal alike, without the answer waiting on it', async () => {
    const answered = await request(buildApp()).post('/api/retirement-quickplan').send(SHORT_PLAN);
    const refused = await request(buildApp()).post('/api/retirement-quickplan').send(REJECTED_PLAN);

    expect(answered.status).toBe(200);
    expect(answered.body.primary.survivalRate).toBeGreaterThanOrEqual(0);
    expect(refused.status).toBe(400);
    // The runs the calculator refused are the point as much as the ones it served.
    expect(log.run).toHaveBeenCalledTimes(1);
    expect(log.reject).toHaveBeenCalledTimes(1);
  }, 60_000);

  it('records what the visitor typed, including the figure it refused', async () => {
    await request(buildApp()).post('/api/retirement-quickplan').send(REJECTED_PLAN);

    const [submitted, error] = log.reject.mock.calls[0] as unknown as [
      Record<string, unknown>, { field: string },
    ];
    // Read before the normalizer ran, so the rejected value survives.
    expect(submitted.investableAssets).toBe(0);
    expect(submitted.annualSpending).toBe(SHORT_PLAN.annualSpending);
    expect(error.field).toBe('investableAssets');
  });

  it('does not rate limit the options endpoint', async () => {
    const limited = buildApp('1');

    await request(limited).post('/api/retirement-quickplan').send(REJECTED_PLAN);
    const options = await request(limited).get('/api/retirement-quickplan/options');

    expect(options.status).toBe(200);
  });
  describe('emailing a plan', () => {
    /** The send is fired, then MailerLite is called after the response. */
    const settle = () => new Promise((resolve) => setImmediate(resolve));

    it('emails figures it computed rather than figures it was handed', async () => {
      const response = await request(buildApp())
        .post('/api/retirement-quickplan/email-results')
        // A caller-supplied verdict must not be able to reach an inbox under
        // our branding. Only the plan's own inputs are read.
        .send({ ...SHORT_PLAN, email: 'Reader@Example.com', survivalRate: 1 });

      expect(response.status).toBe(200);
      const [address, result, primary] = email.send.mock.calls[0] as unknown as [
        string, { inputs: { retirementAge: number } }, { survivalRate: number },
      ];
      expect(address).toBe('reader@example.com');
      expect(result.inputs.retirementAge).toBe(SHORT_PLAN.retirementAge);
      expect(primary.survivalRate).toBeGreaterThanOrEqual(0);
      expect(primary.survivalRate).toBeLessThanOrEqual(1);
    }, 60_000);

    it('links the email at the token-stripping redirect, never at the figures', async () => {
      await request(buildApp())
        .post('/api/retirement-quickplan/email-results')
        .send({ ...SHORT_PLAN, email: 'reader@example.com' });

      const ctaUrl = (email.send.mock.calls[0] as unknown as [string, unknown, unknown, string])[3];
      expect(ctaUrl).toMatch(/\/retirement\/continue\?ref=[a-f0-9]{48}$/);
      expect(ctaUrl).not.toMatch(/500000|60000|30000/);
    }, 60_000);

    /* Personalization is worth a database row; the results are not. */
    it('still sends when the lead could not be stored, minus the personalization', async () => {
      leads.record.mockResolvedValue(false);

      const response = await request(buildApp())
        .post('/api/retirement-quickplan/email-results')
        .send({ ...SHORT_PLAN, email: 'reader@example.com' });

      expect(response.status).toBe(200);
      const ctaUrl = (email.send.mock.calls[0] as unknown as [string, unknown, unknown, string])[3];
      expect(ctaUrl).toBe('http://localhost:3001/getstarted?source=retirement-calculator');
    }, 60_000);

    it('adds the address to the retirement group after answering', async () => {
      // Read when the subscribe runs, not at module load, so a group added in
      // MailerLite takes effect on a restart-free config change.
      const previous = process.env.MAILER_LITE_RETIREMENT_GROUP_ID;
      process.env.MAILER_LITE_RETIREMENT_GROUP_ID = '87654321';

      await request(buildApp())
        .post('/api/retirement-quickplan/email-results')
        .send({ ...SHORT_PLAN, email: 'reader@example.com' });
      await settle();

      if (previous === undefined) delete process.env.MAILER_LITE_RETIREMENT_GROUP_ID;
      else process.env.MAILER_LITE_RETIREMENT_GROUP_ID = previous;

      expect(list.subscribe).toHaveBeenCalledWith(expect.objectContaining({
        email: 'reader@example.com',
        groups: ['87654321'],
        fields: expect.objectContaining({ retirement_age: SHORT_PLAN.retirementAge }),
      }));
    }, 60_000);

    /* The list is a nice-to-have; the results the visitor asked for are not. */
    it('reports success even when the list rejects the address', async () => {
      list.subscribe.mockResolvedValue('failed');

      const response = await request(buildApp())
        .post('/api/retirement-quickplan/email-results')
        .send({ ...SHORT_PLAN, email: 'reader@example.com' });
      await settle();

      expect(response.status).toBe(200);
      expect(leads.mark).toHaveBeenCalledWith(expect.any(String), {
        emailSent: true,
        mailerliteSynced: false,
      });
    }, 60_000);

    it('says so when the send itself failed, rather than claiming it sent', async () => {
      email.send.mockResolvedValue(false);

      const response = await request(buildApp())
        .post('/api/retirement-quickplan/email-results')
        .send({ ...SHORT_PLAN, email: 'reader@example.com' });

      expect(response.status).toBe(502);
      expect(list.subscribe).not.toHaveBeenCalled();
    }, 60_000);

    it.each(['not-an-email', ''])('refuses %p without running the model', async (address) => {
      const response = await request(buildApp())
        .post('/api/retirement-quickplan/email-results')
        .send({ ...SHORT_PLAN, email: address });

      expect(response.status).toBe(400);
      expect(response.body.field).toBe('email');
      expect(email.send).not.toHaveBeenCalled();
    });

    it('names the figure it refused so the form can point at the box', async () => {
      const response = await request(buildApp())
        .post('/api/retirement-quickplan/email-results')
        .send({ ...REJECTED_PLAN, email: 'reader@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.field).toBe('investableAssets');
      expect(email.send).not.toHaveBeenCalled();
    });

    /*
     * A rates run has no survival figure — the model will not invent a
     * portfolio or a spending level — so there is nothing to put in an inbox.
     */
    it('refuses a run with no verdict, and says which box would give it one', async () => {
      const response = await request(buildApp())
        .post('/api/retirement-quickplan/email-results')
        .send({ ...SHORT_PLAN, investableAssets: '', email: 'reader@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.field).toBe('investableAssets');
      expect(response.body.error).toMatch(/investments and annual spending/i);
      expect(email.send).not.toHaveBeenCalled();
    }, 60_000);

    /*
     * Every accepted request puts mail in an address the caller chose, so the
     * window here is far tighter than the model's own.
     */
    it('rejects a caller past its own, tighter window', async () => {
      const limited = buildApp(undefined, undefined, { RETIREMENT_EMAIL_RATE_LIMIT: '1' });

      const first = await request(limited)
        .post('/api/retirement-quickplan/email-results')
        .send({ ...SHORT_PLAN, email: 'reader@example.com' });
      const second = await request(limited)
        .post('/api/retirement-quickplan/email-results')
        .send({ ...SHORT_PLAN, email: 'reader@example.com' });

      expect(first.status).toBe(200);
      expect(second.status).toBe(429);
      expect(email.send).toHaveBeenCalledTimes(1);
    }, 60_000);

    it('keeps a low default limit when the environment value is malformed', async () => {
      const response = await request(
        buildApp(undefined, undefined, { RETIREMENT_EMAIL_RATE_LIMIT: 'not-a-number' }),
      )
        .post('/api/retirement-quickplan/email-results')
        .send({ ...REJECTED_PLAN, email: 'reader@example.com' });

      expect(response.headers['x-ratelimit-limit']).toBe('5');
    });
  });

  describe('the emailed link\'s plan', () => {
    const TOKEN = 'a'.repeat(48);

    /*
     * The stored verdict comes back with the inputs. The token lives for 90
     * days, and re-running would let a change to the engine or its dataset put
     * a different number on the page than the one in the recipient's inbox.
     */
    it('returns the plan and the verdict the email stated', async () => {
      const outcome = {
        survivalRate: 0.94,
        sequencesTested: 800,
        sequencesSurvived: 752,
        projectedPortfolioAtRetirement: 1_840_000,
        firstYearWithdrawalRate: 0.0272,
      };
      leads.read.mockResolvedValue({
        token: TOKEN,
        email: 'reader@example.com',
        inputs: SHORT_PLAN,
        outcome,
      });

      const response = await request(buildApp())
        .get(`/api/retirement-quickplan/signup-context/${TOKEN}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        email: 'reader@example.com',
        inputs: SHORT_PLAN,
        outcome,
      });
      // Personal to one link, so no intermediary may hold a copy.
      expect(response.headers['cache-control']).toBe('no-store');
    });

    /* Unknown and expired are the same answer, so neither can be probed for. */
    it('answers an expired or unknown token with a bare 404', async () => {
      const response = await request(buildApp())
        .get(`/api/retirement-quickplan/signup-context/${'b'.repeat(48)}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Not found' });
    });

    it('refuses a malformed token before it reaches the database', async () => {
      const response = await request(buildApp())
        .get('/api/retirement-quickplan/signup-context/short');

      expect(response.status).toBe(404);
      expect(leads.read).not.toHaveBeenCalled();
    });

    /*
     * Opening the link is a read the recipient performs; the send preceding it
     * must not have spent their window.
     */
    it('counts against its own window, not the send limit', async () => {
      const limited = buildApp(undefined, undefined, { RETIREMENT_EMAIL_RATE_LIMIT: '1' });

      await request(limited)
        .post('/api/retirement-quickplan/email-results')
        .send({ ...REJECTED_PLAN, email: 'reader@example.com' });
      const context = await request(limited)
        .get(`/api/retirement-quickplan/signup-context/${'c'.repeat(48)}`);

      expect(context.status).toBe(404);
    });
  });
});
