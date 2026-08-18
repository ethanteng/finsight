const prisma = {
  accessToken: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  account: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  transaction: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};
const transactionsSync = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prisma),
}));
jest.mock('../../plaid', () => ({
  plaidClient: { transactionsSync },
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
});
