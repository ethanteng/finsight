function isPercentageKey(keyLower: string): boolean {
  return (
    keyLower.includes('percent') ||
    keyLower.includes('pct') ||
    keyLower.includes('rate') ||
    keyLower.includes('allocation') ||
    keyLower.includes('apy')
  );
}

function normalizePercentageValue(value: number): number {
  if (Math.abs(value) > 100) {
    return value / 100;
  }
  return value;
}

function formatDollars(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}$${Math.abs(rounded).toLocaleString()}`;
}

/** Format a key_number value for display based on the key name. */
export function formatKeyNumberValue(key: string, value: number | unknown): string {
  if (typeof value !== 'number') return String(value);
  const keyLower = key.toLowerCase();
  if (isPercentageKey(keyLower)) {
    return `${normalizePercentageValue(value)}%`;
  }
  if (keyLower.includes('months') || keyLower.includes('years')) {
    return value.toLocaleString();
  }
  return formatDollars(value);
}
