/**
 * How every retirement calculator states spending flexibility: the clause its
 * assumptions list, the sentence that reports what a cut did, and the facts an
 * answer may quote. One wording, so the holdings projection and the stated
 * plan read the same.
 *
 * Every figure here is the engine's (`SpendingFlexibilityOutcome`); the model
 * never estimates what a cut would do.
 */

import type { SpendingFlexibilityOutcome } from '../retirement-analytics/types';
import type { SpendingFlexibilityResolution } from '../services/spending-flexibility';
import { SPENDING_CUT_TRIGGER } from '../services/spending-flexibility';
import { savedOn } from '../services/stated-figures';
import type { CanonicalFactUnit } from './canonical-facts';

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function years(value: number): string {
  const shown = Number(value.toFixed(1));
  return `${shown} ${shown === 1 ? 'year' : 'years'}`;
}

/** The rule, as a clause: "cutting spending 20% ($12,000 a year) in any year ...". */
function ruleClause(cutShare: number, annualCut: number): string {
  return `cutting spending ${percent(cutShare)} (${money(annualCut)} a year) in any year that starts with your portfolio ` +
    `more than ${percent(SPENDING_CUT_TRIGGER)} below its inflation-adjusted value when withdrawals began, ` +
    'and spending in full again once it recovers';
}

/**
 * The cut a run applied, as a clause for its assumptions, with where it came
 * from; null when it applied none because nobody said (the comparison then
 * reports separately).
 */
export function describeSpendingCut(resolution: SpendingFlexibilityResolution | undefined): string | null {
  if (!resolution || resolution.kind === 'comparison') return null;
  const saved = resolution.origin === 'saved' && resolution.savedAt
    ? ` (from Your numbers, saved ${savedOn(resolution.savedAt)})`
    : '';
  if (resolution.kind === 'none') return `no spending cuts in a bad market, since you said you could not cut${saved}`;
  const said = resolution.origin === 'stated'
    ? resolution.statedAs === 'floor'
      ? ' (everything above the spending you said you could not go below)'
      : resolution.statedAs === 'amount' ? ' (what you said you could cut)' : ''
    : '';
  return `${ruleClause(resolution.cutShare, resolution.annualCut)}${said}${saved}`;
}

/** How often the cut was in force, as a clause: "in 31% of the 528 historical sequences, for a median of ...". */
function howOften(outcome: SpendingFlexibilityOutcome): string {
  if (outcome.sequencesWithCuts === 0) return `in none of the ${outcome.sequencesTested} historical sequences`;
  return `in ${percent(outcome.sequencesWithCuts / outcome.sequencesTested)} of the ${outcome.sequencesTested} historical ` +
    `sequences, for a median of ${years(outcome.medianYearsCut)} and at most ${years(outcome.mostYearsCut)}`;
}

/**
 * What a cut did, as sentences: how often the user's own cut was in force,
 * or, when they have not said, what a 20% cut would change beside fixed
 * spending. Empty when there is nothing to report.
 */
export function describeSpendingFlexibilityResults(args: {
  resolution: SpendingFlexibilityResolution | undefined;
  /** The run's own result, with the user's cut applied when they gave one. */
  outcome?: SpendingFlexibilityOutcome;
  comparison?: SpendingFlexibilityOutcome;
  /** The plan's survival on its own spending. */
  survivalRate: number;
}): string {
  const { resolution, outcome, comparison, survivalRate } = args;
  if (resolution?.kind === 'cut' && outcome) {
    return outcome.sequencesWithCuts === 0
      ? ` The ${percent(outcome.cutShare)} cut was never needed in any of the ${outcome.sequencesTested} historical sequences.`
      : ` With your ${percent(outcome.cutShare)} cut, spending was cut ${howOften(outcome)}.`;
  }
  if (resolution?.kind === 'comparison' && comparison) {
    // Nothing to gain from flexibility when the plan already lasts every time.
    if (survivalRate >= 1) return '';
    return ` If you cut spending ${percent(comparison.cutShare)} (${money(resolution.annualCut)} a year) in any year that ` +
      `started with your portfolio more than ${percent(SPENDING_CUT_TRIGGER)} below its inflation-adjusted value when ` +
      'withdrawals began, and spent in full again once it recovered, the plan would last in ' +
      `${percent(comparison.survivalRate)} of historical sequences instead of ${percent(survivalRate)}, with spending cut ` +
      `${howOften(comparison)}. Tell me how much of your spending you could cut in a bad market and I will use your number.`;
  }
  return '';
}

/** A fact a calculator publishes about spending flexibility, before its own id prefix and source. */
export interface SpendingFlexibilityFactRow {
  suffix: string;
  label: string;
  value: number;
  unit: CanonicalFactUnit;
  /** Set on the cut itself, an input; every other row is the engine's result. */
  input?: true;
}

/** The user's cut and what it did, or the comparison's, as facts. */
export function spendingFlexibilityFactRows(args: {
  resolution: SpendingFlexibilityResolution | undefined;
  outcome?: SpendingFlexibilityOutcome;
  comparison?: SpendingFlexibilityOutcome;
}): SpendingFlexibilityFactRow[] {
  const { resolution } = args;
  if (!resolution || resolution.kind === 'none') return [];
  const isComparison = resolution.kind === 'comparison';
  const result = isComparison ? args.comparison : args.outcome;
  if (!result) return [];
  const prefix = isComparison ? 'flexible_comparison_' : 'spending_cut_';
  const whose = isComparison
    ? 'A comparison the user has not chosen: '
    : '';
  const trigger = `in any withdrawal year that starts with the portfolio more than ${percent(SPENDING_CUT_TRIGGER)} below ` +
    'its inflation-adjusted value when withdrawals began';
  const rows: SpendingFlexibilityFactRow[] = [
    {
      suffix: `${prefix}${isComparison ? 'cut_percent' : 'percent'}`,
      label: `${whose}share of spending cut ${trigger}`,
      value: Math.round(result.cutShare * 1000) / 10,
      unit: 'percent',
      input: true,
    },
    {
      suffix: `${prefix}${isComparison ? 'cut_annual' : 'annual'}`,
      label: `${whose}spending cut a year ${trigger}, in today's dollars`,
      value: resolution.annualCut,
      unit: 'usd',
      input: true,
    },
    {
      suffix: `${prefix}sequences_cut_percent`,
      label: `${whose}share of historical sequences in which spending was cut at least one year`,
      value: Math.round((result.sequencesTested === 0 ? 0 : result.sequencesWithCuts / result.sequencesTested) * 1000) / 10,
      unit: 'percent',
    },
    {
      suffix: `${prefix}median_years_cut`,
      label: `${whose}median years spending was cut, among historical sequences that cut it`,
      value: Number(result.medianYearsCut.toFixed(2)),
      unit: 'years',
    },
    {
      suffix: `${prefix}most_years_cut`,
      label: `${whose}most years spending was cut in any one historical sequence`,
      value: Number(result.mostYearsCut.toFixed(2)),
      unit: 'years',
    },
  ];
  for (const row of rows) row.label = row.label.charAt(0).toUpperCase() + row.label.slice(1);
  if (isComparison) {
    rows.push({
      suffix: `${prefix}survival_rate`,
      label: `${whose}historical rolling-window survival share with spending cut that way, against the plan's fixed spending`,
      value: Math.round(result.survivalRate * 1000) / 10,
      unit: 'percent',
    });
  }
  return rows;
}
