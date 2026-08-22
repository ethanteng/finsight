/**
 * Which securities the classifier cannot place, aggregated across users.
 *
 * The retirement engine excludes what it cannot classify and says so, which is
 * honest but leaves the operator blind: nothing surfaces *which* instruments
 * keep landing in that bucket, so nothing tells you which provider data to go
 * and find. This report answers that.
 *
 * Deliberately aggregated by security, never by user. Knowing that eleven
 * people hold a fund we cannot model is what decides whether to source its
 * allocation; knowing which eleven is not, and putting individual financial
 * positions in an admin panel is a cost with no matching benefit. Only counts
 * leave this module.
 *
 * Reads analyses that are already persisted, so it needs no schema change and
 * no extra write on the classification path. The tradeoff is coverage: a user
 * who has never run a retirement analysis is invisible here.
 */

/** How a security failed to reach the simulation. */
export type DataGapCategory =
  /** No asset class or equity geography could be resolved at all. */
  | 'unmapped'
  /** Recognized, but the engine has no historical return series for it. */
  | 'unsupported'
  /** Placed as US equity from an exchange-style ticker, lacking country data. */
  | 'us-listing-fallback';

export interface DataGapSecurity {
  label: string;
  category: DataGapCategory;
  /** Distinct users whose most recent analysis reported this security. */
  userCount: number;
  /** Most recent analysis date that reported it (YYYY-MM-DD). */
  lastSeenAt: string;
}

export interface DataGapReport {
  /** Distinct users contributing an analysis to this report. */
  usersConsidered: number;
  usersWithAnyGap: number;
  securities: DataGapSecurity[];
  coverage: {
    /** Sum of unmodeled value across the analyses considered. */
    totalUnmodeledValue: number;
    /** Lowest single-analysis value coverage, 0-1. Null when nothing qualified. */
    worstValueCoverage: number | null;
    medianValueCoverage: number | null;
  };
}

/** One persisted analysis row, narrowed to what this report reads. */
export interface AnalysisRow {
  userId: string;
  computedAt: Date | string;
  historicalImplications: unknown;
}

function asDate(value: Date | string): Date | null {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function labelsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Collapse label variants that differ only in spacing or case.
 *
 * Provider labels arrive inconsistently punctuated across feeds, and counting
 * "BTC LPATH IDX 2040 N" separately from "BTC LPATH IDX  2040 N" would split
 * the very signal this report exists to concentrate. The first spelling seen
 * is kept for display, so the operator still sees a real provider string.
 */
function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim().toLowerCase();
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Aggregate persisted analyses into a per-security gap report.
 *
 * Only each user's most recent analysis counts. A user who re-ran an analysis
 * five times holds the same fund once, and counting the history would rank a
 * frequent user's holdings above a widely-held gap.
 */
export function aggregateDataGaps(rows: readonly AnalysisRow[]): DataGapReport {
  // Keep the newest row per user.
  const latestByUser = new Map<string, { at: Date; row: AnalysisRow }>();
  for (const row of rows) {
    if (typeof row?.userId !== 'string' || !row.userId) continue;
    const at = asDate(row.computedAt);
    if (!at) continue;
    const existing = latestByUser.get(row.userId);
    if (!existing || at > existing.at) latestByUser.set(row.userId, { at, row });
  }

  const byKey = new Map<string, DataGapSecurity>();
  const coverages: number[] = [];
  let totalUnmodeledValue = 0;
  let usersWithAnyGap = 0;

  for (const { at, row } of latestByUser.values()) {
    const quality = (row.historicalImplications as any)?.dataQuality;
    if (!quality) continue;
    const proxyUsage = quality.proxyUsage ?? {};

    const buckets: Array<[DataGapCategory, string[]]> = [
      ['unmapped', labelsOf(proxyUsage.unmappedHoldings)],
      ['unsupported', labelsOf(proxyUsage.unsupportedHoldings)],
      ['us-listing-fallback', labelsOf(proxyUsage.usListingFallbackHoldings)],
    ];

    let sawGap = false;
    for (const [category, labels] of buckets) {
      // A label repeated within one analysis is still one user.
      for (const label of new Set(labels.map(normalizeLabel))) {
        sawGap = true;
        const display = labels.find(entry => normalizeLabel(entry) === label) ?? label;
        const key = `${category}::${label}`;
        const existing = byKey.get(key);
        const seenAt = at.toISOString().slice(0, 10);
        if (existing) {
          existing.userCount += 1;
          if (seenAt > existing.lastSeenAt) existing.lastSeenAt = seenAt;
        } else {
          byKey.set(key, { label: display, category, userCount: 1, lastSeenAt: seenAt });
        }
      }
    }
    if (sawGap) usersWithAnyGap += 1;

    const unmodeled = finite(quality.unmodeledValue);
    if (unmodeled !== null && unmodeled > 0) totalUnmodeledValue += unmodeled;
    const coverage = finite(quality.valueCoverage);
    if (coverage !== null) coverages.push(coverage);
  }

  const securities = [...byKey.values()].sort((left, right) =>
    right.userCount - left.userCount || left.label.localeCompare(right.label)
  );

  return {
    usersConsidered: latestByUser.size,
    usersWithAnyGap,
    securities,
    coverage: {
      totalUnmodeledValue,
      worstValueCoverage: coverages.length ? Math.min(...coverages) : null,
      medianValueCoverage: median(coverages),
    },
  };
}
