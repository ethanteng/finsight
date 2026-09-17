/**
 * The accounts page now asks which institution once, in its own search, and
 * routes from there. For a brokerage that means handing SnapTrade the slug so
 * the portal opens on it -- otherwise the user answers the same question a
 * second time inside the portal, which is the step the unified button exists to
 * remove.
 */

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
    getLoginRedirect: jest.fn(),
    getUserAccounts: jest.fn(),
  },
}));

const getLoginRedirect = snapTradeService.getLoginRedirect as jest.Mock;
const getUserAccounts = snapTradeService.getUserAccounts as jest.Mock;
const snapTradeUserFindUnique = jest.fn();

const app = express();
app.use(express.json());
app.use('/snaptrade', snapTradeRoutes);

describe('POST /snaptrade/login broker pre-selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPrismaClient as jest.Mock).mockReturnValue({
      snapTradeUser: { findUnique: snapTradeUserFindUnique },
    });
    snapTradeUserFindUnique.mockResolvedValue({ userId: 'user-1', userSecret: 'secret-1' });
    getLoginRedirect.mockResolvedValue({
      success: true,
      data: { redirectURI: 'https://app.snaptrade.com/connect' },
    });
  });

  it('passes the picked brokerage slug through to SnapTrade', async () => {
    const response = await request(app).post('/snaptrade/login').send({ broker: 'FIDELITY' });

    expect(response.status).toBe(200);
    expect(getLoginRedirect).toHaveBeenCalledWith('user-1', 'secret-1', undefined, 'FIDELITY');
  });

  it('leaves the ordinary connect flow alone when no institution was picked', async () => {
    const response = await request(app).post('/snaptrade/login').send({});

    expect(response.status).toBe(200);
    expect(getLoginRedirect).toHaveBeenCalledWith('user-1', 'secret-1', undefined, undefined);
  });

  it('caps an over-long slug rather than forwarding it whole', async () => {
    await request(app).post('/snaptrade/login').send({ broker: 'X'.repeat(200) });

    const forwarded = getLoginRedirect.mock.calls[0][3];
    expect(forwarded).toHaveLength(64);
  });

  it('ignores a non-string broker instead of forwarding it', async () => {
    await request(app).post('/snaptrade/login').send({ broker: { slug: 'FIDELITY' } });

    expect(getLoginRedirect).toHaveBeenCalledWith('user-1', 'secret-1', undefined, undefined);
  });

  it('keeps a reconnect a reconnect: a broker alongside it must not redirect the repair', async () => {
    getUserAccounts.mockResolvedValue({
      success: true,
      data: { accounts: [{ brokerageAuthorizationId: 'auth-1' }] },
    });

    await request(app).post('/snaptrade/login').send({ reconnect: 'auth-1', broker: 'ROBINHOOD' });

    // The route still forwards both; the service is what drops the broker, so
    // assert the repair target survived and is what SnapTrade is told about.
    expect(getLoginRedirect).toHaveBeenCalledWith('user-1', 'secret-1', 'auth-1', 'ROBINHOOD');
  });
});
