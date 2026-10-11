/**
 * Social Security's own rules for what claiming earlier or later does to a
 * retirement benefit.
 *
 * A benefit belongs to an age: the amount someone receives depends on when
 * they claim. Without these rules a "what if I claim at 70?" kept the amount
 * and only started it later, so claiming later always looked worse. These are
 * arithmetic the application performs from SSA's published formula, so the
 * model still never estimates a number.
 *
 * - Full retirement age (FRA) rises from 66 to 67 across birth years 1955-1960.
 * - Claiming before FRA reduces the benefit 5/9 of 1% a month for the first 36
 *   months and 5/12 of 1% a month beyond that, back to 62.
 * - Claiming after FRA adds delayed retirement credits of 8% a year (2/3 of 1%
 *   a month), up to 70; nothing more is earned after that.
 *
 * Spousal and survivor benefits follow rules of their own, also here, and
 * `household.ts` applies them to a married couple.
 */

import type { SavableFigure } from '../openai/save-offer';

export const EARLIEST_CLAIMING_AGE = 62;
export const LATEST_CREDIT_AGE = 70;

/** Full retirement age, in months, for a birth year (SSA's table). */
export function fullRetirementAgeMonths(birthYear: number): number {
  if (birthYear <= 1937) return 65 * 12;
  if (birthYear <= 1942) return 65 * 12 + (birthYear - 1937) * 2;
  if (birthYear <= 1954) return 66 * 12;
  if (birthYear <= 1959) return 66 * 12 + (birthYear - 1954) * 2;
  return 67 * 12;
}

/**
 * Full retirement age for a survivor's benefit, in months. It follows its own
 * table, two years behind the retirement one: 66 for 1945-1956, rising two
 * months a year to 67 for 1962 and later.
 */
export function survivorFullRetirementAgeMonths(birthYear: number): number {
  if (birthYear <= 1939) return 65 * 12;
  if (birthYear <= 1944) return 65 * 12 + (birthYear - 1939) * 2;
  if (birthYear <= 1956) return 66 * 12;
  if (birthYear <= 1961) return 66 * 12 + (birthYear - 1956) * 2;
  return 67 * 12;
}

/** The birth year a current age implies, as every rule here reads it. */
export function birthYearOf(currentAge: number, asOfYear?: number): number {
  return (asOfYear ?? new Date().getUTCFullYear()) - currentAge;
}

/**
 * The full-retirement-age benefit (the primary insurance amount) behind a
 * benefit claimed at an age: what spousal and survivor benefits are worked
 * out from, rather than the amount a claiming age made of it.
 */
export function primaryInsuranceAmount(args: {
  amount: number;
  claimAge: number;
  currentAge: number;
  asOfYear?: number;
}): number {
  if (!(args.amount > 0)) return 0;
  const fra = fullRetirementAgeMonths(birthYearOf(args.currentAge, args.asOfYear));
  return args.amount / claimingFactor(args.claimAge * 12, fra);
}

/**
 * A spousal benefit started before full retirement age is reduced 25/36 of 1%
 * a month for the first 36 months and 5/12 of 1% a month beyond that; one
 * started later earns nothing for the wait.
 */
export function spousalFactor(startMonths: number, fraMonths: number): number {
  const early = Math.max(0, fraMonths - Math.max(EARLIEST_CLAIMING_AGE * 12, startMonths));
  return 1 - (Math.min(early, 36) * 25) / 3600 - (Math.max(0, early - 36) * 5) / 1200;
}

/** The earliest a survivor's benefit can start, other than for someone caring for a child. */
export const EARLIEST_SURVIVOR_AGE = 60;

/**
 * A survivor's benefit started before the survivor's full retirement age is
 * reduced in proportion to the months early, to 71.5% at 60.
 */
export function survivorFactor(startMonths: number, survivorFraMonths: number): number {
  const start = Math.max(EARLIEST_SURVIVOR_AGE * 12, startMonths);
  if (start >= survivorFraMonths) return 1;
  return 1 - (0.285 * (survivorFraMonths - start)) / (survivorFraMonths - EARLIEST_SURVIVOR_AGE * 12);
}

/**
 * The benefit at a claiming age as a share of the full-retirement-age benefit.
 * Ages are clamped to 62-70, the only span the rules change anything in: a
 * benefit cannot be claimed earlier, and grows no further after 70.
 */
export function claimingFactor(claimAgeMonths: number, fraMonths: number): number {
  const claim = Math.min(LATEST_CREDIT_AGE * 12, Math.max(EARLIEST_CLAIMING_AGE * 12, claimAgeMonths));
  if (claim < fraMonths) {
    const early = fraMonths - claim;
    return 1 - (Math.min(early, 36) * 5) / 900 - (Math.max(0, early - 36) * 5) / 1200;
  }
  return 1 + ((claim - fraMonths) * 2) / 300;
}

export interface ClaimingAdjustment {
  /** The benefit as the user gave it, and the age it is for. */
  fromAmount: number;
  fromAge: number;
  /** The claiming age the calculation runs, and the benefit there. */
  toAge: number;
  amount: number;
  /** Full retirement age used, from the birth year the current age implies. */
  fullRetirementAge: { years: number; months: number };
}

/**
 * The same benefit claimed at another age, or null when the rules change
 * nothing or cannot apply: the same effective age (both at or past 70, say),
 * an age before 62, or a claim age already in the past.
 *
 * `quotedAtAge` is only the age a stated figure is for (a statement's
 * reference age). It is not proof that payments have begun: a 68-year-old
 * whose statement quotes a benefit at 67 can still earn delayed credits by
 * claiming at 70. Callers that know the plan's start age is already at or
 * before today treat that as already paid and do not ask to move it.
 *
 * The birth year comes from the current age, so it can be a year off around a
 * birthday; that only moves the full retirement age, by two months, for
 * someone born 1955-1960.
 */
export function benefitAtClaimingAge(args: {
  amount: number;
  /** The age the amount is for. */
  quotedAtAge: number;
  claimAge: number;
  currentAge: number;
  asOfYear?: number;
}): ClaimingAdjustment | null {
  const { amount, quotedAtAge, claimAge, currentAge } = args;
  if (!(amount > 0) || quotedAtAge === claimAge) return null;
  // A retirement benefit cannot start before 62, so an age before it is some
  // other benefit (disability, survivor) these rules do not describe.
  if (quotedAtAge < EARLIEST_CLAIMING_AGE || claimAge < EARLIEST_CLAIMING_AGE) return null;
  // A claim that would have to start in the past cannot be moved; claiming
  // at today's age still can.
  if (claimAge < currentAge) return null;
  const birthYear = (args.asOfYear ?? new Date().getUTCFullYear()) - currentAge;
  const fra = fullRetirementAgeMonths(birthYear);
  const from = claimingFactor(quotedAtAge * 12, fra);
  const to = claimingFactor(claimAge * 12, fra);
  if (Math.abs(from - to) < 1e-12) return null;
  return {
    fromAmount: amount,
    fromAge: quotedAtAge,
    toAge: claimAge,
    amount: Math.round((amount * to) / from),
    fullRetirementAge: { years: Math.floor(fra / 12), months: fra % 12 },
  };
}

/**
 * The age a Social Security figure is for. In order: the age the user named
 * for it; for a comparison that only moves the claiming age, the age the main
 * case's figure was for (so "what if I claim at 70?" moves the same benefit);
 * for a figure from Your numbers, the start age saved beside it, which is 67
 * when none was saved; otherwise the age it is claimed at, which leaves it
 * as stated.
 */
export function socialSecurityQuoteAge(args: {
  namedAge?: number;
  inheritedAge?: number;
  saved?: { startAge?: number; defaultStartAge: number };
  claimAge: number;
}): number {
  if (args.namedAge !== undefined) return args.namedAge;
  if (args.inheritedAge !== undefined) return args.inheritedAge;
  if (args.saved) return args.saved.startAge ?? args.saved.defaultStartAge;
  return args.claimAge;
}

/**
 * Your numbers keeps a benefit beside the age it starts, so a benefit moved to
 * another claiming age is saved as it is paid there, with that age: saving the
 * figure as given beside the new age would later read as the benefit at it.
 */
export function withClaimedBenefit(
  figures: SavableFigure[],
  claiming: ClaimingAdjustment | null | undefined,
  namedAmountAge: boolean
): SavableFigure[] {
  const isBenefit = (figure: SavableFigure) =>
    figure.key === 'socialSecurityAnnual' || figure.key === 'socialSecurityStartAge';
  if (!claiming || !(namedAmountAge || figures.some(isBenefit))) return figures;
  return [
    ...figures.filter((figure) => !isBenefit(figure)),
    { key: 'socialSecurityAnnual', value: claiming.amount },
    { key: 'socialSecurityStartAge', value: claiming.toAge },
  ];
}

/** "67", or "66 and 10 months". */
export function describeFullRetirementAge(fra: ClaimingAdjustment['fullRetirementAge']): string {
  return fra.months === 0 ? String(fra.years) : `${fra.years} and ${fra.months} months`;
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/** The same, as a clause inside a list of assumptions. */
export function describeClaimingAdjustmentBriefly(
  adjustment: ClaimingAdjustment,
  /** Whose benefit it is: the user's own, or their partner's. */
  whose: 'user' | 'partner' = 'user'
): string {
  const gave = whose === 'partner' ? 'you gave for them' : 'you gave';
  const age = whose === 'partner' ? 'their age' : 'your age';
  return `the ${money(adjustment.fromAmount)} a year ${gave} for claiming at ${adjustment.fromAge}, moved to ` +
    `${adjustment.toAge} by Social Security's own rules, with full retirement age ` +
    `${describeFullRetirementAge(adjustment.fullRetirementAge)} from ${age}`;
}

/**
 * The sentence an answer adds when it rescaled a benefit, naming both amounts
 * and the rule, so the user can check it against their own statement.
 */
export function describeClaimingAdjustment(adjustment: ClaimingAdjustment): string {
  const later = adjustment.toAge > adjustment.fromAge;
  return `Claimed at ${adjustment.toAge} instead of ${adjustment.fromAge}, Social Security of ` +
    `${money(adjustment.fromAmount)} a year becomes ${money(adjustment.amount)} by Social Security's own rules ` +
    `(${later ? 'a credit for each month after' : 'a reduction for each month before'} full retirement age, which I ` +
    `took as ${describeFullRetirementAge(adjustment.fullRetirementAge)} from your age).`;
}
