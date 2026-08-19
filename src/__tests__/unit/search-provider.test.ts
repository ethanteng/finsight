jest.unmock('../../data/providers/search');

import { SearchProvider } from '../../data/providers/search';

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
