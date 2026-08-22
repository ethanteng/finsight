export const SEARCH_FRESHNESS_VALUES = ['pd', 'pw', 'pm', 'py'] as const;

export type SearchFreshness = (typeof SEARCH_FRESHNESS_VALUES)[number];

export const SEARCH_QUERY_PURPOSES = ['rate', 'rule', 'price', 'news', 'other'] as const;

export type SearchQueryPurpose = (typeof SEARCH_QUERY_PURPOSES)[number];

/**
 * A public, standalone web query derived from the active financial decision.
 * Models may propose these values, but application code validates them before
 * anything is sent to an external search provider.
 */
export interface PlannedSearchQuery {
  query: string;
  purpose: SearchQueryPurpose;
  freshness: SearchFreshness | null;
}


/** A single public search result, kept for admin review of what grounded an answer. */
export interface SearchResultEvidence {
  title: string;
  url: string;
  source: string;
  snippet: string;
  /** Provider publication age string, when it gave one. */
  age?: string;
  publishedAt?: string;
}

/**
 * What actually happened to one planned query: whether it hit the cache or the
 * provider, whether it came back, and what it returned. Recorded per query so a
 * plan that half-failed is not summarized away into a single result count.
 */
export interface SearchQueryEvidence extends PlannedSearchQuery {
  source: 'cache' | 'provider';
  status: 'succeeded' | 'failed';
  resultCount: number;
  /** Provider or rate-limit failure message; present only when status is failed. */
  error?: string;
  results: SearchResultEvidence[];
}

/** Evidence records are persisted with every answer, so they are bounded. */
export const SEARCH_EVIDENCE_LIMITS = {
  queries: 8,
  resultsPerQuery: 5,
  snippetCharacters: 320,
  errorCharacters: 240,
} as const;

function truncate(text: string, limit: number): string {
  const trimmed = (text || '').trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1).trimEnd()}…` : trimmed;
}

/** Bound a live query outcome to what is worth persisting beside an answer. */
export function compactSearchQueryEvidence(
  outcomes: readonly SearchQueryEvidence[]
): SearchQueryEvidence[] {
  return outcomes.slice(0, SEARCH_EVIDENCE_LIMITS.queries).map((outcome) => ({
    ...outcome,
    ...(outcome.error
      ? { error: truncate(outcome.error, SEARCH_EVIDENCE_LIMITS.errorCharacters) }
      : {}),
    results: outcome.results.slice(0, SEARCH_EVIDENCE_LIMITS.resultsPerQuery).map((result) => ({
      title: truncate(result.title, 200),
      url: result.url,
      source: result.source,
      snippet: truncate(result.snippet, SEARCH_EVIDENCE_LIMITS.snippetCharacters),
      ...(result.age ? { age: result.age } : {}),
      ...(result.publishedAt ? { publishedAt: result.publishedAt } : {}),
    })),
  }));
}
