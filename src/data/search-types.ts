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

