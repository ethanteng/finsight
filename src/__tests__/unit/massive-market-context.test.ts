import type { MarketNewsData } from '../../market-news/aggregator';
import { UserTier } from '../../data/types';

const { MarketNewsAggregator } = jest.requireActual('../../market-news/aggregator') as typeof import('../../market-news/aggregator');
const { MarketNewsSynthesizer } = jest.requireActual('../../market-news/synthesizer') as typeof import('../../market-news/synthesizer');

describe('Massive market context normalization', () => {
  const originalMassiveApiKey = process.env.MASSIVE_API_KEY;

  beforeEach(() => {
    process.env.MASSIVE_API_KEY = 'test_massive_key';
  });

  afterAll(() => {
    if (originalMassiveApiKey === undefined) {
      delete process.env.MASSIVE_API_KEY;
    } else {
      process.env.MASSIVE_API_KEY = originalMassiveApiKey;
    }
  });

  it('uses observation dates, keeps the full available curve, and omits missing optional values', async () => {
    const aggregator = new MarketNewsAggregator();
    const latestBarTime = Date.parse('2026-08-17T04:00:00Z');
    (aggregator as any).massiveProvider = {
      getDailyBars: jest.fn().mockResolvedValue({
        status: 'DELAYED',
        // Deliberately ascending to verify normalization does not trust response order.
        results: [
          { t: Date.parse('2026-08-14T04:00:00Z'), c: 760, v: 100 },
          { t: latestBarTime, c: 772.67, h: 774, l: 768, v: 120 },
        ],
      }),
      getLatestTreasuryYields: jest.fn().mockResolvedValue({
        results: [{
          date: '2026-08-14',
          yield_1_month: 3.79,
          yield_3_month: 3.86,
          yield_1_year: 3.98,
          yield_2_year: 4.17,
          yield_5_year: 4.36,
          yield_10_year: 4.68,
          yield_30_year: 5.25,
        }],
      }),
      getLatestInflationExpectations: jest.fn().mockResolvedValue({
        results: [{
          date: '2026-08-01',
          model_1_year: 2.393703,
          model_5_year: 2.4794345,
          model_10_year: 2.491664,
          model_30_year: 2.5628278,
        }],
      }),
    };

    const data = await (aggregator as any).fetchMassiveData() as MarketNewsData[];

    expect(data).toHaveLength(3);
    const market = data.find(item => item.type === 'market_data');
    const treasury = data.find(item => item.type === 'rate_information');
    const expectations = data.find(item => item.data.symbol === 'INFLATION_EXPECTATIONS');

    expect(market).toMatchObject({
      source: 'massive',
      timestamp: new Date(latestBarTime),
      data: {
        closingPrice: 772.67,
        date: '2026-08-17',
        feedStatus: 'DELAYED',
      },
    });
    expect(treasury).toMatchObject({
      source: 'massive',
      timestamp: new Date('2026-08-14T00:00:00Z'),
      data: {
        date: '2026-08-14',
        yields: {
          '1_month': 3.79,
          '3_month': 3.86,
          '1_year': 3.98,
          '2_year': 4.17,
          '5_year': 4.36,
          '10_year': 4.68,
          '30_year': 5.25,
        },
      },
    });
    expect(expectations).toMatchObject({
      source: 'massive',
      timestamp: new Date('2026-08-01T00:00:00Z'),
      data: {
        expectations: {
          model_1_year: 2.393703,
          model_5_year: 2.4794345,
          model_10_year: 2.491664,
          model_30_year: 2.5628278,
        },
      },
    });
    expect(JSON.stringify(data)).not.toContain('undefined');
  });

  it('keeps successful endpoints when another Massive endpoint fails', async () => {
    const aggregator = new MarketNewsAggregator();
    (aggregator as any).massiveProvider = {
      getDailyBars: jest.fn().mockRejectedValue(new Error('stocks unavailable')),
      getLatestTreasuryYields: jest.fn().mockResolvedValue({
        results: [{ date: '2026-08-14', yield_10_year: 4.68 }],
      }),
      getLatestInflationExpectations: jest.fn().mockResolvedValue({ results: [] }),
    };

    const data = await (aggregator as any).fetchMassiveData() as MarketNewsData[];

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ source: 'massive', type: 'rate_information' });
  });

  it('does not create a daily change from only one bar', async () => {
    const aggregator = new MarketNewsAggregator();
    (aggregator as any).massiveProvider = {
      getDailyBars: jest.fn().mockResolvedValue({
        results: [{ t: Date.parse('2026-08-17T04:00:00Z'), c: 772.67 }],
      }),
      getLatestTreasuryYields: jest.fn().mockResolvedValue({ results: [] }),
      getLatestInflationExpectations: jest.fn().mockResolvedValue({ results: [] }),
    };

    await expect((aggregator as any).fetchMassiveData()).resolves.toEqual([]);
  });

  it('formats only available values and clearly labels delayed daily-close data', () => {
    const synthesizer = new MarketNewsSynthesizer();
    const formatted = (synthesizer as any).formatDataForPrompt([
      {
        source: 'massive',
        timestamp: new Date('2026-08-17T04:00:00Z'),
        type: 'market_data',
        relevance: 0.8,
        data: {
          symbol: 'SPY',
          closingPrice: 772.67,
          changePercent: 1.67,
          date: '2026-08-17',
          feedStatus: 'DELAYED',
        },
      },
      {
        source: 'massive',
        timestamp: new Date('2026-08-01T00:00:00Z'),
        type: 'economic_indicator',
        relevance: 0.9,
        data: {
          symbol: 'INFLATION_EXPECTATIONS',
          date: '2026-08-01',
          expectations: { model_1_year: 2.393703 },
        },
      },
    ] as MarketNewsData[]);

    expect(formatted).toContain('SPY adjusted daily close: $772.67 on 2026-08-17');
    expect(formatted).toContain('[Massive status: DELAYED]');
    expect(formatted).toContain('Inflation expectations (2026-08-01): 1Y model: 2.39%');
    expect(formatted).not.toContain('undefined');
    expect(formatted).not.toContain('5Y market');
  });

  it('prefers the Massive Treasury curve over a duplicate FRED 10-year point for Premium', () => {
    const synthesizer = new MarketNewsSynthesizer();
    const data = [
      {
        source: 'fred',
        timestamp: new Date('2026-08-14T00:00:00Z'),
        type: 'economic_indicator',
        relevance: 0.8,
        data: { series: 'DGS10', value: 4.68, date: '2026-08-14' },
      },
      {
        source: 'fred',
        timestamp: new Date('2026-08-01T00:00:00Z'),
        type: 'economic_indicator',
        relevance: 0.9,
        data: { series: 'CPIAUCSL', value: 2.7, date: '2026-08-01' },
      },
      {
        source: 'massive',
        timestamp: new Date('2026-08-14T00:00:00Z'),
        type: 'rate_information',
        relevance: 0.9,
        data: { symbol: 'TREASURY_YIELDS', date: '2026-08-14', yields: { '10_year': 4.68 } },
      },
    ] as MarketNewsData[];

    const premiumData = (synthesizer as any).filterDataForTier(data, UserTier.PREMIUM) as MarketNewsData[];

    expect(premiumData.some(item => item.data.series === 'DGS10')).toBe(false);
    expect(premiumData.some(item => item.data.series === 'CPIAUCSL')).toBe(true);
    expect(premiumData.some(item => item.source === 'massive')).toBe(true);
  });
});
