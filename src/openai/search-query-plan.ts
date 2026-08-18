import {
  SEARCH_FRESHNESS_VALUES,
  SEARCH_QUERY_PURPOSES,
  type PlannedSearchQuery,
  type SearchFreshness,
  type SearchQueryPurpose,
} from '../data/search-types';

export const MAX_SEARCH_QUERIES = 3;
export const MAX_SEARCH_QUERY_CHARACTERS = 240;
export const MAX_SEARCH_QUERY_WORDS = 32;

const PURPOSE_SET = new Set<string>(SEARCH_QUERY_PURPOSES);
const FRESHNESS_SET = new Set<string>(SEARCH_FRESHNESS_VALUES);

// These checks are a data-loss boundary, not a language router. Search queries
// leave Ask Linc, so obvious identifiers must never be forwarded even when a
// model accidentally copies them out of the decision transcript.
const SENSITIVE_QUERY_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:\d[ -]*?){12,19}\b/,
];

export const SEARCH_QUERY_JSON_SCHEMA = {
  type: 'array',
  maxItems: MAX_SEARCH_QUERIES,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['query', 'purpose', 'freshness'],
    properties: {
      query: { type: 'string' },
      purpose: { type: 'string', enum: [...SEARCH_QUERY_PURPOSES] },
      freshness: {
        type: ['string', 'null'],
        enum: [...SEARCH_FRESHNESS_VALUES, null],
      },
    },
  },
} as const;

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function isSafeSearchQuery(query: string): boolean {
  if (!query || query.length > MAX_SEARCH_QUERY_CHARACTERS) return false;
  if (query.split(/\s+/).length > MAX_SEARCH_QUERY_WORDS) return false;
  if (Array.from(query).some((character) => {
    const codePoint = character.charCodeAt(0);
    return codePoint <= 31 || codePoint === 127;
  })) return false;
  return !SENSITIVE_QUERY_PATTERNS.some((pattern) => pattern.test(query));
}

/** Validate, normalize and deduplicate model-proposed public web queries. */
export function parsePlannedSearchQueries(raw: unknown): PlannedSearchQuery[] {
  if (!Array.isArray(raw)) return [];

  const queries: PlannedSearchQuery[] = [];
  const seen = new Set<string>();
  for (const value of raw.slice(0, MAX_SEARCH_QUERIES)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    if (typeof record.query !== 'string') continue;
    const query = normalizeQuery(record.query);
    if (!isSafeSearchQuery(query)) continue;
    if (typeof record.purpose !== 'string' || !PURPOSE_SET.has(record.purpose)) continue;
    const freshness = record.freshness;
    if (freshness !== null && (typeof freshness !== 'string' || !FRESHNESS_SET.has(freshness))) continue;

    const key = `${query.toLocaleLowerCase('en-US')}\u0000${freshness ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push({
      query,
      purpose: record.purpose as SearchQueryPurpose,
      freshness: freshness as SearchFreshness | null,
    });
  }
  return queries;
}

/**
 * A selected search pack without a usable public query is an inconsistent
 * model plan. Throwing lets the existing planner fallback and primary audit
 * recover without silently sending the raw financial prompt to Brave.
 */
export function validateSearchPlan(
  searchContextSelected: boolean,
  queries: readonly PlannedSearchQuery[]
): void {
  if (searchContextSelected && queries.length === 0) {
    throw new Error('Context planner selected search_context without a valid standalone search query.');
  }
  if (!searchContextSelected && queries.length > 0) {
    throw new Error('Context planner returned search queries without selecting search_context.');
  }
}
