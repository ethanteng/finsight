/**
 * Asset-class label normalization.
 *
 * Holding/security types arrive from several providers with different casing and
 * wording for the same asset class: Plaid returns lowercase types ("etf",
 * "mutual fund", "cash"), SnapTrade returns human descriptions ("ETF",
 * "Common Stock", "Security type is not defined"), and manual accounts get their
 * own label. Bucketing allocation by the raw string therefore splits one asset
 * class into several rows (e.g. "etf" and "ETF" side by side).
 *
 * `normalizeAssetType` maps every raw value to a single display label. The label
 * is derived only from the case-folded value, so two spellings of the same type
 * always collapse to the same bucket regardless of the order they are seen in.
 */

import { labelKey, normalizeLabel } from './label-normalization';

const ASSET_TYPE_ALIASES: Record<string, string> = {
  // Cash
  'cash': 'Cash',
  'cash equivalent': 'Cash',
  'cash equivalents': 'Cash',
  'money market': 'Cash',
  'money market fund': 'Cash',

  // Equity
  'equity': 'Equity',
  'equities': 'Equity',
  'stock': 'Equity',
  'stocks': 'Equity',
  'common stock': 'Equity',
  'preferred stock': 'Equity',

  // ETF
  'etf': 'ETF',
  'etfs': 'ETF',
  'exchange traded fund': 'ETF',
  'exchange-traded fund': 'ETF',

  // Mutual fund
  'mutual fund': 'Mutual Fund',
  'mutual funds': 'Mutual Fund',

  // Fixed income
  'fixed income': 'Fixed Income',
  'bond': 'Fixed Income',
  'bonds': 'Fixed Income',
  'treasury': 'Fixed Income',

  // Derivatives
  'derivative': 'Derivative',
  'derivatives': 'Derivative',
  'option': 'Options',
  'options': 'Options',

  // Crypto
  'crypto': 'Cryptocurrency',
  'cryptocurrency': 'Cryptocurrency',
  'digital currency': 'Cryptocurrency',

  // Other provider buckets
  'loan': 'Loan',
  'other': 'Other',
  'manual investments': 'Manual Investments',

  // Missing / undefined types
  'unknown': 'Unknown',
  'security type is not defined': 'Unknown',
  'not defined': 'Unknown',
  'n/a': 'Unknown',
  'none': 'Unknown',
};

/** Canonical label used when a holding has no usable type at all. */
export const UNKNOWN_ASSET_TYPE = 'Unknown';

function caseFoldKey(value: unknown): string {
  // Separators fold too, so a provider sending "FIXED_INCOME" or "mutual-fund"
  // still matches the alias table rather than becoming its own bucket.
  return labelKey(value);
}

/**
 * Map a raw provider asset/security type to the label used for grouping and
 * display. Values that differ only by casing or whitespace always return the
 * same label, so allocation buckets never split on spelling.
 */
export function normalizeAssetType(rawType: unknown): string {
  const key = caseFoldKey(rawType);
  if (!key) return UNKNOWN_ASSET_TYPE;
  return ASSET_TYPE_ALIASES[key] || normalizeLabel(key, UNKNOWN_ASSET_TYPE);
}

/** True when the raw type maps to a known asset class rather than a passthrough label. */
export function hasAssetTypeAlias(rawType: unknown): boolean {
  const key = caseFoldKey(rawType);
  return Boolean(key) && key in ASSET_TYPE_ALIASES;
}

/**
 * Map a SnapTrade security-type description to a canonical asset class.
 *
 * Substring heuristics (e.g. any type containing "fund" -> Mutual Fund) are only
 * applied when the raw value has no alias entry. Otherwise "Money Market Fund"
 * would be mis-bucketed as Mutual Fund instead of Cash.
 */
export function resolveAssetTypeWithHeuristics(rawType: unknown): string {
  // Check the table directly rather than inferring an alias hit by comparing the
  // mapped value against the title-cased one: aliases that map to their own
  // title case ("cash" -> "Cash") look like misses under that comparison, and it
  // would break silently the moment such an alias also matched a heuristic.
  if (hasAssetTypeAlias(rawType)) return normalizeAssetType(rawType);

  let refined = String(rawType ?? '');
  const typeNormalized = refined.toLowerCase();
  if (typeNormalized.includes('stock') || typeNormalized.includes('equity')) {
    refined = 'Equity';
  } else if (
    typeNormalized.includes('bond') ||
    typeNormalized.includes('treasury') ||
    typeNormalized.includes('fixed income')
  ) {
    refined = 'Fixed Income';
  } else if (typeNormalized.includes('etf')) {
    refined = 'ETF';
  } else if (typeNormalized.includes('mutual fund') || typeNormalized.includes('fund')) {
    refined = 'Mutual Fund';
  } else if (typeNormalized.includes('option')) {
    refined = 'Options';
  } else if (typeNormalized.includes('crypto')) {
    refined = 'Cryptocurrency';
  }
  return normalizeAssetType(refined);
}

export interface AssetAllocationRow {
  type: string;
  value: number;
  percentage: number;
}

/**
 * Combine allocation rows that describe the same asset class.
 *
 * Consumers key allocation by type — canonical facts derive a fact id from it,
 * and a Map keyed on that id drops every row but the last. Merging first means a
 * snapshot persisted before types were normalized still yields one fact per
 * asset class carrying the full value, rather than silently reporting whichever
 * spelling happened to be written last.
 */
export function mergeAssetAllocation(
  rows: readonly Partial<AssetAllocationRow>[] | undefined | null
): AssetAllocationRow[] {
  const merged = new Map<string, AssetAllocationRow>();
  for (const row of rows || []) {
    const type = normalizeAssetType(row?.type);
    const value = Number.isFinite(row?.value) ? (row!.value as number) : 0;
    const percentage = Number.isFinite(row?.percentage) ? (row!.percentage as number) : 0;
    const existing = merged.get(type);
    if (existing) {
      existing.value += value;
      existing.percentage += percentage;
    } else {
      merged.set(type, { type, value, percentage });
    }
  }
  return Array.from(merged.values());
}
