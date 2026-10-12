// Healthcare premiums in retirement
//
// What a retired household pays for health coverage a year, per person, in
// today's dollars: before 65 the coverage the user names, and from 65
// Medicare's Part B and Part D base premiums. Premiums only: deductibles,
// copays, Medigap and Medicare's income-related surcharges are not counted.
// Premiums are held level in today's dollars, though they have tended to
// rise faster than prices.
//
// Figures, refreshed each year:
// - Medicare Part B standard premium, 2026: $202.90 a month (CMS, Nov 2025).
// - Medicare Part D base beneficiary premium, 2026: $38.99 a month (CMS).
// - Marketplace benchmark (second-lowest-cost silver) premium for a
//   40-year-old, 2026 national average: $625 a month (KFF), scaled by age on
//   the federal default age curve (CMS, Dec 2016 guidance, Appendix I).
// - COBRA: the 2025 average employer premium for single coverage, $9,325 a
//   year (KFF Employer Health Benefits Survey), plus the 2% COBRA allows, for
//   18 months.
// - Premium tax credit, 2026 coverage: the applicable percentages of Rev.
//   Proc. 2025-25 (2.10% to 9.96% of income, none below 100% or above 400%
//   of the poverty line, now the enhanced credits have ended) against the
//   2025 HHS poverty guidelines ($15,650 for one, $21,150 for two).

export const HEALTHCARE_FIGURES_YEAR = 2026;

export const MEDICARE_ANNUAL_PREMIUM = (202.90 + 38.99) * 12;
export const MEDICARE_AGE = 65;

const BENCHMARK_MONTHLY_AT_40 = 625;
export const COBRA_ANNUAL_PREMIUM = 9_325 * 1.02;
export const COBRA_MONTHS = 18;

/** Federal default age curve: premium relative to a 21-year-old. */
const AGE_CURVE: Readonly<Record<number, number>> = {
  21: 1.000, 22: 1.000, 23: 1.000, 24: 1.000, 25: 1.004, 26: 1.024, 27: 1.048, 28: 1.087, 29: 1.119,
  30: 1.135, 31: 1.159, 32: 1.183, 33: 1.198, 34: 1.214, 35: 1.222, 36: 1.230, 37: 1.238, 38: 1.246,
  39: 1.262, 40: 1.278, 41: 1.302, 42: 1.325, 43: 1.357, 44: 1.397, 45: 1.444, 46: 1.500, 47: 1.563,
  48: 1.635, 49: 1.706, 50: 1.786, 51: 1.865, 52: 1.952, 53: 2.040, 54: 2.135, 55: 2.230, 56: 2.333,
  57: 2.437, 58: 2.548, 59: 2.603, 60: 2.714, 61: 2.810, 62: 2.873, 63: 2.952, 64: 3.000,
};

/** The national average benchmark marketplace premium a year at an age, before any credit. */
export function marketplaceBenchmarkPremium(age: number): number {
  const whole = Math.max(21, Math.min(64, Math.floor(age)));
  return BENCHMARK_MONTHLY_AT_40 * 12 * (AGE_CURVE[whole] / AGE_CURVE[40]);
}

/** Poverty line by household size: the guideline 2026 coverage is priced against. */
export function povertyLine(householdSize: number): number {
  return 15_650 + 5_500 * Math.max(0, Math.round(householdSize) - 1);
}

/** Income above this multiple of the poverty line earns no premium tax credit. */
export const CREDIT_INCOME_CAP = 4;

/**
 * The share of income a household is expected to pay for the benchmark plan,
 * by income as a multiple of the poverty line; undefined where no credit is
 * paid: above 400%, and below 100%, where the credit requires at least the
 * poverty line. A household that low may qualify for Medicaid in a state
 * that expanded it; the plan does not count that, and prices the full
 * premium instead, which is what it costs in a state that did not.
 */
export function applicablePercentage(povertyMultiple: number): number | undefined {
  if (povertyMultiple > CREDIT_INCOME_CAP || povertyMultiple < 1) return undefined;
  const bands: ReadonlyArray<readonly [from: number, to: number, startRate: number, endRate: number]> = [
    [1, 1.33, 0.0210, 0.0210],
    [1.33, 1.5, 0.0314, 0.0419],
    [1.5, 2, 0.0419, 0.0660],
    [2, 2.5, 0.0660, 0.0844],
    [2.5, 3, 0.0844, 0.0996],
    [3, 4, 0.0996, 0.0996],
  ];
  for (const [from, to, startRate, endRate] of bands) {
    if (povertyMultiple <= to) {
      const position = to > from ? (Math.max(from, povertyMultiple) - from) / (to - from) : 0;
      return startRate + (endRate - startRate) * position;
    }
  }
  return undefined;
}

/**
 * The premium tax credit for a year of marketplace coverage, in today's
 * dollars: the benchmark premium less the share of income the household is
 * expected to pay, never below zero. The poverty line rises with prices, so
 * in today's dollars it holds level.
 */
export function premiumTaxCredit(args: {
  /** The benchmark premiums of everyone in the household on the marketplace. */
  benchmarkPremium: number;
  modifiedAdjustedGrossIncome: number;
  householdSize: number;
}): number {
  if (!(args.benchmarkPremium > 0)) return 0;
  const income = Math.max(0, args.modifiedAdjustedGrossIncome);
  const multiple = income / povertyLine(args.householdSize);
  const share = applicablePercentage(multiple);
  if (share === undefined) return 0;
  return Math.max(0, args.benchmarkPremium - share * income);
}

export type PreMedicareCoverage = 'marketplace' | 'cobra' | 'employer_retiree' | 'spouse_plan';
