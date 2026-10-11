/**
 * How every retirement calculator states a partner: the clauses a disclosure
 * lists and the facts an answer may quote. One wording for all three, so a
 * couple's plan reads the same whichever calculator answered it.
 *
 * Every age an engine runs on is the user's, so a partner's income is named
 * at both ages -- "from their 67 (your 70)" -- and a fact's label says whose
 * age its value is.
 */

import type { RetirementIncomeStream } from '../retirement-analytics/types';
import type { CanonicalFactUnit } from './canonical-facts';
import { incomeOfStream, type HouseholdTimeline, type ResolvedPartner } from '../services/household';
import { savedOn } from '../services/stated-figures';
import { describeClaimingAdjustmentBriefly } from '../services/social-security-claiming';

/** A partner a calculator planned for, with the joint timeline it ran on. */
export type PlannedHousehold = ResolvedPartner & { timeline: HouseholdTimeline };

/** Said when there is a partner to plan for but not their age: in a list, and as a sentence. */
export const MISSING_PARTNER_AGE_CLAUSE =
  'not your partner, since I need their age to plan for them (tell me how old they are and I will include them)';
export const MISSING_PARTNER_AGE_SENTENCE =
  'I did not plan for your partner, since I need their age; tell me how old they are and I will include them.';

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/** "their 67 (your 70)": a partner's age beside the user's at the same moment. */
export function partnerAgeAt(userAge: number, household: PlannedHousehold): string {
  return `their ${userAge - household.timeline.ageGap} (your ${userAge})`;
}

/** Why an income stops before the plan ends, as a trailing clause; empty when it is paid to the end. */
export function incomeEndClause(
  stream: Pick<RetirementIncomeStream, 'label' | 'endAge'>,
  household: PlannedHousehold | undefined
): string {
  if (stream.endAge === undefined || !household) return '';
  const { owner, kind } = incomeOfStream(stream as RetirementIncomeStream);
  if (kind === 'social_security') {
    return ', until the first of you reaches their planning age, when the survivor keeps the larger benefit';
  }
  return owner === 'partner' ? ', until your partner reaches their planning age' : ', until you reach your planning age';
}

function savedNote(household: PlannedHousehold): string {
  return household.savedAt ? ` (from Your numbers, saved ${savedOn(household.savedAt)})` : '';
}

/**
 * One of the partner's incomes, as a clause: the amount, when it starts at
 * both ages, any claiming rule applied, when it stops, and which of its terms
 * were assumed or saved.
 */
export function describePartnerIncome(stream: RetirementIncomeStream, household: PlannedHousehold): string {
  const { kind } = incomeOfStream(stream);
  const origin = household.origins;
  const from = partnerAgeAt(stream.startAge, household);
  if (kind === 'social_security') {
    const assumedStart = origin.socialSecurityStartAge === 'default' ? ', an age I assumed' : '';
    const claiming = household.plan.socialSecurity?.claiming;
    const claimed = claiming ? ` (${describeClaimingAdjustmentBriefly(claiming, 'partner')})` : '';
    const saved = origin.socialSecurityAnnual === 'saved' ? savedNote(household) : '';
    return `your partner's Social Security of ${money(stream.annualAmount)} a year in today's dollars from ${from}` +
      `${assumedStart}${claimed}${incomeEndClause(stream, household)}${saved}`;
  }
  const terms = stream.inflationAdjusted
    ? `your partner's pension of ${money(stream.annualAmount)} a year in today's dollars from ${from}, rising with inflation`
    : `your partner's pension of ${money(stream.annualAmount)} a year from ${from}, a fixed amount that buys less each year prices rise`;
  const assumed = [
    origin.pensionStartAge === 'default' ? 'that it starts when you retire' : null,
    origin.pensionInflation === 'default' ? 'that it does not rise with inflation' : null,
  ].filter((item): item is string => Boolean(item));
  const assumedNote = assumed.length > 0 ? ` (I assumed ${assumed.join(' and ')})` : '';
  const saved = origin.pensionAnnual === 'saved' ? savedNote(household) : '';
  return `${terms}${incomeEndClause(stream, household)}${assumedNote}${saved}`;
}

/**
 * The couple's timeline: whose planning age ends the plan, who reaches theirs
 * first, and what changes then. Each part names its source the way the
 * incomes do, so a partner's age or horizon the user never gave is the
 * easiest thing to correct.
 */
export function describeHouseholdTimeline(
  household: PlannedHousehold,
  spending: {
    /** The couple's spending a year, when the run has one. */
    annual?: number;
    /** What the survivor spends from the first death, when the run counted it. */
    survivor?: { fromAge: number; annualAmount: number };
  }
): string[] {
  const { plan, origins, timeline } = household;
  const source = (field: keyof typeof origins) =>
    origins[field] === 'saved'
      ? savedNote(household)
      : origins[field] === 'default' ? ', an age I assumed' : '';
  const partnerEndsAt = `${plan.planThroughAge}${source('planThroughAge')}`;
  const horizon = timeline.horizonAge > timeline.userPlanThroughAge
    ? `the plan runs until your partner reaches ${partnerEndsAt}, when you would be ${timeline.horizonAge}`
    : timeline.horizonAge > timeline.partnerPlanThroughAge
      ? `the plan runs until you reach ${timeline.horizonAge}; your partner plans through ${partnerEndsAt}`
      : `you both reach your planning ages together, at your ${timeline.horizonAge}`;
  const parts = [`planning for you and your partner, ${plan.age} today${source('age')}; ${horizon}`];
  if (timeline.firstDeath.atUserAge < timeline.horizonAge) {
    const first = timeline.firstDeath.who === 'user'
      ? `you reach ${timeline.firstDeath.atUserAge}`
      : `your partner reaches ${plan.planThroughAge} (your ${timeline.firstDeath.atUserAge})`;
    const after = spending.survivor
      ? `, and spending becomes ${money(spending.survivor.annualAmount)} a year, what you said one of you would spend alone${source('survivorAnnualSpending')}`
      : spending.annual !== undefined
        ? `, and spending stays ${money(spending.annual)} a year unless you tell me what one of you would spend alone`
        : '';
    parts.push(`from when ${first}, the survivor keeps the larger Social Security benefit and a pension stops with the person it belongs to${after}`);
  }
  return parts;
}

/** A fact a calculator publishes about the household, before its own id prefix and source. */
export interface HouseholdFactRow {
  suffix: string;
  label: string;
  value: number;
  unit: CanonicalFactUnit;
}

/**
 * The partner's incomes, and when any income stops, as facts. The user's own
 * amounts and start ages are each calculator's own facts already.
 */
export function householdIncomeFactRows(
  streams: readonly RetirementIncomeStream[],
  household: PlannedHousehold
): HouseholdFactRow[] {
  const rows: HouseholdFactRow[] = [];
  for (const stream of streams) {
    const { owner, kind } = incomeOfStream(stream);
    const name = kind === 'pension' ? 'pension' : 'social_security';
    const key = `${owner === 'partner' ? 'partner_' : ''}${name}`;
    const income = kind === 'pension' ? 'pension or other income' : 'Social Security';
    if (owner === 'partner') {
      const claiming = kind === 'social_security' ? household.plan.socialSecurity?.claiming : undefined;
      const amountLabel = kind === 'social_security'
        ? claiming
          ? `The user's partner's Social Security a year, claimed at ${claiming.toAge} (the partner's age) by Social Security's claiming rules, in today's dollars`
          : 'The user\'s partner\'s Social Security a year, in today\'s dollars'
        : stream.inflationAdjusted
          ? 'The user\'s partner\'s pension or other income a year, in today\'s dollars, rising with inflation'
          : 'The user\'s partner\'s pension or other income a year, a fixed dollar amount that does not rise with inflation';
      rows.push({ suffix: `${key}_annual`, label: amountLabel, value: stream.annualAmount, unit: 'usd' });
      if (claiming) {
        rows.push({
          suffix: `${key}_as_given`,
          label: `The user's partner's Social Security a year as the user gave it, for claiming at ${claiming.fromAge} (the partner's age), in today's dollars`,
          value: claiming.fromAmount,
          unit: 'usd',
        });
      }
      rows.push({
        suffix: `${key}_start_age_partner`,
        label: `The partner's age when their ${income} starts`,
        value: stream.startAge - household.timeline.ageGap,
        unit: 'age',
      });
      rows.push({
        suffix: `${key}_start_age`,
        label: `The user's age when the partner's ${income} starts`,
        value: stream.startAge,
        unit: 'age',
      });
    }
    if (stream.endAge !== undefined) {
      rows.push({
        suffix: `${key}_end_age`,
        label: `The user's age when ${owner === 'partner' ? 'the partner\'s' : 'the user\'s'} ${income} stops, ` +
          (kind === 'social_security'
            ? 'at the first death, when the survivor keeps the larger benefit'
            : 'when its holder reaches their planning age'),
        value: stream.endAge,
        unit: 'age',
      });
    }
  }
  return rows;
}

/** The couple's timeline as facts, on the user's ages beside the partner's own. */
export function householdTimelineFactRows(
  household: PlannedHousehold,
  survivorSpending: { fromAge: number; annualAmount: number } | undefined
): HouseholdFactRow[] {
  const { plan, timeline } = household;
  const rows: HouseholdFactRow[] = [
    { suffix: 'partner_age', label: 'The user\'s partner\'s age today', value: plan.age, unit: 'age' },
    { suffix: 'partner_plan_through_age', label: 'Age the user\'s partner plans through', value: plan.planThroughAge, unit: 'age' },
    {
      suffix: 'plan_end_age',
      label: 'The user\'s age when the plan ends, the later of the two partners\' planning ages',
      value: timeline.horizonAge,
      unit: 'age',
    },
  ];
  if (timeline.firstDeath.atUserAge < timeline.horizonAge) {
    rows.push({
      suffix: 'first_death_age',
      label: 'The user\'s age when the first of the couple reaches their planning age and the survivor years begin',
      value: timeline.firstDeath.atUserAge,
      unit: 'age',
    });
  }
  if (survivorSpending) {
    rows.push({
      suffix: 'survivor_spending',
      label: 'Annual spending after the first death, what the user said one survivor would spend, in today\'s dollars',
      value: survivorSpending.annualAmount,
      unit: 'usd',
    });
  }
  return rows;
}
