/**
 * Asset-class label normalization (frontend copy of `src/services/asset-class.ts`).
 *
 * Holding/security types arrive from several providers with different casing and
 * wording for the same asset class: Plaid returns lowercase types ("etf",
 * "mutual fund", "cash"), SnapTrade returns human descriptions ("ETF",
 * "Common Stock", "Security type is not defined"), and manual accounts get their
 * own label. Bucketing allocation by the raw string therefore splits one asset
 * class into several rows (e.g. "etf" and "ETF" side by side).
 *
 * Keep this table in sync with the backend module.
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

  // Target-date funds are a blend, not a single class, and deserve their own row.
  'target date fund': 'Target Date Fund',
  'target date': 'Target Date Fund',
  'target retirement': 'Target Date Fund',

  // Missing / undefined types.
  //
  // "Unrecognized holdings" rather than "Unknown": these are real positions
  // whose asset class we could not resolve, which is a different problem from
  // an account balance with no positions behind it at all. That one is "Not
  // itemized". Two labels that read as synonyms hid the distinction and, worse,
  // hid that one of them is fixable by better security metadata.
  'unknown': 'Unrecognized holdings',
  'unrecognized holdings': 'Unrecognized holdings',
  'security type is not defined': 'Unrecognized holdings',
  'not defined': 'Unrecognized holdings',
  'n/a': 'Unrecognized holdings',
  'none': 'Unrecognized holdings',

  // Value an account reports that no itemized holding explains. Aliased so a
  // snapshot written under the old label still renders under the new one.
  'unclassified': 'Not itemized',
  'not itemized': 'Not itemized',
};

/**
 * Canonical label for a position whose asset class could not be resolved.
 *
 * We hold the security -- ticker, quantity, value -- and only its category is
 * missing. Distinct from `Not itemized`, which is value with no security at all.
 */
export const UNKNOWN_ASSET_TYPE = 'Unrecognized holdings';

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
