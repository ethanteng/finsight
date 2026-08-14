function isPercentageKey(keyLower: string): boolean {
  const tokens = keyLower.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => ['percent', 'pct', 'rate', 'allocation', 'apy'].includes(token));
}

function formatDollars(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}$${Math.abs(rounded).toLocaleString()}`;
}

/** Format a key_number value for display based on the key name. */
export interface DisplayKeyNumber {
  value: number;
  unit: 'usd' | 'percent' | 'months' | 'years' | 'age' | 'count' | 'ratio';
  provenance: string;
}

export function formatKeyNumberValue(key: string, metric: number | DisplayKeyNumber | unknown): string {
  const value = typeof metric === 'number'
    ? metric
    : metric && typeof metric === 'object' && typeof (metric as DisplayKeyNumber).value === 'number'
      ? (metric as DisplayKeyNumber).value
      : null;
  if (value === null) return String(metric);
  const unit = metric && typeof metric === 'object'
    ? (metric as DisplayKeyNumber).unit
    : undefined;
  const keyLower = key.toLowerCase();
  if (unit === 'percent' || (!unit && isPercentageKey(keyLower))) {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  }
  if (unit === 'months' || unit === 'years' || unit === 'age' || unit === 'count' || unit === 'ratio' ||
      (!unit && (keyLower.includes('months') || keyLower.includes('years') || keyLower.includes('age') || keyLower.includes('count')))) {
    return value.toLocaleString();
  }
  return formatDollars(value);
}
