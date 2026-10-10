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
 */

import {
  calculateCoastFire,
  type CoastFireInputs,
  type CoastFireResult,
} from '../services/coast-fire';

/** Only used to value a fixed pension, and named in the answer whenever it is. */
export const DEFAULT_COAST_FIRE_INFLATION_PERCENT = 2.5;

export type CoastFireIncomeKind = 'social_security' | 'pension';

export interface CoastFireIncome {
  kind: CoastFireIncomeKind;
  /** A year: today's dollars when it rises with inflation, otherwise the fixed dollar amount it pays. */
  annualAmount: number;
  startAge: number;
  inflationAdjusted: boolean;
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
  options: { planThroughAge: number; inflationPercent?: number }
): CoastFireIncomeResult {
  const retirementAge = inputs.retirementAge;
  const planThroughAge = Math.max(options.planThroughAge, retirementAge + 1);
  const realReturn = inputs.realReturnRate / 100;
  const inflation = (options.inflationPercent ?? DEFAULT_COAST_FIRE_INFLATION_PERCENT) / 100;
  const discount = (yearsAfterRetirement: number) => (1 + realReturn) ** yearsAfterRetirement;

  const terms: CoastFireIncomeTerm[] = incomes
    .filter((income) => income.annualAmount > 0)
    .map((income) => {
      const firstAge = Math.max(income.startAge, retirementAge);
      let levelAmount = 0;
      if (firstAge < planThroughAge) {
        if (income.inflationAdjusted) {
          levelAmount = income.annualAmount;
        } else {
          // The fixed dollars, in today's dollars each year they are paid,
          // valued at retirement; then the level amount with that same value.
          let value = 0;
          let annuity = 0;
          for (let age = firstAge; age < planThroughAge; age++) {
            const weight = 1 / discount(age - retirementAge);
            value += (income.annualAmount / (1 + inflation) ** (age - inputs.currentAge)) * weight;
            annuity += weight;
          }
          levelAmount = annuity > 0 ? value / annuity : 0;
        }
      }
      return {
        ...income,
        levelAmount,
        // An income paid only after the plan ends leaves no gap to bridge.
        gapYears: levelAmount > 0 ? Math.max(0, income.startAge - retirementAge) : 0,
      };
    });

  const incomeAt = (age: number) => terms
    .filter((term) => term.startAge <= age)
    .reduce((sum, term) => sum + term.levelAmount, 0);
  const steadyIncome = terms.reduce((sum, term) => sum + term.levelAmount, 0);
  const spending = inputs.annualRetirementSpending;
  const steadyNeed = Math.max(0, spending - steadyIncome);

  // Each year before the last income starts, what the portfolio pays beyond
  // the steady state, valued at retirement.
  const lastStart = Math.min(
    planThroughAge,
    terms.reduce((latest, term) => Math.max(latest, term.startAge), retirementAge)
  );
  let bridgeReserve = 0;
  for (let age = retirementAge; age < lastStart; age++) {
    const extra = Math.max(0, spending - incomeAt(age)) - steadyNeed;
    bridgeReserve += extra / discount(age - retirementAge);
  }

  // The straight line on the steady state, validated the way the page's is.
  const base = calculateCoastFire({ ...inputs, annualRetirementIncome: Math.min(steadyIncome, spending) });
  const retirementTarget = base.retirementTarget + bridgeReserve;
  const growthFactor = (1 + realReturn) ** base.yearsToRetirement;
  const coastFireNumber = retirementTarget / growthFactor;
  const differenceToday = inputs.currentSavings - coastFireNumber;

  return {
    ...base,
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
  };
}
