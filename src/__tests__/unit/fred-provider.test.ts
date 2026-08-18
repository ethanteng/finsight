import { cacheService } from '../../data/cache';

const fredModule = jest.requireActual<typeof import('../../data/providers/fred')>(
  '../../data/providers/fred'
);
const { FREDProvider } = fredModule;

type MockFetch = jest.MockedFunction<typeof fetch>;

function fredResponse(observations: Array<{ date: string; value: string }>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue({ observations }),
  } as unknown as Response;
}

describe('FREDProvider', () => {
  const originalFetch = global.fetch;
  const originalGithubActions = process.env.GITHUB_ACTIONS;
  let fetchMock: MockFetch;

  beforeEach(async () => {
    delete process.env.GITHUB_ACTIONS;
    await cacheService.invalidate('fred:');
    fetchMock = jest.fn() as MockFetch;
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalGithubActions === undefined) {
      delete process.env.GITHUB_ACTIONS;
    } else {
      process.env.GITHUB_ACTIONS = originalGithubActions;
    }
    jest.restoreAllMocks();
  });

  it('requests the canonical series and transforms CPI into year-over-year percent', async () => {
    const values: Record<string, string> = {
      CPIAUCSL: '3.2',
      DFF: '4.5',
      MORTGAGE30US: '6.4',
      TERMCBCCALLNS: '22.8',
      UNRATE: '4.1',
      DGS10: '4.25',
      NDR12MCD: '1.7',
    };

    fetchMock.mockImplementation(async (input) => {
      const url = new URL(input.toString());
      const seriesId = url.searchParams.get('series_id') || '';
      const observations = seriesId === 'DGS10'
        ? [
            { date: '2026-08-16', value: '.' },
            { date: '2026-08-15', value: values[seriesId] },
          ]
        : [{ date: '2026-08-01', value: values[seriesId] }];
      return fredResponse(observations);
    });

    const indicators = await new FREDProvider('real_key_for_test').getEconomicIndicators();

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(indicators.cpi).toMatchObject({
      value: 3.2,
      seriesId: 'CPIAUCSL',
      unit: 'percent',
      transformation: 'pc1',
    });
    expect(indicators.creditCardAPR?.value).toBe(22.8);
    expect(indicators.treasury10Y).toMatchObject({ value: 4.25, date: '2026-08-15' });
    expect(indicators.cd12Month?.value).toBe(1.7);

    const urls = fetchMock.mock.calls.map(([input]) => new URL(input.toString()));
    expect(urls.map((url) => url.searchParams.get('series_id')).sort()).toEqual([
      'CPIAUCSL',
      'DFF',
      'DGS10',
      'MORTGAGE30US',
      'NDR12MCD',
      'TERMCBCCALLNS',
      'UNRATE',
    ].sort());
    const cpiUrl = urls.find((url) => url.searchParams.get('series_id') === 'CPIAUCSL');
    expect(cpiUrl?.searchParams.get('units')).toBe('pc1');
    expect(urls.every((url) => url.searchParams.get('limit') === '12')).toBe(true);
    expect(urls.every((url) => url.searchParams.get('sort_order') === 'desc')).toBe(true);
  });

  it('returns partial live data instead of substituting hardcoded rates', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(input.toString());
      const seriesId = url.searchParams.get('series_id');
      if (seriesId === 'MORTGAGE30US') return fredResponse([], 503);
      return fredResponse([{ date: '2026-08-01', value: '4.2' }]);
    });

    const indicators = await new FREDProvider('real_key_for_test').getEconomicIndicators();

    expect(indicators.mortgageRate).toBeUndefined();
    expect(indicators.cpi?.source).toBe('FRED');
    expect(Object.values(indicators)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'FRED (fallback)' })])
    );
  });

  it('fails clearly when no configured series can be fetched', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockResolvedValue(fredResponse([], 503));

    await expect(
      new FREDProvider('real_key_for_test').getEconomicIndicators()
    ).rejects.toThrow('FRED returned no usable economic indicators');
  });

  it('does not make requests without a configured API key', async () => {
    await expect(new FREDProvider('   ').getEconomicIndicators()).rejects.toThrow(
      'FRED_API_KEY is not configured'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not cache a missing observation and uses the next numeric observation', async () => {
    fetchMock
      .mockResolvedValueOnce(fredResponse([
        { date: '2026-08-16', value: '.' },
        { date: '2026-08-15', value: 'not-a-number' },
      ]))
      .mockResolvedValueOnce(fredResponse([
        { date: '2026-08-17', value: '.' },
        { date: '2026-08-16', value: '4.31' },
      ]));

    const provider = new FREDProvider('real_key_for_test');
    await expect(provider.getDataPoint('DGS10')).rejects.toThrow('no numeric observations');
    await expect(provider.getDataPoint('DGS10')).resolves.toMatchObject({
      value: 4.31,
      date: '2026-08-16',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches mock-mode observations so repeated reads stay identical', async () => {
    const provider = new FREDProvider('test_fred_key');

    const first = await provider.getDataPoint('DFF');
    const second = await provider.getDataPoint('DFF');

    expect(first).toEqual(second);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caches valid observations by series and transformation', async () => {
    fetchMock.mockResolvedValue(fredResponse([{ date: '2026-08-01', value: '3.0' }]));
    const provider = new FREDProvider('real_key_for_test');

    await provider.getDataPoint('CPIAUCSL', { units: 'pc1' });
    await provider.getDataPoint('CPIAUCSL', { units: 'pc1' });
    await expect(provider.getDataPoint('CPIAUCSL', { units: 'lin' })).resolves.toMatchObject({
      unit: 'index',
      transformation: 'lin',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('omits leading missing CPI levels and forward-fills only after real data', async () => {
    fetchMock.mockResolvedValue(fredResponse([
      { date: '2026-01-01', value: '.' },
      { date: '2026-02-01', value: '320.1' },
      { date: '2026-03-01', value: '.' },
    ]));

    const observations = await new FREDProvider('real_key_for_test').getCPIObservations(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-03-31T00:00:00Z')
    );

    expect(observations).toEqual([
      { date: '2026-02-01', value: 320.1 },
      { date: '2026-03-01', value: 320.1 },
    ]);
  });
});
