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
const transactionFindMany = jest.fn();
const transactionDeleteMany = jest.fn();
const overrideDeleteMany = jest.fn();
const syncStatusDeleteMany = jest.fn();
const snapTradeUserDeleteMany = jest.fn();

const prisma = {
  accessToken: { findMany: accessTokenFindMany, deleteMany: accessTokenDeleteMany },
  account: { deleteMany: accountDeleteMany },
  transaction: { findMany: transactionFindMany, deleteMany: transactionDeleteMany },
  transactionCategoryOverride: { deleteMany: overrideDeleteMany },
  syncStatus: { deleteMany: syncStatusDeleteMany },
  snapTradeUser: { deleteMany: snapTradeUserDeleteMany },
};

jest.mock('../../prisma-client', () => ({ getPrismaClient: () => prisma }));

import { removePlaidItems } from '../../services/plaid-item-removal';
import { deleteTransactionsWithOverrides } from '../../services/transaction-cleanup';

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

  // Accounts/transactions before tokens: AccessToken delete SetNulls accessTokenId,
  // which would make the revoked-id filters miss and risk orphan bank accounts.
  await deleteTransactionsWithOverrides(prisma as any, userId, { account: { userId, accessTokenId: { in: revokedTokenIds } } });
  await prisma.account.deleteMany({ where: { userId, accessTokenId: { in: revokedTokenIds } } });
  await deleteTransactionsWithOverrides(prisma as any, userId, { account: { userId, accessTokenId: null } });
  await prisma.account.deleteMany({ where: { userId, accessTokenId: null } });
  await prisma.accessToken.deleteMany({ where: { userId, id: { in: revokedTokenIds } } });
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
    transactionFindMany.mockResolvedValue([
      { plaidTransactionId: 'tx-1' },
      { plaidTransactionId: 'tx-2' },
    ]);
    [accessTokenDeleteMany, accountDeleteMany, transactionDeleteMany, overrideDeleteMany, syncStatusDeleteMany, snapTradeUserDeleteMany]
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

  // `Account.accessTokenId` is onDelete: SetNull. Deleting tokens first would
  // null the FK so the revoked-id account filter matches nothing, and a failure
  // mid-cleanup would leave bank accounts looking like hand-entered ones.
  it('deletes accounts before access tokens so SetNull cannot orphan them', async () => {
    const order: string[] = [];
    accountDeleteMany.mockImplementation(async () => {
      order.push('accounts');
      return { count: 0 };
    });
    accessTokenDeleteMany.mockImplementation(async () => {
      order.push('tokens');
      return { count: 0 };
    });

    await request(app).post('/privacy/disconnect-accounts').expect(200);

    expect(order.indexOf('accounts')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('tokens')).toBeGreaterThan(order.indexOf('accounts'));
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

  // This route keeps the user, so a category override left pointing at a deleted
  // transaction survives for the life of the account. Its only cascade is from
  // `User`, and there is no foreign key to clean it up.
  it('clears category overrides for the transactions it removes', async () => {
    await request(app).post('/privacy/disconnect-accounts').expect(200);

    expect(overrideDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', transactionId: { in: ['tx-1', 'tx-2'] } },
    });
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
