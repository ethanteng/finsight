import { MassiveProvider } from '../../data/providers/massive';

describe('MassiveProvider', () => {
  it('uses the canonical Massive host and requests only the two latest adjusted daily bars', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      status: 'DELAYED',
      results: [],
    }), { status: 200 }));
    const fetchImplementation = fetchMock as unknown as typeof fetch;
    const provider = new MassiveProvider('massive-key', {
      fetchImplementation,
      maxAttempts: 1,
    });

    await provider.getDailyBars('spy', '2026-08-01', '2026-08-17');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.hostname).toBe('api.massive.com');
    expect(requestUrl.pathname).toBe('/v2/aggs/ticker/SPY/range/1/day/2026-08-01/2026-08-17');
    expect(requestUrl.searchParams.get('adjusted')).toBe('true');
    expect(requestUrl.searchParams.get('sort')).toBe('desc');
    expect(requestUrl.searchParams.get('limit')).toBe('2');
    expect(requestUrl.searchParams.get('apiKey')).toBe('massive-key');
  });

  it('requests the latest Treasury curve and inflation expectations', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    fetchMock.mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    ));
    const fetchImplementation = fetchMock as unknown as typeof fetch;
    const provider = new MassiveProvider('massive-key', {
      fetchImplementation,
      maxAttempts: 1,
    });

    await provider.getLatestTreasuryYields();
    await provider.getLatestInflationExpectations();

    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.map(url => url.pathname)).toEqual([
      '/fed/v1/treasury-yields',
      '/fed/v1/inflation-expectations',
    ]);
    urls.forEach(url => {
      expect(url.searchParams.get('limit')).toBe('1');
      expect(url.searchParams.get('sort')).toBe('date.desc');
    });
  });

  it('retries a 429 once using Retry-After and then succeeds', async () => {
    const fetchImplementation = jest.fn()
      .mockResolvedValueOnce(new Response('{}', {
        status: 429,
        headers: { 'retry-after': '0.25' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ date: '2026-08-14' }] }), {
        status: 200,
      })) as unknown as jest.MockedFunction<typeof fetch>;
    const sleep = jest.fn().mockResolvedValue(undefined);
    const provider = new MassiveProvider('massive-key', {
      fetchImplementation,
      sleep,
      maxAttempts: 2,
    });

    const result = await provider.getLatestTreasuryYields();

    expect(result.results?.[0].date).toBe('2026-08-14');
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it('waits for the next rate-limit window when a 429 omits Retry-After', async () => {
    const fetchImplementation = jest.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 })) as unknown as jest.MockedFunction<typeof fetch>;
    const sleep = jest.fn().mockResolvedValue(undefined);
    const provider = new MassiveProvider('massive-key', {
      fetchImplementation,
      sleep,
      maxAttempts: 2,
    });

    await provider.getLatestTreasuryYields();

    expect(sleep).toHaveBeenCalledWith(60_000);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable HTTP failures', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    fetchMock.mockResolvedValue(new Response('{}', { status: 403 }));
    const fetchImplementation = fetchMock as unknown as typeof fetch;
    const sleep = jest.fn().mockResolvedValue(undefined);
    const provider = new MassiveProvider('massive-key', {
      fetchImplementation,
      sleep,
      maxAttempts: 2,
    });

    await expect(provider.getLatestTreasuryYields()).rejects.toThrow(
      'Massive API error for /fed/v1/treasury-yields: HTTP 403',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('fails before making a request when no API key is configured', async () => {
    const fetchMock = jest.fn();
    const fetchImplementation = fetchMock as unknown as typeof fetch;
    const provider = new MassiveProvider('  ', { fetchImplementation });

    await expect(provider.getLatestInflationExpectations()).rejects.toThrow(
      'MASSIVE_API_KEY or POLYGON_API_KEY is not configured',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
