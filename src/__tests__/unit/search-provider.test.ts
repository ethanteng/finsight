jest.unmock('../../data/providers/search');

import { BraveSearchRateLimiter, SearchProvider } from '../../data/providers/search';

describe('Brave Search provider', () => {
  const originalGithubActions = process.env.GITHUB_ACTIONS;
  const noWait = { waitForNextCall: jest.fn().mockResolvedValue(undefined) };
  const noSleep = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    delete process.env.GITHUB_ACTIONS;
    global.fetch = jest.fn();
    noWait.waitForNextCall.mockClear();
    noSleep.mockClear();
  });

  afterAll(() => {
    if (originalGithubActions === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = originalGithubActions;
  });

  it('uses Brave language and freshness parameters without rewriting the semantic query', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        web: {
          results: [{
            title: 'Federal Reserve',
            description: 'Current target range information.',
            url: 'https://federalreserve.gov/rates',
          }],
        },
      }),
    });
    const provider = new SearchProvider('real-brave-key', 'brave', {
      rateLimiter: noWait,
      sleep: noSleep,
    });
    const query = 'current Federal Reserve target interest rate';

    const results = await provider.search(query, { freshness: 'pm', maxResults: 3 });

    const requestedUrl = new URL((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(requestedUrl.searchParams.get('q')).toBe(query);
    expect(requestedUrl.searchParams.get('freshness')).toBe('pm');
    expect(requestedUrl.searchParams.get('search_lang')).toBe('en');
    expect(requestedUrl.searchParams.get('ui_lang')).toBe('en-US');
    expect(requestedUrl.searchParams.get('count')).toBe('3');
    expect(results).toEqual([expect.objectContaining({ url: 'https://federalreserve.gov/rates' })]);
  });

  it('preserves Brave result age and parses page_age as publication time', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        web: {
          results: [{
            title: 'Market update',
            description: 'Stocks moved after the announcement.',
            url: 'https://example.com/market-update',
            age: '2 hours ago',
            page_age: '2026-08-18T15:00:00Z',
          }],
        },
      }),
    });
    const provider = new SearchProvider('real-brave-key', 'brave', {
      rateLimiter: noWait,
      sleep: noSleep,
    });

    await expect(provider.search('market update')).resolves.toEqual([
      expect.objectContaining({
        age: '2 hours ago',
        publishedAt: '2026-08-18T15:00:00.000Z',
      }),
    ]);
  });

  it('preserves provider failures instead of disguising them as zero results', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });
    const provider = new SearchProvider('real-brave-key', 'brave', {
      rateLimiter: noWait,
      sleep: noSleep,
    });

    await expect(provider.search('current mortgage rates', { freshness: 'pd' }))
      .rejects.toThrow('Brave search failed: 429');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries a transient Brave failure and rate-limits every attempt', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => null } })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ web: { results: [] } }),
      });
    const provider = new SearchProvider('real-brave-key', 'brave', {
      rateLimiter: noWait,
      sleep: noSleep,
    });

    await expect(provider.search('current treasury yields')).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(noWait.waitForNextCall).toHaveBeenCalledTimes(2);
    expect(noSleep).toHaveBeenCalledWith(1000);
  });

  it('retries a 429 rather than reading the unlimited monthly window as spent', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers(PAID_PLAN_HEADERS),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ web: { results: [] } }),
      });
    const provider = new SearchProvider('real-brave-key', 'brave', {
      rateLimiter: noWait,
      sleep: noSleep,
    });

    await expect(provider.search('market update')).resolves.toEqual([]);
    // The per-second window resets in 1s. Honouring the monthly window's
    // month-long reset instead would exceed maxRetryDelayMs and drop the retry.
    expect(noSleep).toHaveBeenCalledWith(1000);
  });

  it('uses Brave reset and remaining headers for a bounded 429 retry', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({
          'x-ratelimit-remaining': '0, 1000',
          'x-ratelimit-reset': '0.25, 100000',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ web: { results: [] } }),
      });
    const provider = new SearchProvider('real-brave-key', 'brave', {
      rateLimiter: noWait,
      sleep: noSleep,
    });

    await expect(provider.search('market update')).resolves.toEqual([]);
    expect(noSleep).toHaveBeenCalledWith(250);
  });
});

/**
 * Headers observed on Brave's paid Search plan: 50 requests per second, and an
 * unlimited monthly allowance advertised as `limit 0, remaining 0` with Reset
 * counting down to the end of the month.
 */
const PAID_PLAN_HEADERS = {
  'x-ratelimit-limit': '50, 0',
  'x-ratelimit-policy': '50;w=1, 0;w=2678400',
  'x-ratelimit-remaining': '0, 0',
  'x-ratelimit-reset': '1, 704214',
};

describe('BraveSearchRateLimiter window accounting', () => {
  const originalInterval = process.env.BRAVE_MIN_REQUEST_INTERVAL_MS;

  const respond = (status: number, headers: Record<string, string>) =>
    ({ status, headers: new Headers(headers) }) as Response;

  beforeEach(() => {
    // Construction reads the floor, so set it before building a limiter.
    process.env.BRAVE_MIN_REQUEST_INTERVAL_MS = '0';
  });

  afterAll(() => {
    if (originalInterval === undefined) delete process.env.BRAVE_MIN_REQUEST_INTERVAL_MS;
    else process.env.BRAVE_MIN_REQUEST_INTERVAL_MS = originalInterval;
  });

  it('does not park the provider on a response Brave served', async () => {
    const limiter = new BraveSearchRateLimiter();

    limiter.observeResponse(respond(200, { ...PAID_PLAN_HEADERS, 'x-ratelimit-remaining': '49, 0' }));

    await expect(limiter.waitForNextCall()).resolves.toBeUndefined();
  });

  it('treats an unlimited monthly window as uncapped rather than exhausted', async () => {
    const limiter = new BraveSearchRateLimiter();

    // Remaining is 0 on both windows, but the monthly window meters nothing:
    // its limit is 0, so only the sub-second window is real backpressure. Were
    // the monthly window counted, this would throw instead of pausing briefly.
    limiter.observeResponse(respond(429, { ...PAID_PLAN_HEADERS, 'x-ratelimit-reset': '0.05, 704214' }));

    await expect(limiter.waitForNextCall()).resolves.toBeUndefined();
  });

  it('caps a metered window whose reset is further out than a retry can wait', async () => {
    const limiter = new BraveSearchRateLimiter();

    limiter.observeResponse(respond(429, {
      'x-ratelimit-limit': '1, 2000',
      'x-ratelimit-remaining': '0, 0',
      'x-ratelimit-reset': '1, 704214',
    }));

    // Never the 704214 seconds Brave reports: the block is bounded so the
    // provider re-probes instead of going dark for the rest of the month.
    await expect(limiter.waitForNextCall()).rejects.toThrow('quota is exhausted for another 60 seconds');
  });

  it('honours a short exhausted window from a refusal', async () => {
    const limiter = new BraveSearchRateLimiter();

    limiter.observeResponse(respond(429, {
      'x-ratelimit-limit': '50, 2000',
      'x-ratelimit-remaining': '0, 500',
      'x-ratelimit-reset': '30, 704214',
    }));

    await expect(limiter.waitForNextCall()).rejects.toThrow('quota is exhausted for another 30 seconds');
  });
});
