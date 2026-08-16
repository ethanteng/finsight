import {
  getProviderCatalog,
  resetCatalogCache,
  verifyAgainstCatalog,
} from '../../openai/model-catalog';

const originalFetch = global.fetch;

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

describe('model catalog', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetCatalogCache();
    process.env.ANTHROPIC_API_KEY = 'test-anthropic';
    process.env.OPENAI_API_KEY = 'test-openai';
    process.env.GOOGLE_AI_API_KEY = 'test-google';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('lists Anthropic models and marks them chat-capable', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        data: [{ id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8' }],
        has_more: false,
      })
    ) as unknown as typeof fetch;

    const catalog = await getProviderCatalog('anthropic');

    expect(catalog.models).toEqual([
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', recommended: true },
    ]);
  });

  it('follows Anthropic pagination', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: 'claude-opus-4-8' }], has_more: true, last_id: 'claude-opus-4-8' })
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'claude-sonnet-5' }], has_more: false }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const catalog = await getProviderCatalog('anthropic');

    expect(catalog.models?.map(entry => entry.id)).toEqual(['claude-opus-4-8', 'claude-sonnet-5']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('separates OpenAI chat models from single-purpose ones', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { id: 'gpt-4o' },
          { id: 'text-embedding-3-large' },
          { id: 'whisper-1' },
          { id: 'gpt-4o-audio-preview' },
          { id: 'o3-mini' },
        ],
      })
    ) as unknown as typeof fetch;

    const catalog = await getProviderCatalog('openai');
    const recommended = catalog.models?.filter(entry => entry.recommended).map(entry => entry.id);

    expect(recommended).toEqual(['gpt-4o', 'o3-mini']);
    // Everything the provider returned stays selectable, just not promoted.
    expect(catalog.models).toHaveLength(5);
  });

  it('strips the models/ prefix and drops Gemini models that cannot generate', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        models: [
          { name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        ],
      })
    ) as unknown as typeof fetch;

    const catalog = await getProviderCatalog('google');

    expect(catalog.models).toEqual([
      { id: 'gemini-3-flash-preview', label: undefined, recommended: true },
    ]);
  });

  it('reports unavailable rather than empty when the provider errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({}),
    } as Response) as unknown as typeof fetch;

    const catalog = await getProviderCatalog('openai');

    expect(catalog.models).toBeNull();
    expect(catalog.unavailableReason).toContain('401');
  });

  it('reports unavailable when no API key is configured', async () => {
    delete process.env.GOOGLE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    global.fetch = jest.fn() as unknown as typeof fetch;

    const catalog = await getProviderCatalog('google');

    expect(catalog.models).toBeNull();
    expect(catalog.unavailableReason).toContain('No API key');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not cache a failed lookup', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) })
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'gpt-4o' }] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    expect((await getProviderCatalog('openai')).models).toBeNull();
    expect((await getProviderCatalog('openai')).models).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches a successful lookup', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'gpt-4o' }] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await getProviderCatalog('openai');
    await getProviderCatalog('openai');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('verifyAgainstCatalog', () => {
    const fetchedAt = '2026-08-16T00:00:00.000Z';

    it('confirms a model the provider serves', () => {
      const catalog = {
        provider: 'openai' as const,
        models: [{ id: 'gpt-4o', recommended: true }],
        fetchedAt,
      };
      expect(verifyAgainstCatalog(catalog, 'gpt-4o')).toEqual({ status: 'served' });
    });

    it('flags a model the provider does not serve', () => {
      const catalog = {
        provider: 'openai' as const,
        models: [{ id: 'gpt-4o', recommended: true }],
        fetchedAt,
      };
      expect(verifyAgainstCatalog(catalog, 'gpt-4-turbo-typo')).toEqual({ status: 'not_served' });
    });

    it('reports unverified — never not_served — when the catalog is unavailable', () => {
      const catalog = {
        provider: 'openai' as const,
        models: null,
        unavailableReason: 'Could not reach OpenAI: 500',
        fetchedAt,
      };
      expect(verifyAgainstCatalog(catalog, 'anything')).toEqual({
        status: 'unverified',
        reason: 'Could not reach OpenAI: 500',
      });
    });
  });
});
