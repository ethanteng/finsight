import type { MarketNewsData } from '../../market-news/aggregator';
import { UserTier } from '../../data/types';

const { MarketNewsAggregator } = jest.requireActual('../../market-news/aggregator') as typeof import('../../market-news/aggregator');
const { MarketNewsSynthesizer } = jest.requireActual('../../market-news/synthesizer') as typeof import('../../market-news/synthesizer');

describe('Tiingo Power market context', () => {
  it('keeps quotes when news fails and labels IEX observations', async () => {
    const aggregator = new MarketNewsAggregator();
    (aggregator as any).tiingoProvider = {
      getIexQuotes: jest.fn().mockResolvedValue([{
        ticker: 'SPY',
        last: 700,
        prevClose: 693,
        lastSaleTimestamp: '2026-08-18T15:30:00Z',
        volume: 123,
      }]),
      getNews: jest.fn().mockRejectedValue(new Error('news unavailable')),
    };

    const data = await (aggregator as any).fetchTiingoData() as MarketNewsData[];
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      source: 'tiingo',
      timestamp: new Date('2026-08-18T15:30:00Z'),
      type: 'market_data',
      data: {
        symbol: 'SPY',
        currentPrice: 700,
        previousClose: 693,
        changePercent: expect.closeTo(1.0101, 3),
        feedStatus: 'TIINGO_IEX',
      },
    });
  });

  it('normalizes and deduplicates Tiingo news URLs', async () => {
    const aggregator = new MarketNewsAggregator();
    const article = {
      title: 'Markets move',
      url: 'https://example.com/article',
      description: 'A market update',
      publishedDate: '2026-08-18T14:00:00Z',
      tickers: ['SPY'],
    };
    (aggregator as any).tiingoProvider = {
      getIexQuotes: jest.fn().mockResolvedValue([]),
      getNews: jest.fn().mockResolvedValue([article, article]),
    };

    const data = await (aggregator as any).fetchTiingoData() as MarketNewsData[];
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      source: 'tiingo',
      type: 'news_article',
      data: { title: article.title, url: article.url, description: article.description, tickers: ['SPY'] },
    });
  });

  it('adds Tiingo to Standard and prefers IEX SPY over duplicate Massive bars for Premium', () => {
    const synthesizer = new MarketNewsSynthesizer();
    const data = [
      { source: 'tiingo', type: 'market_data', data: { symbol: 'SPY', currentPrice: 700 }, timestamp: new Date(), relevance: 0.8 },
      { source: 'massive', type: 'market_data', data: { symbol: 'SPY', closingPrice: 699 }, timestamp: new Date(), relevance: 0.8 },
      { source: 'massive', type: 'rate_information', data: { symbol: 'TREASURY_YIELDS', yields: { '10_year': 4.2 } }, timestamp: new Date(), relevance: 0.9 },
    ] as MarketNewsData[];

    const standard = synthesizer.filterDataForTier(data, UserTier.STANDARD);
    const premium = synthesizer.filterDataForTier(data, UserTier.PREMIUM);
    expect(standard.map(item => item.source)).toEqual(['tiingo']);
    expect(premium.some(item => item.source === 'tiingo' && item.type === 'market_data')).toBe(true);
    expect(premium.some(item => item.source === 'massive' && item.type === 'market_data')).toBe(false);
    expect(premium.some(item => item.source === 'massive' && item.type === 'rate_information')).toBe(true);
  });

  it('uses Brave publication time and labels retrieval-only fallbacks explicitly', async () => {
    const aggregator = new MarketNewsAggregator();
    (aggregator as any).searchProvider = {
      search: jest.fn()
        .mockResolvedValueOnce([{
          title: 'Published update', snippet: 'A', url: 'https://example.com/a',
          source: 'Brave', relevance: 1, publishedAt: '2026-08-18T14:00:00.000Z', age: '1 hour ago',
        }])
        .mockResolvedValue([]),
    };

    const data = await (aggregator as any).fetchBraveSearchData() as MarketNewsData[];

    expect(data[0]).toMatchObject({
      timestamp: new Date('2026-08-18T14:00:00.000Z'),
      data: {
        timestampBasis: 'published',
        publishedAt: '2026-08-18T14:00:00.000Z',
        providerAge: '1 hour ago',
      },
    });
  });
});
