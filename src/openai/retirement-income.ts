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
import {
  INCOME_INFLATION_OPTIONS,
  savedChoice,
  savedNumber,
  type IncomeInflation,
  type StatedFigures,
} from '../services/stated-figures';

/** Social Security's start when none is named: the full retirement age for anyone born after 1959. */
export const DEFAULT_PROJECTION_SOCIAL_SECURITY_START_AGE = 67;

export const SOCIAL_SECURITY_LABEL = 'Social Security';
export const PENSION_LABEL = 'pension or other income';

/** Where a term came from: this decision, Your numbers, or a named default. */
export type IncomeTermOrigin = 'stated' | 'saved' | 'default';

export interface RetirementIncomeOrigins {
  socialSecurity?: { amount: Exclude<IncomeTermOrigin, 'default'>; startAge: IncomeTermOrigin };
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
 */
export function resolveRetirementIncome(args: {
  stated?: StatedRetirementIncome;
  statedFigures?: StatedFigures;
  retirementAge: number;
}): ResolvedRetirementIncome {
  const { stated = {}, statedFigures, retirementAge } = args;
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
    streams.push({ label: SOCIAL_SECURITY_LABEL, annualAmount: socialSecurityAnnual, startAge, inflationAdjusted: true });
    origins.socialSecurity = {
      amount: stated.socialSecurityAnnual !== undefined ? 'stated' : 'saved',
      startAge: stated.socialSecurityStartAge !== undefined ? 'stated' : savedStart ? 'saved' : 'default',
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
  retirementAge: number | null
): RetirementIncomeStream[] {
  if (retirementAge === null || origins?.pension?.startAge !== 'default') return [...streams];
  return streams.map((stream) => stream.label === PENSION_LABEL ? { ...stream, startAge: retirementAge } : stream);
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
