import { Products, type Institution } from 'plaid';
import {
  MIN_QUERY_LENGTH,
  PROVIDER_COVERAGE,
  cachedBrokerages,
  mergeInstitutionOptions,
  normalizeInstitutionName,
  resetBrokerageCache,
  searchInstitutions,
  toLogoSource,
  type InstitutionDirectoryDeps,
  type InstitutionOption,
  type SnapTradeBrokerage,
} from '../../services/institution-directory';

function plaidInstitution(overrides: Partial<Institution> = {}): Institution {
  return {
    institution_id: 'ins_1',
    name: 'Chase',
    products: [Products.Transactions],
    country_codes: [],
    routing_numbers: [],
    oauth: false,
    ...overrides,
  } as Institution;
}

function brokerage(overrides: Partial<SnapTradeBrokerage> = {}): SnapTradeBrokerage {
  return { slug: 'FIDELITY', name: 'Fidelity', display_name: 'Fidelity', enabled: true, ...overrides };
}

function deps(
  plaid: Institution[] | Error,
  snaptrade: SnapTradeBrokerage[] | Error,
): InstitutionDirectoryDeps {
  return {
    searchPlaidInstitutions: async () => {
      if (plaid instanceof Error) throw plaid;
      return plaid;
    },
    listSnapTradeBrokerages: async () => {
      if (snaptrade instanceof Error) throw snaptrade;
      return snaptrade;
    },
  };
}

describe('normalizeInstitutionName', () => {
  it('folds case, punctuation and corporate suffixes so two directories compare', () => {
    expect(normalizeInstitutionName('Fidelity Investments Inc.')).toBe('fidelity investments');
    expect(normalizeInstitutionName('E*TRADE')).toBe('e trade');
    expect(normalizeInstitutionName('Charles Schwab & Co.')).toBe('charles schwab and');
  });
});

describe('toLogoSource', () => {
  it('wraps a bare Plaid base64 payload so an img src can render it', () => {
    expect(toLogoSource('iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('passes a SnapTrade URL through untouched', () => {
    expect(toLogoSource('https://cdn.example.com/logo.png')).toBe('https://cdn.example.com/logo.png');
  });

  it('treats a missing or blank logo as no logo', () => {
    expect(toLogoSource(null)).toBeNull();
    expect(toLogoSource('   ')).toBeNull();
  });
});

describe('searchInstitutions', () => {
  it('declines a query too short to be a search', async () => {
    const short = 'x'.repeat(MIN_QUERY_LENGTH - 1);
    const searchPlaidInstitutions = jest.fn();
    const listSnapTradeBrokerages = jest.fn();

    const result = await searchInstitutions(short, {
      searchPlaidInstitutions,
      listSnapTradeBrokerages,
    });

    expect(result.institutions).toEqual([]);
    // No provider quota spent on a query that cannot discriminate.
    expect(searchPlaidInstitutions).not.toHaveBeenCalled();
    expect(listSnapTradeBrokerages).not.toHaveBeenCalled();
  });

  it('labels each row with the provider that can actually connect it', async () => {
    const result = await searchInstitutions(
      'chase',
      deps([plaidInstitution()], [brokerage()]),
    );

    expect(result.institutions).toEqual([
      expect.objectContaining({
        provider: 'plaid',
        name: 'Chase',
        providerInstitutionId: 'ins_1',
        covers: PROVIDER_COVERAGE.plaid,
      }),
    ]);
  });

  it('carries the SnapTrade slug through, since that is what pre-selects the portal', async () => {
    const result = await searchInstitutions(
      'fidelity',
      deps([], [brokerage({ slug: 'FIDELITY', display_name: 'Fidelity Investments' })]),
    );

    expect(result.institutions).toEqual([
      expect.objectContaining({
        provider: 'snaptrade',
        providerInstitutionId: 'FIDELITY',
        name: 'Fidelity Investments',
        covers: PROVIDER_COVERAGE.snaptrade,
      }),
    ]);
  });

  it('keeps both rows for a brand in both directories, rather than guessing one', async () => {
    const result = await searchInstitutions(
      'fidelity',
      deps([plaidInstitution({ institution_id: 'ins_fid', name: 'Fidelity' })], [brokerage()]),
    );

    expect(result.institutions.map(option => option.provider)).toEqual(['plaid', 'snaptrade']);
  });

  it('omits brokerages SnapTrade will not accept a new connection for', async () => {
    const result = await searchInstitutions(
      'fidelity',
      deps([], [
        brokerage({ slug: 'FIDELITY_OFF', enabled: false }),
        brokerage({ slug: 'FIDELITY_MAINT', maintenance_mode: true }),
      ]),
    );

    expect(result.institutions).toEqual([]);
  });

  it('still lists banks when SnapTrade is down, and says the list is partial', async () => {
    const result = await searchInstitutions(
      'chase',
      deps([plaidInstitution()], new Error('SnapTrade unavailable')),
    );

    expect(result.institutions).toHaveLength(1);
    expect(result.institutions[0].provider).toBe('plaid');
    expect(result.degradedProviders).toEqual(['snaptrade']);
  });

  it('still lists brokerages when Plaid is down', async () => {
    const result = await searchInstitutions(
      'fidelity',
      deps(new Error('Plaid unavailable'), [brokerage()]),
    );

    expect(result.institutions).toHaveLength(1);
    expect(result.institutions[0].provider).toBe('snaptrade');
    expect(result.degradedProviders).toEqual(['plaid']);
  });
});

describe('mergeInstitutionOptions', () => {
  function option(
    provider: 'plaid' | 'snaptrade',
    name: string,
  ): InstitutionOption {
    return {
      id: `${provider}:${name}`,
      provider,
      name,
      providerInstitutionId: name,
      logoUrl: null,
      covers: PROVIDER_COVERAGE[provider],
    };
  }

  it('puts an exact match above a longer name that merely contains the query', () => {
    const merged = mergeInstitutionOptions(
      [option('plaid', 'JPMorgan Chase Private Bank'), option('plaid', 'Chase')],
      [],
      'Chase',
    );

    expect(merged.map(entry => entry.name)).toEqual(['Chase', 'JPMorgan Chase Private Bank']);
  });

  it('keeps one brand\'s two rows adjacent instead of splitting them', () => {
    const merged = mergeInstitutionOptions(
      [option('plaid', 'Fidelity'), option('plaid', 'Fidelity Charitable')],
      [option('snaptrade', 'Fidelity')],
      'Fidelity',
    );

    expect(merged.map(entry => `${entry.name}/${entry.provider}`)).toEqual([
      'Fidelity/plaid',
      'Fidelity/snaptrade',
      'Fidelity Charitable/plaid',
    ]);
  });
});

describe('cachedBrokerages', () => {
  beforeEach(() => resetBrokerageCache());
  afterAll(() => resetBrokerageCache());

  it('fetches once and reuses the reference table within its window', async () => {
    const fetchBrokerages = jest.fn().mockResolvedValue([brokerage()]);

    await cachedBrokerages(fetchBrokerages, 0);
    await cachedBrokerages(fetchBrokerages, 60_000);

    expect(fetchBrokerages).toHaveBeenCalledTimes(1);
  });

  it('refetches once the window has passed, so a newly supported brokerage appears', async () => {
    const fetchBrokerages = jest.fn().mockResolvedValue([brokerage()]);

    await cachedBrokerages(fetchBrokerages, 0);
    await cachedBrokerages(fetchBrokerages, 7 * 60 * 60 * 1000);

    expect(fetchBrokerages).toHaveBeenCalledTimes(2);
  });

  it('does not cache an empty list, so a transient blank response does not blank investment search for hours', async () => {
    const fetchBrokerages = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([brokerage()]);

    expect(await cachedBrokerages(fetchBrokerages, 0)).toEqual([]);
    expect(await cachedBrokerages(fetchBrokerages, 60_000)).toEqual([
      expect.objectContaining({ slug: 'FIDELITY' }),
    ]);
    expect(fetchBrokerages).toHaveBeenCalledTimes(2);
  });
});

describe('result caps', () => {
  it('keeps the exact brokerage match when more match than fit', async () => {
    // The brokerage table has its own order, so an exact hit sitting late in it
    // must not be the one that falls off the end of the list.
    const many = Array.from({ length: 12 }, (_, index) => ({
      slug: `SCHWAB_SUB_${index}`,
      display_name: `Schwab Subsidiary ${index}`,
      enabled: true,
    }));
    const exact = { slug: 'SCHWAB', display_name: 'Schwab', enabled: true };

    const result = await searchInstitutions('schwab', deps([], [...many, exact]));

    expect(result.institutions[0]).toEqual(
      expect.objectContaining({ providerInstitutionId: 'SCHWAB' }),
    );
    expect(result.institutions).toHaveLength(8);
  });
});

describe('cachedBrokerages degraded responses', () => {
  beforeEach(() => resetBrokerageCache());
  afterAll(() => resetBrokerageCache());

  it('does not cache an empty brokerage list', async () => {
    // Roughly a hundred brokerages exist, so empty is a degraded reply that
    // happened to arrive as a 200. Caching it would hide every brokerage from
    // the picker for the whole TTL over one bad response.
    const fetchBrokerages = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([brokerage()]);

    const first = await cachedBrokerages(fetchBrokerages, 0);
    const second = await cachedBrokerages(fetchBrokerages, 1_000);

    expect(first).toEqual([]);
    expect(second).toHaveLength(1);
    expect(fetchBrokerages).toHaveBeenCalledTimes(2);
  });
});
