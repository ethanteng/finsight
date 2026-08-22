import { targetDateFundYear } from './target-date-fund';

export interface TargetDateFundAllocation {
  provider: 'state-street' | 'blackrock';
  targetYear: number;
  allocationAsOf: string;
  allocationAgeDays: number;
  staleAllocation: boolean;
  sourceUrl: string;
  sourceContext: string;
  exactAllocation: boolean;
  /** Fractions of the whole fund supported by the historical engine. */
  weights: {
    usEquity: number;
    internationalEquity: number;
    nominalBonds: number;
    cash: number;
  };
}

type RegistryEntry = Omit<
  TargetDateFundAllocation,
  'allocationAgeDays' | 'staleAllocation'
>;

const STALE_ALLOCATION_DAYS = 366;

/**
 * Versioned, reviewable allocations for target-date products observed in the
 * live portfolio. Unsupported sleeves such as TIPS, commodities and global
 * infrastructure are intentionally omitted from `weights`; callers report
 * and exclude that fraction instead of redistributing it.
 *
 * State Street's plan-specific Class III CIT does not publish holdings in the
 * public plan sheet, so these entries are explicitly marked as proxies for the
 * corresponding public implementation of the standard Target Retirement
 * strategy. BlackRock's 2040 entry is the Fund N share class itself.
 * Cash includes the source's cash holding plus any reported U.S.-dollar
 * balance. When rounded source lines total 100.01%, the cash residual is
 * reduced by 0.01 percentage point so modeled weights never create value.
 *
 * UC Pathway is knowingly absent: no public per-vintage allocation was found,
 * so recognizing its target year is not enough evidence to model its sleeves.
 * Provider matching below is deliberately narrow for the same reason. A label
 * that no longer carries one of the reviewed provider aliases stays unmodeled
 * instead of inheriting another fund family's allocation.
 */
const REGISTRY: RegistryEntry[] = [
  {
    provider: 'state-street',
    targetYear: 2025,
    allocationAsOf: '2026-06-30',
    sourceUrl: 'https://www.ssga.com/us/en/institutional/mf/state-street-target-retirement-2025-fund-class-r3-ssahx',
    sourceContext: 'Plan CIT has no public holdings; a State Street public mutual-fund share class supplies the proxy allocation',
    exactAllocation: false,
    weights: { usEquity: 0.2201, internationalEquity: 0.1368, nominalBonds: 0.3783, cash: 0.0014 },
  },
  {
    provider: 'state-street',
    targetYear: 2030,
    allocationAsOf: '2026-06-30',
    sourceUrl: 'https://www.ssga.com/us/en/individual/mf/state-street-target-retirement-2030-fund-class-r3-ssajx',
    sourceContext: 'Plan CIT has no public holdings; a State Street public mutual-fund share class supplies the proxy allocation',
    exactAllocation: false,
    weights: { usEquity: 0.3145, internationalEquity: 0.2101, nominalBonds: 0.3110, cash: 0.0014 },
  },
  {
    provider: 'state-street',
    targetYear: 2035,
    allocationAsOf: '2026-06-30',
    sourceUrl: 'https://www.ssga.com/us/en/institutional/mf/state-street-target-retirement-2035-fund-class-r3-ssazx',
    sourceContext: 'Plan CIT has no public holdings; a State Street public mutual-fund share class supplies the proxy allocation',
    exactAllocation: false,
    weights: { usEquity: 0.3898, internationalEquity: 0.2797, nominalBonds: 0.2920, cash: 0.0019 },
  },
  {
    provider: 'state-street',
    targetYear: 2040,
    allocationAsOf: '2026-06-30',
    sourceUrl: 'https://www.ssga.com/us/en/individual/mf/state-street-target-retirement-2040-fund-class-i-sscnx',
    sourceContext: 'Plan CIT has no public holdings; a State Street public mutual-fund share class supplies the proxy allocation',
    exactAllocation: false,
    weights: { usEquity: 0.4341, internationalEquity: 0.3176, nominalBonds: 0.2467, cash: 0.0016 },
  },
  {
    provider: 'state-street',
    targetYear: 2050,
    allocationAsOf: '2026-06-30',
    sourceUrl: 'https://www.ssga.com/us/en/individual/mf/state-street-target-retirement-2050-fund-class-i-ssdjx',
    sourceContext: 'Plan CIT has no public holdings; a State Street public mutual-fund share class supplies the proxy allocation',
    exactAllocation: false,
    weights: { usEquity: 0.5011, internationalEquity: 0.3668, nominalBonds: 0.1304, cash: 0.0017 },
  },
  {
    provider: 'blackrock',
    targetYear: 2040,
    allocationAsOf: '2026-03-31',
    sourceUrl: 'https://assets.mersofmich.com/forms/MERS_LifePath_2040.pdf',
    sourceContext: 'MERS plan-sponsor fact sheet for the BlackRock LifePath Fund N share class',
    exactAllocation: true,
    weights: { usEquity: 0.4773, internationalEquity: 0.2698, nominalBonds: 0.2276, cash: 0 },
  },
];

function providerForLabel(text: string): TargetDateFundAllocation['provider'] | null {
  if (/state\s*(st|street).*target\s*-?\s*(ret|retirement)/i.test(text)) return 'state-street';
  if (/\b(btc|blackrock)\b.*\b(lpath|life\s*-?\s*path)\b/i.test(text)) return 'blackrock';
  return null;
}

export function lookupTargetDateFundAllocation(
  labels: Array<unknown>,
  asOfDate: string | number,
): TargetDateFundAllocation | null {
  const targetYear = targetDateFundYear(...labels);
  if (targetYear === null) return null;

  const text = labels.filter((label): label is string => typeof label === 'string').join(' ');
  const provider = providerForLabel(text);
  if (!provider) return null;

  const normalizedAsOfDate = normalizeAsOfDate(asOfDate);
  if (!normalizedAsOfDate) return null;

  const entry = REGISTRY
    .filter(candidate =>
      candidate.provider === provider &&
      candidate.targetYear === targetYear &&
      candidate.allocationAsOf <= normalizedAsOfDate
    )
    .sort((left, right) => right.allocationAsOf.localeCompare(left.allocationAsOf))[0];
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
    provider: entry.provider,
    targetYear: entry.targetYear,
    allocationAsOf: entry.allocationAsOf,
    allocationAgeDays,
    staleAllocation: allocationAgeDays > STALE_ALLOCATION_DAYS,
    sourceUrl: entry.sourceUrl,
    sourceContext: entry.sourceContext,
    exactAllocation: entry.exactAllocation,
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
