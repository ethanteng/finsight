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
    removeConnection: jest.fn(),
  },
}));

const schedule = jest.fn();
jest.mock('../../services/financial-revision-service', () => ({
  FinancialRevisionService: { schedule: (...args: any[]) => schedule(...args) },
}));

const getUserAccounts = snapTradeService.getUserAccounts as jest.Mock;
const removeConnection = snapTradeService.removeConnection as jest.Mock;

const snapTradeUserFindUnique = jest.fn();
const snapshotFindUnique = jest.fn();
const accountFindMany = jest.fn();
const accountDeleteMany = jest.fn();
const transactionDeleteMany = jest.fn();
const activityDeleteMany = jest.fn();
const activityFindMany = jest.fn();
const overrideDeleteMany = jest.fn();

const app = express();
app.use(express.json());
app.use('/snaptrade', snapTradeRoutes);

// Two brokerages on one SnapTrade user: removing one must leave the other whole.
const publicAccounts = [
  { id: 'acct-public-1', name: 'Public Treasury Account', institution: 'Public', brokerageAuthorizationId: 'auth-public', lastSuccessfulHoldingsSync: '2025-11-23T23:58:28.789Z' },
  { id: 'acct-public-2', name: 'Public Brokerage Account', institution: 'Public', brokerageAuthorizationId: 'auth-public', lastSuccessfulHoldingsSync: '2026-08-21T00:50:54.652Z' },
];
const fidelityAccounts = [
  { id: 'acct-fidelity-1', name: 'Fidelity Roth', institution: 'Fidelity', brokerageAuthorizationId: 'auth-fidelity', lastSuccessfulHoldingsSync: '2026-08-20T10:00:00.000Z' },
];

describe('SnapTrade per-institution disconnect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPrismaClient as jest.Mock).mockReturnValue({
      snapTradeUser: { findUnique: snapTradeUserFindUnique },
      financialSummarySnapshot: { findUnique: snapshotFindUnique },
      account: { findMany: accountFindMany, deleteMany: accountDeleteMany },
      transaction: { deleteMany: transactionDeleteMany },
      snapTradeActivity: { deleteMany: activityDeleteMany, findMany: activityFindMany },
      transactionCategoryOverride: { deleteMany: overrideDeleteMany },
      $transaction: async (callback: any) => callback({
        account: { findMany: accountFindMany, deleteMany: accountDeleteMany },
        transaction: { deleteMany: transactionDeleteMany },
        snapTradeActivity: { deleteMany: activityDeleteMany, findMany: activityFindMany },
        transactionCategoryOverride: { deleteMany: overrideDeleteMany },
      }),
    });
    snapTradeUserFindUnique.mockResolvedValue({ userId: 'user-1', userSecret: 'secret' });
    snapshotFindUnique.mockResolvedValue({ accounts: [] });
    getUserAccounts.mockResolvedValue({
      success: true,
      data: {
        accounts: [...publicAccounts, ...fidelityAccounts],
        authorizations: [
          { id: 'auth-public', institution: 'Public', disabled: false, disabledAt: null },
          { id: 'auth-fidelity', institution: 'Fidelity', disabled: false, disabledAt: null },
        ],
      },
    });
    removeConnection.mockResolvedValue({ success: true });
    accountFindMany.mockResolvedValue([{ id: 'db-1' }, { id: 'db-2' }]);
    accountDeleteMany.mockResolvedValue({ count: 2 });
    transactionDeleteMany.mockResolvedValue({ count: 37 });
    activityDeleteMany.mockResolvedValue({ count: 411 });
    activityFindMany.mockResolvedValue([{ activityId: 'act-1' }, { activityId: 'act-2' }]);
    overrideDeleteMany.mockResolvedValue({ count: 1 });
  });

  describe('listing', () => {
    it('groups accounts into one row per institution', async () => {
      const response = await request(app).get('/snaptrade/connections').expect(200);

      const connections = response.body.data.connections;
      expect(connections).toHaveLength(2);
      const publicConnection = connections.find((c: any) => c.id === 'auth-public');
      expect(publicConnection.institution).toBe('Public');
      expect(publicConnection.accounts).toHaveLength(2);
      // The newest sync across the connection, so the row answers "is this link
      // still doing anything" rather than reporting its most neglected account.
      expect(publicConnection.lastHoldingsSync).toBe('2026-08-21T00:50:54.652Z');
    });

    // A user who never linked a brokerage has no connections. That is an empty
    // list, not a failure, and must not render as a broken panel.
    it('returns an empty list for a user with no SnapTrade registration', async () => {
      snapTradeUserFindUnique.mockResolvedValue(null);

      const response = await request(app).get('/snaptrade/connections').expect(200);

      expect(response.body.data.connections).toEqual([]);
      expect(getUserAccounts).not.toHaveBeenCalled();
    });

    // An account with no authorization cannot be disconnected on its own, so
    // listing it would offer a button that could not work.
    it('omits accounts with no brokerage authorization', async () => {
      getUserAccounts.mockResolvedValue({
        success: true,
        data: {
          accounts: [...publicAccounts, { id: 'orphan', name: 'Orphan', institution: 'Nowhere' }],
          authorizations: [{ id: 'auth-public', institution: 'Public', disabled: false, disabledAt: null }],
        },
      });

      const response = await request(app).get('/snaptrade/connections').expect(200);

      expect(response.body.data.connections).toHaveLength(1);
    });

    // A brokerage can be linked before any accounts appear. Listing only from
    // accounts would hide it and leave no way to disconnect the dead link.
    it('lists an authorization that currently has no accounts', async () => {
      getUserAccounts.mockResolvedValue({
        success: true,
        data: {
          accounts: [],
          authorizations: [{ id: 'auth-pending', institution: 'Public', disabled: true, disabledAt: '2026-08-20T00:00:00.000Z' }],
        },
      });

      const response = await request(app).get('/snaptrade/connections').expect(200);

      expect(response.body.data.connections).toEqual([
        expect.objectContaining({
          id: 'auth-pending',
          institution: 'Public',
          disabled: true,
          accounts: [],
        }),
      ]);
    });
  });

  describe('disconnecting', () => {
    it('removes the authorization and only that institution rows', async () => {
      const response = await request(app)
        .delete('/snaptrade/connections/auth-public')
        .expect(200);

      expect(removeConnection).toHaveBeenCalledWith('user-1', 'secret', 'auth-public');
      // Scoped to the two Public accounts; Fidelity's account id is never in the filter.
      const deletedIds = accountDeleteMany.mock.calls[0][0].where.plaidAccountId.in;
      expect(deletedIds).toEqual(['snaptrade-acct-public-1', 'snaptrade-acct-public-2']);
      expect(deletedIds).not.toContain('snaptrade-acct-fidelity-1');
      expect(response.body.data.removed).toEqual({ accounts: 2, transactions: 37, activities: 411, categoryOverrides: 1 });
    });

    // `Transaction.account` has no onDelete cascade, so an account still
    // referenced by a transaction row cannot be deleted -- the whole cleanup
    // would roll back. SnapTrade activity lives in its own table today, which is
    // exactly why this ordering is easy to break without noticing.
    it('clears transactions before the accounts they reference', async () => {
      const order: string[] = [];
      transactionDeleteMany.mockImplementation(async () => { order.push('transactions'); return { count: 0 }; });
      accountDeleteMany.mockImplementation(async () => { order.push('accounts'); return { count: 2 }; });

      await request(app).delete('/snaptrade/connections/auth-public').expect(200);

      expect(order).toEqual(['transactions', 'accounts']);
    });

    it('scopes activity deletion to the disconnected accounts and this user', async () => {
      await request(app).delete('/snaptrade/connections/auth-public').expect(200);

      expect(activityDeleteMany).toHaveBeenCalledWith({
        where: {
          snapTradeUser: { userId: 'user-1' },
          accountId: { in: ['snaptrade-acct-public-1', 'snaptrade-acct-public-2'] },
        },
      });
    });

    // SnapTrade activities reach `snapshot.transactions` as `snaptrade-{activityId}`
    // and the override route gates only on snapshot membership, so one of these
    // can already carry a user category. Leaving it behind would keep data for an
    // institution the user asked to have removed.
    it('clears category overrides for the disconnected institution transactions', async () => {
      await request(app).delete('/snaptrade/connections/auth-public').expect(200);

      expect(overrideDeleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          transactionId: { in: ['snaptrade-act-1', 'snaptrade-act-2'] },
        },
      });
    });

    // Ask Linc answers from the snapshot, so until it is rebuilt the disconnected
    // institution is still in the user's totals and still visible to the model.
    it('queues a snapshot rebuild so the institution leaves the totals', async () => {
      await request(app).delete('/snaptrade/connections/auth-public').expect(200);

      expect(schedule).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          history: { kind: 'material', reason: 'snaptrade-connection-disconnected' },
        }),
        expect.any(String),
      );
    });

    it('refuses an authorization that is not this user\'s', async () => {
      await request(app).delete('/snaptrade/connections/auth-someone-else').expect(404);

      expect(removeConnection).not.toHaveBeenCalled();
      expect(accountDeleteMany).not.toHaveBeenCalled();
    });

    // Removing the authorization while blind to its accounts would strand their
    // rows with no connection left to identify them.
    it('does not remove anything when the account list cannot be read', async () => {
      getUserAccounts.mockResolvedValue({ success: false, error: 'SnapTrade unavailable' });

      await request(app).delete('/snaptrade/connections/auth-public').expect(503);

      expect(removeConnection).not.toHaveBeenCalled();
      expect(accountDeleteMany).not.toHaveBeenCalled();
    });

    // Deleting history against a connection that is still live would only see it
    // re-imported on the next sync, with the user believing it was gone.
    it('keeps local data when the provider refuses the removal', async () => {
      removeConnection.mockResolvedValue({ success: false, status: 502, error: 'Could not disconnect this institution.' });

      await request(app).delete('/snaptrade/connections/auth-public').expect(502);

      expect(accountDeleteMany).not.toHaveBeenCalled();
      expect(transactionDeleteMany).not.toHaveBeenCalled();
      expect(activityDeleteMany).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
    });

    it('passes expired credentials through as unauthorized', async () => {
      removeConnection.mockResolvedValue({
        success: false,
        status: 401,
        error: 'SnapTrade credentials invalid or expired. Please reconnect your SnapTrade account.',
      });

      await request(app).delete('/snaptrade/connections/auth-public').expect(401);
    });

    // The provider being ahead of us is not a reason to leave local rows behind.
    it('still cleans up when the authorization was already gone at the provider', async () => {
      removeConnection.mockResolvedValue({ success: true, alreadyRemoved: true });

      const response = await request(app)
        .delete('/snaptrade/connections/auth-public')
        .expect(200);

      expect(accountDeleteMany).toHaveBeenCalled();
      expect(response.body.data.alreadyRemovedAtProvider).toBe(true);
    });

    // Provider remove succeeded but local cleanup failed: SnapTrade no longer
    // lists the accounts, so a naive retry would 404. The pending targets from
    // the first attempt let the second request finish the delete.
    // The pending map is exact but process-local, and the database outage it
    // exists to survive is the same kind of incident that restarts a process --
    // so on its own it strands the rows it was meant to save. A fresh process
    // has no memory of the earlier attempt; the persisted snapshot still records
    // which accounts the authorization owned, which is enough to finish.
    it('completes a stranded cleanup with no memory of the earlier attempt', async () => {
      // Provider has already forgotten this authorization, and nothing is pending.
      getUserAccounts.mockResolvedValue({
        success: true,
        data: {
          accounts: [...fidelityAccounts],
          authorizations: [{ id: 'auth-fidelity', institution: 'Fidelity', disabled: false, disabledAt: null }],
        },
      });
      snapshotFindUnique.mockResolvedValue({
        accounts: [
          { account_id: 'snaptrade-acct-public-1', source: 'snaptrade', institution: 'Public', brokerageAuthorizationId: 'auth-public' },
          { account_id: 'snaptrade-acct-public-2', source: 'snaptrade', institution: 'Public', brokerageAuthorizationId: 'auth-public' },
          { account_id: 'snaptrade-acct-fidelity-1', source: 'snaptrade', institution: 'Fidelity', brokerageAuthorizationId: 'auth-fidelity' },
        ],
      });

      const response = await request(app)
        .delete('/snaptrade/connections/auth-public')
        .expect(200);

      const deletedIds = accountDeleteMany.mock.calls[0][0].where.plaidAccountId.in;
      expect(deletedIds).toEqual(['snaptrade-acct-public-1', 'snaptrade-acct-public-2']);
      expect(deletedIds).not.toContain('snaptrade-acct-fidelity-1');
      expect(response.body.data.institution).toBe('Public');
    });

    // The recovery path must not become a way to delete rows for an id that was
    // never this user's: an unknown authorization has nothing in the snapshot.
    it('still refuses an unknown authorization with nothing in the snapshot', async () => {
      snapshotFindUnique.mockResolvedValue({
        accounts: [
          { account_id: 'snaptrade-acct-public-1', source: 'snaptrade', brokerageAuthorizationId: 'auth-public' },
        ],
      });

      await request(app).delete('/snaptrade/connections/auth-someone-else').expect(404);

      expect(removeConnection).not.toHaveBeenCalled();
      expect(accountDeleteMany).not.toHaveBeenCalled();
    });

    it('retries local cleanup after a prior provider-success / local-failure split', async () => {
      let attempts = 0;
      (getPrismaClient as jest.Mock).mockReturnValue({
        snapTradeUser: { findUnique: snapTradeUserFindUnique },
        financialSummarySnapshot: { findUnique: snapshotFindUnique },
        account: { findMany: accountFindMany, deleteMany: accountDeleteMany },
        transaction: { deleteMany: transactionDeleteMany },
        snapTradeActivity: { deleteMany: activityDeleteMany, findMany: activityFindMany },
        transactionCategoryOverride: { deleteMany: overrideDeleteMany },
        $transaction: async (callback: any) => {
          attempts += 1;
          if (attempts === 1) throw new Error('database unavailable');
          return callback({
            account: { findMany: accountFindMany, deleteMany: accountDeleteMany },
            transaction: { deleteMany: transactionDeleteMany },
            snapTradeActivity: { deleteMany: activityDeleteMany, findMany: activityFindMany },
        transactionCategoryOverride: { deleteMany: overrideDeleteMany },
          });
        },
      });

      await request(app).delete('/snaptrade/connections/auth-public').expect(500);
      expect(accountDeleteMany).not.toHaveBeenCalled();

      // Provider auth is gone; only the sibling institution remains visible.
      getUserAccounts.mockResolvedValue({
        success: true,
        data: {
          accounts: [...fidelityAccounts],
          authorizations: [{ id: 'auth-fidelity', institution: 'Fidelity', disabled: false, disabledAt: null }],
        },
      });
      removeConnection.mockResolvedValue({ success: true, alreadyRemoved: true });

      const response = await request(app)
        .delete('/snaptrade/connections/auth-public')
        .expect(200);

      const deletedIds = accountDeleteMany.mock.calls[0][0].where.plaidAccountId.in;
      expect(deletedIds).toEqual(['snaptrade-acct-public-1', 'snaptrade-acct-public-2']);
      expect(response.body.data.alreadyRemovedAtProvider).toBe(true);
      expect(schedule).toHaveBeenCalled();
    });

    it('removes an authorization that has no accounts yet', async () => {
      getUserAccounts.mockResolvedValue({
        success: true,
        data: {
          accounts: [],
          authorizations: [{ id: 'auth-pending', institution: 'Public', disabled: true, disabledAt: null }],
        },
      });
      accountFindMany.mockResolvedValue([]);
      accountDeleteMany.mockResolvedValue({ count: 0 });
      transactionDeleteMany.mockResolvedValue({ count: 0 });
      activityDeleteMany.mockResolvedValue({ count: 0 });
      activityFindMany.mockResolvedValue([]);
      overrideDeleteMany.mockResolvedValue({ count: 0 });

      const response = await request(app)
        .delete('/snaptrade/connections/auth-pending')
        .expect(200);

      expect(removeConnection).toHaveBeenCalledWith('user-1', 'secret', 'auth-pending');
      expect(response.body.data.removed).toEqual({ accounts: 0, transactions: 0, activities: 0, categoryOverrides: 0 });
    });
  });
});
