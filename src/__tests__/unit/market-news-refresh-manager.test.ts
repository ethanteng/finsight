import { UserTier } from '../../data/types';
import { MarketNewsManager } from '../../market-news/manager';
import {
  acquireScheduledRefreshLease,
  completeScheduledRefreshLease,
  releaseScheduledRefreshLease,
} from '../../market-news/refresh-lease';

jest.mock('../../market-news/refresh-lease', () => ({
  acquireScheduledRefreshLease: jest.fn(),
  completeScheduledRefreshLease: jest.fn(),
  failScheduledRefreshLease: jest.fn(),
  releaseScheduledRefreshLease: jest.fn(),
}));

jest.mock('../../market-news/aggregator', () => ({
  MarketNewsAggregator: jest.fn().mockImplementation(() => ({
    aggregateMarketData: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('../../market-news/synthesizer', () => ({
  MarketNewsSynthesizer: jest.fn().mockImplementation(() => ({
    synthesizeMarketContext: jest.fn().mockImplementation(async (_data, tier: UserTier) => ({
      tier,
      contextText: `${tier} context`,
      dataSources: [],
      keyEvents: [],
    })),
  })),
}));

jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn(() => ({
    marketNewsContext: {
      upsert: jest.fn().mockResolvedValue({ id: 'auto-standard' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'auto-standard', dataSources: [], keyEvents: [] }),
    },
    marketNewsHistory: {
      create: jest.fn().mockResolvedValue({}),
    },
  })),
}));

const mockedAcquire = acquireScheduledRefreshLease as jest.MockedFunction<typeof acquireScheduledRefreshLease>;
const mockedComplete = completeScheduledRefreshLease as jest.MockedFunction<typeof completeScheduledRefreshLease>;
const mockedRelease = releaseScheduledRefreshLease as jest.MockedFunction<typeof releaseScheduledRefreshLease>;

describe('MarketNewsManager.refreshMarketContexts lease completion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAcquire.mockResolvedValue({ acquired: true, ownerId: 'owner-1' });
  });

  it('marks the scheduled job complete only after refreshing every tier', async () => {
    const manager = new MarketNewsManager();
    await manager.refreshMarketContexts([
      UserTier.STARTER,
      UserTier.STANDARD,
      UserTier.PREMIUM,
    ], { force: true });

    expect(mockedComplete).toHaveBeenCalledWith('market-news-refresh', 'owner-1');
    expect(mockedRelease).not.toHaveBeenCalled();
  });

  it('releases a single-tier force refresh without advancing lastCompletedAt', async () => {
    const manager = new MarketNewsManager();
    await manager.refreshMarketContexts([UserTier.STANDARD], { force: true });

    expect(mockedRelease).toHaveBeenCalledWith('market-news-refresh', 'owner-1');
    expect(mockedComplete).not.toHaveBeenCalled();
  });
});
