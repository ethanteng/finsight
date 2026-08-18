const prisma = {
  accessToken: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  account: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  transaction: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};
const transactionsSync = jest.fn();
const accountsGet = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prisma),
}));
jest.mock('../../plaid', () => ({
  plaidClient: { transactionsSync, accountsGet },
  processTransactionData: jest.fn((transaction) => transaction),
}));
jest.mock('../../services/transaction-categorization-service', () => ({
  TransactionCategorizationService: jest.fn(() => ({
    categorizeTransaction: jest.fn(),
  })),
}));
jest.mock('../../services/transaction-normalization-service', () => ({
  TransactionNormalizationService: jest.fn(() => ({
    normalizeTransaction: jest.fn((transaction) => transaction),
  })),
}));

import { TransactionSyncService } from '../../services/transaction-sync-service';

describe('TransactionSyncService cursor durability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.accessToken.findUnique.mockResolvedValue({
      id: 'connection-1',
      userId: 'user-1',
      transactionSyncCursor: 'cursor-before',
    });
    prisma.accessToken.update.mockResolvedValue({});
    prisma.account.findMany.mockResolvedValue([{ plaidAccountId: 'account-1' }]);
    prisma.account.upsert.mockResolvedValue({});
    accountsGet.mockResolvedValue({ data: { accounts: [] } });
  });

  it('does not acknowledge a Plaid page when one transaction cannot be persisted', async () => {
    transactionsSync.mockResolvedValue({
      data: {
        added: [{ transaction_id: 'tx-1', account_id: 'missing-account' }],
        modified: [],
        removed: [],
        next_cursor: 'cursor-after',
        has_more: false,
      },
    });
    prisma.account.findFirst.mockResolvedValue(null);
    // Not in our tables and not reported by the Item either: nothing to create,
    // so the change stays unpersisted and the cursor must not advance.
    prisma.account.findMany.mockResolvedValue([]);

    const result = await TransactionSyncService.syncTransactionsForToken('access-token');

    expect(result).toMatchObject({ success: false, cursor: null });
    expect(result.error).toContain('Failed to persist 1 transaction change');
    expect(prisma.accessToken.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ transactionSyncCursor: 'cursor-after' }) })
    );
    expect(prisma.accessToken.update).toHaveBeenCalledWith({
      where: { token: 'access-token' },
      data: { lastError: expect.stringContaining('Failed to persist 1 transaction change') },
    });
  });

  it('commits the cursor after every change in the page succeeds', async () => {
    transactionsSync.mockResolvedValue({
      data: {
        added: [],
        modified: [],
        removed: [],
        next_cursor: 'cursor-after',
        has_more: false,
      },
    });

    await expect(
      TransactionSyncService.syncTransactionsForToken('access-token')
    ).resolves.toMatchObject({ success: true, cursor: 'cursor-after' });

    expect(prisma.accessToken.update).toHaveBeenCalledWith({
      where: { token: 'access-token' },
      data: expect.objectContaining({
        transactionSyncCursor: 'cursor-after',
        lastError: null,
      }),
    });
  });

  it('discards pages collected before restarting an expired cursor', async () => {
    transactionsSync
      .mockResolvedValueOnce({
        data: {
          added: [{ transaction_id: 'tx-old-page', account_id: 'account-1' }],
          modified: [],
          removed: [],
          next_cursor: 'cursor-page-2',
          has_more: true,
        },
      })
      .mockRejectedValueOnce({
        response: { data: { error_code: 'CURSOR_EXPIRED', error_message: 'expired' } },
      })
      .mockResolvedValueOnce({
        data: {
          added: [],
          modified: [],
          removed: [],
          next_cursor: 'cursor-reset',
          has_more: false,
        },
      });

    await expect(
      TransactionSyncService.syncTransactionsForToken('access-token')
    ).resolves.toMatchObject({ success: true, cursor: 'cursor-reset' });

    expect(prisma.account.findFirst).not.toHaveBeenCalled();
  });

  it('restarts pagination from the sync-start cursor on mid-page mutation', async () => {
    transactionsSync
      .mockResolvedValueOnce({
        data: {
          added: [{ transaction_id: 'tx-stale-page', account_id: 'account-1' }],
          modified: [],
          removed: [],
          next_cursor: 'cursor-page-2',
          has_more: true,
        },
      })
      .mockRejectedValueOnce({
        response: {
          data: {
            error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
            error_message: 'mutated',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          added: [],
          modified: [],
          removed: [],
          next_cursor: 'cursor-stable',
          has_more: false,
        },
      });

    await expect(
      TransactionSyncService.syncTransactionsForToken('access-token')
    ).resolves.toMatchObject({ success: true, cursor: 'cursor-stable' });

    expect(transactionsSync).toHaveBeenNthCalledWith(3, {
      access_token: 'access-token',
      cursor: 'cursor-before',
    });
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
  });

  it('creates an account row for a bank account opened after linking', async () => {
    // Nothing on the scheduled path writes accounts, so without this the
    // unknown-account guard would fail every future run on the same page.
    transactionsSync.mockResolvedValue({
      data: {
        added: [{ transaction_id: 'tx-1', account_id: 'account-new' }],
        modified: [],
        removed: [],
        next_cursor: 'cursor-after',
        has_more: false,
      },
    });
    prisma.account.findMany.mockResolvedValue([]);
    accountsGet.mockResolvedValue({
      data: {
        accounts: [
          { account_id: 'account-new', name: 'New Checking', type: 'depository', subtype: 'checking', balances: { current: 100 } },
          { account_id: 'account-other', name: 'Untouched', type: 'depository', subtype: 'savings', balances: {} },
        ],
      },
    });
    prisma.account.findFirst.mockResolvedValue({ id: 'db-account-new', accessTokenId: 'connection-1', plaidAccountId: 'account-new', type: 'depository', name: 'New Checking' });
    prisma.transaction.findUnique.mockResolvedValue({ aiCategory: 'expense' });
    prisma.transaction.upsert.mockResolvedValue({});

    await expect(
      TransactionSyncService.syncTransactionsForToken('access-token')
    ).resolves.toMatchObject({ success: true, added: 1, cursor: 'cursor-after' });

    expect(prisma.account.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.account.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { plaidAccountId: 'account-new' },
      update: {},
      create: expect.objectContaining({
        plaidAccountId: 'account-new',
        accessTokenId: 'connection-1',
        userId: 'user-1',
      }),
    }));
  });

  it('does not call Plaid for accounts it already stores', async () => {
    transactionsSync.mockResolvedValue({
      data: {
        added: [{ transaction_id: 'tx-1', account_id: 'account-1' }],
        modified: [],
        removed: [],
        next_cursor: 'cursor-after',
        has_more: false,
      },
    });
    prisma.account.findFirst.mockResolvedValue({ id: 'db-account-1', accessTokenId: 'connection-1', plaidAccountId: 'account-1', type: 'depository', name: 'Checking' });
    prisma.transaction.findUnique.mockResolvedValue({ aiCategory: 'expense' });
    prisma.transaction.upsert.mockResolvedValue({});

    await TransactionSyncService.syncTransactionsForToken('access-token');

    expect(accountsGet).not.toHaveBeenCalled();
    expect(prisma.account.upsert).not.toHaveBeenCalled();
  });
});
