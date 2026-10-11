// Taxes on retirement income
//
// One year's federal and state income tax, in today's dollars, on what a
// retired household draws and is paid: withdrawals from pre-tax accounts and
// pensions as ordinary income, gains realized in a taxable account at the
// long-term capital-gains rates, and Social Security by its own
// provisional-income formula. Roth withdrawals are tax-free.
//
// The brackets, the standard deduction and the capital-gains thresholds are
// indexed to inflation every year, so in today's dollars they hold level and
// the 2026 figures serve every simulated year. Three thresholds are written
// into law in nominal dollars and never indexed -- Social Security's base
// amounts and the net investment income tax threshold -- so they shrink in
// today's dollars by the year's price level, which is how more of a benefit
// becomes taxable over a long retirement.
//
// Figures: IRS Rev. Proc. 2025-32 (tax year 2026); IRC 86 (Social Security);
// IRC 1411 (NIIT); Treas. Reg. 1.401(a)(9)-9 Uniform Lifetime Table (2022);
// SECURE 2.0 for the age required minimum distributions begin. Refresh each
// year with the new revenue procedure.

export const TAX_FIGURES_YEAR = 2026;

export type FilingStatus = 'single' | 'joint';

interface FilingFigures {
  standardDeduction: number;
  /** Added per person 65 or older. */
  additionalDeduction65: number;
  /** Upper bound of each bracket, in order, with its rate. */
  brackets: ReadonlyArray<readonly [upTo: number, rate: number]>;
  /** Taxable income up to which long-term gains are taxed at 0%, then 15%. */
  capitalGainsZeroUpTo: number;
  capitalGainsFifteenUpTo: number;
  /** Nominal, never indexed. */
  netInvestmentIncomeThreshold: number;
  socialSecurityBaseAmounts: readonly [first: number, second: number];
}

export const FEDERAL_TAX_2026: Readonly<Record<FilingStatus, FilingFigures>> = {
  single: {
    standardDeduction: 16_100,
    additionalDeduction65: 2_050,
    brackets: [
      [12_400, 0.10],
      [50_400, 0.12],
      [105_700, 0.22],
      [201_775, 0.24],
      [256_225, 0.32],
      [640_600, 0.35],
      [Number.POSITIVE_INFINITY, 0.37],
    ],
    capitalGainsZeroUpTo: 49_450,
    capitalGainsFifteenUpTo: 545_500,
    netInvestmentIncomeThreshold: 200_000,
    socialSecurityBaseAmounts: [25_000, 34_000],
  },
  joint: {
    standardDeduction: 32_200,
    additionalDeduction65: 1_650,
    brackets: [
      [24_800, 0.10],
      [100_800, 0.12],
      [211_400, 0.22],
      [403_550, 0.24],
      [512_450, 0.32],
      [768_700, 0.35],
      [Number.POSITIVE_INFINITY, 0.37],
    ],
    capitalGainsZeroUpTo: 98_900,
    capitalGainsFifteenUpTo: 613_700,
    netInvestmentIncomeThreshold: 250_000,
    socialSecurityBaseAmounts: [32_000, 44_000],
  },
};

const NET_INVESTMENT_INCOME_RATE = 0.038;

export interface YearTaxInput {
  filing: FilingStatus;
  /** People on the return who are 65 or older: each adds to the standard deduction. */
  peopleAged65: number;
  /** Pre-tax withdrawals and pensions, in today's dollars. */
  ordinaryIncome: number;
  /** Social Security paid in the year, in today's dollars. */
  socialSecurity: number;
  /** Long-term gains realized in a taxable account, in today's dollars. */
  capitalGains: number;
  /** State income tax as a share of pre-tax withdrawals, pensions and gains; Social Security is exempt. */
  stateRate: number;
  /** Prices relative to today: an unindexed threshold is worth 1/priceLevel of itself. Defaults to 1. */
  priceLevel?: number;
}

export interface YearTax {
  federal: number;
  state: number;
  /** The part of Social Security counted as income. */
  taxableSocialSecurity: number;
  adjustedGrossIncome: number;
  /** Adjusted gross income plus untaxed Social Security, as the premium tax credit counts it. */
  modifiedAdjustedGrossIncome: number;
}

/** Social Security counted as income: none, up to half, then up to 85%, by provisional income. */
export function taxableSocialSecurity(
  otherIncome: number,
  benefits: number,
  baseAmounts: readonly [number, number]
): number {
  if (!(benefits > 0)) return 0;
  const [first, second] = baseAmounts;
  const provisional = Math.max(0, otherIncome) + benefits / 2;
  if (provisional <= first) return 0;
  if (provisional <= second) return Math.min(benefits / 2, (provisional - first) / 2);
  return Math.min(0.85 * benefits, 0.85 * (provisional - second) + Math.min(benefits / 2, (second - first) / 2));
}

function bracketTax(taxableIncome: number, brackets: FilingFigures['brackets']): number {
  let tax = 0;
  let lower = 0;
  for (const [upTo, rate] of brackets) {
    if (taxableIncome <= lower) break;
    tax += (Math.min(taxableIncome, upTo) - lower) * rate;
    lower = upTo;
  }
  return tax;
}

/** One year's income tax on a retired household's draws and income, in today's dollars. */
export function taxForYear(input: YearTaxInput): YearTax {
  const figures = FEDERAL_TAX_2026[input.filing];
  const priceLevel = input.priceLevel && input.priceLevel > 0 ? input.priceLevel : 1;
  const ordinary = Math.max(0, input.ordinaryIncome);
  const gains = Math.max(0, input.capitalGains);
  const benefits = Math.max(0, input.socialSecurity);
  const [first, second] = figures.socialSecurityBaseAmounts;
  const counted = taxableSocialSecurity(ordinary + gains, benefits, [first / priceLevel, second / priceLevel]);
  const agi = ordinary + gains + counted;

  const deduction = figures.standardDeduction + figures.additionalDeduction65 * Math.max(0, Math.min(2, input.peopleAged65));
  const taxableIncome = Math.max(0, agi - deduction);
  // Gains sit on top of ordinary income: the deduction is used up by ordinary
  // income first, and the gains' rate depends on where they land.
  const taxableGains = Math.min(gains, taxableIncome);
  const taxableOrdinary = taxableIncome - taxableGains;
  const atZero = Math.min(taxableGains, Math.max(0, figures.capitalGainsZeroUpTo - taxableOrdinary));
  const atFifteen = Math.min(
    taxableGains - atZero,
    Math.max(0, figures.capitalGainsFifteenUpTo - Math.max(taxableOrdinary, figures.capitalGainsZeroUpTo))
  );
  const atTwenty = taxableGains - atZero - atFifteen;
  const netInvestmentIncome = Math.max(0, Math.min(gains, agi - figures.netInvestmentIncomeThreshold / priceLevel));
  const federal = bracketTax(taxableOrdinary, figures.brackets) +
    0.15 * atFifteen + 0.20 * atTwenty +
    NET_INVESTMENT_INCOME_RATE * netInvestmentIncome;
  const state = Math.max(0, input.stateRate) * (ordinary + gains);
  return {
    federal,
    state,
    taxableSocialSecurity: counted,
    adjustedGrossIncome: agi,
    modifiedAdjustedGrossIncome: agi + (benefits - counted),
  };
}

/** Uniform Lifetime Table (2022): the divisor for a pre-tax balance at each age. */
const UNIFORM_LIFETIME_DIVISORS: Readonly<Record<number, number>> = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
  80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4,
  88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
  96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2,
  104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4,
  112: 3.3, 113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3,
};

export function uniformLifetimeDivisor(age: number): number | undefined {
  const whole = Math.floor(age);
  if (whole < 72) return undefined;
  return UNIFORM_LIFETIME_DIVISORS[whole] ?? 2.0;
}

/**
 * The age required minimum distributions begin, by birth year (SECURE 2.0):
 * 75 for anyone born in 1960 or later, 73 for 1951 to 1959. Anyone born
 * earlier has already begun, so the age they began at serves.
 */
export function requiredDistributionAge(birthYear: number): number {
  if (birthYear >= 1960) return 75;
  if (birthYear >= 1951) return 73;
  return 72;
}
