function isPercentageKey(keyLower: string): boolean {
  const tokens = keyLower.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => ['percent', 'pct', 'rate', 'allocation', 'apy'].includes(token));
}

function hasUnitToken(keyLower: string, units: readonly string[]): boolean {
  const tokens = keyLower.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => units.includes(token));
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
  /** The fact's human label, set by the server. Preferred over the id. */
  provenanceLabel?: string;
}

/**
 * Does this fact-id segment look like a provider identifier?
 *
 * Fact ids are built for uniqueness, not for reading. Most de-underscore into
 * something serviceable -- `allocation_equity` gives "Allocation Equity" -- but
 * a per-holding id embeds the account and security identifiers, and the same
 * treatment gives "Holding Value Qq9wmog6pvh1xrv4dpaqc11orpeexyfzzodop
 * 96d5ao5gljc9eowv7zy1tb1ydryymnfajrrjp 2893".
 *
 * Length, absent whitespace and a digit, matching the server-side test in
 * `src/services/holding-label.ts`. The two are deliberately the same shape; the
 * duplication is the cost of the client not sharing the server's modules.
 */
function isOpaqueSegment(segment: string): boolean {
  return segment.length >= 12 && /\d/.test(segment) && /^[a-z0-9]+$/i.test(segment);
}

/**
 * A human-readable source line for a key number, or null when there is none.
 *
 * Null rather than a best effort: this line is supplementary, and a row of hex
 * under a dollar figure is worse for the reader than no attribution at all.
 *
 * The server-set label is preferred, but only when it does not itself embed an
 * opaque identifier — a holding fact used to fall back to `security_id` in its
 * label, which would reintroduce the hex this helper exists to suppress.
 */
export function formatProvenance(metric: DisplayKeyNumber): string | null {
  const label = metric.provenanceLabel?.trim();
  if (label) {
    const words = label.split(/\s+/).filter(Boolean);
    if (!words.some(isOpaqueSegment)) return label;
  }
  if (!metric.provenance) return null;
  const segments = metric.provenance.split('_').filter(Boolean);
  if (segments.some(isOpaqueSegment)) return null;
  // Title-cased here rather than by a CSS `capitalize` on the element. That
  // rule cannot tell a fact id from a label, so it also rewrote server labels:
  // "WFC holding value" rendered as "Wfc Holding Value", turning a ticker into
  // a word. Only this fallback wants the transform.
  return segments
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
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
      (!unit && hasUnitToken(keyLower, ['month', 'months', 'year', 'years', 'age', 'count', 'ratio']))) {
    return value.toLocaleString();
  }
  return formatDollars(value);
}
