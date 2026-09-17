/**
 * One searchable directory of institutions across both account providers.
 *
 * The accounts page used to show a "Connect Account" button per provider, which
 * asked the user a question they have no way to answer: whether their bank or
 * brokerage is reachable through Plaid or through SnapTrade. That is our
 * plumbing, not their concern. This module answers it instead -- the user names
 * the institution, and the search says which flow can actually connect it.
 *
 * Deliberately one row per (institution, provider) pair rather than one row per
 * brand. Several large firms are in both directories, and there the two rows are
 * genuinely different connections: Plaid brings in the bank side, SnapTrade the
 * brokerage side. Collapsing them would force a guess back onto the caller.
 */

import { CountryCode, Products, type Institution } from 'plaid';

export type ConnectionProvider = 'plaid' | 'snaptrade';

export interface InstitutionOption {
  /** Stable list key; also what the client echoes back when launching a flow. */
  id: string;
  provider: ConnectionProvider;
  name: string;
  /**
   * The provider's own identifier: a Plaid `institution_id`, or a SnapTrade
   * brokerage slug. SnapTrade takes its slug as `broker` and opens the portal
   * on that brokerage; Plaid has no general pre-selection, so for Plaid rows
   * this travels for logging and future use rather than to skip a step.
   */
  providerInstitutionId: string;
  /** A logo the picker can render, already normalized to something `src` accepts. */
  logoUrl: string | null;
  /** What this particular connection brings in, so two rows for one brand read differently. */
  covers: string;
}

export interface InstitutionSearchResult {
  institutions: InstitutionOption[];
  /** Providers that could not be searched, so the UI can say the list is partial. */
  degradedProviders: ConnectionProvider[];
}

/** What each provider is actually good for, in the user's terms rather than ours. */
export const PROVIDER_COVERAGE: Record<ConnectionProvider, string> = {
  plaid: 'Checking, savings, credit cards & loans',
  snaptrade: 'Brokerage, retirement & investment holdings',
};

/** Plaid returns up to 50; a picker is not a directory, so keep the payload small. */
const MAX_RESULTS_PER_PROVIDER = 8;

/** Below this a query matches nearly everything, which is noise rather than a result. */
export const MIN_QUERY_LENGTH = 2;

/**
 * SnapTrade's brokerage list is a static-ish reference table of ~100 rows, so it
 * is fetched once and reused. Six hours is short enough that a newly supported
 * brokerage appears the same day and long enough that a typing user does not
 * spend a provider call per keystroke.
 */
const BROKERAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface SnapTradeBrokerage {
  slug?: string;
  name?: string;
  display_name?: string;
  aws_s3_logo_url?: string;
  aws_s3_square_logo_url?: string | null;
  enabled?: boolean;
  maintenance_mode?: boolean;
}

/** Just the two provider calls this module needs, so tests can supply them directly. */
export interface InstitutionDirectoryDeps {
  searchPlaidInstitutions: (query: string) => Promise<Institution[]>;
  listSnapTradeBrokerages: () => Promise<SnapTradeBrokerage[]>;
}

/**
 * Fold a display name down to something two directories can be compared on:
 * case, punctuation, and the corporate suffixes only one of them tends to
 * carry ("Fidelity Investments" vs "Fidelity").
 */
export function normalizeInstitutionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(inc|llc|ltd|corp|co|na|the)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Rank a name against the query: an exact hit first, then a prefix, then a
 * word-boundary hit, then a bare substring. Without this "Chase" surfaces
 * "JPMorgan Chase Private Bank" above "Chase", which reads as a broken search.
 */
function relevance(name: string, query: string): number {
  const haystack = normalizeInstitutionName(name);
  const needle = normalizeInstitutionName(query);
  if (!needle) return 4;
  if (haystack === needle) return 0;
  if (haystack.startsWith(needle)) return 1;
  if (new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(haystack)) return 2;
  if (haystack.includes(needle)) return 3;
  return 4;
}

/**
 * Plaid ships logos as bare base64 PNG payloads, not URLs. Handing that
 * straight to an `<img src>` renders a broken image, so it becomes a data URI
 * here -- while a value that already looks like a URL is passed through, since
 * SnapTrade's logos arrive that way.
 */
export function toLogoSource(logo: string | null | undefined): string | null {
  if (!logo) return null;
  const trimmed = logo.trim();
  if (!trimmed) return null;
  if (/^(https?:|data:)/i.test(trimmed)) return trimmed;
  return `data:image/png;base64,${trimmed}`;
}

function plaidOptions(institutions: Institution[]): InstitutionOption[] {
  return institutions
    .filter(institution => institution?.institution_id && institution?.name)
    .map(institution => ({
      id: `plaid:${institution.institution_id}`,
      provider: 'plaid' as const,
      name: institution.name,
      providerInstitutionId: institution.institution_id,
      logoUrl: toLogoSource(institution.logo),
      covers: PROVIDER_COVERAGE.plaid,
    }));
}

function snapTradeOptions(brokerages: SnapTradeBrokerage[], query: string): InstitutionOption[] {
  const needle = normalizeInstitutionName(query);
  if (!needle) return [];

  return brokerages
    .filter(brokerage => {
      // `enabled: false` means SnapTrade will not accept a new connection, and
      // maintenance mode means not right now. Offering either sends the user
      // into a portal that cannot finish.
      if (brokerage?.enabled === false) return false;
      if (brokerage?.maintenance_mode === true) return false;
      return Boolean(brokerage?.slug);
    })
    .filter(brokerage => {
      const candidates = [brokerage.display_name, brokerage.name, brokerage.slug];
      return candidates.some(
        candidate => typeof candidate === 'string' && normalizeInstitutionName(candidate).includes(needle),
      );
    })
    .map(brokerage => ({
      id: `snaptrade:${brokerage.slug}`,
      provider: 'snaptrade' as const,
      name: brokerage.display_name || brokerage.name || brokerage.slug!,
      providerInstitutionId: brokerage.slug!,
      logoUrl: toLogoSource(brokerage.aws_s3_square_logo_url || brokerage.aws_s3_logo_url),
      covers: PROVIDER_COVERAGE.snaptrade,
    }));
}

/**
 * Order the merged list so the best match leads and a brand present in both
 * directories keeps its two rows adjacent -- a user who searched "Fidelity"
 * should see both of their Fidelity choices together, not separated by Fidelity
 * Charitable.
 */
export function mergeInstitutionOptions(
  plaid: InstitutionOption[],
  snaptrade: InstitutionOption[],
  query: string,
): InstitutionOption[] {
  const ranked = [...plaid, ...snaptrade].map(option => ({
    option,
    rank: relevance(option.name, query),
    key: normalizeInstitutionName(option.name),
  }));

  // Group rank is the best rank any row for that brand earned, so the two rows
  // of a strong match do not split around a weaker brand between them.
  const groupRank = new Map<string, number>();
  for (const entry of ranked) {
    const current = groupRank.get(entry.key);
    if (current === undefined || entry.rank < current) groupRank.set(entry.key, entry.rank);
  }

  return ranked
    .sort((a, b) => {
      const byGroup = groupRank.get(a.key)! - groupRank.get(b.key)!;
      if (byGroup !== 0) return byGroup;
      const byName = a.key.localeCompare(b.key);
      if (byName !== 0) return byName;
      // Within one brand, list the bank side first: it is the more common
      // reason to be adding an account, and it keeps the order stable.
      if (a.option.provider !== b.option.provider) {
        return a.option.provider === 'plaid' ? -1 : 1;
      }
      return a.option.name.localeCompare(b.option.name);
    })
    .map(entry => entry.option);
}

/**
 * Search both directories.
 *
 * One provider failing degrades the list rather than the request: a SnapTrade
 * outage must not stop someone connecting their bank. The providers that failed
 * are named in the result so the UI can say the list is short rather than
 * implying the missing institutions are unsupported.
 */
export async function searchInstitutions(
  query: string,
  deps: InstitutionDirectoryDeps,
): Promise<InstitutionSearchResult> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return { institutions: [], degradedProviders: [] };
  }

  const [plaidResult, snapTradeResult] = await Promise.allSettled([
    deps.searchPlaidInstitutions(trimmed),
    deps.listSnapTradeBrokerages(),
  ]);

  const degradedProviders: ConnectionProvider[] = [];

  let plaid: InstitutionOption[] = [];
  if (plaidResult.status === 'fulfilled') {
    plaid = plaidOptions(plaidResult.value).slice(0, MAX_RESULTS_PER_PROVIDER);
  } else {
    console.warn('Institution search: Plaid lookup failed:', plaidResult.reason);
    degradedProviders.push('plaid');
  }

  let snaptrade: InstitutionOption[] = [];
  if (snapTradeResult.status === 'fulfilled') {
    // Rank before capping. Plaid returns its own list already ordered by
    // relevance, but the brokerage table is a static list in its own order, so
    // taking the first eight matches could drop the exact hit the user typed.
    snaptrade = snapTradeOptions(snapTradeResult.value, trimmed)
      .sort((a, b) => relevance(a.name, trimmed) - relevance(b.name, trimmed))
      .slice(0, MAX_RESULTS_PER_PROVIDER);
  } else {
    console.warn('Institution search: SnapTrade lookup failed:', snapTradeResult.reason);
    degradedProviders.push('snaptrade');
  }

  return {
    institutions: mergeInstitutionOptions(plaid, snaptrade, trimmed),
    degradedProviders,
  };
}

/** Process-local memo for the brokerage reference table. Exported for tests to reset. */
let brokerageCache: { fetchedAt: number; brokerages: SnapTradeBrokerage[] } | null = null;

export function resetBrokerageCache(): void {
  brokerageCache = null;
}

export async function cachedBrokerages(
  fetchBrokerages: () => Promise<SnapTradeBrokerage[]>,
  now: number = Date.now(),
): Promise<SnapTradeBrokerage[]> {
  if (brokerageCache && now - brokerageCache.fetchedAt < BROKERAGE_CACHE_TTL_MS) {
    return brokerageCache.brokerages;
  }
  const brokerages = await fetchBrokerages();
  // Do not cache an empty list: a transient provider blip would blank every
  // investment search row for the full TTL. Non-empty tables are stable enough
  // that the ordinary TTL is fine.
  if (brokerages.length > 0) {
    brokerageCache = { fetchedAt: now, brokerages };
  }
  return brokerages;
}

/**
 * The products the ordinary connect flow asks Plaid for.
 *
 * Must stay in step with `/plaid/create_link_token`: an institution listed here
 * that Link then refuses is a dead end offered in our own search results.
 */
export const PLAID_SEARCH_PRODUCTS: Products[] = [Products.Transactions];
export const PLAID_SEARCH_COUNTRIES: CountryCode[] = [CountryCode.Us];
