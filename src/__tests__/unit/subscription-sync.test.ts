import { SubscriptionSyncService } from '../../services/subscription-sync';
import { getPrismaClient } from '../../prisma-client';

jest.mock('../../config/stripe', () => ({
  stripe: {
    client: {
      subscriptions: {
        retrieve: jest.fn(),
        update: jest.fn()
      }
    }
  },
  getTierFromPriceId: jest.fn()
}));

jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn()
}));

describe('SubscriptionSyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('bulk-syncs active and trialing subscriptions', async () => {
    const mockStripe = require('../../config/stripe');
    const mockPrisma = {
      subscription: {
        findMany: jest.fn().mockResolvedValue([
          { stripeSubscriptionId: 'sub_active' },
          { stripeSubscriptionId: 'sub_trialing' }
        ])
      }
    };

    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
    mockStripe.stripe.client.subscriptions.retrieve.mockResolvedValue({
      items: { data: [{ price: { id: 'price_test_123' } }] },
      metadata: { tier: 'premium' }
    });
    mockStripe.getTierFromPriceId.mockReturnValue('premium');

    const result = await SubscriptionSyncService.syncAllSubscriptions();

    expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['active', 'trialing'] }
      }
    });
    expect(mockStripe.stripe.client.subscriptions.retrieve).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      success: true,
      syncedCount: 2,
      message: 'Synced 2 active or trialing subscription(s)'
    });
  });
});
