/**
 * Provider types that describe a wrapper rather than an investment exposure.
 * These cannot veto a stronger classification carried by the holding label.
 */
const CONTAINER_ASSET_TYPES = new Set([
  'etf',
  'etfs',
  'exchange traded fund',
  'exchange-traded fund',
  'mutual fund',
  'mutual funds',
  'fund',
  'index fund',
  'collective trust',
  'collective investment trust',
  'commingled fund',
  'pooled fund',
  'separate account',
]);

const FIXED_INCOME_TYPE_SIGNALS = [
  'bond',
  'fixed income',
  'treasury',
  'tips',
  'inflation protected',
  'inflation-protected',
  'aggregate',
  'corporate credit',
];

export function isContainerAssetType(assetType: string): boolean {
  return CONTAINER_ASSET_TYPES.has(assetType.trim().toLowerCase());
}

/**
 * True when a provider explicitly names fixed-income exposure. Every holding
 * classifier uses this function so a generic security wrapper cannot hide a
 * more specific fixed-income type supplied on the holding itself.
 */
export function isDeclaredFixedIncomeType(assetType: unknown): boolean {
  if (typeof assetType !== 'string') return false;
  const normalized = assetType.trim().toLowerCase();
  if (!normalized || isContainerAssetType(normalized)) return false;
  return FIXED_INCOME_TYPE_SIGNALS.some(signal => normalized.includes(signal));
}

/**
 * Choose the strongest declared type while preserving a wrapper as the display
 * fallback. Fixed income wins conflicts because it also serves as the safety
 * veto against target-date name inference.
 */
export function selectDeclaredAssetType(assetTypes: Array<unknown>): string {
  const candidates = assetTypes
    .filter((assetType): assetType is string =>
      typeof assetType === 'string' && assetType.trim().length > 0
    )
    .map(assetType => assetType.trim());
  return candidates.find(isDeclaredFixedIncomeType)
    ?? candidates.find(assetType => {
      const normalized = assetType.toLowerCase();
      return !isContainerAssetType(normalized) &&
        !['unknown', 'unclassified', 'other'].includes(normalized);
    })
    ?? candidates[0]
    ?? '';
}
