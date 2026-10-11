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
import {
  incomeOfStream,
  type HouseholdSocialSecurity,
  type HouseholdTimeline,
  type ResolvedPartner,
} from '../services/household';
import { savedOn, STATED_FIGURE_DEFINITIONS } from '../services/stated-figures';
import { buildInputRequest, type InputFieldSpec, type InputRequest, type InputRequestSpec } from './input-request';
import { describeClaimingAdjustmentBriefly } from '../services/social-security-claiming';

/**
 * A partner a calculator planned for, with the joint timeline it ran on and
 * what Social Security pays the couple (absent on runs recorded before
 * spousal benefits).
 */
export type PlannedHousehold = ResolvedPartner & { timeline: HouseholdTimeline; socialSecurity?: HouseholdSocialSecurity };

/** Said when a partner is planned for but nobody has said whether they are married, and it matters. */
export const MARRIAGE_UNKNOWN_CLAUSE =
  'no spousal or survivor Social Security benefits, since I don\'t know whether you\'re married (tell me if you are and I will count them)';

/** A couple's marriage as every retirement form asks for it. */
export const PARTNER_MARRIED_FIELD: InputFieldSpec = {
  id: 'partnerMarried',
  label: 'Are you and your partner married?',
  kind: 'choice',
  options: [
    { value: 'married', label: 'married' },
    { value: 'not_married', label: 'not married' },
  ],
  sentence: 'My partner and I are {value}.',
};

/**
 * The form a run that could not count spousal or survivor benefits carries,
 * because nobody said whether the couple is married.
 */
export function partnerMarriageInputRequest(calculatorId: string, question: string): InputRequest {
  return buildInputRequest({
    calculatorId,
    title: 'Spousal and survivor benefits',
    question,
    submitLabel: 'Update my plan',
    fields: [PARTNER_MARRIED_FIELD],
  }, [PARTNER_MARRIED_FIELD.id])!;
}

/** The form for whatever the couple is missing, the partner's age first; null when nothing is. */
export function householdInputRequest(
  household: { missingAge: true } | PlannedHousehold | undefined,
  calculatorId: string,
  question: string
): InputRequest | null {
  if (!household) return null;
  if ('missingAge' in household) return partnerAgeInputRequest(calculatorId, question);
  return household.socialSecurity?.marriageUnknown ? partnerMarriageInputRequest(calculatorId, question) : null;
}

/** Said when there is a partner to plan for but not their age: in a list, and as a sentence. */
export const MISSING_PARTNER_AGE_CLAUSE =
  'not your partner, since I need their age to plan for them (tell me how old they are and I will include them)';
export const MISSING_PARTNER_AGE_SENTENCE =
  'I did not plan for your partner, since I need their age; tell me how old they are and I will include them.';

/**
 * A partner's age as every retirement form asks for it, in the bounds Your
 * numbers keeps it in. The sentence is one the planner reads as the
 * partner's age, like anything else the user types.
 */
export const PARTNER_AGE_FIELD: InputFieldSpec = {
  id: 'partnerAge',
  label: 'Your partner\'s age',
  kind: 'age',
  minimum: STATED_FIGURE_DEFINITIONS.partnerAge.minimum,
  maximum: STATED_FIGURE_DEFINITIONS.partnerAge.maximum,
  sentence: 'My partner is {value} years old.',
  defaultNote: 'If left blank, I plan without your partner',
};

/** A calculator's form with the partner's age added, for a run still waiting on the user's own figures. */
export function withPartnerAgeField(spec: InputRequestSpec): InputRequestSpec {
  return { ...spec, fields: [...spec.fields, PARTNER_AGE_FIELD] };
}

/**
 * The form a run that planned without the partner carries: their age alone.
 * The answer stands without it; the form is how to add them.
 */
export function partnerAgeInputRequest(calculatorId: string, question: string): InputRequest {
  return buildInputRequest({
    calculatorId,
    title: 'Include your partner',
    question,
    submitLabel: 'Include my partner',
    fields: [PARTNER_AGE_FIELD],
  }, [PARTNER_AGE_FIELD.id])!;
}

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
  if (kind === 'spousal') return ', until the first of you reaches their planning age';
  if (kind === 'survivor') return owner === 'partner' ? ', until their own benefit starts' : ', until your own benefit starts';
  return owner === 'partner' ? ', until your partner reaches their planning age' : ', until you reach your planning age';
}

/**
 * A spousal benefit, as a clause, whoever it belongs to: on whose record,
 * from when, whether it was reduced for starting early, and whether it is
 * only the least they would be paid.
 */
export function describeSpousalIncome(stream: RetirementIncomeStream, household: PlannedHousehold): string {
  const { owner } = incomeOfStream(stream);
  const spousal = household.socialSecurity?.spousal;
  const partner = owner === 'partner';
  const reduced = spousal && spousal.annualAmount < spousal.fullAmount
    ? ', reduced for starting before full retirement age'
    : '';
  const floor = spousal?.floor
    ? partner
      ? ' (the least they would be paid, since I don\'t know their own benefit)'
      : ' (the least you would be paid, since I don\'t know your own benefit)'
    : '';
  const from = partner ? partnerAgeAt(stream.startAge, household) : String(stream.startAge);
  return `${partner ? 'your partner\'s spousal benefit' : 'your spousal benefit'} of ${money(stream.annualAmount)} a year ` +
    `in today's dollars on ${partner ? 'your' : 'your partner\'s'} record from ${from}${reduced}${incomeEndClause(stream, household)}${floor}`;
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
  if (kind === 'spousal') return describeSpousalIncome(stream, household);
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
 *
 * Pass the incomes the run counted so the first-death clause only names the
 * Social Security survivor rule or a pension stop when those actually apply.
 */
export function describeHouseholdTimeline(
  household: PlannedHousehold,
  spending: {
    /** The couple's spending a year, when the run has one. */
    annual?: number;
    /** What the survivor spends from the first death, when the run counted it. */
    survivor?: { fromAge: number; annualAmount: number };
  },
  countedIncomes?: ReadonlyArray<{ kind: string; endAge?: number }>
): string[] {
  const { plan, origins, timeline } = household;
  const socialSecurity = household.socialSecurity;
  const source = (field: keyof typeof origins) =>
    origins[field] === 'saved'
      ? savedNote(household)
      : origins[field] === 'default' ? ', an age I assumed' : '';
  const marriage = household.married?.value
    ? household.married.origin === 'saved' && household.married.savedAt
      ? ` (married, from Your numbers, saved ${savedOn(household.married.savedAt)})`
      : household.married.origin === 'remembered' ? ' (married, as you told me before)' : ''
    : '';
  const partnerEndsAt = `${plan.planThroughAge}${source('planThroughAge')}`;
  const horizon = timeline.horizonAge > timeline.userPlanThroughAge
    ? `the plan runs until your partner reaches ${partnerEndsAt}, when you would be ${timeline.horizonAge}`
    : timeline.horizonAge > timeline.partnerPlanThroughAge
      ? `the plan runs until you reach ${timeline.horizonAge}; your partner plans through ${partnerEndsAt}`
      : `you both reach your planning ages together, at your ${timeline.horizonAge}`;
  const parts = [`planning for you and your partner${marriage}, ${plan.age} today${source('age')}; ${horizon}`];
  if (timeline.firstDeath.atUserAge < timeline.horizonAge) {
    const deceased = timeline.firstDeath.who;
    const first = deceased === 'user'
      ? `you reach ${timeline.firstDeath.atUserAge}`
      : `your partner reaches ${plan.planThroughAge} (your ${timeline.firstDeath.atUserAge})`;
    const incomes = countedIncomes ?? [
      ...(plan.socialSecurity ? [{ kind: 'social_security' }] : []),
      ...(plan.pension ? [{ kind: 'pension' }] : []),
    ];
    const hasSocialSecurity = incomes.some((income) => income.kind === 'social_security');
    const pensionStops = incomes.some((income) => income.kind === 'pension' && (countedIncomes ? income.endAge !== undefined : true));
    const rules: string[] = [];
    const survivor = socialSecurity?.survivor;
    if (survivor) {
      const theSurvivor = survivor.owner === 'partner' ? 'your partner\'s' : 'your';
      const record = survivor.owner === 'partner' ? 'your' : 'your partner\'s';
      const deceasedName = survivor.owner === 'partner' ? 'you' : 'your partner';
      const later = survivor.startAge > timeline.firstDeath.atUserAge
        ? ` from ${survivor.owner === 'partner' ? partnerAgeAt(survivor.startAge, household) : survivor.startAge}`
        : '';
      const notes = [
        survivor.reducedTo !== undefined ? 'reduced for taking it before full retirement age' : null,
        survivor.limited
          ? `no more than ${deceasedName === 'you' ? 'you were' : 'your partner was'} paid or 82.5% of ${deceasedName === 'you' ? 'your' : 'their'} full benefit, since ${deceasedName} claimed early`
          : null,
      ].filter((note): note is string => Boolean(note));
      const noted = notes.length > 0 ? ` (${notes.join('; ')})` : '';
      const ownLater = survivor.ownStartAge !== undefined
        ? survivor.owner === 'partner' ? partnerAgeAt(survivor.ownStartAge, household) : String(survivor.ownStartAge)
        : undefined;
      rules.push(survivor.annualAmount > survivor.ownAmount
        ? `${theSurvivor} Social Security becomes ${money(survivor.annualAmount)} a year${later}, the survivor benefit on ${record} record${noted}`
        : ownLater
          ? `${survivor.owner === 'partner' ? 'your partner is' : 'you are'} paid the survivor benefit on ${record} record, ` +
            `${money(survivor.annualAmount)} a year${later}${noted}, until ${survivor.owner === 'partner' ? 'their' : 'your'} own larger benefit starts at ${ownLater}`
          : `${survivor.owner === 'partner' ? 'your partner keeps their' : 'you keep your'} own Social Security, which is more than the survivor benefit on ${record} record`);
      if (socialSecurity?.spousal) rules.push('the spousal benefit stops');
      if (pensionStops) rules.push('a pension stops with the person it belongs to');
    } else if (!socialSecurity && incomes.filter((income) => income.kind === 'social_security').length >= 2) {
      // Recorded before spousal benefits, under the rule that kept the larger benefit.
      rules.push('the survivor keeps the larger Social Security benefit');
      if (pensionStops) rules.push('a pension stops with the person it belongs to');
    } else if (hasSocialSecurity || pensionStops) {
      const what = [hasSocialSecurity ? 'Social Security benefit' : null, pensionStops ? 'pension' : null]
        .filter(Boolean).join(' and ');
      rules.push(`each ${what} stops with the person it belongs to`);
    }
    const after = spending.survivor
      ? `spending becomes ${money(spending.survivor.annualAmount)} a year, what you said one of you would spend alone${source('survivorAnnualSpending')}`
      : spending.annual !== undefined
        ? `spending stays ${money(spending.annual)} a year unless you tell me what one of you would spend alone`
        : '';
    // "the survivor ... and a pension stops ..., and spending stays ...", or
    // the spending alone when no income rule applies.
    const changes = [rules.join(' and '), after].filter(Boolean).join(', and ');
    if (changes) parts.push(`from when ${first}, ${changes}`);
  }
  if (socialSecurity?.marriageUnknown) parts.push(MARRIAGE_UNKNOWN_CLAUSE);
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
    // Spousal and survivor benefits are the household's Social Security facts.
    if (kind === 'spousal' || kind === 'survivor') continue;
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
          'when its holder reaches their planning age',
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

/**
 * What Social Security pays the couple beyond each one's own benefit, as
 * facts: each one's full-retirement-age benefit, the spousal benefit and the
 * survivor benefit, with the user's age each starts at.
 */
export function householdSocialSecurityFactRows(household: PlannedHousehold): HouseholdFactRow[] {
  const socialSecurity = household.socialSecurity;
  if (!socialSecurity?.married?.value) return [];
  const rows: HouseholdFactRow[] = [];
  const whose = (owner: 'user' | 'partner') => (owner === 'partner' ? 'The user\'s partner\'s' : 'The user\'s');
  const record = (owner: 'user' | 'partner') => (owner === 'partner' ? 'the user\'s' : 'the partner\'s');
  const prefix = (owner: 'user' | 'partner') => (owner === 'partner' ? 'partner_' : '');
  for (const owner of ['user', 'partner'] as const) {
    const pia = socialSecurity[owner].pia;
    if (pia > 0) {
      rows.push({
        suffix: `${prefix(owner)}full_retirement_benefit`,
        label: `${whose(owner)} Social Security a year at full retirement age, in today's dollars`,
        value: Number(pia.toFixed(2)),
        unit: 'usd',
      });
    }
  }
  const spousal = socialSecurity.spousal;
  if (spousal) {
    rows.push({
      suffix: `${prefix(spousal.owner)}spousal_annual`,
      label: `${whose(spousal.owner)} spousal benefit a year on ${record(spousal.owner)} record, in today's dollars` +
        (spousal.annualAmount < spousal.fullAmount ? ', reduced for starting before full retirement age' : ''),
      value: Number(spousal.annualAmount.toFixed(2)),
      unit: 'usd',
    });
    rows.push({
      suffix: `${prefix(spousal.owner)}spousal_start_age`,
      label: `The user's age when ${spousal.owner === 'partner' ? 'the partner\'s' : 'the user\'s'} spousal benefit starts`,
      value: spousal.startAge,
      unit: 'age',
    });
  }
  const survivor = socialSecurity.survivor;
  if (survivor) {
    rows.push({
      suffix: `${prefix(survivor.owner)}survivor_benefit_annual`,
      label: `The survivor benefit a year ${survivor.owner === 'partner' ? 'the user\'s partner' : 'the user'} would be paid on ${record(survivor.owner)} record after the first death, in today's dollars`,
      value: Number(survivor.annualAmount.toFixed(2)),
      unit: 'usd',
    });
    rows.push({
      suffix: `${prefix(survivor.owner)}survivor_benefit_start_age`,
      label: `The user's age when ${survivor.owner === 'partner' ? 'the partner\'s' : 'the user\'s'} survivor benefit starts`,
      value: survivor.startAge,
      unit: 'age',
    });
  }
  return rows;
}
