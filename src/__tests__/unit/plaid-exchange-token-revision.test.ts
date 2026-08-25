import express from 'express';
import request from 'supertest';

const itemPublicTokenExchange = jest.fn();

jest.mock('plaid', () => {
  const actual = jest.requireActual('plaid');
  return {
    ...actual,
    PlaidApi: jest.fn().mockImplementation(() => ({ itemPublicTokenExchange })),
  };
});

const accessTokenFindFirst = jest.fn();
const accessTokenCreate = jest.fn();
const accessTokenUpdate = jest.fn();
const prisma = {
  accessToken: {
    findFirst: accessTokenFindFirst,
    create: accessTokenCreate,
    update: accessTokenUpdate,
  },
};

jest.mock('../../prisma-client', () => ({ getPrismaClient: () => prisma }));

// `src/plaid.ts` builds its own PrismaClient from `@prisma/client` rather than
// going through the shared factory, so the constructor is what has to be replaced.
jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  return { ...actual, PrismaClient: jest.fn().mockImplementation(() => prisma) };
});

const schedule = jest.fn();
jest.mock('../../services/financial-revision-service', () => ({
  FinancialRevisionService: { schedule },
}));

// The shared unit setup replaces `../../plaid` wholesale with a stub client.
const { setupPlaidRoutes } = jest.requireActual('../../plaid') as {
  setupPlaidRoutes: (app: express.Application) => void;
};

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 'user-1', email: 'user@example.com', tier: 'premium' };
  next();
});
setupPlaidRoutes(app);

describe('POST /plaid/exchange_public_token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks resets recorded calls but keeps implementations, so the throwing
    // schedule below would otherwise leak into every test declared after it.
    schedule.mockReset();
    itemPublicTokenExchange.mockResolvedValue({
      data: { access_token: 'access-sandbox-1', item_id: 'item-1' },
    });
    accessTokenFindFirst.mockResolvedValue(null);
    accessTokenCreate.mockResolvedValue({ id: 'token-1', institutionName: null });
    accessTokenUpdate.mockResolvedValue({ id: 'token-1', institutionName: null });
  });

  // The reported gap: linking added accounts that no existing snapshot had seen, but
  // only the relink-reconciliation branch scheduled a revision. An ordinary new
  // connection scheduled nothing, so `recomputeIfStale` kept serving the user's
  // existing `current` snapshot until it expired and the new accounts stayed invisible.
  it('schedules a revision even when nothing was reconciled', async () => {
    const response = await request(app)
      .post('/plaid/exchange_public_token')
      .send({ public_token: 'public-sandbox-1' })
      .expect(200);

    expect(response.body).toEqual({ access_token: 'access-sandbox-1' });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(
      'user-1',
      { categorize: false, history: { kind: 'material', reason: 'account-sync' } },
      'exchange_public_token'
    );
  });

  // The token is already stored by the time the revision is scheduled, so a failure
  // here must not fail the response: the frontend would report a link failure for an
  // Item that is live, and cron still picks the connection up regardless.
  it('still succeeds when scheduling the revision throws', async () => {
    schedule.mockImplementation(() => {
      throw new Error('queue unavailable');
    });

    const response = await request(app)
      .post('/plaid/exchange_public_token')
      .send({ public_token: 'public-sandbox-1' })
      .expect(200);

    expect(response.body).toEqual({ access_token: 'access-sandbox-1' });
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  // Ingestion is the only path that stores what it reads. Link-time calls to the
  // product endpoints discarded every response, so re-adding one would spend a Plaid
  // request per account and persist nothing.
  it('does not call product endpoints at link time', async () => {
    const { plaidClient } = jest.requireActual('../../plaid') as { plaidClient: any };
    const probes = [
      'investmentsHoldingsGet',
      'investmentsTransactionsGet',
      'liabilitiesGet',
      'transactionsSync',
    ];
    const spies = probes.map(name => {
      const spy = jest.fn();
      plaidClient[name] = spy;
      return [name, spy] as const;
    });

    await request(app)
      .post('/plaid/exchange_public_token')
      .send({ public_token: 'public-sandbox-1' })
      .expect(200);

    for (const [name, spy] of spies) {
      expect([name, spy.mock.calls.length]).toEqual([name, 0]);
    }
  });
});
