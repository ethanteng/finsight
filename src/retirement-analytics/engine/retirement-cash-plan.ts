// A year of a retired household's cash
//
// How much to draw from each kind of account so the household can spend what
// it plans after paying income tax and health premiums, in today's dollars.
// Taxable money is drawn first, then pre-tax, then Roth, the conventional
// order; a required minimum distribution comes out of pre-tax money whatever
// the order would take, and what of it the household does not need is
// reinvested in the taxable account after tax. The tax and the premiums
// depend on the draw, so the draw is solved: the smallest draw whose cash,
// after tax and premiums, covers the spending.

import { taxForYear, type YearTax } from './taxes';
import { premiumTaxCredit } from './healthcare';

export type TaxHousehold = 'single' | 'joint' | 'separate_singles';

export interface AccountBalances {
  taxable: number;
  pretax: number;
  roth: number;
}

export interface YearCashInput {
  /** What the household spends this year. */
  spending: number;
  /** Pensions and other income taxed as ordinary income. */
  ordinaryIncome: number;
  socialSecurity: number;
  balances: AccountBalances;
  /** Cost basis of the taxable account: what can be drawn without a gain. */
  taxableBasis: number;
  /** The least that must come out of pre-tax accounts this year. */
  requiredDistribution: number;
  tax?: {
    household: TaxHousehold;
    peopleAged65: number;
    stateRate: number;
    priceLevel: number;
  };
  healthcare?: {
    /** Premiums that do not depend on income: Medicare, COBRA, a stated premium. */
    fixedPremiums: number;
    /** The marketplace benchmark premiums of everyone covered there, before any credit. */
    marketplaceBenchmark: number;
    /**
     * How many people the benchmark covers this year (can be fractional when
     * someone turns 65 mid-year). Used so an unmarried couple's credit is not
     * split across a Medicare enrollee who has no marketplace premium.
     */
    marketplacePeople: number;
    /** People in the household, for the poverty line. */
    householdSize: number;
  };
}

export interface YearCashPlan {
  draws: AccountBalances;
  /** Required-distribution money not needed this year, moved to the taxable account after tax. */
  reinvested: number;
  federalTax: number;
  stateTax: number;
  /** Premiums paid, after any premium tax credit. */
  premiums: number;
  premiumTaxCredit: number;
  /** Spending the accounts could not cover, once everything was drawn. */
  shortfall: number;
}

interface Evaluation {
  draws: AccountBalances;
  cash: number;
  federalTax: number;
  stateTax: number;
  premiums: number;
  premiumTaxCredit: number;
}

function householdTax(
  input: YearCashInput,
  ordinary: number,
  gains: number
): Pick<YearTax, 'federal' | 'state' | 'modifiedAdjustedGrossIncome'> {
  const tax = input.tax;
  if (!tax) {
    // Untaxed, income still decides any premium credit.
    return { federal: 0, state: 0, modifiedAdjustedGrossIncome: ordinary + gains + input.socialSecurity };
  }
  if (tax.household === 'separate_singles') {
    // An unmarried couple files two returns; each is counted on half of the
    // household's income.
    const half = taxForYear({
      filing: 'single',
      peopleAged65: tax.peopleAged65 / 2,
      ordinaryIncome: ordinary / 2,
      socialSecurity: input.socialSecurity / 2,
      capitalGains: gains / 2,
      stateRate: tax.stateRate,
      priceLevel: tax.priceLevel,
    });
    return {
      federal: half.federal * 2,
      state: half.state * 2,
      modifiedAdjustedGrossIncome: half.modifiedAdjustedGrossIncome * 2,
    };
  }
  return taxForYear({
    filing: tax.household,
    peopleAged65: tax.peopleAged65,
    ordinaryIncome: ordinary,
    socialSecurity: input.socialSecurity,
    capitalGains: gains,
    stateRate: tax.stateRate,
    priceLevel: tax.priceLevel,
  });
}

function evaluate(input: YearCashInput, discretionary: number): Evaluation {
  const { balances } = input;
  const taxable = Math.min(discretionary, balances.taxable);
  let rest = discretionary - taxable;
  const pretaxByOrder = Math.min(rest, balances.pretax);
  rest -= pretaxByOrder;
  const roth = Math.min(rest, balances.roth);
  const pretax = Math.max(pretaxByOrder, Math.min(input.requiredDistribution, balances.pretax));

  const gainShare = balances.taxable > 0
    ? Math.min(1, Math.max(0, 1 - input.taxableBasis / balances.taxable))
    : 0;
  const gains = taxable * gainShare;
  const ordinary = input.ordinaryIncome + pretax;
  const tax = householdTax(input, ordinary, gains);

  let premiums = 0;
  let credit = 0;
  const health = input.healthcare;
  if (health) {
    const marketplacePeople = Math.max(0, health.marketplacePeople);
    if (
      input.tax?.household === 'separate_singles' &&
      health.householdSize > 1 &&
      marketplacePeople > 0
    ) {
      // Each unmarried partner files alone. Only people on the marketplace
      // share that credit; a Medicare enrollee is not given a phantom half
      // of the benchmark.
      credit = marketplacePeople * premiumTaxCredit({
        benchmarkPremium: health.marketplaceBenchmark / marketplacePeople,
        modifiedAdjustedGrossIncome: tax.modifiedAdjustedGrossIncome / health.householdSize,
        householdSize: 1,
      });
    } else {
      credit = premiumTaxCredit({
        benchmarkPremium: health.marketplaceBenchmark,
        modifiedAdjustedGrossIncome: tax.modifiedAdjustedGrossIncome,
        householdSize: health.householdSize,
      });
    }
    premiums = health.fixedPremiums + Math.max(0, health.marketplaceBenchmark - credit);
  }

  const cash = input.ordinaryIncome + input.socialSecurity + taxable + pretax + roth -
    tax.federal - tax.state - premiums;
  return {
    draws: { taxable, pretax, roth },
    cash,
    federalTax: tax.federal,
    stateTax: tax.state,
    premiums,
    premiumTaxCredit: credit,
  };
}

function plan(input: YearCashInput, result: Evaluation, shortfall: number): YearCashPlan {
  // Only required-distribution money is kept; income the household does not
  // spend is not banked, as throughout the simulation.
  const surplus = Math.max(0, result.cash - Math.max(0, input.spending));
  const required = Math.min(Math.max(0, input.requiredDistribution), input.balances.pretax);
  return {
    draws: result.draws,
    reinvested: Math.min(surplus, required),
    federalTax: result.federalTax,
    stateTax: result.stateTax,
    premiums: result.premiums,
    premiumTaxCredit: result.premiumTaxCredit,
    shortfall,
  };
}

/**
 * Smallest discretionary draw in [lowBound, highBound] whose cash covers
 * spending. Cash must be non-decreasing on that interval. Null when even
 * highBound cannot cover.
 */
function smallestCovering(
  input: YearCashInput,
  spending: number,
  lowBound: number,
  highBound: number
): YearCashPlan | null {
  if (!(highBound >= lowBound)) return null;
  const atHigh = evaluate(input, highBound);
  if (atHigh.cash < spending) return null;
  const atLow = evaluate(input, lowBound);
  if (atLow.cash >= spending) return plan(input, atLow, 0);

  let low = lowBound;
  let high = highBound;
  for (let i = 0; i < 64 && high - low > 1e-4; i++) {
    const middle = (low + high) / 2;
    if (evaluate(input, middle).cash >= spending) high = middle;
    else low = middle;
  }
  return plan(input, evaluate(input, high), 0);
}

/** The year's draws, taxes and premiums, in today's dollars. */
export function planYearCash(input: YearCashInput): YearCashPlan {
  const spending = Math.max(0, input.spending);
  const base = evaluate(input, 0);
  if (base.cash >= spending) return plan(input, base, 0);

  const total = input.balances.taxable + input.balances.pretax + input.balances.roth;
  const all = evaluate(input, total);
  if (all.cash < spending) return plan(input, all, spending - all.cash);

  // Cash usually rises with the draw, but losing the premium tax credit at
  // 400% of the poverty line can drop cash: a below-cliff draw may cover
  // spending when a larger one does not. Prefer the smallest covering draw
  // that keeps a credit when one exists; only clear the cliff when that
  // window cannot cover.
  const marketplace = input.healthcare?.marketplaceBenchmark ?? 0;
  if (marketplace > 0 && base.premiumTaxCredit > 0) {
    let low = 0;
    let high = total;
    for (let i = 0; i < 64 && high - low > 1e-4; i++) {
      const middle = (low + high) / 2;
      if (evaluate(input, middle).premiumTaxCredit > 0) low = middle;
      else high = middle;
    }
    const below = smallestCovering(input, spending, 0, low);
    if (below) return below;
    const above = smallestCovering(input, spending, high, total);
    if (above) return above;
  }

  return smallestCovering(input, spending, 0, total) ?? plan(input, all, 0);
}
