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
  /\bfreedom\s+20\d{2}\b/i,
  /\bretirement\s+20\d{2}\b/i,
];
const UC_PATHWAY_SIGNAL = /\bpathway\b/i;

/** Plausible target years. Beyond this a match is far likelier to be noise. */
const MIN_TARGET_YEAR = 2000;
const MAX_TARGET_YEAR = 2100;

/** Heuristic identity only. It never implies an allocation. */
export interface TargetDateFundIdentity {
  provider?: string;
  series?: string;
  vintage: number;
}

function providerFromLabel(text: string): string | undefined {
  if (/\bstate\s*(?:st|street)\b/i.test(text)) return 'state-street';
  if (/\b(?:btc|blackrock)\b/i.test(text)) return 'blackrock';
  if (/\buc\b/i.test(text) && /\bpathway\b/i.test(text)) return 'uc';
  if (/\bfidelity\b/i.test(text)) return 'fidelity';
  if (/\bamerican\s+funds\b/i.test(text)) return 'american-funds';
  return undefined;
}

function seriesFromLabel(text: string, provider?: string): string | undefined {
  if (provider === 'state-street' && /target\s*-?\s*(?:ret|retirement)/i.test(text)) {
    return 'target-retirement';
  }
  if (provider === 'blackrock' && /(?:life\s*-?\s*path|\blpath\b)/i.test(text)) {
    return /\b(?:idx|index)\b/i.test(text) ? 'lifepath-index' : 'lifepath';
  }
  if (provider === 'uc' && /\bpathway\b/i.test(text)) return 'pathway';
  if (provider === 'fidelity' && /\bfreedom\b/i.test(text)) return 'freedom';
  if (provider === 'american-funds' && /target\s*-?\s*date/i.test(text)) return 'target-date';

  if (/(?:life\s*-?\s*path|\blpath\b)/i.test(text)) return 'lifepath';
  if (/\bfreedom\b/i.test(text)) return 'freedom';
  if (/target\s*-?\s*date/i.test(text)) return 'target-date';
  if (/target\s*-?\s*(?:ret|retirement)/i.test(text)) return 'target-retirement';
  if (/\bretirement\s+20\d{2}\b/i.test(text)) return 'retirement';
  return undefined;
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
export function identifyTargetDateFund(
  ...labels: Array<unknown>
): TargetDateFundIdentity | null {
  // Accept both identifyTargetDateFund(labelA, labelB) and the planned
  // identifyTargetDateFund([labelA, labelB]) boundary.
  const text = labels
    .flatMap(label => Array.isArray(label) ? label : [label])
    .filter((label): label is string => typeof label === 'string' && label.trim().length > 0)
    .join(' ');
  if (!text) return null;

  const provider = providerFromLabel(text);
  // "Pathway" alone is used by unrelated businesses and debt securities. It
  // identifies a target-date series only when the same labels identify UC,
  // which preserves the verified "UC Pathway Fund 2040" product name without
  // relabeling an untyped "Pathway Capital 2030 Senior Notes" holding.
  const recognitionSignals = provider === 'uc'
    ? [...TARGET_DATE_SIGNALS, UC_PATHWAY_SIGNAL]
    : TARGET_DATE_SIGNALS;
  let signalIndex = -1;
  let signalLength = 0;
  for (const signal of recognitionSignals) {
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

  if (!best) return null;
  const series = seriesFromLabel(text, provider);
  return {
    ...(provider ? { provider } : {}),
    ...(series ? { series } : {}),
    vintage: best.year,
  };
}

/** Compatibility projection for callers that need only the recognized year. */
export function targetDateFundYear(...labels: Array<unknown>): number | null {
  return identifyTargetDateFund(...labels)?.vintage ?? null;
}

/** True when any of the supplied labels identify a target-date fund. */
export function isTargetDateFund(...labels: Array<unknown>): boolean {
  return identifyTargetDateFund(...labels) !== null;
}

/**
 * Resolve a holding's identity only after considering every provider type.
 * A fixed-income declaration is stronger evidence than a target-like word and
 * year in a bond label. Wrapper types such as "mutual fund" do not veto.
 */
export function identifyTargetDateFundHolding(
  labels: Array<unknown>,
  declaredAssetTypes: Array<unknown> = [],
): TargetDateFundIdentity | null {
  if (declaredAssetTypes.some(isDeclaredFixedIncomeType)) return null;
  return identifyTargetDateFund(...labels);
}

export function isTargetDateFundHolding(
  labels: Array<unknown>,
  declaredAssetTypes: Array<unknown> = [],
): boolean {
  return identifyTargetDateFundHolding(labels, declaredAssetTypes) !== null;
}
