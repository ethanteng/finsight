/**
 * When a preset mix has to stand in for the user's holdings.
 *
 * The holdings-based retirement projection is the real market-history answer.
 * It has nothing to run on in two cases: no holdings are linked, or holdings
 * are linked and none of them maps to a return series the engine can simulate
 * (an all-crypto or all-real-asset portfolio, say). In both, the preset-mix
 * engine the public retirement calculator uses is the only market history an
 * answer can show, so the stated retirement plan and Coast FIRE's market-history
 * test run on it, and say which of the two cases they stood in for.
 *
 * One predicate for both calculators, so they can never disagree about whether
 * the user has a real projection.
 */

import type { FinancialContextSnapshot } from '../openai/types';

export type PresetStandInReason = 'no_holdings' | 'unsupported_holdings';

type HoldingsView = Pick<FinancialContextSnapshot, 'investments' | 'retirementAnalysisNeedsInfo'>;

/** Why a preset stands in for this user's holdings, or null when it does not. */
export function presetStandInReason(snapshot: HoldingsView): PresetStandInReason | null {
  if ((snapshot.investments?.holdings?.length ?? 0) === 0) return 'no_holdings';
  return snapshot.retirementAnalysisNeedsInfo?.unavailableCode === 'no_supported_simulation'
    ? 'unsupported_holdings'
    : null;
}
