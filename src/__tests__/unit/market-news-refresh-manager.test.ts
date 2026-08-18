import { UserTier } from '../../data/types';
import { MarketNewsManager } from '../../market-news/manager';
import {
  acquireScheduledRefreshLease,
  completeScheduledRefreshLease,
  failScheduledRefreshLease,
  releaseScheduledRefreshLease,
} from '../../market-news/refresh-lease';

const completeEvidence = [
  { source: 'fred', timestamp: new Date(), data: { series: 'CPIAUCSL', value: 2.5 }, type: 'economic_indicator', relevance: 0.9 },
  { source: 'tiingo', timestamp: new Date(), data: { symbol: 'SPY', currentPrice: 600 }, type: 'market_data', relevance: 0.9 },
  { source: 'massive', timestamp: new Date(), data: { symbol: 'TREASURY_YIELDS' }, type: 'rate_information', relevance: 0.8 },
];
const mockAggregateMarketData = jest.fn().mockResolvedValue(completeEvidence);

jest.mock('../../market-news/refresh-lease', () => ({
  acquireScheduledRefreshLease: jest.fn(),
  completeScheduledRefreshLease: jest.fn().mockResolvedValue(undefined),
  failScheduledRefreshLease: jest.fn().mockResolvedValue(undefined),
  releaseScheduledRefreshLease: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../market-news/aggregator', () => ({
  MarketNewsAggregator: jest.fn().mockImplementation(() => ({
    aggregateMarketData: mockAggregateMarketData,
  })),
}));

jest.mock('../../market-news/synthesizer', () => ({
  MarketNewsSynthesizer: jest.fn().mockImplementation(() => ({
    filterDataForTier: jest.fn().mockImplementation((data: unknown[], tier: UserTier) => (
      tier === 'starter' ? [] : data
    )),
    synthesizeMarketContext: jest.fn().mockImplementation(async (data: Array<{ source: string }>, tier: UserTier) => ({
      tier,
      contextText: `${tier} context`,
      dataSources: [...new Set(data.map(item => item.source))],
      keyEvents: [],
    })),
  })),
}));

jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn(() => ({
    marketNewsContext: {
      upsert: jest.fn().mockResolvedValue({ id: 'auto-standard' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'auto-standard', dataSources: [], keyEvents: [] }),
      findUnique: jest.fn().mockResolvedValue({ id: 'auto-standard', dataSources: [], keyEvents: [] }),
    },
    marketNewsHistory: {
      create: jest.fn().mockResolvedValue({}),
    },
  })),
}));

const mockedAcquire = acquireScheduledRefreshLease as jest.MockedFunction<typeof acquireScheduledRefreshLease>;
const mockedComplete = completeScheduledRefreshLease as jest.MockedFunction<typeof completeScheduledRefreshLease>;
const mockedFail = failScheduledRefreshLease as jest.MockedFunction<typeof failScheduledRefreshLease>;
const mockedRelease = releaseScheduledRefreshLease as jest.MockedFunction<typeof releaseScheduledRefreshLease>;

describe('MarketNewsManager.refreshMarketContexts lease completion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAcquire.mockResolvedValue({ acquired: true, ownerId: 'owner-1' });
    mockAggregateMarketData.mockResolvedValue(completeEvidence);
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

  it('keeps all last-known-good rows when required provider evidence is incomplete', async () => {
    mockAggregateMarketData.mockResolvedValue([
      completeEvidence[0],
    ]);
    const manager = new MarketNewsManager();

    await expect(manager.refreshMarketContexts([
      UserTier.STARTER,
      UserTier.STANDARD,
      UserTier.PREMIUM,
    ], { force: true })).rejects.toThrow('missing required evidence');

    expect(manager.prisma.marketNewsContext.upsert).not.toHaveBeenCalled();
    expect(mockedFail).toHaveBeenCalledWith(
      'market-news-refresh',
      'owner-1',
      expect.any(Error),
    );
    expect(mockedComplete).not.toHaveBeenCalled();
  });

  it('prioritizes manual context over a newer automatic row', async () => {
    const manager = new MarketNewsManager();
    await manager.getMarketContext(UserTier.STANDARD);

    expect(manager.prisma.marketNewsContext.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { manualOverride: 'desc' },
          { lastUpdate: 'desc' },
        ],
      }),
    );
  });
});
