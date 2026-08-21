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
  snapTradeService: {
    getUserAccounts: jest.fn(),
    refreshConnection: jest.fn(),
  },
}));

const getUserAccounts = snapTradeService.getUserAccounts as jest.Mock;
const refreshConnection = snapTradeService.refreshConnection as jest.Mock;
const findUnique = jest.fn();

const app = express();
app.use(express.json());
app.use('/snaptrade', snapTradeRoutes);

// The route's cooldown is module state that outlives a single test, so each test
// refreshes its own authorization rather than sharing one and inheriting the
// previous test's click.
let authorizationCounter = 0;
function freshAuthorization(): string {
  authorizationCounter += 1;
  return `auth-${authorizationCounter}`;
}

function refresh(authorizationId: string) {
  return request(app).post(`/snaptrade/connections/${authorizationId}/refresh`);
}

describe('SnapTrade connection refresh route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPrismaClient as jest.Mock).mockReturnValue({ snapTradeUser: { findUnique } });
    findUnique.mockResolvedValue({ userId: 'user-1', userSecret: 'secret' });
    // Every authorization the tests ask for belongs to this user unless a test
    // says otherwise, so ownership is only ever the subject under test.
    getUserAccounts.mockImplementation(async () => ({
      success: true,
      data: { accounts: [{ id: 'account-1', brokerageAuthorizationId: `auth-${authorizationCounter}` }] },
    }));
    refreshConnection.mockResolvedValue({ success: true, data: { detail: 'Refresh scheduled' } });
  });

  it('refreshes a connection the user owns', async () => {
    const authorizationId = freshAuthorization();
    const response = await refresh(authorizationId).expect(200);

    expect(response.body.success).toBe(true);
    expect(refreshConnection).toHaveBeenCalledWith('user-1', 'secret', authorizationId);
  });

  // The provider only schedules the syncs, so the response must not imply the
  // balances on screen already moved.
  it('promises a scheduled refresh rather than updated balances', async () => {
    const response = await refresh(freshAuthorization()).expect(200);

    expect(response.body.message).toMatch(/requested/i);
  });

  it('refuses an authorization belonging to someone else', async () => {
    freshAuthorization();
    const response = await refresh('someone-elses-auth').expect(400);

    expect(response.body.error).toContain('Unknown brokerage connection');
    expect(refreshConnection).not.toHaveBeenCalled();
  });

  // Reconnect fails open because a user locked out of the portal has no other
  // repair path. A refresh has one -- waiting -- so an unverifiable ownership
  // check must not spend a metered provider write.
  it('does not refresh when ownership cannot be verified', async () => {
    getUserAccounts.mockResolvedValue({ success: false, error: 'SnapTrade unavailable' });

    await refresh(freshAuthorization()).expect(503);

    expect(refreshConnection).not.toHaveBeenCalled();
  });

  it('rejects a second click inside the cooldown instead of spending another refresh', async () => {
    const authorizationId = freshAuthorization();
    await refresh(authorizationId).expect(200);

    const response = await refresh(authorizationId).expect(429);

    expect(response.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(response.headers['retry-after']).toBeDefined();
    expect(refreshConnection).toHaveBeenCalledTimes(1);
  });

  // A failed attempt consumed nothing, so locking the user out of retrying would
  // strand them behind a cooldown for a refresh that never happened.
  it('does not start the cooldown when the provider rejected the refresh', async () => {
    const authorizationId = freshAuthorization();
    refreshConnection.mockResolvedValueOnce({ success: false, status: 500, error: 'Refresh failed' });

    await refresh(authorizationId).expect(502);
    await refresh(authorizationId).expect(200);

    expect(refreshConnection).toHaveBeenCalledTimes(2);
  });

  it('passes the provider rate limit through as a rate limit', async () => {
    refreshConnection.mockResolvedValue({
      success: false,
      status: 425,
      error: 'This connection was refreshed recently. Please try again later.',
    });

    const response = await refresh(freshAuthorization()).expect(429);

    expect(response.body.error).toContain('refreshed recently');
  });
});
