// A year of a retired household's cash
//
// How much to draw from each kind of account so the household can spend what
// it plans after paying income tax and health premiums, in today's dollars.
// Taxable money is drawn first, then pre-tax, then Roth, the conventional
// order; a required minimum distribution comes out of pre-tax money whatever
// the order would take, and what of it the household does not need is
// reinvested in the taxable account after tax. Pre-tax money drawn before
// 59 1/2 pays the 10% additional tax (IRC 72(t)); its exceptions -- leaving
// an employer at 55 or later, substantially equal periodic payments -- are
// not counted. The tax and the premiums depend on the draw, so the draw is
// solved: the smallest draw whose cash, after tax and premiums, covers the
// spending.

import { taxForYear, type YearTax } from './taxes';
import { CREDIT_INCOME_CAP, povertyLine, premiumTaxCredit } from './healthcare';

/** The additional tax on pre-tax money drawn before 59 1/2. */
export const EARLY_WITHDRAWAL_TAX_RATE = 0.10;
export const EARLY_WITHDRAWAL_AGE = 59.5;

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
    /** Share of the year the pre-tax money's owner is under 59 1/2, when its draws pay the additional tax. */
    earlyWithdrawalShare?: number;
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
    /**
     * Share of the year with marketplace coverage (calendar months / 12).
     * Form 8962 scales the expected income contribution by coverage months; a
     * prorated benchmark with a full-year contribution understates the credit.
     * Defaults to a full year when omitted.
     */
    marketplaceCoverageShare?: number;
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
  /** Whether income is past the point where the premium tax credit stops. */
  pastCreditCap: boolean;
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
  const earlyShare = Math.min(1, Math.max(0, input.tax?.earlyWithdrawalShare ?? 0));
  const earlyWithdrawalTax = EARLY_WITHDRAWAL_TAX_RATE * earlyShare * pretax;

  let premiums = 0;
  let credit = 0;
  let pastCreditCap = false;
  const health = input.healthcare;
  if (health) {
    const marketplacePeople = Math.max(0, health.marketplacePeople);
    const separate = input.tax?.household === 'separate_singles' && health.householdSize > 1;
    pastCreditCap = separate
      ? tax.modifiedAdjustedGrossIncome / health.householdSize > CREDIT_INCOME_CAP * povertyLine(1)
      : tax.modifiedAdjustedGrossIncome > CREDIT_INCOME_CAP * povertyLine(health.householdSize);
    if (separate && marketplacePeople > 0) {
      // Each unmarried partner files alone. Only people on the marketplace
      // share that credit; a Medicare enrollee is not given a phantom half
      // of the benchmark. Person-years annualize the benchmark so a half-year
      // of coverage pays half a year's expected contribution, not a full one.
      credit = marketplacePeople * premiumTaxCredit({
        benchmarkPremium: health.marketplaceBenchmark / marketplacePeople,
        modifiedAdjustedGrossIncome: tax.modifiedAdjustedGrossIncome / health.householdSize,
        householdSize: 1,
      });
    } else if (health.marketplaceBenchmark > 0) {
      // Joint / single: Form 8962's monthly contribution is (applicable% ×
      // annual MAGI) / 12 for each covered month, so scale the annual credit
      // by coverage share rather than feeding a prorated benchmark a full year
      // of expected contribution.
      const coverageShare = Math.min(
        1,
        Math.max(0, health.marketplaceCoverageShare ?? 1)
      );
      credit = coverageShare > 0
        ? coverageShare * premiumTaxCredit({
          benchmarkPremium: health.marketplaceBenchmark / coverageShare,
          modifiedAdjustedGrossIncome: tax.modifiedAdjustedGrossIncome,
          householdSize: health.householdSize,
        })
        : 0;
    }
    premiums = health.fixedPremiums + Math.max(0, health.marketplaceBenchmark - credit);
  }

  const federal = tax.federal + earlyWithdrawalTax;
  const cash = input.ordinaryIncome + input.socialSecurity + taxable + pretax + roth -
    federal - tax.state - premiums;
  return {
    draws: { taxable, pretax, roth },
    cash,
    federalTax: federal,
    stateTax: tax.state,
    premiums,
    premiumTaxCredit: credit,
    pastCreditCap,
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

/** The year's draws, taxes and premiums, in today's dollars. */
export function planYearCash(input: YearCashInput): YearCashPlan {
  const spending = Math.max(0, input.spending);
  const base = evaluate(input, 0);
  if (base.cash >= spending) return plan(input, base, 0);

  const total = input.balances.taxable + input.balances.pretax + input.balances.roth;
  const all = evaluate(input, total);
  if (all.cash < spending) return plan(input, all, spending - all.cash);

  const covers = (draw: number) => evaluate(input, draw).cash >= spending;
  /** The smallest draw in [low, high] that passes `test`, given it passes at `high` and keeps passing once it does. */
  const smallest = (low: number, high: number, test: typeof covers): number => {
    for (let i = 0; i < 64 && high - low > 1e-4; i++) {
      const middle = (low + high) / 2;
      if (test(middle)) high = middle;
      else low = middle;
    }
    return high;
  };
  // Cash rises with the draw, since no tax or premium takes all of a dollar,
  // with one exception: past 400% of the poverty line the whole premium
  // credit is lost at once, and cash falls. So the draws on either side of
  // that point are searched apart, the lower side first, which keeps the
  // credit whenever spending can be covered without crossing it.
  if (!base.pastCreditCap && all.pastCreditCap) {
    const cliff = smallest(0, total, (draw) => evaluate(input, draw).pastCreditCap);
    const below = Math.max(0, cliff - 1e-3);
    if (covers(below)) return plan(input, evaluate(input, smallest(0, below, covers)), 0);
    return plan(input, evaluate(input, smallest(cliff, total, covers)), 0);
  }
  return plan(input, evaluate(input, smallest(0, total, covers)), 0);
}
