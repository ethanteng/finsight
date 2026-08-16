/**
 * Grouping-label normalization (frontend copy of
 * `src/services/label-normalization.ts` — keep the two in sync).
 *
 * Any bucket keyed by a raw provider string splits when two providers spell the
 * same thing differently: Plaid sends lowercase investment transaction types
 * ("buy"), SnapTrade sends uppercase activity types ("BUY"), and provider
 * taxonomies mix snake_case with spaced words.
 */

/** Case-folded grouping key: lowercase, separators and whitespace collapsed. */
export function labelKey(value: unknown): string {
  return String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    // Trim last: separators become spaces, so a placeholder like "-" or "__"
    // would otherwise fold to a truthy " " and produce a blank bucket instead of
    // taking the Unknown fallback.
    .trim()
    .toLowerCase();
}

/**
 * Title-cased display label for a raw grouping value. Values differing only by
 * case, separator, or whitespace always produce the same label.
 */
export function normalizeLabel(value: unknown, fallback = 'Unknown'): string {
  const key = labelKey(value);
  if (!key) return fallback;
  return key.replace(/\b\w/g, character => character.toUpperCase());
}
