/**
 * Spending flexibility: how much of their spending the user could cut in a bad
 * market.
 *
 * The engine cuts spending by that share for any withdrawal year that starts
 * with the portfolio more than 20% below its inflation-adjusted value when
 * withdrawals began (`SPENDING_CUT_TRIGGER`), and spends in full once it
 * recovers. The cut is the user's: what they said in this decision, as a
 * share, an amount or the spending they could not go below, then what they
 * saved in Your numbers. It is never assumed. Unstated, a plan keeps fixed
 * spending and runs a 20% cut beside it as a disclosed comparison
 * (`COMPARISON_SPENDING_CUT`), because how much flexibility is worth is
 * something most users do not know to ask.
 */

import { COMPARISON_SPENDING_CUT, SPENDING_CUT_TRIGGER, type SpendingFlexibility } from '../retirement-analytics/types';
import { savedNumber, STATED_FIGURE_DEFINITIONS, type StatedFigures } from './stated-figures';

export { COMPARISON_SPENDING_CUT, SPENDING_CUT_TRIGGER };

/** The most of their spending a user can be planned to cut: beyond it, the figure is a misreading. */
export const MAXIMUM_SPENDING_CUT_PERCENT = STATED_FIGURE_DEFINITIONS.spendingCutPercent.maximum!;

/** What the user said about cutting spending in this decision, in whichever form they said it. */
export interface StatedSpendingCut {
  /** Percentage points: 20 is a 20% cut. */
  percent?: number;
  /** Dollars a year less. */
  annualAmount?: number;
  /** The spending a year they could not go below. */
  essentialAnnual?: number;
}

export type SpendingCutForm = 'percent' | 'amount' | 'floor';

export type SpendingFlexibilityResolution =
  /** The user's own cut, which the plan runs. */
  | {
    kind: 'cut';
    cutShare: number;
    /** The cut in dollars a year, against the plan's spending. */
    annualCut: number;
    origin: 'stated' | 'saved';
    /** How the user put it, so the answer can say it back. */
    statedAs?: SpendingCutForm;
    savedAt?: string;
  }
  /** The user said they could not cut: fixed spending, and no comparison. */
  | { kind: 'none'; origin: 'stated' | 'saved'; savedAt?: string }
  /** Nobody said: fixed spending, with a disclosed comparison at this cut. */
  | { kind: 'comparison'; cutShare: number; annualCut: number };

/** A share of spending from a stated cut, or undefined when it cannot be one. */
function shareOf(stated: StatedSpendingCut, annualSpending: number): { share: number; form: SpendingCutForm } | undefined {
  const within = (share: number) => share >= 0 && share <= MAXIMUM_SPENDING_CUT_PERCENT / 100;
  if (stated.percent !== undefined) {
    const share = stated.percent / 100;
    return within(share) ? { share, form: 'percent' } : undefined;
  }
  if (stated.annualAmount !== undefined) {
    const share = stated.annualAmount / annualSpending;
    return within(share) ? { share, form: 'amount' } : undefined;
  }
  if (stated.essentialAnnual !== undefined) {
    // A floor at or above what they plan to spend leaves nothing to cut.
    const share = Math.max(0, (annualSpending - stated.essentialAnnual) / annualSpending);
    return within(share) ? { share, form: 'floor' } : undefined;
  }
  return undefined;
}

/**
 * The cut a plan runs, from what the user said in this decision, then Your
 * numbers; otherwise the comparison. Undefined when the plan has no spending
 * level to cut.
 */
export function resolveSpendingFlexibility(args: {
  stated?: StatedSpendingCut;
  statedFigures?: StatedFigures;
  annualSpending: number | null | undefined;
}): SpendingFlexibilityResolution | undefined {
  const spending = args.annualSpending;
  if (typeof spending !== 'number' || !Number.isFinite(spending) || spending <= 0) return undefined;
  const annual = (share: number) => Math.round(spending * share);

  const stated = args.stated ? shareOf(args.stated, spending) : undefined;
  if (stated) {
    return stated.share > 0
      ? { kind: 'cut', cutShare: stated.share, annualCut: annual(stated.share), origin: 'stated', statedAs: stated.form }
      : { kind: 'none', origin: 'stated' };
  }
  const saved = savedNumber(args.statedFigures, 'spendingCutPercent');
  if (saved) {
    const share = saved.value / 100;
    return share > 0
      ? { kind: 'cut', cutShare: share, annualCut: annual(share), origin: 'saved', savedAt: saved.savedAt }
      : { kind: 'none', origin: 'saved', savedAt: saved.savedAt };
  }
  return { kind: 'comparison', cutShare: COMPARISON_SPENDING_CUT, annualCut: annual(COMPARISON_SPENDING_CUT) };
}

/** The engine's inputs for a resolution: the plan's own cut, or the comparison beside fixed spending. */
export function spendingFlexibilityInput(resolution: SpendingFlexibilityResolution | undefined): {
  spendingFlexibility?: SpendingFlexibility;
  spendingFlexibilityComparison?: SpendingFlexibility;
} {
  if (resolution?.kind === 'cut') return { spendingFlexibility: { cutShare: resolution.cutShare } };
  if (resolution?.kind === 'comparison') return { spendingFlexibilityComparison: { cutShare: resolution.cutShare } };
  return {};
}

/** The cut as Your numbers keeps it, a whole percent, for "Use these next time?". */
export function savableSpendingCut(resolution: SpendingFlexibilityResolution | undefined): number | undefined {
  if (!resolution || resolution.kind === 'comparison' || resolution.origin !== 'stated') return undefined;
  return resolution.kind === 'cut' ? Math.round(resolution.cutShare * 100) : 0;
}
