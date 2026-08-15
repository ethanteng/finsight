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
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Title-case a case-folded key so unmapped types still render consistently. */
function labelFromKey(key: string): string {
  return key
    .split(' ')
    .map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/**
 * Map a raw provider asset/security type to the label used for grouping and
 * display. Values that differ only by casing or whitespace always return the
 * same label, so allocation buckets never split on spelling.
 */
export function normalizeAssetType(rawType: unknown): string {
  const key = caseFoldKey(rawType);
  if (!key) return UNKNOWN_ASSET_TYPE;
  return ASSET_TYPE_ALIASES[key] || labelFromKey(key);
}
