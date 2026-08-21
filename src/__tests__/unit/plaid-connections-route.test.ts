import express from 'express';
import request from 'supertest';

jest.mock('plaid', () => {
  const actual = jest.requireActual('plaid');
  return { ...actual, PlaidApi: jest.fn().mockImplementation(() => ({})) };
});

const accessTokenFindMany = jest.fn();
const prisma = { accessToken: { findMany: accessTokenFindMany } };

jest.mock('../../prisma-client', () => ({ getPrismaClient: () => prisma }));

// `src/plaid.ts` builds its own PrismaClient from `@prisma/client` rather than
// going through the shared factory, so the constructor is what has to be
// replaced.
jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  return { ...actual, PrismaClient: jest.fn().mockImplementation(() => prisma) };
});

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

const LINKED_IN_2025 = new Date('2025-08-19T23:57:47.935Z');
const FETCHED_TODAY = new Date('2026-08-21T03:05:14.487Z');

describe('GET /plaid/connections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    accessTokenFindMany.mockResolvedValue([
      {
        id: 'token-boa',
        itemId: 'item-boa',
        institutionName: 'Bank of America',
        isActive: true,
        lastError: null,
        lastRefreshed: LINKED_IN_2025,
        accounts: [
          { id: 'acct-1', name: 'Checking', mask: '4321', balanceLastFetched: FETCHED_TODAY, lastSynced: LINKED_IN_2025 },
        ],
      },
    ]);
  });

  // The reported defect: `AccessToken.lastRefreshed` is written only by
  // `exchange_public_token`, so it records when the Item was linked. A user whose
  // balances were hours old was told they had not been refreshed since 2025.
  it('reports when the data was observed, not when the item was linked', async () => {
    const response = await request(app).get('/plaid/connections').expect(200);

    const [connection] = response.body.data.connections;
    expect(new Date(connection.lastUpdated)).toEqual(FETCHED_TODAY);
    expect(connection.lastRefreshed).toBeUndefined();
  });

  it('takes the newest account when a connection has several', async () => {
    const newest = new Date('2026-08-21T04:00:00.000Z');
    accessTokenFindMany.mockResolvedValue([
      {
        id: 'token-cit',
        itemId: 'item-cit',
        institutionName: 'CIT Bank',
        isActive: true,
        lastError: null,
        accounts: [
          { id: 'acct-1', name: 'Joint Savings', mask: '1111', balanceLastFetched: FETCHED_TODAY, lastSynced: null },
          { id: 'acct-2', name: 'echecking', mask: '2222', balanceLastFetched: newest, lastSynced: null },
        ],
      },
    ]);

    const response = await request(app).get('/plaid/connections').expect(200);

    expect(new Date(response.body.data.connections[0].lastUpdated)).toEqual(newest);
  });

  // Distinguishable from a stale timestamp: the UI says "never updated" rather
  // than inventing a date.
  it('reports null for a connection whose accounts have never been observed', async () => {
    accessTokenFindMany.mockResolvedValue([
      {
        id: 'token-new',
        itemId: 'item-new',
        institutionName: 'Freshly Linked Bank',
        isActive: true,
        lastError: null,
        accounts: [{ id: 'acct-1', name: 'Checking', mask: '9999', balanceLastFetched: null, lastSynced: null }],
      },
    ]);

    const response = await request(app).get('/plaid/connections').expect(200);

    expect(response.body.data.connections[0].lastUpdated).toBeNull();
  });

  it('excludes connections a re-link already replaced', async () => {
    await request(app).get('/plaid/connections').expect(200);

    expect(accessTokenFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', supersededAt: null } })
    );
  });
});
