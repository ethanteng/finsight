/**
 * A partner in a retirement plan.
 *
 * Every retirement calculator used to plan for one person: one age, one
 * horizon, one Social Security benefit. A couple's plan differs in three ways
 * that change the answer, and this module is where each is decided once for
 * all three calculators:
 *
 * - **Their incomes.** The partner's Social Security (moved by the same
 *   claiming rules as the user's) and pension, each starting at the partner's
 *   own age.
 * - **The joint horizon.** Each partner plans through their own age (95 unless
 *   stated). The plan runs until the later of the two, so with a younger
 *   partner it runs past the user's own planning age.
 * - **The survivor years.** When the first of them reaches their planning age,
 *   the survivor keeps the larger Social Security benefit and the smaller one
 *   stops, as Social Security's survivor rule pays; a pension stops with the
 *   person it belongs to. Spending stays what the couple spent unless the user
 *   says what the survivor would spend.
 *
 * The engines run on the user's age, so everything here is converted to it:
 * a partner three years younger claiming at 67 is income from the user's 70.
 *
 * Spousal benefits (up to half of the other's benefit) and pension survivor
 * shares are not modeled; the answer says so where it matters.
 */

import {
  benefitAtClaimingAge,
  socialSecurityQuoteAge,
  type ClaimingAdjustment,
} from './social-security-claiming';
import { savedChoice, savedNumber, type IncomeInflation, type StatedFigures } from './stated-figures';
import type { RetirementIncomeStream } from '../retirement-analytics/types';
import type { SavableFigure } from '../openai/save-offer';

export const DEFAULT_PLAN_THROUGH_AGE = 95;

/** How each income is named to the engine, and so in its assumptions. */
export const SOCIAL_SECURITY_LABEL = 'Social Security';
export const PENSION_LABEL = 'pension or other income';
export const PARTNER_SOCIAL_SECURITY_LABEL = 'your partner\'s Social Security';
export const PARTNER_PENSION_LABEL = 'your partner\'s pension or other income';
export const DEFAULT_PARTNER_SOCIAL_SECURITY_START_AGE = 67;

/** What the user said about their partner in this decision. */
export interface StatedPartner {
  age?: number;
  socialSecurityAnnual?: number;
  /** The partner's age when they claim. */
  socialSecurityStartAge?: number;
  /** The claiming age the partner's Social Security figure is for, when named. */
  socialSecurityAmountAge?: number;
  pensionAnnual?: number;
  /** The partner's age when it starts. */
  pensionStartAge?: number;
  pensionInflation?: IncomeInflation;
  planThroughAge?: number;
  /** What one survivor spends a year, in today's dollars. */
  survivorAnnualSpending?: number;
}

export type PartnerOrigin = 'stated' | 'saved' | 'default';
export type PartnerField = keyof StatedPartner;

export interface PartnerPlan {
  age: number;
  planThroughAge: number;
  socialSecurity?: {
    /** At the age it is claimed, after any claiming rule. */
    annualAmount: number;
    /** The partner's age. */
    startAge: number;
    /** The figure as given and the age it is for, before any claiming rule. */
    quote: { amount: number; age: number };
    claiming?: ClaimingAdjustment;
  };
  pension?: {
    annualAmount: number;
    /** The partner's age. */
    startAge: number;
    inflationAdjusted: boolean;
  };
  survivorAnnualSpending?: number;
}

export interface ResolvedPartner {
  plan: PartnerPlan;
  /** Where each figure the plan uses came from. */
  origins: Partial<Record<PartnerField, PartnerOrigin>>;
  /** When the newest figure taken from Your numbers was saved, if any was. */
  savedAt?: string;
}

/**
 * The partner's figures: what the user said in this decision, then Your
 * numbers, then named defaults -- and only for an income the partner has.
 *
 * Null when there is no partner to plan for. When something that would change
 * the plan is known but the partner's age is not, `missingAge` says so: none
 * of it can be timed, and an age is not something to assume.
 */
export function resolvePartner(args: {
  stated?: StatedPartner;
  statedFigures?: StatedFigures;
  /** The household's retirement age, on the user's timeline: a pension's default start. */
  retirementAge: number;
  /** The user's age today. */
  currentAge: number;
  /** For a comparison that only moves the partner's claiming age: the age the main case's figure was for. */
  inheritedQuoteAge?: number;
  asOfYear?: number;
}): ResolvedPartner | { missingAge: true } | null {
  const stated = args.stated ?? {};
  const origins: ResolvedPartner['origins'] = {};
  const savedDates: string[] = [];
  const take = <T extends number | string>(
    field: PartnerField,
    savedFigure: { value: T; savedAt: string } | undefined
  ): T | undefined => {
    const value = stated[field] as T | undefined;
    if (value !== undefined) {
      origins[field] = 'stated';
      return value;
    }
    if (savedFigure) {
      origins[field] = 'saved';
      savedDates.push(savedFigure.savedAt);
      return savedFigure.value;
    }
    return undefined;
  };
  const savedNum = (key: Parameters<typeof savedNumber>[1]) => savedNumber(args.statedFigures, key);

  const socialSecurityAmount = take<number>('socialSecurityAnnual', savedNum('partnerSocialSecurityAnnual'));
  const pensionAmount = take<number>('pensionAnnual', savedNum('partnerRetirementIncome'));
  const age = take<number>('age', savedNum('partnerAge'));
  if (age === undefined) {
    // Anything that changes the plan once the age is known says there is a
    // partner to plan for; a start age or inflation term with no income
    // behind it does not.
    const planned = (socialSecurityAmount ?? 0) > 0 || (pensionAmount ?? 0) > 0 ||
      stated.planThroughAge !== undefined || savedNum('partnerPlanThroughAge') !== undefined ||
      stated.survivorAnnualSpending !== undefined || savedNum('survivorAnnualSpending') !== undefined;
    return planned ? { missingAge: true } : null;
  }

  const ageGap = args.currentAge - age;
  const withDefault = <T extends number | string>(
    field: PartnerField,
    savedFigure: { value: T; savedAt: string } | undefined,
    fallback: T
  ): T => {
    const value = take<T>(field, savedFigure);
    if (value !== undefined) return value;
    origins[field] = 'default';
    return fallback;
  };

  const planThroughAge = withDefault<number>('planThroughAge', savedNum('partnerPlanThroughAge'), DEFAULT_PLAN_THROUGH_AGE);
  const plan: PartnerPlan = { age, planThroughAge: Math.max(planThroughAge, age + 1) };

  if (socialSecurityAmount !== undefined && socialSecurityAmount > 0) {
    const savedStart = savedNum('partnerSocialSecurityStartAge');
    const startAge = withDefault<number>('socialSecurityStartAge', savedStart, DEFAULT_PARTNER_SOCIAL_SECURITY_START_AGE);
    const namedAge = stated.socialSecurityAmountAge;
    if (namedAge !== undefined) origins.socialSecurityAmountAge = 'stated';
    const quoteAge = socialSecurityQuoteAge({
      namedAge,
      inheritedAge: args.inheritedQuoteAge,
      ...(origins.socialSecurityAnnual === 'saved' && {
        saved: { startAge: savedStart?.value, defaultStartAge: DEFAULT_PARTNER_SOCIAL_SECURITY_START_AGE },
      }),
      claimAge: startAge,
    });
    const claiming = benefitAtClaimingAge({
      amount: socialSecurityAmount,
      quotedAtAge: quoteAge,
      claimAge: startAge,
      currentAge: age,
      ...(args.asOfYear !== undefined && { asOfYear: args.asOfYear }),
    });
    plan.socialSecurity = {
      annualAmount: claiming?.amount ?? socialSecurityAmount,
      startAge,
      quote: { amount: socialSecurityAmount, age: quoteAge },
      ...(claiming && { claiming }),
    };
  } else {
    delete origins.socialSecurityAnnual;
  }

  if (pensionAmount !== undefined && pensionAmount > 0) {
    // A pension most often starts when work stops: the household's
    // retirement, at the partner's age then.
    const startAge = withDefault<number>(
      'pensionStartAge',
      savedNum('partnerRetirementIncomeStartAge'),
      Math.max(age, args.retirementAge - ageGap)
    );
    const savedInflation = savedChoice(args.statedFigures, 'partnerRetirementIncomeInflation');
    const inflation = withDefault<string>(
      'pensionInflation',
      savedInflation,
      'fixed'
    );
    plan.pension = { annualAmount: pensionAmount, startAge, inflationAdjusted: inflation === 'rises_with_inflation' };
  } else {
    delete origins.pensionAnnual;
  }

  const survivorSpending = take<number>('survivorAnnualSpending', savedNum('survivorAnnualSpending'));
  if (survivorSpending !== undefined) plan.survivorAnnualSpending = survivorSpending;

  const savedAt = savedDates.sort()[savedDates.length - 1];
  return { plan, origins, ...(savedAt && { savedAt }) };
}

export interface HouseholdTimeline {
  /** Years the user is older than the partner; negative when younger. */
  ageGap: number;
  /** When each reaches their planning age, as the user's age then. */
  userPlanThroughAge: number;
  partnerPlanThroughAge: number;
  /** The first of them to reach their planning age, and the user's age then. */
  firstDeath: { who: 'user' | 'partner' | 'both'; atUserAge: number };
  /** The user's age when the plan ends: the later of the two. */
  horizonAge: number;
}

export function householdTimeline(args: {
  currentAge: number;
  userPlanThroughAge: number;
  partner: PartnerPlan;
}): HouseholdTimeline {
  const ageGap = args.currentAge - args.partner.age;
  const userEnd = args.userPlanThroughAge;
  const partnerEnd = args.partner.planThroughAge + ageGap;
  const firstAt = Math.min(userEnd, partnerEnd);
  return {
    ageGap,
    userPlanThroughAge: userEnd,
    partnerPlanThroughAge: partnerEnd,
    firstDeath: { who: userEnd === partnerEnd ? 'both' : userEnd < partnerEnd ? 'user' : 'partner', atUserAge: firstAt },
    horizonAge: Math.max(userEnd, partnerEnd),
  };
}

export type HouseholdIncomeKind = 'social_security' | 'pension';

/** One income on the user's age timeline. */
export interface HouseholdIncome {
  owner: 'user' | 'partner';
  kind: HouseholdIncomeKind;
  annualAmount: number;
  startAge: number;
  inflationAdjusted: boolean;
  /** First age, on the user's timeline, it is no longer paid. */
  endAge?: number;
}

/** The partner's incomes, moved onto the user's age timeline. */
export function partnerIncomes(partner: PartnerPlan, timeline: HouseholdTimeline): HouseholdIncome[] {
  const incomes: HouseholdIncome[] = [];
  if (partner.socialSecurity) {
    incomes.push({
      owner: 'partner',
      kind: 'social_security',
      annualAmount: partner.socialSecurity.annualAmount,
      startAge: partner.socialSecurity.startAge + timeline.ageGap,
      inflationAdjusted: true,
    });
  }
  if (partner.pension) {
    incomes.push({
      owner: 'partner',
      kind: 'pension',
      annualAmount: partner.pension.annualAmount,
      startAge: partner.pension.startAge + timeline.ageGap,
      inflationAdjusted: partner.pension.inflationAdjusted,
    });
  }
  return incomes;
}

/**
 * Who stops being paid when. A pension stops with the person it belongs to;
 * at the first death the smaller Social Security benefit stops and the
 * survivor keeps the larger, which is Social Security's survivor rule with
 * both benefits already claimed. Nothing changes when both reach their
 * planning age together, since the plan ends there.
 */
export function applySurvivorRule(
  incomes: readonly HouseholdIncome[],
  timeline: HouseholdTimeline
): HouseholdIncome[] {
  const end = (owner: HouseholdIncome['owner']) =>
    owner === 'user' ? timeline.userPlanThroughAge : timeline.partnerPlanThroughAge;
  const benefits = incomes.filter((income) => income.kind === 'social_security' && income.annualAmount > 0);
  const smaller = benefits.length === 2
    ? (benefits[0].annualAmount <= benefits[1].annualAmount ? benefits[0] : benefits[1])
    : undefined;
  return incomes.flatMap((income) => {
    let endAge: number | undefined;
    if (income.kind === 'pension') endAge = end(income.owner);
    if (income === smaller) endAge = timeline.firstDeath.atUserAge;
    if (endAge === undefined || endAge >= timeline.horizonAge) return [income];
    const until = Math.min(income.endAge ?? endAge, endAge);
    // An income that would stop before it starts is never paid at all.
    return until > income.startAge ? [{ ...income, endAge: until }] : [];
  });
}

function labelOf(income: { owner?: HouseholdIncome['owner']; kind: HouseholdIncomeKind }): string {
  if (income.owner === 'partner') {
    return income.kind === 'pension' ? PARTNER_PENSION_LABEL : PARTNER_SOCIAL_SECURITY_LABEL;
  }
  return income.kind === 'pension' ? PENSION_LABEL : SOCIAL_SECURITY_LABEL;
}

/** Whose income an engine stream is, and what kind, from its label. */
export function incomeOfStream(stream: RetirementIncomeStream): Pick<HouseholdIncome, 'owner' | 'kind'> {
  if (stream.label === PARTNER_PENSION_LABEL) return { owner: 'partner', kind: 'pension' };
  if (stream.label === PARTNER_SOCIAL_SECURITY_LABEL) return { owner: 'partner', kind: 'social_security' };
  if (stream.label === PENSION_LABEL) return { owner: 'user', kind: 'pension' };
  return { owner: 'user', kind: 'social_security' };
}

/** One income as an engine stream, labelled by whose and what kind it is. */
export function toStream(income: Omit<HouseholdIncome, 'owner'> & { owner?: HouseholdIncome['owner'] }): RetirementIncomeStream {
  return {
    label: labelOf(income),
    annualAmount: income.annualAmount,
    startAge: income.startAge,
    inflationAdjusted: income.inflationAdjusted,
    ...(income.endAge !== undefined && { endAge: income.endAge }),
  };
}

/**
 * The survivor rule applied afresh to a household's engine streams: after a
 * what-if changes a benefit, the smaller of the two may no longer be the same
 * one. Only the survivor rule ends an income, so any end age is recomputed.
 */
export function withSurvivorRule(
  streams: readonly RetirementIncomeStream[],
  timeline: HouseholdTimeline
): RetirementIncomeStream[] {
  const incomes: HouseholdIncome[] = streams.map((stream) => ({
    ...incomeOfStream(stream),
    annualAmount: stream.annualAmount,
    startAge: stream.startAge,
    inflationAdjusted: stream.inflationAdjusted !== false,
  }));
  return applySurvivorRule(incomes, timeline).map(toStream);
}

/**
 * The household's incomes as the engine takes them: the user's own, the
 * partner's on the user's ages, and the survivor rule applied to both.
 */
export function householdIncomeStreams(
  userStreams: readonly RetirementIncomeStream[],
  partner: PartnerPlan,
  timeline: HouseholdTimeline
): RetirementIncomeStream[] {
  return withSurvivorRule([...userStreams, ...partnerIncomes(partner, timeline).map(toStream)], timeline);
}

/**
 * What the survivor spends, from the first death, when the user said; the
 * plan ends at the first death when both reach their age together.
 */
export function survivorSpendingFor(
  partner: PartnerPlan,
  timeline: HouseholdTimeline
): { fromAge: number; annualAmount: number } | undefined {
  if (partner.survivorAnnualSpending === undefined || timeline.firstDeath.atUserAge >= timeline.horizonAge) return undefined;
  return { fromAge: timeline.firstDeath.atUserAge, annualAmount: partner.survivorAnnualSpending };
}

/**
 * The partner's figures the user stated in this decision, under the keys Your
 * numbers keeps them by. A benefit moved to another claiming age is saved as
 * it is paid there, with that age, like the user's own.
 */
export function partnerSavableFigures(partner: ResolvedPartner): SavableFigure[] {
  const { plan, origins } = partner;
  const stated = (field: PartnerField) => origins[field] === 'stated';
  const figures: SavableFigure[] = [];
  if (stated('age')) figures.push({ key: 'partnerAge', value: plan.age });
  const benefit = plan.socialSecurity;
  if (benefit) {
    const named = stated('socialSecurityAmountAge') || stated('socialSecurityAnnual') || stated('socialSecurityStartAge');
    if (benefit.claiming && named) {
      figures.push(
        { key: 'partnerSocialSecurityAnnual', value: benefit.claiming.amount },
        { key: 'partnerSocialSecurityStartAge', value: benefit.claiming.toAge }
      );
    } else {
      if (stated('socialSecurityAnnual')) figures.push({ key: 'partnerSocialSecurityAnnual', value: benefit.annualAmount });
      if (stated('socialSecurityStartAge')) figures.push({ key: 'partnerSocialSecurityStartAge', value: benefit.startAge });
    }
  }
  const pension = plan.pension;
  if (pension) {
    if (stated('pensionAnnual')) figures.push({ key: 'partnerRetirementIncome', value: pension.annualAmount });
    if (stated('pensionStartAge')) figures.push({ key: 'partnerRetirementIncomeStartAge', value: pension.startAge });
    if (stated('pensionInflation')) {
      figures.push({
        key: 'partnerRetirementIncomeInflation',
        value: pension.inflationAdjusted ? 'rises_with_inflation' : 'fixed',
      });
    }
  }
  if (stated('planThroughAge')) figures.push({ key: 'partnerPlanThroughAge', value: plan.planThroughAge });
  if (stated('survivorAnnualSpending') && plan.survivorAnnualSpending !== undefined) {
    figures.push({ key: 'survivorAnnualSpending', value: plan.survivorAnnualSpending });
  }
  return figures;
}
