import express from 'express';
import request from 'supertest';

const itemRemove = jest.fn();

jest.mock('plaid', () => {
  const actual = jest.requireActual('plaid');
  return {
    ...actual,
    PlaidApi: jest.fn().mockImplementation(() => ({ itemRemove })),
  };
});

const accessTokenFindFirst = jest.fn();
const accessTokenFindMany = jest.fn();
const accessTokenDeleteMany = jest.fn();
const accountFindMany = jest.fn();
const accountDeleteMany = jest.fn();
const transactionFindMany = jest.fn();
const transactionDeleteMany = jest.fn();
const overrideDeleteMany = jest.fn();

const prisma = {
  accessToken: {
    findFirst: accessTokenFindFirst,
    findMany: accessTokenFindMany,
    deleteMany: accessTokenDeleteMany,
  },
  account: { findMany: accountFindMany, deleteMany: accountDeleteMany },
  transaction: { findMany: transactionFindMany, deleteMany: transactionDeleteMany },
  transactionCategoryOverride: { deleteMany: overrideDeleteMany },
  $transaction: async (callback: any) => callback({
    account: { findMany: accountFindMany, deleteMany: accountDeleteMany },
    transaction: { findMany: transactionFindMany, deleteMany: transactionDeleteMany },
    transactionCategoryOverride: { deleteMany: overrideDeleteMany },
    accessToken: { deleteMany: accessTokenDeleteMany },
  }),
};

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => prisma,
}));

// `src/plaid.ts` builds its own PrismaClient from `@prisma/client` rather than
// going through the shared factory, so the constructor is what has to be
// replaced -- mocking `../../prisma-client` alone leaves the routes talking to a
// real client and failing on a missing DATABASE_URL.
jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  return { ...actual, PrismaClient: jest.fn().mockImplementation(() => prisma) };
});

const schedule = jest.fn();
jest.mock('../../services/financial-revision-service', () => ({
  FinancialRevisionService: { schedule: (...args: any[]) => schedule(...args) },
}));

// The shared unit setup replaces `../../plaid` wholesale with a stub client, so
// the real route registrations have to be pulled in explicitly. The `plaid`
// package itself is still mocked above, so no live SDK is constructed.
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

function plaidError(errorCode: string) {
  return Object.assign(new Error(errorCode), { response: { data: { error_code: errorCode } } });
}

describe('Plaid per-institution disconnect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    accessTokenFindFirst.mockResolvedValue({ id: 'token-boa', token: 'access-boa', institutionName: 'Bank of America' });
    accessTokenFindMany.mockResolvedValue([
      { id: 'token-boa', token: 'access-boa' },
      { id: 'token-chase', token: 'access-chase' },
    ]);
    accessTokenDeleteMany.mockResolvedValue({ count: 1 });
    accountFindMany.mockResolvedValue([{ id: 'acct-1' }, { id: 'acct-2' }]);
    accountDeleteMany.mockResolvedValue({ count: 2 });
    transactionFindMany.mockResolvedValue([
      { plaidTransactionId: 'tx-1' },
      { plaidTransactionId: 'tx-2' },
    ]);
    transactionDeleteMany.mockResolvedValue({ count: 2 });
    overrideDeleteMany.mockResolvedValue({ count: 1 });
    itemRemove.mockResolvedValue({ data: {} });
  });

  it('revokes the item at Plaid before removing anything locally', async () => {
    const order: string[] = [];
    itemRemove.mockImplementation(async () => { order.push('itemRemove'); return { data: {} }; });
    accountDeleteMany.mockImplementation(async () => { order.push('deleteAccounts'); return { count: 2 }; });

    await request(app).delete('/plaid/connections/token-boa').expect(200);

    expect(itemRemove).toHaveBeenCalledWith({ access_token: 'access-boa' });
    expect(order).toEqual(['itemRemove', 'deleteAccounts']);
  });

  // The whole point of the change: deleting the token first leaves the Item live
  // at Plaid forever, because the token is the only thing that can revoke it.
  it('keeps local data when Plaid refuses the revocation', async () => {
    itemRemove.mockRejectedValue(plaidError('INTERNAL_SERVER_ERROR'));

    await request(app).delete('/plaid/connections/token-boa').expect(502);

    expect(accountDeleteMany).not.toHaveBeenCalled();
    expect(transactionDeleteMany).not.toHaveBeenCalled();
    expect(accessTokenDeleteMany).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('scopes the cleanup to the disconnected connection', async () => {
    await request(app).delete('/plaid/connections/token-boa').expect(200);

    expect(accountDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', accessTokenId: 'token-boa' },
    });
    expect(accessTokenDeleteMany).toHaveBeenCalledWith({
      where: { id: 'token-boa', userId: 'user-1' },
    });
  });

  // `Transaction.account` has no onDelete cascade, so an account still
  // referenced by a transaction cannot be deleted and the cleanup rolls back.
  it('clears transactions before the accounts they reference', async () => {
    const order: string[] = [];
    transactionDeleteMany.mockImplementation(async () => { order.push('transactions'); return { count: 2 }; });
    accountDeleteMany.mockImplementation(async () => { order.push('accounts'); return { count: 2 }; });

    await request(app).delete('/plaid/connections/token-boa').expect(200);

    expect(order).toEqual(['transactions', 'accounts']);
  });

  it('clears category overrides for the removed transactions', async () => {
    await request(app).delete('/plaid/connections/token-boa').expect(200);

    expect(overrideDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', transactionId: { in: ['tx-1', 'tx-2'] } },
    });
  });

  it('queues a snapshot rebuild so the institution leaves the totals', async () => {
    await request(app).delete('/plaid/connections/token-boa').expect(200);

    expect(schedule).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        history: { kind: 'material', reason: 'plaid-connection-disconnected' },
      }),
      expect.any(String),
    );
  });

  it('refuses a connection that is not this user\'s', async () => {
    accessTokenFindFirst.mockResolvedValue(null);

    await request(app).delete('/plaid/connections/someone-elses-token').expect(404);

    expect(itemRemove).not.toHaveBeenCalled();
    expect(accountDeleteMany).not.toHaveBeenCalled();
  });

  it('still cleans up when the item was already gone at Plaid', async () => {
    itemRemove.mockRejectedValue(plaidError('ITEM_NOT_FOUND'));

    const response = await request(app).delete('/plaid/connections/token-boa').expect(200);

    expect(accountDeleteMany).toHaveBeenCalled();
    expect(response.body.data.alreadyRemovedAtProvider).toBe(true);
  });
});

describe('Plaid disconnect-all', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    accessTokenFindMany.mockResolvedValue([
      { id: 'token-boa', token: 'access-boa' },
      { id: 'token-chase', token: 'access-chase' },
    ]);
    accessTokenDeleteMany.mockResolvedValue({ count: 2 });
    accountDeleteMany.mockResolvedValue({ count: 3 });
    transactionFindMany.mockResolvedValue([
      { plaidTransactionId: 'tx-1' },
      { plaidTransactionId: 'tx-2' },
    ]);
    transactionDeleteMany.mockResolvedValue({ count: 4 });
    overrideDeleteMany.mockResolvedValue({ count: 1 });
    itemRemove.mockResolvedValue({ data: {} });
  });

  it('revokes every item before forgetting the tokens', async () => {
    await request(app).delete('/plaid/disconnect_accounts').expect(200);

    expect(itemRemove).toHaveBeenCalledTimes(2);
    expect(accessTokenDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', id: { in: ['token-boa', 'token-chase'] } },
    });
  });

  // `Account.accessTokenId` is onDelete: SetNull, so deleting the token alone
  // leaves its accounts behind with a null connection -- and a null
  // `accessTokenId` is how manual and SnapTrade accounts are identified, so
  // orphaned bank accounts would quietly start passing for hand-entered ones.
  it('removes the accounts belonging to each revoked connection', async () => {
    const order: string[] = [];
    transactionDeleteMany.mockImplementation(async () => { order.push('transactions'); return { count: 4 }; });
    accountDeleteMany.mockImplementation(async () => { order.push('accounts'); return { count: 3 }; });

    await request(app).delete('/plaid/disconnect_accounts').expect(200);

    expect(accountDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', accessTokenId: { in: ['token-boa', 'token-chase'] } },
    });
    expect(order).toEqual(['transactions', 'accounts']);
  });

  // Overrides are keyed by provider transaction id with no foreign key, and this
  // route keeps the user, so anything left behind outlives the transactions it
  // annotates. The per-institution path already cleared them; this one did not.
  it('clears category overrides for the transactions it removes', async () => {
    await request(app).delete('/plaid/disconnect_accounts').expect(200);

    expect(overrideDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', transactionId: { in: ['tx-1', 'tx-2'] } },
    });
  });

  // Ask Linc answers from the snapshot, so without a rebuild it keeps serving
  // the disconnected banks' balances.
  it('queues a snapshot rebuild after a successful disconnect', async () => {
    await request(app).delete('/plaid/disconnect_accounts').expect(200);

    expect(schedule).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        history: { kind: 'material', reason: 'plaid-connection-disconnected' },
      }),
      expect.any(String),
    );
  });

  it('does not queue a rebuild when nothing could be revoked', async () => {
    itemRemove.mockRejectedValue(plaidError('INTERNAL_SERVER_ERROR'));

    await request(app).delete('/plaid/disconnect_accounts').expect(200);

    expect(schedule).not.toHaveBeenCalled();
  });

  // Deleting a token whose Item is still live strands it at Plaid permanently,
  // so an unrevoked connection keeps its token and can be retried.
  it('keeps the token of any item Plaid would not revoke', async () => {
    itemRemove
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce(plaidError('INTERNAL_SERVER_ERROR'));

    const response = await request(app).delete('/plaid/disconnect_accounts').expect(200);

    expect(accessTokenDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', id: { in: ['token-boa'] } },
    });
    expect(response.body.success).toBe(false);
    expect(response.body.failed).toBe(1);
  });
});
