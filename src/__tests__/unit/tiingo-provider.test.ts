import { TiingoHttpError, TiingoProvider } from '../../data/providers/tiingo';
import {
  TiingoCoverageGapError,
  TiingoProvider as RetirementTiingoProvider,
} from '../../retirement-analytics/data/providers/tiingo-provider';
import { dbCache } from '../../retirement-analytics/data/db-cache';

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  } as Response;
}

describe('Tiingo Power client', () => {
  it('batches IEX tickers and authenticates with the token header', async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(response(200, [{ ticker: 'SPY', last: 700 }]));
    const provider = new TiingoProvider('power-key', { fetchImplementation, maxAttempts: 1 });

    await expect(provider.getIexQuotes(['spy', 'QQQ', 'spy'])).resolves.toEqual([{ ticker: 'SPY', last: 700 }]);
    const [url, options] = fetchImplementation.mock.calls[0];
    expect(String(url)).toContain('/iex?tickers=SPY%2CQQQ');
    expect(options.headers.Authorization).toBe('Token power-key');
  });

  it('uses server-side monthly EOD resampling', async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(response(200, []));
    const provider = new TiingoProvider('power-key', { fetchImplementation, maxAttempts: 1 });

    await provider.getEodPrices('vtsax', '2000-01-01', '2026-08-18', 'monthly');
    expect(String(fetchImplementation.mock.calls[0][0])).toContain('resampleFreq=monthly');
  });

  it('normalizes class-share dots for every ticker-based endpoint', async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(response(200, []));
    const provider = new TiingoProvider('power-key', { fetchImplementation, maxAttempts: 1 });

    await provider.getEodPrices('brk.b', '2026-01-01', '2026-01-31');
    await provider.getIexQuotes(['BRK.B']);
    await provider.getNews({ tickers: ['brk.b'] });

    expect(String(fetchImplementation.mock.calls[0][0])).toContain('/tiingo/daily/BRK-B/prices');
    expect(String(fetchImplementation.mock.calls[1][0])).toContain('tickers=BRK-B');
    expect(String(fetchImplementation.mock.calls[2][0])).toContain('tickers=BRK-B');
  });

  it('retries rate limits using Retry-After', async () => {
    const fetchImplementation = jest.fn()
      .mockResolvedValueOnce(response(429, {}, { 'retry-after': '0' }))
      .mockResolvedValueOnce(response(200, []));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const provider = new TiingoProvider('power-key', { fetchImplementation, sleep, maxAttempts: 2 });

    await expect(provider.getNews({ tickers: ['SPY'] })).resolves.toEqual([]);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(0);
  });

  it('fails fast instead of holding a user request for a long Retry-After', async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(response(429, {}, { 'retry-after': '60' }));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const provider = new TiingoProvider('power-key', { fetchImplementation, sleep, maxAttempts: 3 });

    await expect(provider.getNews({ tickers: ['SPY'] })).rejects.toThrow('HTTP 429');
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a rate limit that carries no Retry-After with a bounded backoff', async () => {
    const fetchImplementation = jest.fn()
      .mockResolvedValueOnce(response(429, {}))
      .mockResolvedValueOnce(response(200, []));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const provider = new TiingoProvider('power-key', { fetchImplementation, sleep, maxAttempts: 2 });

    await expect(provider.getNews({ tickers: ['SPY'] })).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  it('uses the prior month for returns and drops Tiingo future month-end labels', () => {
    const provider = new RetirementTiingoProvider('test_tiingo_key');
    const series = (provider as any).convertToMonthlyReturns(
      [
        { date: '2026-06-30T00:00:00Z', adjClose: 100 },
        { date: '2026-07-31T00:00:00Z', adjClose: 110 },
        // A partial August bar is labeled August 31 even on August 18.
        { date: '2026-08-31T00:00:00Z', adjClose: 115 },
      ],
      'SPY',
      new Date('2026-07-01T00:00:00Z'),
      new Date('2026-08-18T23:59:59Z'),
    );

    expect(series.dates).toEqual([new Date('2026-07-31T00:00:00Z')]);
    expect(series.prices).toEqual([110]);
    expect(series.returns[0]).toBeCloseTo(0.1);
  });

  it('treats cache data as fresh only through the latest completed month', () => {
    const covers = (dbCache as any).coversLatestCompleteMonth.bind(dbCache);
    const july = [{ date: new Date('2026-07-31T00:00:00Z') }];
    expect(covers(july, new Date('2026-08-18T00:00:00Z'))).toBe(true);
    expect(covers(july, new Date('2026-09-01T00:00:00Z'))).toBe(false);
    expect(covers(july, new Date('2026-07-31T23:59:59Z'))).toBe(true);
    const now = new Date();
    const currentMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
    const priorMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    expect(covers([{ date: priorMonthEnd }], currentMonthEnd)).toBe(true);
  });
});

describe('Tiingo coverage gaps', () => {
  const HISTORY_START = new Date('2025-07-01T00:00:00Z');
  const HISTORY_END = new Date('2026-08-01T00:00:00Z');
  const originalGithubActions = process.env.GITHUB_ACTIONS;

  function liveProvider(fetchImplementation: jest.Mock): RetirementTiingoProvider {
    const provider = new RetirementTiingoProvider('power-key');
    // The provider builds its own client; swap in one with a stubbed transport
    // so the 404 path runs without a real request.
    (provider as any).client = new TiingoProvider('power-key', {
      fetchImplementation,
      maxAttempts: 1,
    });
    return provider;
  }

  beforeEach(() => {
    // The mock-data branch short-circuits before the API call under CI.
    delete process.env.GITHUB_ACTIONS;
    jest.spyOn(dbCache, 'getPriceHistory').mockResolvedValue(null);
    jest.spyOn(dbCache, 'savePriceHistory').mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalGithubActions === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = originalGithubActions;
    jest.restoreAllMocks();
  });

  it('records a coverage gap when Tiingo has no data for the symbol', async () => {
    jest.spyOn(dbCache, 'isCoverageGap').mockResolvedValue(false);
    const record = jest.spyOn(dbCache, 'recordCoverageGap').mockResolvedValue(undefined);
    const fetchImplementation = jest.fn().mockResolvedValue(response(404, {}));

    await expect(
      liveProvider(fetchImplementation).getPriceHistory('SSISLX', HISTORY_START, HISTORY_END),
    ).rejects.toBeInstanceOf(TiingoHttpError);

    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      ticker: 'SSISLX',
      provider: 'tiingo',
      statusCode: 404,
      endpoint: '/tiingo/daily',
    }));
  });

  it('skips the request entirely once a gap is cached', async () => {
    jest.spyOn(dbCache, 'isCoverageGap').mockResolvedValue(true);
    const record = jest.spyOn(dbCache, 'recordCoverageGap').mockResolvedValue(undefined);
    const fetchImplementation = jest.fn();

    await expect(
      liveProvider(fetchImplementation).getPriceHistory('O7PE', HISTORY_START, HISTORY_END),
    ).rejects.toBeInstanceOf(TiingoCoverageGapError);

    // The point of the whole change: no outbound request, no repeat report.
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('does not treat a server error as a coverage gap', async () => {
    jest.spyOn(dbCache, 'isCoverageGap').mockResolvedValue(false);
    const record = jest.spyOn(dbCache, 'recordCoverageGap').mockResolvedValue(undefined);
    const fetchImplementation = jest.fn().mockResolvedValue(response(500, {}));

    await expect(
      liveProvider(fetchImplementation).getPriceHistory('SPY', HISTORY_START, HISTORY_END),
    ).rejects.toBeInstanceOf(TiingoHttpError);

    // A 500 is transient; caching it would blind us to a symbol we do cover.
    expect(record).not.toHaveBeenCalled();
  });
});
