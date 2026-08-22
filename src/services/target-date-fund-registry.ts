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
      value: 'c32ad70b80ee1b65fd56c7f542992e446d96a222c078ea0ca3fa2231a8a75641',
      observedAt: '2026-08-22',
      sourceAsOf: '2026-06-30',
      observed: '2026-06-30|ssi us gov money market class=0.18|state street aggregate bond index portfolio=21.10|state street equity 500 index ii portfolio=19.56|state street global equity ex-u.s. index portfolio=13.68|state street small/mid cap equity index portfolio=2.45|state street spdr bloomberg 1-10 year tips etf=17.93|state street spdr bloomberg enhanced roll yield commodity strategy no k-1 etf=3.51|state street spdr bloomberg high yield bond etf=6.98|state street spdr dow jones global real estate etf=4.91|state street spdr portfolio short term corporate bond etf=1.99|state street spdr portfolio short term treasury etf=7.76',
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
      value: 'd0194222e756f633de638a4c7644df8ee11b54921a3a9d05f6b85cca4054e169',
      observedAt: '2026-08-22',
      sourceAsOf: '2026-06-30',
      observed: '2026-06-30|ssi us gov money market class=0.25|state street aggregate bond index portfolio=19.78|state street equity 500 index ii portfolio=27.38|state street global equity ex-u.s. index portfolio=21.01|state street small/mid cap equity index portfolio=4.07|state street spdr bloomberg 1-10 year tips etf=12.07|state street spdr bloomberg enhanced roll yield commodity strategy no k-1 etf=1.05|state street spdr bloomberg high yield bond etf=6.47|state street spdr dow jones global real estate etf=3.18|state street spdr portfolio long term treasury etf=3.44|state street spdr portfolio short term corporate bond etf=0.32|state street spdr portfolio short term treasury etf=1.09',
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
      value: '5062041d545c08591e95eeec367a37fcb625b16f8082e592c350b6c5b63e55ec',
      observedAt: '2026-08-22',
      sourceAsOf: '2026-06-30',
      observed: '2026-06-30|ssi us gov money market class=0.16|state street aggregate bond index portfolio=15.84|state street equity 500 index ii portfolio=33.13|state street global equity ex-u.s. index portfolio=27.97|state street small/mid cap equity index portfolio=5.85|state street spdr bloomberg 1-10 year tips etf=2.93|state street spdr bloomberg high yield bond etf=5.21|state street spdr dow jones global real estate etf=0.73|state street spdr portfolio long term treasury etf=8.15|u.s. dollar=0.03',
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
      value: '03e32dbfedb1544f67a1b8a16f7316ccf4567fd58280090b8a20d0c012a7e0b8',
      observedAt: '2026-08-22',
      sourceAsOf: '2026-06-30',
      observed: '2026-06-30|ssi us gov money market class=0.17|state street aggregate bond index portfolio=12.22|state street equity 500 index ii portfolio=35.90|state street global equity ex-u.s. index portfolio=31.76|state street small/mid cap equity index portfolio=7.51|state street spdr bloomberg high yield bond etf=2.84|state street spdr portfolio long term treasury etf=9.61',
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
      value: 'a014f913ec9e82fdb2d723ea4226c0cf6b108ed009b95f4dbf787cfd905d349b',
      observedAt: '2026-08-22',
      sourceAsOf: '2026-06-30',
      observed: '2026-06-30|ssi us gov money market class=0.19|state street aggregate bond index portfolio=3.45|state street equity 500 index ii portfolio=38.72|state street global equity ex-u.s. index portfolio=36.68|state street small/mid cap equity index portfolio=11.39|state street spdr portfolio long term treasury etf=9.59',
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
