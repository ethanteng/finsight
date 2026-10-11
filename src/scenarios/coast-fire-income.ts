/**
 * Retirement income in Ask Linc's Coast FIRE number.
 *
 * The public calculator's formula (`services/coast-fire.ts`) takes one income
 * from the retirement date, in today's dollars, and it stays that way: the
 * page runs in the browser and is pinned to a copy of it. Ask Linc's answer
 * reads income the way the user describes it -- Social Security from 67, a
 * pension from 60, a pension that never rises -- so it builds on that formula
 * here rather than changing it.
 *
 * Two things the single-income formula cannot say:
 *
 * - **An income that starts after retirement.** The portfolio pays that
 *   income's share until it begins. The target is what the steady state needs
 *   (spending left once every income has started, divided by the withdrawal
 *   rate) plus a reserve for those earlier years, discounted at the same real
 *   return as everything else. The reserve is reported on its own, because
 *   "how do I cover the years before my pension starts?" is the question.
 * - **A fixed pension.** Its dollars never change, so it is worth less every
 *   year. It is counted as the level amount, in today's dollars, with the same
 *   value over the retirement it is paid in, under a disclosed inflation
 *   assumption. The market-history test beside the number uses each historical
 *   sequence's actual inflation instead.
 *
 * A couple adds more, valued the same way (`services/household.ts`): an
 * income that stops before the plan ends -- a Social Security benefit or a
 * pension with its holder, a spousal benefit at the first death -- is counted
 * as the level amount with the same value as the years it is paid, and a
 * survivor's lower spending as the level spending with the same value over
 * retirement. A survivor benefit, paid only from the first death, is counted
 * as the level amount with its value over the whole retirement rather than as
 * an income to bridge to: it replaces a benefit that stops, not one that has
 * yet to start.
 */

import {
  calculateCoastFire,
  type CoastFireInputs,
  type CoastFireResult,
} from '../services/coast-fire';

/** Only used to value a fixed pension, and named in the answer whenever it is. */
export const DEFAULT_COAST_FIRE_INFLATION_PERCENT = 2.5;

/** A spousal or survivor benefit is Social Security on the other's record, valued the same way. */
export type CoastFireIncomeKind = 'social_security' | 'pension' | 'spousal' | 'survivor';

export interface CoastFireIncome {
  /** Whose income it is; the user's when absent. Ages are always the user's. */
  owner?: 'user' | 'partner';
  kind: CoastFireIncomeKind;
  /** A year: today's dollars when it rises with inflation, otherwise the fixed dollar amount it pays. */
  annualAmount: number;
  startAge: number;
  inflationAdjusted: boolean;
  /** The first age it is no longer paid, when it stops before the plan ends. */
  endAge?: number;
}

export interface CoastFireIncomeTerm extends CoastFireIncome {
  /**
   * What it is counted as against spending, in today's dollars a year: the
   * amount itself when it rises with inflation, otherwise the level amount
   * with the same value over the years it is paid.
   */
  levelAmount: number;
  /** Years between retiring and it starting; zero when it starts by then. */
  gapYears: number;
}

export interface CoastFireIncomeResult extends CoastFireResult {
  incomes: CoastFireIncomeTerm[];
  /**
   * Set aside at the retirement age, in today's dollars, to pay the share of
   * spending that incomes starting later will cover once they begin.
   */
  bridgeReserve: number;
  /** The age the income is valued through: the market-history test's horizon. */
  planThroughAge: number;
  /** Present only when a fixed income was valued under it. */
  inflationPercent?: number;
  /** What one survivor spends from an age on, when it was counted. */
  spendingChange?: { fromAge: number; annualAmount: number };
  /**
   * With a spending change: the level spending, in today's dollars a year,
   * with the same value over retirement as the couple's spending and then the
   * survivor's. The target is built on it; `annualRetirementSpending` stays
   * the couple's figure as given.
   */
  levelSpending?: number;
}

/**
 * The Coast FIRE figures with each income on its own schedule.
 * `annualRetirementIncome` in the result is the income counted once every
 * income has started, and `portfolioSpendingNeed` what is left for the
 * portfolio then.
 */
export function calculateCoastFireWithIncome(
  inputs: Omit<CoastFireInputs, 'annualRetirementIncome'>,
  incomes: readonly CoastFireIncome[],
  options: {
    planThroughAge: number;
    inflationPercent?: number;
    /** What one survivor spends from an age on, in today's dollars. */
    spendingChange?: { fromAge: number; annualAmount: number };
  }
): CoastFireIncomeResult {
  const retirementAge = inputs.retirementAge;
  const planThroughAge = Math.max(options.planThroughAge, retirementAge + 1);
  const realReturn = inputs.realReturnRate / 100;
  const inflation = (options.inflationPercent ?? DEFAULT_COAST_FIRE_INFLATION_PERCENT) / 100;
  const discount = (yearsAfterRetirement: number) => (1 + realReturn) ** yearsAfterRetirement;

  // A survivor benefit is spread over the whole retirement; every other
  // income over the years from its own start.
  const spreadOverRetirement = (income: CoastFireIncome) => income.kind === 'survivor';
  const terms: CoastFireIncomeTerm[] = incomes
    .filter((income) => income.annualAmount > 0)
    .map((income) => {
      const firstAge = Math.max(income.startAge, retirementAge);
      const lastAge = Math.min(income.endAge ?? planThroughAge, planThroughAge);
      const spread = spreadOverRetirement(income);
      let levelAmount = 0;
      if (firstAge < lastAge) {
        if (income.inflationAdjusted && lastAge === planThroughAge && !spread) {
          levelAmount = income.annualAmount;
        } else {
          // The dollars, in today's dollars each year they are paid, valued
          // at retirement; then the level amount with that same value from
          // its start (or retirement, for a survivor benefit) to the end of
          // the plan.
          let value = 0;
          let annuity = 0;
          for (let age = spread ? retirementAge : firstAge; age < planThroughAge; age++) {
            const weight = 1 / discount(age - retirementAge);
            if (age >= firstAge && age < lastAge) {
              const real = income.inflationAdjusted
                ? income.annualAmount
                : income.annualAmount / (1 + inflation) ** (age - inputs.currentAge);
              value += real * weight;
            }
            annuity += weight;
          }
          levelAmount = annuity > 0 ? value / annuity : 0;
        }
      }
      return {
        ...income,
        levelAmount,
        // An income paid only after the plan ends leaves no gap to bridge,
        // and a survivor benefit is already spread over all of retirement.
        gapYears: levelAmount > 0 && !spread ? Math.max(0, income.startAge - retirementAge) : 0,
      };
    });

  const incomeAt = (age: number) => terms
    .filter((term) => term.startAge <= age || spreadOverRetirement(term))
    .reduce((sum, term) => sum + term.levelAmount, 0);
  const steadyIncome = terms.reduce((sum, term) => sum + term.levelAmount, 0);

  // A survivor's spending from an age on, as the level spending with the
  // same value over retirement.
  const change = options.spendingChange;
  let levelSpending: number | undefined;
  if (change && change.fromAge < planThroughAge) {
    let value = 0;
    let annuity = 0;
    for (let age = retirementAge; age < planThroughAge; age++) {
      const weight = 1 / discount(age - retirementAge);
      value += (age >= change.fromAge ? change.annualAmount : inputs.annualRetirementSpending) * weight;
      annuity += weight;
    }
    levelSpending = value / annuity;
  }
  const spending = levelSpending ?? inputs.annualRetirementSpending;
  const steadyNeed = Math.max(0, spending - steadyIncome);

  // Each year before the last income starts, what the portfolio pays beyond
  // the steady state, valued at retirement.
  const lastStart = Math.min(
    planThroughAge,
    terms
      .filter((term) => !spreadOverRetirement(term))
      .reduce((latest, term) => Math.max(latest, term.startAge), retirementAge)
  );
  let bridgeReserve = 0;
  for (let age = retirementAge; age < lastStart; age++) {
    const extra = Math.max(0, spending - incomeAt(age)) - steadyNeed;
    bridgeReserve += extra / discount(age - retirementAge);
  }

  // The straight line on the steady state, validated the way the page's is.
  const base = calculateCoastFire({
    ...inputs,
    annualRetirementSpending: spending,
    annualRetirementIncome: Math.min(steadyIncome, spending),
  });
  const retirementTarget = base.retirementTarget + bridgeReserve;
  const growthFactor = (1 + realReturn) ** base.yearsToRetirement;
  const coastFireNumber = retirementTarget / growthFactor;
  const differenceToday = inputs.currentSavings - coastFireNumber;

  return {
    ...base,
    annualRetirementSpending: inputs.annualRetirementSpending,
    annualRetirementIncome: steadyIncome,
    portfolioSpendingNeed: steadyNeed,
    retirementTarget,
    coastFireNumber,
    differenceToday,
    differenceAtRetirement: base.projectedSavingsAtRetirement - retirementTarget,
    fundedRatio: coastFireNumber === 0 ? Number.POSITIVE_INFINITY : inputs.currentSavings / coastFireNumber,
    hasReachedCoastFire: differenceToday >= 0,
    incomes: terms,
    bridgeReserve,
    planThroughAge,
    ...(terms.some((term) => !term.inflationAdjusted) && { inflationPercent: inflation * 100 }),
    ...(levelSpending !== undefined && change && { spendingChange: change, levelSpending }),
  };
}
