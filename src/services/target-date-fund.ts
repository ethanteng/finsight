import { isDeclaredFixedIncomeType } from './investment-holding-classification';

/**
 * Target-date fund recognition.
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
 * Legacy sensitivity curve retained for callers that explicitly request a
 * hypothetical glidepath. Retirement analytics does not use this curve for an
 * authoritative allocation; it uses the versioned published-allocation
 * registry and leaves unmatched funds unmodeled.
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
 * Both a signal phrase and a plausible year are required. The year closest to
 * the earliest signal match wins, so the common provider orders all resolve:
 * - year after signal: "Target Ret 2040 SL SF CL III"
 * - year before signal: "American Funds 2040 Target Date Retirement Fund"
 * - year inside signal: "Fidelity Freedom 2045 Fund"
 *
 * Closeness is what keeps a trailing inception or series year from stealing the
 * target when the real year sits on the other side of the signal
 * ("…2040 Target Date… Inception 2015", "2040 Target Retirement Fund Series 2020"),
 * and what stops "Target Date 2035 Fund Series 2020" from picking 2020.
 */
export function targetDateFundYear(...labels: Array<unknown>): number | null {
  const text = labels
    .filter((label): label is string => typeof label === 'string' && label.trim().length > 0)
    .join(' ');
  if (!text) return null;

  let signalIndex = -1;
  let signalLength = 0;
  for (const signal of TARGET_DATE_SIGNALS) {
    const match = text.match(signal);
    if (match?.index === undefined) continue;
    if (signalIndex === -1 || match.index < signalIndex) {
      signalIndex = match.index;
      signalLength = match[0].length;
    }
  }
  if (signalIndex < 0) return null;

  const signalEnd = signalIndex + signalLength;
  const yearPattern = /\b(20\d{2})\b/g;
  let best: { year: number; distance: number; after: boolean } | null = null;
  let match: RegExpExecArray | null;
  while ((match = yearPattern.exec(text)) !== null) {
    const year = Number(match[1]);
    if (!Number.isFinite(year) || year < MIN_TARGET_YEAR || year > MAX_TARGET_YEAR) continue;

    const yearIndex = match.index;
    const yearEnd = yearIndex + match[0].length;
    let distance: number;
    let after: boolean;
    if (yearIndex >= signalIndex && yearIndex < signalEnd) {
      // Year is inside the signal match itself (e.g. "Freedom 2045").
      distance = 0;
      after = true;
    } else if (yearIndex >= signalEnd) {
      distance = yearIndex - signalEnd;
      after = true;
    } else {
      distance = signalIndex - yearEnd;
      after = false;
    }

    // Closer to the signal wins. On a tie, prefer the year after the signal --
    // that is the dominant provider convention when both sides carry a 20xx.
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && after && !best.after)
    ) {
      best = { year, distance, after };
    }
  }

  return best?.year ?? null;
}

/** True when any of the supplied labels identify a target-date fund. */
export function isTargetDateFund(...labels: Array<unknown>): boolean {
  return targetDateFundYear(...labels) !== null;
}

/**
 * Resolve a holding's target year only after considering every provider type.
 * A fixed-income declaration is stronger evidence than a target-like word and
 * year in a bond label. Wrapper types such as "mutual fund" do not veto.
 */
export function targetDateFundYearForHolding(
  labels: Array<unknown>,
  declaredAssetTypes: Array<unknown> = [],
): number | null {
  if (declaredAssetTypes.some(isDeclaredFixedIncomeType)) return null;
  return targetDateFundYear(...labels);
}

export function isTargetDateFundHolding(
  labels: Array<unknown>,
  declaredAssetTypes: Array<unknown> = [],
): boolean {
  return targetDateFundYearForHolding(labels, declaredAssetTypes) !== null;
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

/** Resolve the legacy sensitivity curve in one step, or null when unrecognized. */
export function resolveTargetDateFund(
  labels: Array<unknown>,
  asOfYear: number
): TargetDateFund | null {
  const targetYear = targetDateFundYear(...labels);
  return targetYear === null ? null : targetDateGlidepath(targetYear, asOfYear);
}
