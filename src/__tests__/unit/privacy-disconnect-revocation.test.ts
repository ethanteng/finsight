import express from 'express';
import request from 'supertest';

/**
 * `/privacy/disconnect-accounts` keeps the user's account, so unlike the two
 * deletion endpoints it can — and must — keep a connection Plaid would not
 * revoke. Deleting that token destroys the only credential that could ever
 * revoke the Item, while telling the user the bank was disconnected.
 */

const itemRemove = jest.fn();
jest.mock('../../plaid', () => ({ plaidClient: { itemRemove } }));

const accessTokenFindMany = jest.fn();
const accessTokenDeleteMany = jest.fn();
const accountDeleteMany = jest.fn();
const transactionDeleteMany = jest.fn();
const syncStatusDeleteMany = jest.fn();
const snapTradeUserDeleteMany = jest.fn();

const prisma = {
  accessToken: { findMany: accessTokenFindMany, deleteMany: accessTokenDeleteMany },
  account: { deleteMany: accountDeleteMany },
  transaction: { deleteMany: transactionDeleteMany },
  syncStatus: { deleteMany: syncStatusDeleteMany },
  snapTradeUser: { deleteMany: snapTradeUserDeleteMany },
};

jest.mock('../../prisma-client', () => ({ getPrismaClient: () => prisma }));

import { removePlaidItems } from '../../services/plaid-item-removal';

function plaidError(errorCode: string) {
  return Object.assign(new Error(errorCode), { response: { data: { error_code: errorCode } } });
}

/**
 * The route's revoke-then-scope-deletes shape, exercised directly.
 *
 * The real handler lives inside a 3,000-line `index.ts` whose import starts
 * servers and cron jobs, so the contract is pinned here instead: what gets
 * deleted is derived from what Plaid confirmed, never from the full token list.
 */
async function disconnectAccounts(userId: string) {
  const tokens = await prisma.accessToken.findMany({ where: { userId }, select: { id: true, token: true } });
  const { plaidClient } = await import('../../plaid');
  const revocation = await removePlaidItems(tokens, plaidClient as any);
  const revokedTokenIds = revocation.results.filter(result => result.removed).map(result => result.tokenId);

  await prisma.accessToken.deleteMany({ where: { userId, id: { in: revokedTokenIds } } });
  await prisma.transaction.deleteMany({ where: { account: { userId, accessTokenId: { in: revokedTokenIds } } } });
  await prisma.account.deleteMany({ where: { userId, accessTokenId: { in: revokedTokenIds } } });
  await prisma.transaction.deleteMany({ where: { account: { userId, accessTokenId: null } } });
  await prisma.account.deleteMany({ where: { userId, accessTokenId: null } });
  await prisma.syncStatus.deleteMany({ where: { userId } });
  await prisma.snapTradeUser.deleteMany({ where: { userId } });

  const everythingRevoked = revocation.failed === 0;
  return {
    success: everythingRevoked,
    unrevokedConnections: revocation.failed,
  };
}

const app = express();
app.use(express.json());
app.post('/privacy/disconnect-accounts', async (_req, res) => {
  res.json(await disconnectAccounts('user-1'));
});

describe('privacy disconnect keeps what Plaid would not revoke', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    accessTokenFindMany.mockResolvedValue([
      { id: 'token-boa', token: 'access-boa' },
      { id: 'token-chase', token: 'access-chase' },
    ]);
    [accessTokenDeleteMany, accountDeleteMany, transactionDeleteMany, syncStatusDeleteMany, snapTradeUserDeleteMany]
      .forEach(mock => mock.mockResolvedValue({ count: 0 }));
    itemRemove.mockResolvedValue({ data: {} });
  });

  it('clears everything when every item is revoked', async () => {
    const response = await request(app).post('/privacy/disconnect-accounts').expect(200);

    expect(itemRemove).toHaveBeenCalledTimes(2);
    expect(accessTokenDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', id: { in: ['token-boa', 'token-chase'] } },
    });
    expect(response.body.success).toBe(true);
  });

  // The reported defect: a transient failure used to delete every token anyway,
  // permanently stranding a live Item and reporting a clean disconnect.
  it('keeps the token and data of a connection Plaid would not revoke', async () => {
    itemRemove
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce(plaidError('INTERNAL_SERVER_ERROR'));

    const response = await request(app).post('/privacy/disconnect-accounts').expect(200);

    expect(accessTokenDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', id: { in: ['token-boa'] } },
    });
    expect(accountDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', accessTokenId: { in: ['token-boa'] } },
    });
    expect(response.body.success).toBe(false);
    expect(response.body.unrevokedConnections).toBe(1);
  });

  // A rejected credential proves nothing about the Item, so its token is kept
  // rather than deleted on the strength of an error that never said it was gone.
  it('keeps a connection whose credential Plaid rejected', async () => {
    itemRemove
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce(plaidError('INVALID_ACCESS_TOKEN'));

    const response = await request(app).post('/privacy/disconnect-accounts').expect(200);

    expect(accessTokenDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', id: { in: ['token-boa'] } },
    });
    expect(response.body.success).toBe(false);
  });

  // Manual and SnapTrade accounts carry no `accessTokenId`. Prisma's negated
  // filters do not match NULL columns, so excluding the failed tokens by
  // negation would silently spare these too — a user who asked to disconnect
  // everything would keep them because an unrelated bank errored.
  it('still clears accounts that have no Plaid connection', async () => {
    itemRemove.mockRejectedValue(plaidError('INTERNAL_SERVER_ERROR'));

    await request(app).post('/privacy/disconnect-accounts').expect(200);

    expect(accountDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', accessTokenId: null },
    });
    expect(snapTradeUserDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });
});
