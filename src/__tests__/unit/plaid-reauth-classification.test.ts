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
import {
  extractPlaidErrorCode,
  isUserActionRequiredPlaidError,
} from '../../services/plaid-error-classification';

/** Shape of a Plaid SDK (axios) rejection. */
const plaidError = (code: string, message = 'plaid said no') =>
  Object.assign(new Error(message), {
    response: { data: { error_code: code, error_message: message } },
  });

describe('Plaid error classification', () => {
  it('suppresses only the codes the product can walk a user out of', () => {
    // Both deactivate the token in GET /profile/tokens, and the profile page
    // offers update-mode Link off lastError === 'ITEM_LOGIN_REQUIRED'.
    for (const code of ['ITEM_LOGIN_REQUIRED', 'INVALID_ACCESS_TOKEN']) {
      expect(isUserActionRequiredPlaidError(code)).toBe(true);
    }
  });

  it('leaves retryable provider failures alerting', () => {
    for (const code of [
      'INTERNAL_SERVER_ERROR',
      'PLANNED_MAINTENANCE',
      'RATE_LIMIT_EXCEEDED',
      'INSTITUTION_DOWN',
    ]) {
      expect(isUserActionRequiredPlaidError(code)).toBe(false);
    }
  });

  it('keeps user-fixable codes with no recovery path alerting', () => {
    // These are user-fixable at Plaid, but nothing deactivates the token or
    // offers a reconnect for them, so going quiet would leave the connection to
    // rot unseen. They stay red until that path exists — see the module comment.
    for (const code of [
      'ITEM_LOCKED',
      'PENDING_EXPIRATION',
      'PENDING_DISCONNECT',
      'USER_PERMISSION_REVOKED',
      'USER_SETUP_REQUIRED',
      'ITEM_NOT_SUPPORTED',
      'INSUFFICIENT_CREDENTIALS',
    ]) {
      expect(isUserActionRequiredPlaidError(code)).toBe(false);
    }
  });

  it('does not swallow an unknown or missing code', () => {
    // An unrecognized failure must still fail the run rather than be assumed benign.
    expect(isUserActionRequiredPlaidError(undefined)).toBe(false);
    expect(isUserActionRequiredPlaidError(null)).toBe(false);
    expect(isUserActionRequiredPlaidError('')).toBe(false);
    expect(isUserActionRequiredPlaidError('SOME_NEW_CODE')).toBe(false);
  });

  it('reads the code off a Plaid SDK error and ignores errors without one', () => {
    expect(extractPlaidErrorCode(plaidError('ITEM_LOGIN_REQUIRED'))).toBe('ITEM_LOGIN_REQUIRED');
    expect(extractPlaidErrorCode(new Error('socket hang up'))).toBeUndefined();
    expect(extractPlaidErrorCode(undefined)).toBeUndefined();
  });
});

describe('syncAllActiveTokens failure accounting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.accessToken.update.mockResolvedValue({});
    prisma.accessToken.findUnique.mockImplementation(async ({ where }: any) => ({
      id: `id-${where.token}`,
      token: where.token,
      transactionSyncCursor: null,
    }));
  });

  const tokens = (...names: string[]) =>
    prisma.accessToken.findMany.mockResolvedValue(
      names.map((name) => ({ id: `token-${name}`, token: name, userId: `user-${name}` }))
    );

  const okPage = { data: { added: [], modified: [], removed: [], next_cursor: 'c1', has_more: false } };

  it('stays successful when every failure is waiting on a user re-link', async () => {
    tokens('good', 'stale');
    transactionsSync.mockImplementation(async ({ access_token }: any) => {
      if (access_token === 'stale') throw plaidError('ITEM_LOGIN_REQUIRED');
      return okPage;
    });

    const result = await TransactionSyncService.syncAllActiveTokens();

    // The run did everything it could; nothing here is actionable by a retry.
    expect(result.success).toBe(true);
    expect(result.failed).toBe(1);
    expect(result.needsReauth).toBe(1);
    expect(result.providerFailures).toBe(0);
    expect(result.results.find((r) => r.tokenId === 'token-stale')?.result.errorCode)
      .toBe('ITEM_LOGIN_REQUIRED');
    // Profile update-mode Link keys off lastError === 'ITEM_LOGIN_REQUIRED'.
    expect(prisma.accessToken.update).toHaveBeenCalledWith({
      where: { token: 'stale' },
      data: { lastError: 'ITEM_LOGIN_REQUIRED' },
    });
  });

  it('does not fail the run for INVALID_ACCESS_TOKEN', async () => {
    tokens('dead');
    transactionsSync.mockRejectedValue(plaidError('INVALID_ACCESS_TOKEN', 'invalid token'));

    const result = await TransactionSyncService.syncAllActiveTokens();

    expect(result.success).toBe(true);
    expect(result.needsReauth).toBe(1);
    expect(result.providerFailures).toBe(0);
  });

  it('still fails when a provider failure is present', async () => {
    tokens('good', 'stale', 'broken');
    transactionsSync.mockImplementation(async ({ access_token }: any) => {
      if (access_token === 'stale') throw plaidError('ITEM_LOGIN_REQUIRED');
      if (access_token === 'broken') throw plaidError('INTERNAL_SERVER_ERROR');
      return okPage;
    });

    const result = await TransactionSyncService.syncAllActiveTokens();

    expect(result.success).toBe(false);
    expect(result.failed).toBe(2);
    expect(result.needsReauth).toBe(1);
    // Only the retryable one is worth alerting on.
    expect(result.providerFailures).toBe(1);
  });

  it('fails on an error that carried no Plaid code at all', async () => {
    tokens('good', 'offline');
    transactionsSync.mockImplementation(async ({ access_token }: any) => {
      if (access_token === 'offline') throw new Error('socket hang up');
      return okPage;
    });

    const result = await TransactionSyncService.syncAllActiveTokens();

    expect(result.success).toBe(false);
    expect(result.needsReauth).toBe(0);
    expect(result.providerFailures).toBe(1);
  });
});
