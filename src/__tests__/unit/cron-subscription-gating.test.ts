/**
 * The scheduled refresh jobs reach Prisma and the providers directly, so no
 * request-time subscription check applies to them. These tests pin the
 * selection queries themselves: each cron population must exclude a canceled
 * customer at the database level, before a provider call is ever made.
 */
const prisma = {
  accessToken: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  account: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), upsert: jest.fn() },
  transaction: { findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  userProfile: { findMany: jest.fn() },
  $disconnect: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prisma),
}));
jest.mock('../../plaid', () => ({
  plaidClient: { transactionsSync: jest.fn(), accountsGet: jest.fn() },
  processTransactionData: jest.fn((transaction) => transaction),
}));
jest.mock('../../services/transaction-categorization-service', () => ({
  TransactionCategorizationService: jest.fn(() => ({ categorizeTransaction: jest.fn() })),
}));
jest.mock('../../services/transaction-normalization-service', () => ({
  TransactionNormalizationService: jest.fn(() => ({
    normalizeTransaction: jest.fn((transaction) => transaction),
  })),
}));
jest.mock('../../profile/manager', () => ({
  ProfileManager: jest.fn(() => ({
    getOriginalProfile: jest.fn(),
    extractHomeData: jest.fn(),
    updateHomeValue: jest.fn(),
  })),
}));

import { TransactionSyncService } from '../../services/transaction-sync-service';
import { HomeValueRefreshService } from '../../services/home-value-refresh';
import { ACCESS_BLOCKING_SUBSCRIPTION_STATUSES } from '../../services/subscription-refresh-eligibility';

const ELIGIBLE = { subscriptionStatus: { notIn: [...ACCESS_BLOCKING_SUBSCRIPTION_STATUSES] } };

describe('TransactionSyncService.syncAllActiveTokens subscription gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.accessToken.findMany.mockResolvedValue([]);
  });

  it('selects only connections whose owner still has an eligible subscription', async () => {
    await TransactionSyncService.syncAllActiveTokens();

    expect(prisma.accessToken.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        supersededAt: null,
        OR: [
          { userId: null },
          { user: { is: ELIGIBLE } },
        ],
      },
      select: { id: true, token: true, userId: true },
    });
  });

  // Cancellation rewrites subscription status only -- handleSubscriptionDeleted
  // never touches AccessToken -- so isActive/supersededAt stay true forever for
  // a canceled customer. Losing the user clause would restore the nightly Plaid
  // spend this gate exists to stop, without any test noticing.
  it('does not rely on token flags alone, which cancellation leaves untouched', async () => {
    await TransactionSyncService.syncAllActiveTokens();

    const where = prisma.accessToken.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ user: { is: ELIGIBLE } });
    expect(ELIGIBLE.subscriptionStatus.notIn).toContain('canceled');
  });

  // A token with no owner has no subscription to judge it by. It was synced
  // before this gate existed and still is: dropping it would be an unrelated
  // behavior change riding along with a billing fix.
  it('still selects connections that have no owner', async () => {
    await TransactionSyncService.syncAllActiveTokens();

    const where = prisma.accessToken.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ userId: null });
  });
});

describe('HomeValueRefreshService.refreshAllHomeValues subscription gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.userProfile.findMany.mockResolvedValue([]);
  });

  it('selects only profiles whose owner still has an eligible subscription', async () => {
    await new HomeValueRefreshService().refreshAllHomeValues();

    expect(prisma.userProfile.findMany).toHaveBeenCalledWith({
      where: {
        userId: { not: null },
        isActive: true,
        user: { is: ELIGIBLE },
      },
      select: { userId: true },
    });
  });

  // UserProfile.isActive is a profile flag; billing never writes it. Without the
  // user clause a canceled subscriber's address keeps going to RentCast.
  it('does not rely on the profile isActive flag, which billing never writes', async () => {
    await new HomeValueRefreshService().refreshAllHomeValues();

    const where = prisma.userProfile.findMany.mock.calls[0][0].where;
    expect(where.user).toEqual({ is: ELIGIBLE });
  });
});
