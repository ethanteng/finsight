import express from 'express';
import request from 'supertest';
import snapTradeRoutes from '../../auth/snaptrade-routes';
import { snapTradeService } from '../../snaptrade';
import { getPrismaClient } from '../../prisma-client';

jest.mock('../../auth/middleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'user@example.com', tier: 'premium' };
    next();
  },
}));

jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn(),
}));

jest.mock('../../snaptrade', () => ({
  snapTradeService: { getUserAccounts: jest.fn() },
}));

const getUserAccounts = snapTradeService.getUserAccounts as jest.Mock;
const snapTradeUserFindUnique = jest.fn();
const accountFindMany = jest.fn();
const snapshotFindFirst = jest.fn();
const credentialFindUnique = jest.fn();

const app = express();
app.use(express.json());
app.use('/snaptrade', snapTradeRoutes);

const directTreasury = {
  id: 'public-3CR13857',
  account_id: 'public-3CR13857',
  name: 'Treasury Account',
  type: 'investment',
  subtype: 'treasury',
  institution: 'Public',
  source: 'public',
  balance: { current: 57046.98, iso_currency_code: 'USD' },
  balanceDerivedFromPositions: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  (getPrismaClient as jest.Mock).mockReturnValue({
    snapTradeUser: { findUnique: snapTradeUserFindUnique },
    account: { findMany: accountFindMany },
    financialSummarySnapshot: { findFirst: snapshotFindFirst },
    publicApiCredential: { findUnique: credentialFindUnique },
  });
  snapTradeUserFindUnique.mockResolvedValue({ userId: 'user-1', userSecret: 'secret' });
  accountFindMany.mockResolvedValue([]);
  snapshotFindFirst.mockResolvedValue({ accounts: [directTreasury] });
  credentialFindUnique.mockResolvedValue({ lastVerifiedAt: new Date(), lastError: null });
});

/**
 * The direct Public feed does not run through SnapTrade, so a SnapTrade outage
 * must not take it off the page. SnapTradeButton clears its whole list on any
 * non-OK response, so returning an error status here hides the one source still
 * working — during exactly the failure the per-row health handling says direct
 * accounts should survive.
 */
describe('GET /snaptrade/accounts during a SnapTrade failure', () => {
  it('serves the direct Public accounts when the SnapTrade lookup fails', async () => {
    getUserAccounts.mockResolvedValue({ success: false, error: 'SnapTrade unreachable' });

    const res = await request(app).get('/snaptrade/accounts');

    expect(res.status).toBe(200);
    expect(res.body.data.accounts.map((a: any) => a.id)).toEqual(['public-3CR13857']);
    expect(res.body.data.accounts[0].balance).toBe(57046.98);
  });

  it('serves them when the SnapTrade user is gone entirely', async () => {
    // Unlinked every brokerage from SnapTrade but kept the direct secret. The
    // Public accounts are still theirs.
    snapTradeUserFindUnique.mockResolvedValue(null);

    const res = await request(app).get('/snaptrade/accounts');

    expect(res.status).toBe(200);
    expect(res.body.data.accounts.map((a: any) => a.id)).toEqual(['public-3CR13857']);
  });

  it('still fails when there is no direct feed to fall back to', async () => {
    // Nothing to show is nothing to show: the SnapTrade error must not be
    // swallowed into an empty success.
    credentialFindUnique.mockResolvedValue(null);
    getUserAccounts.mockResolvedValue({ success: false, error: 'SnapTrade unreachable' });

    const res = await request(app).get('/snaptrade/accounts');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('SnapTrade unreachable');
  });

  it('still 404s a missing SnapTrade user who has no direct feed either', async () => {
    snapTradeUserFindUnique.mockResolvedValue(null);
    credentialFindUnique.mockResolvedValue(null);

    const res = await request(app).get('/snaptrade/accounts');

    expect(res.status).toBe(404);
  });

  it('does not fall back on a rejected credential, whose rows may be stale', async () => {
    credentialFindUnique.mockResolvedValue({
      lastVerifiedAt: new Date('2026-01-01'),
      lastError: 'Public rejected the stored API secret.',
    });
    getUserAccounts.mockResolvedValue({ success: false, error: 'SnapTrade unreachable' });

    const res = await request(app).get('/snaptrade/accounts');

    expect(res.status).toBe(400);
  });
});

describe('GET /snaptrade/accounts on the success path', () => {
  it('substitutes the direct rows for SnapTrade copies of the same accounts', async () => {
    getUserAccounts.mockResolvedValue({
      success: true,
      data: {
        accounts: [
          { id: 'f1', name: 'Fidelity Roth', institution: 'Fidelity', balance: 100 },
          { id: 'p1', name: 'Treasury Account', institution: 'Public', balance: null },
        ],
      },
    });

    const res = await request(app).get('/snaptrade/accounts');

    expect(res.status).toBe(200);
    expect(res.body.data.accounts.map((a: any) => a.id)).toEqual(['snaptrade-f1', 'public-3CR13857']);
  });
});
