/**
 * Grouping-label normalization.
 *
 * Any bucket keyed by a raw provider string splits when two providers spell the
 * same thing differently — Plaid sends lowercase investment transaction types
 * ("buy"), SnapTrade sends uppercase activity types ("BUY"), and provider
 * taxonomies mix snake_case with spaced words. Consumers downstream then key
 * those buckets case-insensitively (canonical fact ids do), so a split bucket
 * can turn into a silently dropped one.
 *
 * `normalizeLabel` maps a raw value to a single display label derived only from
 * the case-folded value, so grouping is order-independent: whichever spelling
 * arrives first, the bucket is the same.
 */

/** Case-folded grouping key: lowercase, separators and whitespace collapsed. */
export function labelKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
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
