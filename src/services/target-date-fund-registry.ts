import type { TargetDateFundIdentity } from './target-date-fund';

type RegisteredTargetDateFundIdentity =
  | { provider: 'state-street'; series: 'target-retirement'; vintage: number }
  | { provider: 'blackrock'; series: 'lifepath-index'; vintage: number };

/**
 * A recorded observation of a cited source at a point in time.
 *
 * Two kinds, because the sources differ in nature:
 * - `document-sha256` for immutable-ish binaries (a PDF fact sheet), where the
 *   bytes are the evidence.
 * - `published-values` for rendered HTML fund pages, where hashing the document
 *   is useless -- unrelated markup churn would report drift on every check --
 *   so the fingerprint covers the figures actually read off the page.
 *
 * `sourceAsOf` is the holdings date the source itself advertised when observed.
 * When it differs from an entry's `allocationAsOf`, the provider has published
 * newer data than the stored weights represent.
 */
export interface SourceFingerprint {
  kind: 'document-sha256' | 'published-values';
  /** sha256 of the document bytes, or of the canonicalized published values. */
  value: string;
  /** Date this observation was made (YYYY-MM-DD). */
  observedAt: string;
  /** Holdings date the source advertised at that observation (YYYY-MM-DD), or `see-document` when the date is only inside a binary. */
  sourceAsOf: string;
  /** Human-readable note on what was read, for auditors without the tooling. */
  observed: string;
}

export interface TargetDateFundAllocation {
  identity: RegisteredTargetDateFundIdentity;
  allocationAsOf: string;
  /** Earliest date this publication was observable and may be used without look-ahead. */
  availableFrom: string;
  allocationAgeDays: number;
  staleAllocation: boolean;
  sourceUrl: string;
  sourceContext: string;
  exactAllocation: boolean;
  /** `lower-bound` means the source does not separately publish embedded TIPS. */
  tipsAllocationStatus: 'exact' | 'lower-bound';
  /**
   * Fingerprint of the cited source, so a later audit can tell whether the
   * document behind `sourceUrl` still says what was recorded when this entry
   * was fingerprinted.
   *
   * Provider pages are mutable and are republished on the provider's own
   * cadence -- State Street monthly -- so a URL alone does not reproduce the
   * figure it supports. Required on every registry row; omitted from
   * `lookupTargetDateAllocation` results because allocation math does not use it.
   */
  sourceFingerprint?: SourceFingerprint;
  /** Fractions of the whole fund supported by the historical engine. */
  weights: {
    usEquity: number;
    internationalEquity: number;
    nominalBonds: number;
    tips: number;
    cash: number;
  };
}

/** Registry rows always carry a fingerprint; lookup results may omit it. */
type RegistryEntry = Omit<
  TargetDateFundAllocation,
  'allocationAgeDays' | 'staleAllocation'
> & {
  sourceFingerprint: SourceFingerprint;
};

const STALE_ALLOCATION_DAYS = 366;

/**
 * Versioned, reviewable allocations for target-date products observed in the
 * live portfolio. Reported TIPS sleeves remain distinct in `weights` so the
 * retirement engine can exclude and disclose them instead of silently
 * reassigning them to nominal bonds.
 * Other unsupported sleeves, such as commodities and global infrastructure,
 * are omitted; callers report and exclude that fraction instead of
 * redistributing it.
 *
 * State Street's plan-specific Class III CIT does not publish holdings in the
 * public plan sheet, so these entries are explicitly marked as proxies for the
 * corresponding public implementation of the standard Target Retirement
 * strategy. BlackRock's 2040 entry is the Fund N share class itself.
 * Cash includes the source's cash holding plus any reported U.S.-dollar
 * balance. When rounded source lines total 100.01%, the cash residual is
 * reduced by 0.01 percentage point so modeled weights never create value.
 * `availableFrom` is the earliest verified observation/publication date, not
 * the holdings date. Mutable source pages without a publication timestamp use
 * the date on which their allocation was first verified for this registry.
 *
 * UC Pathway is knowingly absent: no public per-vintage allocation was found,
 * so recognizing its identity is not enough evidence to model its sleeves.
 * Lookup requires an exact provider/series/vintage key; recognition heuristics
 * live elsewhere and cannot invent an allocation for an unregistered identity.
 */
const REGISTRY: RegistryEntry[] = [
  {
    identity: { provider: 'state-street', series: 'target-retirement', vintage: 2025 },
    allocationAsOf: '2026-06-30',
    availableFrom: '2026-08-21',
    sourceUrl: 'https://www.ssga.com/us/en/institutional/mf/state-street-target-retirement-2025-fund-class-r3-ssahx',
    sourceContext: 'Plan CIT has no public holdings; a State Street public mutual-fund share class supplies the proxy allocation',
    exactAllocation: false,
    tipsAllocationStatus: 'exact',
    sourceFingerprint: {
      kind: 'published-values',
      value: '835f999070c8691f4973258bfde99620fbd9a060498f3c38689b3cc2b7db7d74',
      observedAt: '2026-08-22',
      sourceAsOf: '2026-07-31',
      observed: '2026-07-31|alternatives=5.17|equity=35.23|fixed income=55.83|unassigned=3.77',
    },
    weights: { usEquity: 0.2201, internationalEquity: 0.1368, nominalBonds: 0.3783, tips: 0.1793, cash: 0.0014 },
  },
  {
    identity: { provider: 'state-street', series: 'target-retirement', vintage: 2030 },
    allocationAsOf: '2026-06-30',
    availableFrom: '2026-08-21',
    sourceUrl: 'https://www.ssga.com/us/en/individual/mf/state-street-target-retirement-2030-fund-class-r3-ssajx',
    sourceContext: 'Plan CIT has no public holdings; a State Street public mutual-fund share class supplies the proxy allocation',
    exactAllocation: false,
    tipsAllocationStatus: 'exact',
    sourceFingerprint: {
      kind: 'published-values',
      value: 'c4ad286501c827a555f6b7fff474fa7430675367747f4155bf9f2850d305b531',
      observedAt: '2026-08-22',
      sourceAsOf: '2026-07-31',
      observed: '2026-07-31|alternatives=3.37|equity=52.13|fixed income=43.35|unassigned=1.14',
    },
    weights: { usEquity: 0.3145, internationalEquity: 0.2101, nominalBonds: 0.3110, tips: 0.1207, cash: 0.0014 },
  },
  {
    identity: { provider: 'state-street', series: 'target-retirement', vintage: 2035 },
    allocationAsOf: '2026-06-30',
    availableFrom: '2026-08-21',
    sourceUrl: 'https://www.ssga.com/us/en/institutional/mf/state-street-target-retirement-2035-fund-class-r3-ssazx',
    sourceContext: 'Plan CIT has no public holdings; a State Street public mutual-fund share class supplies the proxy allocation',
    exactAllocation: false,
    tipsAllocationStatus: 'exact',
    sourceFingerprint: {
      kind: 'published-values',
      value: '499eb2aaa939c9290e1f687091ef8633da12bae46fcbe6db7fd452b7f06bc24c',
      observedAt: '2026-08-22',
      sourceAsOf: '2026-07-31',
      observed: '2026-07-31|alternatives=0.78|equity=66.93|fixed income=32.28',
    },
    weights: { usEquity: 0.3898, internationalEquity: 0.2797, nominalBonds: 0.2920, tips: 0.0293, cash: 0.0019 },
  },
  {
    identity: { provider: 'state-street', series: 'target-retirement', vintage: 2040 },
    allocationAsOf: '2026-06-30',
    availableFrom: '2026-08-21',
    sourceUrl: 'https://www.ssga.com/us/en/individual/mf/state-street-target-retirement-2040-fund-class-i-sscnx',
    sourceContext: 'Plan CIT has no public holdings; a State Street public mutual-fund share class supplies the proxy allocation',
    exactAllocation: false,
    tipsAllocationStatus: 'exact',
    sourceFingerprint: {
      kind: 'published-values',
      value: '852a45e10cf2baf8d8ffe45f8b5ef93af2492a09fd15c973e43a43569c68a5ec',
      observedAt: '2026-08-22',
      sourceAsOf: '2026-07-31',
      observed: '2026-07-31|equity=75.27|fixed income=24.73',
    },
    weights: { usEquity: 0.4341, internationalEquity: 0.3176, nominalBonds: 0.2467, tips: 0, cash: 0.0016 },
  },
  {
    identity: { provider: 'state-street', series: 'target-retirement', vintage: 2050 },
    allocationAsOf: '2026-06-30',
    availableFrom: '2026-08-21',
    sourceUrl: 'https://www.ssga.com/us/en/individual/mf/state-street-target-retirement-2050-fund-class-i-ssdjx',
    sourceContext: 'Plan CIT has no public holdings; a State Street public mutual-fund share class supplies the proxy allocation',
    exactAllocation: false,
    tipsAllocationStatus: 'exact',
    sourceFingerprint: {
      kind: 'published-values',
      value: '847f02a37edb8771d1468846bff5aa12b08246d104031b2d97779c7c1720c3e9',
      observedAt: '2026-08-22',
      sourceAsOf: '2026-07-31',
      observed: '2026-07-31|equity=87.00|fixed income=13.00',
    },
    weights: { usEquity: 0.5011, internationalEquity: 0.3668, nominalBonds: 0.1304, tips: 0, cash: 0.0017 },
  },
  {
    identity: { provider: 'blackrock', series: 'lifepath-index', vintage: 2040 },
    allocationAsOf: '2026-06-30',
    // The source PDF reports 2026-06-30 holdings and was created 2026-07-16.
    // Do not expose those weights to an earlier snapshot.
    availableFrom: '2026-07-16',
    sourceUrl: 'https://assets.mersofmich.com/forms/MERS_LifePath_2040.pdf',
    sourceContext: 'MERS plan-sponsor fact sheet for the BlackRock LifePath Fund N share class; no separate TIPS weight is published in its holdings',
    exactAllocation: true,
    tipsAllocationStatus: 'lower-bound',
    // The fact sheet names a TIPS index only among possible custom-benchmark
    // components, not as a separately weighted reported holding. Leave the
    // unreported residual unsupported instead of inventing a TIPS allocation.
    sourceFingerprint: {
      kind: 'document-sha256',
      value: '668628f829cf2c1c00f1ed65f993073db68aaf780e60b4a2721b3e8588a82e04',
      observedAt: '2026-08-22',
      sourceAsOf: 'see-document',
      observed: '185553 bytes',
    },
    weights: { usEquity: 0.4773, internationalEquity: 0.2698, nominalBonds: 0.2276, tips: 0, cash: 0 },
  },
];

/**
 * The registry's entries, for auditing tools. Returns copies so a caller cannot
 * mutate the table that the retirement engine reads.
 *
 * Deliberately not used by the lookup path: allocation resolution still
 * requires an exact identity key, and nothing here widens that.
 */
export function listRegistryEntries(): RegistryEntry[] {
  return REGISTRY.map(entry => ({
    ...entry,
    identity: { ...entry.identity },
    weights: { ...entry.weights },
    sourceFingerprint: { ...entry.sourceFingerprint },
  }));
}

/**
 * Resolve a recognized identity against dated, sourced holdings. This function
 * deliberately performs no label parsing: recognition can be heuristic while
 * allocation requires an exact provider/series/vintage registry key.
 *
 * Omits `sourceFingerprint` on purpose: allocation math does not need it, and
 * provenance audits go through `listRegistryEntries()` instead.
 */
export function lookupTargetDateAllocation(
  identity: TargetDateFundIdentity,
  asOfDate: string | number,
): TargetDateFundAllocation | null {
  if (!identity.provider || !identity.series) return null;

  const normalizedAsOfDate = normalizeAsOfDate(asOfDate);
  if (!normalizedAsOfDate) return null;

  const entry = REGISTRY
    .filter(candidate =>
      candidate.identity.provider === identity.provider &&
      candidate.identity.series === identity.series &&
      candidate.identity.vintage === identity.vintage &&
      candidate.availableFrom <= normalizedAsOfDate
    )
    .sort((left, right) =>
      right.allocationAsOf.localeCompare(left.allocationAsOf) ||
      right.availableFrom.localeCompare(left.availableFrom)
    )[0];
  if (!entry) return null;

  const allocationAgeDays = Math.max(
    0,
    Math.floor(
      (Date.parse(`${normalizedAsOfDate}T00:00:00.000Z`) -
        Date.parse(`${entry.allocationAsOf}T00:00:00.000Z`)) /
      (24 * 60 * 60 * 1000)
    ),
  );

  return {
    identity: { ...entry.identity },
    allocationAsOf: entry.allocationAsOf,
    availableFrom: entry.availableFrom,
    allocationAgeDays,
    staleAllocation: allocationAgeDays > STALE_ALLOCATION_DAYS,
    sourceUrl: entry.sourceUrl,
    sourceContext: entry.sourceContext,
    exactAllocation: entry.exactAllocation,
    tipsAllocationStatus: entry.tipsAllocationStatus,
    weights: { ...entry.weights },
  };
}

function normalizeAsOfDate(value: string | number): string | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 2000 || value > 2100) return null;
    // Compatibility for older direct callers that supplied only a year. The
    // production path supplies the full snapshot date and never uses this.
    return `${value}-12-31`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return value;
}
