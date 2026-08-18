import { UserTier } from '../../data/types';
import { MarketNewsManager } from '../../market-news/manager';
import {
  acquireScheduledRefreshLease,
  completeScheduledRefreshLease,
  failScheduledRefreshLease,
  releaseScheduledRefreshLease,
} from '../../market-news/refresh-lease';

const fredCpi = { source: 'fred', timestamp: new Date(), data: { series: 'CPIAUCSL', value: 2.5 }, type: 'economic_indicator', relevance: 0.9 };
const fredFedRate = { source: 'fred', timestamp: new Date(), data: { series: 'DFF', value: 4.25 }, type: 'economic_indicator', relevance: 0.9 };
const fredTenYear = { source: 'fred', timestamp: new Date(), data: { series: 'DGS10', value: 4.1 }, type: 'economic_indicator', relevance: 0.9 };
const tiingoQuote = { source: 'tiingo', timestamp: new Date(), data: { symbol: 'SPY', currentPrice: 600 }, type: 'market_data', relevance: 0.9 };
const tiingoNews = { source: 'tiingo', timestamp: new Date(), data: { title: 'Markets close higher', url: 'https://example.com/a' }, type: 'news_article', relevance: 0.8 };
const massiveTreasury = { source: 'massive', timestamp: new Date(), data: { symbol: 'TREASURY_YIELDS', yields: { '10_year': 4.1 } }, type: 'rate_information', relevance: 0.8 };
const massiveInflation = { source: 'massive', timestamp: new Date(), data: { symbol: 'INFLATION_EXPECTATIONS', expectations: { model_5_year: 2.3 } }, type: 'economic_indicator', relevance: 0.8 };

const completeEvidence = [
  fredCpi,
  fredFedRate,
  fredTenYear,
  tiingoQuote,
  tiingoNews,
  massiveTreasury,
  massiveInflation,
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
  hasMassiveTenYearYield: (data: Array<{ source: string; data?: Record<string, any> }>) => data.some(
    item => item.source === 'massive'
      && item.data?.symbol === 'TREASURY_YIELDS'
      && typeof item.data?.yields?.['10_year'] === 'number'
  ),
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
      findFirst: jest.fn().mockResolvedValue({
        id: 'auto-standard',
        contextText: 'standard context',
        lastUpdate: new Date('2026-08-18T12:00:00.000Z'),
        dataSources: [],
        keyEvents: [],
      }),
      findUnique: jest.fn().mockResolvedValue({ id: 'auto-standard', dataSources: [], keyEvents: [] }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    mockAggregateMarketData.mockResolvedValue([fredCpi]);
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

  it('rejects a batch that carries a provider name without its macro datasets', async () => {
    // Massive answers three endpoints independently: a surviving SPY bar must
    // not vouch for a missing Treasury curve and inflation expectations.
    process.env.MASSIVE_API_KEY = 'test-massive-key';
    mockAggregateMarketData.mockResolvedValue([
      fredCpi,
      fredFedRate,
      fredTenYear,
      tiingoNews,
      { source: 'massive', timestamp: new Date(), data: { symbol: 'SPY', closingPrice: 600 }, type: 'market_data', relevance: 0.8 },
    ]);
    const manager = new MarketNewsManager();

    try {
      await expect(manager.refreshMarketContexts([
        UserTier.STARTER,
        UserTier.STANDARD,
        UserTier.PREMIUM,
      ], { force: true })).rejects.toThrow('massive:TREASURY_YIELDS, massive:INFLATION_EXPECTATIONS');
    } finally {
      delete process.env.MASSIVE_API_KEY;
    }

    expect(manager.prisma.marketNewsContext.upsert).not.toHaveBeenCalled();
  });

  it('rejects a FRED batch that lost its macro baseline', async () => {
    // getEconomicIndicators tolerates per-series failure, so a surviving
    // unemployment row must not stand in for CPI and the policy rate.
    mockAggregateMarketData.mockResolvedValue([
      { source: 'fred', timestamp: new Date(), data: { series: 'UNRATE', value: 4.1 }, type: 'economic_indicator', relevance: 0.5 },
      tiingoNews,
      massiveTreasury,
    ]);
    const manager = new MarketNewsManager();

    await expect(manager.refreshMarketContexts([
      UserTier.STANDARD,
    ], { force: true })).rejects.toThrow('fred:CPIAUCSL, fred:DFF');
  });

  it('accepts a 10-year yield supplied by Massive when FRED omits DGS10', async () => {
    mockAggregateMarketData.mockResolvedValue([
      fredCpi,
      fredFedRate,
      tiingoNews,
      massiveTreasury,
      massiveInflation,
    ]);
    const manager = new MarketNewsManager();

    await expect(manager.refreshMarketContexts([UserTier.PREMIUM], { force: true }))
      .resolves.toEqual({ refreshed: true });
  });

  it('clears a manual override when an admin refresh asks for it', async () => {
    const manager = new MarketNewsManager();
    await manager.refreshMarketContexts([UserTier.STANDARD], {
      force: true,
      clearManualOverride: true,
    });

    expect(manager.prisma.marketNewsContext.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['manual-standard'] }, isActive: true },
      data: { isActive: false },
    });
  });

  it('leaves a manual override in place for the scheduled refresh', async () => {
    const manager = new MarketNewsManager();
    await manager.refreshMarketContexts([
      UserTier.STARTER,
      UserTier.STANDARD,
      UserTier.PREMIUM,
    ]);

    expect(manager.prisma.marketNewsContext.updateMany).not.toHaveBeenCalled();
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

  it('returns the exact record identity and update time with stored context', async () => {
    const manager = new MarketNewsManager();

    await expect(manager.getMarketContextObservation(UserTier.STANDARD)).resolves.toEqual({
      id: 'auto-standard',
      tier: UserTier.STANDARD,
      contextText: 'standard context',
      lastUpdate: new Date('2026-08-18T12:00:00.000Z'),
    });
  });
});
