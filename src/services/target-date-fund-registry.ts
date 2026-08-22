import { targetDateFundYear } from './target-date-fund';

export interface TargetDateFundAllocation {
  provider: 'state-street' | 'blackrock';
  targetYear: number;
  allocationAsOf: string;
  sourceUrl: string;
  exactAllocation: boolean;
  /** Fractions of the whole fund supported by the historical engine. */
  weights: {
    usEquity: number;
    internationalEquity: number;
    nominalBonds: number;
    cash: number;
  };
}

interface RegistryEntry extends TargetDateFundAllocation {
  sourceYear: number;
}

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
 */
const REGISTRY: RegistryEntry[] = [
  {
    provider: 'state-street',
    targetYear: 2025,
    sourceYear: 2026,
    allocationAsOf: '2026-06-30',
    sourceUrl: 'https://www.ssga.com/us/en/institutional/mf/state-street-target-retirement-2025-fund-class-r3-ssahx',
    exactAllocation: false,
    weights: { usEquity: 0.2201, internationalEquity: 0.1368, nominalBonds: 0.3783, cash: 0.0014 },
  },
  {
    provider: 'state-street',
    targetYear: 2030,
    sourceYear: 2026,
    allocationAsOf: '2026-06-30',
    sourceUrl: 'https://www.ssga.com/us/en/individual/mf/state-street-target-retirement-2030-fund-class-r3-ssajx',
    exactAllocation: false,
    weights: { usEquity: 0.3145, internationalEquity: 0.2101, nominalBonds: 0.3110, cash: 0.0014 },
  },
  {
    provider: 'state-street',
    targetYear: 2035,
    sourceYear: 2026,
    allocationAsOf: '2026-06-30',
    sourceUrl: 'https://www.ssga.com/us/en/institutional/mf/state-street-target-retirement-2035-fund-class-r3-ssazx',
    exactAllocation: false,
    weights: { usEquity: 0.3898, internationalEquity: 0.2797, nominalBonds: 0.2920, cash: 0.0019 },
  },
  {
    provider: 'state-street',
    targetYear: 2040,
    sourceYear: 2026,
    allocationAsOf: '2026-06-30',
    sourceUrl: 'https://www.ssga.com/us/en/individual/mf/state-street-target-retirement-2040-fund-class-i-sscnx',
    exactAllocation: false,
    weights: { usEquity: 0.4341, internationalEquity: 0.3176, nominalBonds: 0.2467, cash: 0.0016 },
  },
  {
    provider: 'state-street',
    targetYear: 2050,
    sourceYear: 2026,
    allocationAsOf: '2026-06-30',
    sourceUrl: 'https://www.ssga.com/us/en/individual/mf/state-street-target-retirement-2050-fund-class-i-ssdjx',
    exactAllocation: false,
    weights: { usEquity: 0.5011, internationalEquity: 0.3668, nominalBonds: 0.1304, cash: 0.0017 },
  },
  {
    provider: 'blackrock',
    targetYear: 2040,
    sourceYear: 2026,
    allocationAsOf: '2026-06-30',
    sourceUrl: 'https://assets.mersofmich.com/forms/MERS_LifePath_2040.pdf',
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
  asOfYear: number,
): TargetDateFundAllocation | null {
  const targetYear = targetDateFundYear(...labels);
  if (targetYear === null) return null;

  const text = labels.filter((label): label is string => typeof label === 'string').join(' ');
  const provider = providerForLabel(text);
  if (!provider) return null;

  const entry = REGISTRY.find(candidate =>
    candidate.provider === provider &&
    candidate.targetYear === targetYear &&
    candidate.sourceYear === asOfYear
  );
  if (!entry) return null;

  return {
    provider: entry.provider,
    targetYear: entry.targetYear,
    allocationAsOf: entry.allocationAsOf,
    sourceUrl: entry.sourceUrl,
    exactAllocation: entry.exactAllocation,
    weights: { ...entry.weights },
  };
}
