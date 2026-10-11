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
 *   their own Social Security and pension stop. A married survivor is paid a
 *   survivor benefit on the deceased's record; spending stays what the couple
 *   spent unless the user says what the survivor would spend.
 *
 * Married, the lower earner is also paid a spousal benefit on the other's
 * record (`householdSocialSecurity`). Marriage is never assumed: unknown, the
 * plan counts neither and the answer asks.
 *
 * The engines run on the user's age, so everything here is converted to it:
 * a partner three years younger claiming at 67 is income from the user's 70.
 *
 * A pension's survivor share and divorced-spouse benefits are not modeled.
 */

import {
  benefitAtClaimingAge,
  birthYearOf,
  claimingFactor,
  EARLIEST_CLAIMING_AGE,
  EARLIEST_SURVIVOR_AGE,
  fullRetirementAgeMonths,
  primaryInsuranceAmount,
  socialSecurityQuoteAge,
  spousalFactor,
  survivorFactor,
  survivorFullRetirementAgeMonths,
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
export const SPOUSAL_LABEL = 'spousal benefit on your partner\'s record';
export const PARTNER_SPOUSAL_LABEL = 'your partner\'s spousal benefit on your record';
export const SURVIVOR_LABEL = 'survivor benefit on your partner\'s record';
export const PARTNER_SURVIVOR_LABEL = 'your partner\'s survivor benefit on your record';
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
  /** Whether they are married, when the user said. */
  married?: boolean;
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
  /**
   * The partner's age when they claim, their own benefit or a spousal one:
   * the start age above when they have a benefit, otherwise what was said or
   * saved, else 67. Absent on plans recorded before spousal benefits.
   */
  socialSecurityClaimAge?: number;
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
  origins: Partial<Record<Exclude<PartnerField, 'married'>, PartnerOrigin>>;
  /** When the newest figure taken from Your numbers was saved, if any was. */
  savedAt?: string;
  /** Whether the couple is married, and how Linc knows; absent when it does not. */
  married?: Marriage;
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
  /** The household status Linc remembers, for whether the couple is married. */
  householdStatus?: string;
  asOfYear?: number;
}): ResolvedPartner | { missingAge: true } | null {
  const stated = args.stated ?? {};
  const origins: ResolvedPartner['origins'] = {};
  const savedDates: string[] = [];
  const take = <T extends number | string>(
    field: Exclude<PartnerField, 'married'>,
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
  if (age === undefined) return partnerAgeMissing(args.stated, args.statedFigures) ? { missingAge: true } : null;

  const ageGap = args.currentAge - age;
  const withDefault = <T extends number | string>(
    field: Exclude<PartnerField, 'married'>,
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
    plan.socialSecurityClaimAge = startAge;
  } else {
    // A spousal benefit needs a claim age even with no benefit of their own.
    plan.socialSecurityClaimAge = withDefault<number>(
      'socialSecurityStartAge',
      savedNum('partnerSocialSecurityStartAge'),
      DEFAULT_PARTNER_SOCIAL_SECURITY_START_AGE
    );
    // A stated zero is a known benefit of none; a blank is unknown.
    if (socialSecurityAmount === undefined) delete origins.socialSecurityAnnual;
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

  const married = resolveMarriage({
    ...(stated.married !== undefined && { stated: stated.married }),
    ...(args.statedFigures && { statedFigures: args.statedFigures }),
    ...(args.householdStatus && { householdStatus: args.householdStatus }),
  });
  const savedAt = savedDates.sort()[savedDates.length - 1];
  return { plan, origins, ...(savedAt && { savedAt }), ...(married && { married }) };
}

/**
 * Whether there is a partner to plan for whose age nobody has given: anything
 * that would change the plan once the age is known, said in this decision or
 * saved. A start age or inflation term with no income behind it is not one.
 */
export function partnerAgeMissing(stated: StatedPartner | undefined, statedFigures: StatedFigures | undefined): boolean {
  const said = stated ?? {};
  const saved = (key: Parameters<typeof savedNumber>[1]) => savedNumber(statedFigures, key);
  if (said.age !== undefined || saved('partnerAge')) return false;
  const socialSecurity = said.socialSecurityAnnual ?? saved('partnerSocialSecurityAnnual')?.value;
  const pension = said.pensionAnnual ?? saved('partnerRetirementIncome')?.value;
  return (socialSecurity ?? 0) > 0 || (pension ?? 0) > 0 ||
    (said.planThroughAge ?? saved('partnerPlanThroughAge')?.value) !== undefined ||
    (said.survivorAnnualSpending ?? saved('survivorAnnualSpending')?.value) !== undefined;
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

export type HouseholdIncomeKind = 'social_security' | 'pension' | 'spousal' | 'survivor';

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

/** Whether a couple is married, and how Linc knows. */
export type MarriageOrigin = 'stated' | 'saved' | 'remembered';
export interface Marriage {
  value: boolean;
  origin: MarriageOrigin;
  savedAt?: string;
}

/**
 * Whether the couple is married: what the user said in this decision, then
 * Your numbers, then the household status Linc remembers. Undefined when none
 * says, and then neither spousal nor survivor benefits are counted.
 */
export function resolveMarriage(args: {
  stated?: boolean;
  statedFigures?: StatedFigures;
  householdStatus?: string;
}): Marriage | undefined {
  if (args.stated !== undefined) return { value: args.stated, origin: 'stated' };
  const saved = savedChoice(args.statedFigures, 'partnerMarried');
  if (saved) return { value: saved.value === 'married', origin: 'saved', savedAt: saved.savedAt };
  if (args.householdStatus === 'married') return { value: true, origin: 'remembered' };
  if (args.householdStatus === 'partnered') return { value: false, origin: 'remembered' };
  return undefined;
}

/** The user's own Social Security, as a calculator resolved it. */
export interface UserSocialSecurity {
  /** As claimed, on the user's ages; absent with none of their own. */
  benefit?: { annualAmount: number; startAge: number };
  /** The user's age when they claim, their own benefit or a spousal one. */
  claimAge: number;
  /** Whether anyone said what the user's own benefit is, zero included. */
  known: boolean;
}

/**
 * The couple's Social Security as Social Security pays it, for the answer to
 * describe: each one's full-retirement-age benefit, and the spousal and
 * survivor benefits a marriage adds.
 */
export interface HouseholdSocialSecurity {
  married?: Marriage;
  /** Each one's full-retirement-age benefit a year, 0 with none of their own; claim ages on their own ages. */
  user: { pia: number; claimAge: number; known: boolean };
  partner: { pia: number; claimAge: number; known: boolean };
  /** The lower earner's spousal benefit on the other's record. */
  spousal?: {
    owner: 'user' | 'partner';
    /** A year, after the reduction for starting before full retirement age. */
    annualAmount: number;
    /** Half the other's full-retirement-age benefit, less the owner's own, before any reduction. */
    fullAmount: number;
    /** The owner's age when it starts, and the user's age then. */
    ownerStartAge: number;
    startAge: number;
    /** Set when the owner's own benefit is not known, so this is the least they would be paid. */
    floor: boolean;
  };
  /** The survivor's benefit on the record of the first to die. */
  survivor?: {
    owner: 'user' | 'partner';
    /** The survivor benefit a year, before netting the survivor's own. */
    annualAmount: number;
    /** What the deceased was paid, or would have been, a year. */
    deceasedBenefit: number;
    ownerStartAge: number;
    startAge: number;
    /** The share kept for starting before the survivor's full retirement age, when it was. */
    reducedTo?: number;
    /** Set when the deceased claimed early and their benefit, or 82.5% of their full one, capped it. */
    limited?: boolean;
    /** The survivor's own benefit as claimed, a year; 0 with none. */
    ownAmount: number;
    /** The user's age when the survivor's own benefit starts, when that is after the survivor benefit does. */
    ownStartAge?: number;
  };
  /** Set when the marriage is not known and it would change what is paid. */
  marriageUnknown?: true;
}

/**
 * The couple's Social Security incomes on the user's timeline.
 *
 * - Each one's own benefit is paid from their claim until they die. The first
 *   to reach their planning age stops there; the other runs to the plan's end.
 * - Married, the lower earner is also paid a spousal benefit: half the other's
 *   full-retirement-age benefit, less their own. It starts once both have
 *   claimed (filing for one benefit is filing for both), is reduced for
 *   starting before the owner's full retirement age, earns nothing for waiting
 *   past it, and stops at the first death. Unknown own benefit counts as none,
 *   which is the least they would be paid.
 * - Married, the survivor is paid a survivor benefit on the record of the
 *   first to die, net of their own: the deceased's benefit (their full one if
 *   they claimed early), reduced if the survivor takes it before their own
 *   survivor full retirement age (from 60), and no more than the larger of
 *   what the deceased was paid or 82.5% of their full benefit when they
 *   claimed early. A survivor who has not claimed their own yet takes the
 *   survivor benefit alone until they do.
 * - Unmarried, neither applies: each benefit simply stops with its holder.
 */
export function householdSocialSecurity(args: {
  user: UserSocialSecurity;
  partner: PartnerPlan;
  /** Whether anyone said what the partner's own benefit is. */
  partnerKnown: boolean;
  married?: Marriage;
  timeline: HouseholdTimeline;
  currentAge: number;
  asOfYear?: number;
}): { incomes: HouseholdIncome[]; summary: HouseholdSocialSecurity } {
  const { user, partner, timeline, currentAge, asOfYear } = args;
  const gap = timeline.ageGap;
  const firstDeath = timeline.firstDeath;
  const deathBeforeEnd = firstDeath.who !== 'both' && firstDeath.atUserAge < timeline.horizonAge;
  const married = args.married?.value === true;

  // Everything on the user's timeline; each person's rules on their own birth year.
  const people = {
    user: {
      age: currentAge,
      toUser: 0,
      benefit: user.benefit,
      claimAge: user.benefit?.startAge ?? user.claimAge,
      known: user.known,
    },
    partner: {
      age: partner.age,
      toUser: gap,
      benefit: partner.socialSecurity
        ? { annualAmount: partner.socialSecurity.annualAmount, startAge: partner.socialSecurity.startAge }
        : undefined,
      claimAge: partner.socialSecurity?.startAge ?? partner.socialSecurityClaimAge ?? DEFAULT_PARTNER_SOCIAL_SECURITY_START_AGE,
      known: args.partnerKnown,
    },
  };
  type Who = keyof typeof people;
  const fra = (who: Who) => fullRetirementAgeMonths(birthYearOf(people[who].age, asOfYear));
  const pia = (who: Who) => {
    const benefit = people[who].benefit;
    return benefit
      ? primaryInsuranceAmount({ amount: benefit.annualAmount, claimAge: benefit.startAge, currentAge: people[who].age, asOfYear })
      : 0;
  };
  const piaOf = { user: pia('user'), partner: pia('partner') };
  const endOf = (who: Who) => (deathBeforeEnd && firstDeath.who === who ? firstDeath.atUserAge : undefined);

  const incomes: HouseholdIncome[] = [];
  const push = (income: HouseholdIncome) => {
    const end = income.endAge ?? timeline.horizonAge;
    // An income that would stop before it starts is never paid at all.
    if (income.annualAmount > 0 && income.startAge < end) incomes.push(income);
  };

  // Each one's own benefit, until they die.
  for (const who of ['user', 'partner'] as const) {
    const benefit = people[who].benefit;
    if (!benefit) continue;
    const endAge = endOf(who);
    push({
      owner: who,
      kind: 'social_security',
      annualAmount: benefit.annualAmount,
      startAge: benefit.startAge + people[who].toUser,
      inflationAdjusted: true,
      ...(endAge !== undefined && { endAge }),
    });
  }

  const summary: HouseholdSocialSecurity = {
    ...(args.married && { married: args.married }),
    user: { pia: piaOf.user, claimAge: people.user.claimAge, known: people.user.known },
    partner: { pia: piaOf.partner, claimAge: people.partner.claimAge, known: people.partner.known },
  };
  if (!married) {
    // Unknown, it is worth asking only when being married would pay more.
    if (!args.married && (piaOf.user > 0 || piaOf.partner > 0)) {
      const ifMarried = householdSocialSecurity({ ...args, married: { value: true, origin: 'stated' } });
      if (ifMarried.incomes.length > incomes.length) summary.marriageUnknown = true;
    }
    return { incomes, summary };
  }

  // The lower earner's spousal benefit, once both have claimed.
  const lower: Who = piaOf.user <= piaOf.partner ? 'user' : 'partner';
  const higher: Who = lower === 'user' ? 'partner' : 'user';
  const fullSpousal = 0.5 * piaOf[higher] - piaOf[lower];
  if (piaOf[higher] > 0 && fullSpousal > 0.5) {
    const startAge = Math.max(
      people[lower].claimAge + people[lower].toUser,
      people[higher].claimAge + people[higher].toUser,
      EARLIEST_CLAIMING_AGE + people[lower].toUser
    );
    const ownerStartAge = startAge - people[lower].toUser;
    const annualAmount = fullSpousal * spousalFactor(ownerStartAge * 12, fra(lower));
    const endAge = deathBeforeEnd ? firstDeath.atUserAge : undefined;
    if (startAge < (endAge ?? timeline.horizonAge)) {
      push({ owner: lower, kind: 'spousal', annualAmount, startAge, inflationAdjusted: true, ...(endAge !== undefined && { endAge }) });
      summary.spousal = { owner: lower, annualAmount, fullAmount: fullSpousal, ownerStartAge, startAge, floor: !people[lower].known };
    }
  }

  // The survivor's benefit on the record of the first to die.
  if (deathBeforeEnd) {
    const deceased = firstDeath.who as Who;
    const survivor: Who = deceased === 'user' ? 'partner' : 'user';
    if (piaOf[deceased] > 0) {
      const deathAge = firstDeath.atUserAge - people[deceased].toUser;
      const deceasedFra = fra(deceased);
      const own = people[deceased].benefit!;
      const claimedBeforeDeath = own.startAge <= deathAge;
      // What the deceased was paid, or would have been at death: their full
      // benefit, with any credits earned by then.
      const deceasedBenefit = claimedBeforeDeath
        ? own.annualAmount
        : piaOf[deceased] * claimingFactor(Math.max(deathAge * 12, deceasedFra), deceasedFra);
      const claimedEarly = claimedBeforeDeath && own.startAge * 12 < deceasedFra;
      const full = claimedEarly ? piaOf[deceased] : deceasedBenefit;
      const ownerStartAge = Math.max(firstDeath.atUserAge - people[survivor].toUser, EARLIEST_SURVIVOR_AGE);
      const startAge = ownerStartAge + people[survivor].toUser;
      const factor = survivorFactor(
        ownerStartAge * 12,
        survivorFullRetirementAgeMonths(birthYearOf(people[survivor].age, asOfYear))
      );
      const reduced = full * factor;
      const cap = claimedEarly ? Math.max(deceasedBenefit, 0.825 * piaOf[deceased]) : Number.POSITIVE_INFINITY;
      const annualAmount = Math.min(reduced, cap);
      if (startAge < timeline.horizonAge && annualAmount > 0) {
        const ownBenefit = people[survivor].benefit;
        const ownStart = ownBenefit ? ownBenefit.startAge + people[survivor].toUser : undefined;
        summary.survivor = {
          owner: survivor,
          annualAmount,
          deceasedBenefit,
          ownerStartAge,
          startAge,
          ...(factor < 1 && { reducedTo: factor }),
          ...(reduced > cap && { limited: true }),
          ownAmount: ownBenefit?.annualAmount ?? 0,
          ...(ownStart !== undefined && ownStart > startAge && { ownStartAge: ownStart }),
        };
        // Net of the survivor's own: alone until their own starts, then the
        // part above it.
        if (ownBenefit && ownStart !== undefined && ownStart > startAge) {
          push({ owner: survivor, kind: 'survivor', annualAmount, startAge, inflationAdjusted: true, endAge: ownStart });
        }
        push({
          owner: survivor,
          kind: 'survivor',
          annualAmount: Math.max(0, annualAmount - (ownBenefit?.annualAmount ?? 0)),
          startAge: ownStart !== undefined ? Math.max(startAge, ownStart) : startAge,
          inflationAdjusted: true,
        });
      }
    }
  }
  return { incomes, summary };
}

/** The partner's pension on the user's timeline. */
function partnerPension(partner: PartnerPlan, timeline: HouseholdTimeline): HouseholdIncome | undefined {
  if (!partner.pension) return undefined;
  return {
    owner: 'partner',
    kind: 'pension',
    annualAmount: partner.pension.annualAmount,
    startAge: partner.pension.startAge + timeline.ageGap,
    inflationAdjusted: partner.pension.inflationAdjusted,
  };
}

/** A pension stops with the person it belongs to. */
function withHolderRule(pension: HouseholdIncome, timeline: HouseholdTimeline): HouseholdIncome[] {
  const end = pension.owner === 'user' ? timeline.userPlanThroughAge : timeline.partnerPlanThroughAge;
  if (end >= timeline.horizonAge) return [pension];
  return end > pension.startAge ? [{ ...pension, endAge: end }] : [];
}

/** The couple a calculator plans for: the partner, their marriage, and the joint timeline. */
export interface HouseholdPlan {
  plan: PartnerPlan;
  /** Where each partner figure came from; `socialSecurityAnnual` says whether their own benefit is known. */
  origins?: ResolvedPartner['origins'];
  married?: Marriage;
  timeline: HouseholdTimeline;
}

/**
 * Every income the couple has, on the user's timeline: both pensions, each
 * stopping with its holder, and both Social Security benefits with whatever
 * spousal and survivor benefits a marriage adds.
 */
export function householdIncomes(args: {
  user: { socialSecurity: UserSocialSecurity; pension?: Omit<HouseholdIncome, 'owner' | 'kind'> };
  household: HouseholdPlan;
  currentAge: number;
  asOfYear?: number;
}): { incomes: HouseholdIncome[]; socialSecurity: HouseholdSocialSecurity } {
  const { household } = args;
  const { incomes: socialSecurityIncomes, summary } = householdSocialSecurity({
    user: args.user.socialSecurity,
    partner: household.plan,
    partnerKnown: household.origins?.socialSecurityAnnual !== undefined || Boolean(household.plan.socialSecurity),
    ...(household.married && { married: household.married }),
    timeline: household.timeline,
    currentAge: args.currentAge,
    ...(args.asOfYear !== undefined && { asOfYear: args.asOfYear }),
  });
  const pensions = [
    ...(args.user.pension ? [{ ...args.user.pension, owner: 'user' as const, kind: 'pension' as const }] : []),
    ...[partnerPension(household.plan, household.timeline)].filter((income): income is HouseholdIncome => Boolean(income)),
  ].flatMap((pension) => withHolderRule(pension, household.timeline));
  return { incomes: [...socialSecurityIncomes, ...pensions], socialSecurity: summary };
}

function labelOf(income: { owner?: HouseholdIncome['owner']; kind: HouseholdIncomeKind }): string {
  const partner = income.owner === 'partner';
  switch (income.kind) {
    case 'pension': return partner ? PARTNER_PENSION_LABEL : PENSION_LABEL;
    case 'spousal': return partner ? PARTNER_SPOUSAL_LABEL : SPOUSAL_LABEL;
    case 'survivor': return partner ? PARTNER_SURVIVOR_LABEL : SURVIVOR_LABEL;
    default: return partner ? PARTNER_SOCIAL_SECURITY_LABEL : SOCIAL_SECURITY_LABEL;
  }
}

/** Whose income an engine stream is, and what kind, from its label. */
export function incomeOfStream(stream: Pick<RetirementIncomeStream, 'label'>): Pick<HouseholdIncome, 'owner' | 'kind'> {
  switch (stream.label) {
    case PARTNER_PENSION_LABEL: return { owner: 'partner', kind: 'pension' };
    case PARTNER_SOCIAL_SECURITY_LABEL: return { owner: 'partner', kind: 'social_security' };
    case PARTNER_SPOUSAL_LABEL: return { owner: 'partner', kind: 'spousal' };
    case PARTNER_SURVIVOR_LABEL: return { owner: 'partner', kind: 'survivor' };
    case SPOUSAL_LABEL: return { owner: 'user', kind: 'spousal' };
    case SURVIVOR_LABEL: return { owner: 'user', kind: 'survivor' };
    case PENSION_LABEL: return { owner: 'user', kind: 'pension' };
    default: return { owner: 'user', kind: 'social_security' };
  }
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
 * The household's incomes as the engine takes them, from the user's own
 * streams: theirs, the partner's on the user's ages, and what Social Security
 * pays a couple. `userSocialSecurity` covers a user with no benefit of their
 * own: when they would claim a spousal one, and whether "none" was said.
 */
export function householdIncomeStreams(
  userStreams: readonly RetirementIncomeStream[],
  household: HouseholdPlan,
  options: {
    currentAge?: number;
    userSocialSecurity?: { claimAge: number; known: boolean };
    asOfYear?: number;
  } = {}
): { streams: RetirementIncomeStream[]; socialSecurity: HouseholdSocialSecurity } {
  const own = userStreams.filter((stream) => incomeOfStream(stream).owner === 'user');
  const benefit = own.find((stream) => incomeOfStream(stream).kind === 'social_security');
  const pension = own.find((stream) => incomeOfStream(stream).kind === 'pension');
  const currentAge = options.currentAge ?? household.plan.age + household.timeline.ageGap;
  const { incomes, socialSecurity } = householdIncomes({
    user: {
      socialSecurity: {
        ...(benefit && { benefit: { annualAmount: benefit.annualAmount, startAge: benefit.startAge } }),
        claimAge: benefit?.startAge ?? options.userSocialSecurity?.claimAge ?? DEFAULT_PARTNER_SOCIAL_SECURITY_START_AGE,
        known: Boolean(benefit) || (options.userSocialSecurity?.known ?? false),
      },
      ...(pension && {
        pension: {
          annualAmount: pension.annualAmount,
          startAge: pension.startAge,
          inflationAdjusted: pension.inflationAdjusted !== false,
        },
      }),
    },
    household,
    currentAge,
    ...(options.asOfYear !== undefined && { asOfYear: options.asOfYear }),
  });
  return { streams: incomes.map(toStream), socialSecurity };
}

/**
 * The household's streams worked out afresh after a what-if changed the
 * user's own: a benefit claimed at another age changes the spousal start and
 * the survivor benefit, so only the user's own streams are kept.
 */
export function rebuildHouseholdStreams(
  streams: readonly RetirementIncomeStream[],
  household: HouseholdPlan & { socialSecurity?: HouseholdSocialSecurity },
  currentAge: number
): RetirementIncomeStream[] {
  // Their end ages are worked out afresh too.
  const own = streams.filter((stream) => {
    const { owner, kind } = incomeOfStream(stream);
    return owner === 'user' && (kind === 'social_security' || kind === 'pension');
  });
  return householdIncomeStreams(own, household, {
    currentAge,
    ...(household.socialSecurity && {
      userSocialSecurity: { claimAge: household.socialSecurity.user.claimAge, known: household.socialSecurity.user.known },
    }),
  }).streams;
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
  const stated = (field: Exclude<PartnerField, 'married'>) => origins[field] === 'stated';
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
  if (partner.married?.origin === 'stated') {
    figures.push({ key: 'partnerMarried', value: partner.married.value ? 'married' : 'not_married' });
  }
  if (stated('survivorAnnualSpending') && plan.survivorAnnualSpending !== undefined) {
    figures.push({ key: 'survivorAnnualSpending', value: plan.survivorAnnualSpending });
  }
  return figures;
}
