/**
 * Target-date fund recognition and glidepath approximation.
 *
 * A target-date fund is a blend that shifts from equity to bonds as its target
 * year approaches, so it is neither an equity fund nor a bond fund and no
 * single provider asset type describes it. Providers rarely help: institutional
 * collective-trust share classes often arrive with no type at all, and the ones
 * that do arrive typed say "Mutual Fund", which says nothing about the mix.
 *
 * Left unrecognized these funds are either dropped from portfolio mapping or,
 * worse, caught by a generic heuristic and modeled as pure equity -- a 2040
 * fund treated as 100% stocks overstates both growth and sequence risk for a
 * holding that is deliberately de-risking.
 */

/** Display and mapping label for a recognized target-date fund. */
export const TARGET_DATE_ASSET_TYPE = 'Target Date Fund';

/**
 * Phrases that identify a target-date fund rather than merely a dated security.
 *
 * A bare four-digit year is not enough and must never be treated as one: a
 * Treasury named "UST 3.875% 04/30/2030" carries a year for its maturity, and
 * reading that as a 2030 glidepath would model a bond as mostly equity.
 */
const TARGET_DATE_SIGNALS: RegExp[] = [
  /target\s*-?\s*(date|ret)/i,
  /life\s*-?\s*path/i,
  /\blpath\b/i,
  /\bpathway\b/i,
  /\bfreedom\s+20\d{2}\b/i,
  /\bretirement\s+20\d{2}\b/i,
];

/** Plausible target years. Beyond this a match is far likelier to be noise. */
const MIN_TARGET_YEAR = 2000;
const MAX_TARGET_YEAR = 2100;

/**
 * Equity share at the target year, and how much it adds per year still to run.
 *
 * A linear approximation of the glidepaths the large providers publish:
 * roughly 90% equity twenty or more years out, about half at the target date,
 * levelling near 30% well after it. It is deliberately provider-agnostic --
 * modeling one issuer's exact curve would be a false precision when the fund's
 * own prospectus is not something we hold.
 */
const EQUITY_SHARE_AT_TARGET = 0.5;
const EQUITY_SHARE_PER_YEAR = 0.02;
const MIN_EQUITY_SHARE = 0.3;
const MAX_EQUITY_SHARE = 0.9;

export interface TargetDateFund {
  targetYear: number;
  /** 0-1 equity share implied by the glidepath at the requested year. */
  equityShare: number;
  /** 1 - equityShare, held as nominal bonds for modeling purposes. */
  bondShare: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The target year a fund names, or null when it is not a target-date fund.
 *
 * Both a signal phrase and a plausible year are required. The year is the first
 * `20xx` at or after the earliest signal match, so "Target Ret 2040 SL SF CL III"
 * still resolves through share-class noise, while a trailing inception or series
 * year ("Target Date 2035 Fund Series 2020") cannot override the target. A year
 * that only appears before the signal is used only when none follows it, so a
 * label like "2040 Retirement Fund" still resolves without letting a trailing
 * series year win over a real target.
 */
export function targetDateFundYear(...labels: Array<unknown>): number | null {
  const text = labels
    .filter((label): label is string => typeof label === 'string' && label.trim().length > 0)
    .join(' ');
  if (!text) return null;

  let signalIndex = -1;
  for (const signal of TARGET_DATE_SIGNALS) {
    const match = text.match(signal);
    if (match?.index === undefined) continue;
    if (signalIndex === -1 || match.index < signalIndex) {
      signalIndex = match.index;
    }
  }
  if (signalIndex < 0) return null;

  // Prefer the first year at or after the signal, which is where every provider
  // convention puts it. Fall back to a year earlier in the label rather than
  // giving up: preferring the later position is what stops a trailing series
  // year from winning, and nothing about that requires refusing the other order.
  const following = text.slice(signalIndex).match(/\b(20\d{2})\b/g);
  const years = following && following.length > 0 ? following : text.match(/\b(20\d{2})\b/g);
  if (!years || years.length === 0) return null;
  const year = Number(years[0]);
  if (!Number.isFinite(year) || year < MIN_TARGET_YEAR || year > MAX_TARGET_YEAR) return null;
  return year;
}

/** True when any of the supplied labels identify a target-date fund. */
export function isTargetDateFund(...labels: Array<unknown>): boolean {
  return targetDateFundYear(...labels) !== null;
}

/**
 * Approximate the equity/bond split a target-date fund holds today.
 *
 * `asOfYear` is required rather than read from the clock so a snapshot, a test,
 * and a replay all resolve the same split for the same data.
 */
export function targetDateGlidepath(targetYear: number, asOfYear: number): TargetDateFund {
  const yearsToTarget = targetYear - asOfYear;
  const equityShare = clamp(
    EQUITY_SHARE_AT_TARGET + EQUITY_SHARE_PER_YEAR * yearsToTarget,
    MIN_EQUITY_SHARE,
    MAX_EQUITY_SHARE
  );
  return { targetYear, equityShare, bondShare: 1 - equityShare };
}

/** Resolve a holding to its glidepath in one step, or null when it is not one. */
export function resolveTargetDateFund(
  labels: Array<unknown>,
  asOfYear: number
): TargetDateFund | null {
  const targetYear = targetDateFundYear(...labels);
  return targetYear === null ? null : targetDateGlidepath(targetYear, asOfYear);
}
