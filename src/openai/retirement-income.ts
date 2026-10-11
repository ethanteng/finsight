/**
 * Social Security and a pension for the holdings-based projection.
 *
 * The projection used to model none, whatever the user had said or saved, so
 * an answer could quote a Social Security figure from Your numbers above a
 * projection that assumed zero income. Each income now resolves the way the
 * stated-plan and Coast FIRE calculators resolve theirs: what the user said in
 * this decision, then what they saved in Your numbers, then a named default --
 * and only the terms of an income someone actually has are ever defaulted.
 */

import type { RetirementIncomeStream } from '../retirement-analytics/types';
import { PARTNER_PENSION_LABEL, PENSION_LABEL, SOCIAL_SECURITY_LABEL } from '../services/household';
import {
  benefitAtClaimingAge,
  socialSecurityQuoteAge,
  type ClaimingAdjustment,
} from '../services/social-security-claiming';
import {
  INCOME_INFLATION_OPTIONS,
  savedChoice,
  savedNumber,
  type IncomeInflation,
  type StatedFigures,
} from '../services/stated-figures';

/** Social Security's start when none is named: the full retirement age for anyone born after 1959. */
export const DEFAULT_PROJECTION_SOCIAL_SECURITY_START_AGE = 67;

export { SOCIAL_SECURITY_LABEL, PENSION_LABEL };

/** Where a term came from: this decision, Your numbers, or a named default. */
export type IncomeTermOrigin = 'stated' | 'saved' | 'default';

export interface RetirementIncomeOrigins {
  socialSecurity?: {
    amount: Exclude<IncomeTermOrigin, 'default'>;
    startAge: IncomeTermOrigin;
    /**
     * Set when the figure was for another claiming age: the stream is then the
     * benefit at its start age by Social Security's claiming rules.
     */
    claiming?: ClaimingAdjustment;
  };
  pension?: {
    amount: Exclude<IncomeTermOrigin, 'default'>;
    startAge: IncomeTermOrigin;
    inflation: IncomeTermOrigin;
  };
  /** When the newest figure taken from Your numbers was saved, if any was. */
  savedAt?: string;
}

/** What the user said about their income in this decision. */
export interface StatedRetirementIncome {
  socialSecurityAnnual?: number;
  socialSecurityStartAge?: number;
  /** The claiming age the stated figure is for, when the user named one. */
  socialSecurityAmountAge?: number;
  pensionAnnual?: number;
  pensionStartAge?: number;
  pensionInflation?: IncomeInflation;
}

export interface ResolvedRetirementIncome {
  streams: RetirementIncomeStream[];
  origins: RetirementIncomeOrigins;
}

function isIncomeInflation(value: unknown): value is IncomeInflation {
  return typeof value === 'string' && (INCOME_INFLATION_OPTIONS as readonly string[]).includes(value);
}

/**
 * The incomes the projection counts. A stated amount wins even when it is
 * zero: "I won't get a pension" is a statement about the plan, not a blank.
 * A Social Security figure for one claiming age, claimed at another, counts
 * as what Social Security's own rules pay there.
 */
export function resolveRetirementIncome(args: {
  stated?: StatedRetirementIncome;
  statedFigures?: StatedFigures;
  retirementAge: number;
  currentAge: number;
}): ResolvedRetirementIncome {
  const { stated = {}, statedFigures, retirementAge, currentAge } = args;
  const streams: RetirementIncomeStream[] = [];
  const origins: RetirementIncomeOrigins = {};
  const savedDates: string[] = [];
  const fromSaved = (figure: { value: number; savedAt: string } | undefined) => {
    if (figure) savedDates.push(figure.savedAt);
    return figure?.value;
  };

  const savedSocialSecurity = savedNumber(statedFigures, 'socialSecurityAnnual');
  const socialSecurityAnnual = stated.socialSecurityAnnual ?? fromSaved(savedSocialSecurity);
  if (socialSecurityAnnual !== undefined && socialSecurityAnnual > 0) {
    const savedStart = savedNumber(statedFigures, 'socialSecurityStartAge');
    const startAge = stated.socialSecurityStartAge ?? fromSaved(savedStart) ?? DEFAULT_PROJECTION_SOCIAL_SECURITY_START_AGE;
    const amountFromSaved = stated.socialSecurityAnnual === undefined;
    const claiming = benefitAtClaimingAge({
      amount: socialSecurityAnnual,
      quotedAtAge: socialSecurityQuoteAge({
        namedAge: stated.socialSecurityAmountAge,
        ...(amountFromSaved && {
          saved: { startAge: savedStart?.value, defaultStartAge: DEFAULT_PROJECTION_SOCIAL_SECURITY_START_AGE },
        }),
        claimAge: startAge,
      }),
      claimAge: startAge,
      currentAge,
    });
    streams.push({
      label: SOCIAL_SECURITY_LABEL,
      annualAmount: claiming?.amount ?? socialSecurityAnnual,
      startAge,
      inflationAdjusted: true,
    });
    origins.socialSecurity = {
      amount: amountFromSaved ? 'saved' : 'stated',
      startAge: stated.socialSecurityStartAge !== undefined ? 'stated' : savedStart ? 'saved' : 'default',
      ...(claiming && { claiming }),
    };
  }

  const savedPension = savedNumber(statedFigures, 'retirementIncome');
  const pensionAnnual = stated.pensionAnnual ?? fromSaved(savedPension);
  if (pensionAnnual !== undefined && pensionAnnual > 0) {
    const savedStart = savedNumber(statedFigures, 'retirementIncomeStartAge');
    // A pension most often starts when work stops, and most private pensions
    // pay a fixed amount; overstating future income is the costlier mistake.
    const startAge = stated.pensionStartAge ?? fromSaved(savedStart) ?? retirementAge;
    const savedInflationChoice = savedChoice(statedFigures, 'retirementIncomeInflation');
    const savedInflation = savedInflationChoice && isIncomeInflation(savedInflationChoice.value)
      ? savedInflationChoice
      : undefined;
    if (!stated.pensionInflation && savedInflation) savedDates.push(savedInflation.savedAt);
    const inflation: IncomeInflation = stated.pensionInflation ?? (savedInflation?.value as IncomeInflation | undefined) ?? 'fixed';
    streams.push({
      label: PENSION_LABEL,
      annualAmount: pensionAnnual,
      startAge,
      inflationAdjusted: inflation === 'rises_with_inflation',
    });
    origins.pension = {
      amount: stated.pensionAnnual !== undefined ? 'stated' : 'saved',
      startAge: stated.pensionStartAge !== undefined ? 'stated' : savedStart ? 'saved' : 'default',
      inflation: stated.pensionInflation ? 'stated' : savedInflation ? 'saved' : 'default',
    };
  }

  if (savedDates.length > 0) origins.savedAt = savedDates.sort()[savedDates.length - 1];
  return { streams, origins };
}

/**
 * The same incomes for a what-if that retires at a different age: a pension
 * whose start was only ever "when you retire" moves with the retirement.
 */
export function incomeForRetirementAge(
  streams: readonly RetirementIncomeStream[],
  origins: RetirementIncomeOrigins | undefined,
  retirementAge: number | null,
  /** Whether the partner's pension start was only ever the household's retirement. */
  partnerPensionStartsAtRetirement = false
): RetirementIncomeStream[] {
  if (retirementAge === null) return [...streams];
  return streams.map((stream) =>
    (stream.label === PENSION_LABEL && origins?.pension?.startAge === 'default') ||
    (stream.label === PARTNER_PENSION_LABEL && partnerPensionStartsAtRetirement)
      ? { ...stream, startAge: retirementAge }
      : stream
  );
}

/**
 * The same incomes with Social Security claimed at another age: the benefit
 * the baseline counts is the one for its own start age, so Social Security's
 * claiming rules move it from there. `claiming` is absent when the rules
 * change nothing (both ages at or past 70). A benefit the plan has not got,
 * one already being paid, or a claiming age already past cannot be moved, and
 * the reason says which.
 */
export function incomeClaimedAt(
  streams: readonly RetirementIncomeStream[],
  claimAge: number,
  currentAge: number
): { streams: RetirementIncomeStream[]; claiming?: ClaimingAdjustment } | { unavailableReason: string } {
  const socialSecurity = streams.find((stream) => stream.label === SOCIAL_SECURITY_LABEL);
  if (!socialSecurity) {
    return {
      unavailableReason: 'This plan has no Social Security benefit to claim at another age. Tell me what Social ' +
        'Security expects to pay you, and for which claiming age, and I will compare.',
    };
  }
  if (socialSecurity.startAge <= currentAge) {
    return { unavailableReason: 'Social Security is already being paid in this plan, so when it is claimed cannot change.' };
  }
  if (claimAge < currentAge) {
    return { unavailableReason: `Claiming Social Security at ${claimAge} is already in the past at ${currentAge}.` };
  }
  const claiming = benefitAtClaimingAge({
    amount: socialSecurity.annualAmount,
    quotedAtAge: socialSecurity.startAge,
    claimAge,
    currentAge,
  });
  return {
    streams: streams.map((stream) => stream === socialSecurity
      ? { ...stream, startAge: claimAge, annualAmount: claiming?.amount ?? stream.annualAmount }
      : stream),
    ...(claiming && { claiming }),
  };
}

/**
 * Whether two lists of incomes are the same plan. Compared term by term, not
 * as JSON: a stored analysis comes back from a jsonb column, which does not
 * keep key order, so a stringified comparison would never match its own
 * cached run.
 */
export function sameIncomeStreams(left: readonly unknown[], right: readonly RetirementIncomeStream[]): boolean {
  const terms = (stream: Partial<RetirementIncomeStream>) => [
    stream.label ?? null,
    stream.annualAmount ?? null,
    stream.startAge ?? null,
    stream.endAge ?? null,
    stream.inflationAdjusted !== false,
  ];
  if (left.length !== right.length) return false;
  return left.every((stream, index) =>
    stream !== null && typeof stream === 'object' &&
    JSON.stringify(terms(stream as Partial<RetirementIncomeStream>)) === JSON.stringify(terms(right[index]))
  );
}
