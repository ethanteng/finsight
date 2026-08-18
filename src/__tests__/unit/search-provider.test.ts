jest.unmock('../../data/providers/search');

import { SearchProvider } from '../../data/providers/search';

describe('Brave Search provider', () => {
  const originalGithubActions = process.env.GITHUB_ACTIONS;

  beforeEach(() => {
    delete process.env.GITHUB_ACTIONS;
    global.fetch = jest.fn();
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
    const provider = new SearchProvider('real-brave-key', 'brave');
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

  it('preserves provider failures instead of disguising them as zero results', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });
    const provider = new SearchProvider('real-brave-key', 'brave');

    await expect(provider.search('current mortgage rates', { freshness: 'pd' }))
      .rejects.toThrow('Brave search failed: 429');
  });
});
