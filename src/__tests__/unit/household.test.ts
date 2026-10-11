import { describe, expect, it } from '@jest/globals';
import { describeHouseholdTimeline } from '../../openai/household-evidence';
import {
  householdIncomes,
  householdIncomeStreams,
  householdSocialSecurity,
  householdTimeline,
  partnerAgeMissing,
  partnerClaimingAt,
  partnerClaimingUnavailableReason,
  partnerSavableFigures,
  rebuildHouseholdStreams,
  resolveMarriage,
  resolvePartner,
  type HouseholdPlan,
  type Marriage,
  type PartnerPlan,
  type ResolvedPartner,
} from '../../services/household';

const SAVED_AT = '2026-09-14T10:00:00.000Z';
const saved = (value: number | string) => ({ value, savedAt: SAVED_AT, source: 'page' as const });
const MARRIED: Marriage = { value: true, origin: 'stated' };
const benefit = (annualAmount: number, startAge: number) => ({
  annualAmount,
  startAge,
  quote: { amount: annualAmount, age: startAge },
});

/** A couple on the user's timeline: every rule here reads birth years from 2026. */
function couple(args: {
  currentAge: number;
  userPlanThroughAge?: number;
  partner: PartnerPlan;
  married?: Marriage;
  partnerKnown?: boolean;
}): HouseholdPlan {
  return {
    plan: args.partner,
    ...(args.partnerKnown !== false && args.partner.socialSecurity && { origins: { socialSecurityAnnual: 'stated' as const } }),
    ...(args.married && { married: args.married }),
    timeline: householdTimeline({
      currentAge: args.currentAge,
      userPlanThroughAge: args.userPlanThroughAge ?? 95,
      partner: args.partner,
    }),
  };
}

function partnerOf(result: ReturnType<typeof resolvePartner>): ResolvedPartner {
  if (!result || 'missingAge' in result) throw new Error('no partner');
  return result;
}

describe('a partner in the plan', () => {
  it('has no partner without one, and asks for an age rather than assume it', () => {
    expect(resolvePartner({ retirementAge: 65, currentAge: 60 })).toBeNull();
    expect(resolvePartner({ stated: { socialSecurityAnnual: 24_000 }, retirementAge: 65, currentAge: 60 }))
      .toEqual({ missingAge: true });
    // Anything that changes the plan once the age is known asks for it too.
    expect(resolvePartner({ stated: { survivorAnnualSpending: 50_000 }, retirementAge: 65, currentAge: 60 }))
      .toEqual({ missingAge: true });
    expect(resolvePartner({ statedFigures: { partnerPlanThroughAge: saved(92) }, retirementAge: 65, currentAge: 60 }))
      .toEqual({ missingAge: true });
    // A claiming age with no benefit behind it does not.
    expect(resolvePartner({ stated: { socialSecurityStartAge: 70 }, retirementAge: 65, currentAge: 60 })).toBeNull();
    // The same check, for a form that is still waiting on the user's own figures.
    expect(partnerAgeMissing({ pensionAnnual: 12_000 }, undefined)).toBe(true);
    expect(partnerAgeMissing({ pensionAnnual: 12_000 }, { partnerAge: saved(55) })).toBe(false);
    expect(partnerAgeMissing({ pensionAnnual: 0 }, { partnerRetirementIncome: saved(12_000) })).toBe(false);
    expect(partnerAgeMissing(undefined, undefined)).toBe(false);
  });

  it('takes what the user said, then Your numbers, then named defaults', () => {
    const partner = partnerOf(resolvePartner({
      stated: { age: 57, socialSecurityAnnual: 24_000 },
      statedFigures: {
        partnerAge: saved(55),
        partnerRetirementIncome: saved(18_000),
        partnerRetirementIncomeInflation: saved('rises_with_inflation'),
      },
      retirementAge: 65,
      currentAge: 60,
      asOfYear: 2026,
    }));

    expect(partner.plan).toEqual({
      age: 57,
      planThroughAge: 95,
      socialSecurity: { annualAmount: 24_000, startAge: 67, quote: { amount: 24_000, age: 67 } },
      socialSecurityClaimAge: 67,
      // Starts at the household's retirement: the user's 65 is the partner's 62.
      pension: { annualAmount: 18_000, startAge: 62, inflationAdjusted: true },
    });
    expect(partner.origins).toEqual({
      age: 'stated',
      socialSecurityAnnual: 'stated',
      socialSecurityStartAge: 'default',
      pensionAnnual: 'saved',
      pensionStartAge: 'default',
      pensionInflation: 'saved',
      planThroughAge: 'default',
    });
    expect(partner.savedAt).toBe(SAVED_AT);
  });

  it('moves the partner\'s benefit by the claiming rules, on their own age', () => {
    const partner = partnerOf(resolvePartner({
      stated: { age: 50, socialSecurityAnnual: 30_000, socialSecurityAmountAge: 67, socialSecurityStartAge: 70 },
      retirementAge: 65,
      currentAge: 52,
      asOfYear: 2026,
    }));
    expect(partner.plan.socialSecurity).toMatchObject({ annualAmount: 37_200, startAge: 70 });
  });

  it('runs until the younger reaches their age, with the older\'s as the first death', () => {
    const timeline = householdTimeline({
      currentAge: 60,
      userPlanThroughAge: 95,
      partner: { age: 55, planThroughAge: 95 },
    });
    expect(timeline).toEqual({
      ageGap: 5,
      userPlanThroughAge: 95,
      partnerPlanThroughAge: 100,
      firstDeath: { who: 'user', atUserAge: 95 },
      horizonAge: 100,
    });
  });

  it('stops each benefit and pension with its holder when the couple is not married', () => {
    const partner = { age: 55, planThroughAge: 95, socialSecurity: benefit(20_000, 67), pension: { annualAmount: 12_000, startAge: 60, inflationAdjusted: false } };
    const { incomes, socialSecurity } = householdIncomes({
      user: {
        socialSecurity: { benefit: { annualAmount: 30_000, startAge: 67 }, claimAge: 67, known: true },
        pension: { annualAmount: 10_000, startAge: 65, inflationAdjusted: false },
      },
      household: couple({ currentAge: 60, partner, married: { value: false, origin: 'stated' } }),
      currentAge: 60,
      asOfYear: 2026,
    });

    expect(incomes).toEqual([
      // The user reaches 95 first: their own benefit stops then, however large.
      { owner: 'user', kind: 'social_security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true, endAge: 95 },
      // The partner claims at their 67, the user's 72, and outlives the first death.
      { owner: 'partner', kind: 'social_security', annualAmount: 20_000, startAge: 72, inflationAdjusted: true },
      { owner: 'user', kind: 'pension', annualAmount: 10_000, startAge: 65, inflationAdjusted: false, endAge: 95 },
      { owner: 'partner', kind: 'pension', annualAmount: 12_000, startAge: 65, inflationAdjusted: false },
    ]);
    expect(socialSecurity.spousal).toBeUndefined();
    expect(socialSecurity.survivor).toBeUndefined();
    expect(socialSecurity.marriageUnknown).toBeUndefined();
  });

  it('counts neither benefit, and says so, when nobody has said whether they are married', () => {
    const partner = { age: 60, planThroughAge: 90, socialSecurity: benefit(30_000, 67) };
    const { incomes, summary } = householdSocialSecurity({
      user: { benefit: { annualAmount: 18_000, startAge: 67 }, claimAge: 67, known: true },
      partner,
      partnerKnown: true,
      timeline: couple({ currentAge: 60, partner }).timeline,
      currentAge: 60,
      asOfYear: 2026,
    });
    expect(incomes.map((income) => [income.owner, income.kind, income.endAge])).toEqual([
      ['user', 'social_security', undefined],
      ['partner', 'social_security', 90],
    ]);
    expect(summary.marriageUnknown).toBe(true);

    // Nor asks when being married would pay nothing more: both reach their age
    // together, and the partner's own is more than half the user's.
    const together = { age: 60, planThroughAge: 95, socialSecurity: benefit(20_000, 67) };
    expect(householdSocialSecurity({
      user: { benefit: { annualAmount: 30_000, startAge: 67 }, claimAge: 67, known: true },
      partner: together,
      partnerKnown: true,
      timeline: couple({ currentAge: 60, partner: together }).timeline,
      currentAge: 60,
      asOfYear: 2026,
    }).summary.marriageUnknown).toBeUndefined();
  });

  it('pays the survivor the larger benefit, net of their own, when the couple is married', () => {
    const partner = { age: 60, planThroughAge: 90, socialSecurity: benefit(30_000, 67) };
    const { incomes, socialSecurity } = householdIncomes({
      user: { socialSecurity: { benefit: { annualAmount: 18_000, startAge: 67 }, claimAge: 67, known: true } },
      household: couple({ currentAge: 60, partner, married: MARRIED }),
      currentAge: 60,
      asOfYear: 2026,
    });
    expect(incomes).toEqual([
      { owner: 'user', kind: 'social_security', annualAmount: 18_000, startAge: 67, inflationAdjusted: true },
      { owner: 'partner', kind: 'social_security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true, endAge: 90 },
      // From the partner's death the user is paid $30,000 in all: $12,000 above their own.
      { owner: 'user', kind: 'survivor', annualAmount: 12_000, startAge: 90, inflationAdjusted: true },
    ]);
    expect(socialSecurity.survivor).toEqual({
      owner: 'user',
      annualAmount: 30_000,
      deceasedBenefit: 30_000,
      ownerStartAge: 90,
      startAge: 90,
      ownAmount: 18_000,
    });
    // Half of $30,000 is less than the user's own $18,000: no spousal benefit.
    expect(socialSecurity.spousal).toBeUndefined();
  });

  it('pays a spousal benefit on the higher earner\'s record, the least they would be paid when their own is unknown', () => {
    const partner = { age: 60, planThroughAge: 95, socialSecurity: benefit(30_000, 67) };
    const { incomes, socialSecurity } = householdIncomes({
      user: { socialSecurity: { claimAge: 67, known: false } },
      household: couple({ currentAge: 60, partner, married: MARRIED }),
      currentAge: 60,
      asOfYear: 2026,
    });
    expect(incomes).toEqual([
      { owner: 'partner', kind: 'social_security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true },
      { owner: 'user', kind: 'spousal', annualAmount: 15_000, startAge: 67, inflationAdjusted: true },
    ]);
    expect(socialSecurity.spousal).toEqual({
      owner: 'user',
      annualAmount: 15_000,
      fullAmount: 15_000,
      ownerStartAge: 67,
      startAge: 67,
      floor: true,
    });
  });

  it('starts a spousal benefit once both have claimed, reduced for starting early', () => {
    // $24,000 claimed at 64 is a $30,000 full benefit (80% three years early).
    const partner = { age: 60, planThroughAge: 95, socialSecurity: benefit(24_000, 64) };
    const { socialSecurity } = householdIncomes({
      // A stated zero: the user has no benefit of their own, and would claim at 62.
      user: { socialSecurity: { claimAge: 62, known: true } },
      household: couple({ currentAge: 60, partner, married: MARRIED }),
      currentAge: 60,
      asOfYear: 2026,
    });
    expect(socialSecurity.partner.pia).toBeCloseTo(30_000, 6);
    // It cannot start before the partner claims at 64: 36 months early is 25% less.
    expect(socialSecurity.spousal).toMatchObject({ ownerStartAge: 64, startAge: 64, floor: false });
    expect(socialSecurity.spousal!.fullAmount).toBeCloseTo(15_000, 6);
    expect(socialSecurity.spousal!.annualAmount).toBeCloseTo(11_250, 6);
  });

  it('limits a survivor benefit when the deceased claimed early, and stops the spousal benefit at the death', () => {
    // $21,000 at 62 is 70% of a $30,000 full benefit.
    const partner = { age: 60, planThroughAge: 80, socialSecurity: benefit(21_000, 62) };
    const { incomes, socialSecurity } = householdIncomes({
      user: { socialSecurity: { benefit: { annualAmount: 10_000, startAge: 67 }, claimAge: 67, known: true } },
      household: couple({ currentAge: 60, partner, married: MARRIED }),
      currentAge: 60,
      asOfYear: 2026,
    });
    // The full $30,000 at the survivor's full retirement age, capped at the
    // larger of the $21,000 paid and 82.5% of $30,000.
    expect(socialSecurity.survivor).toMatchObject({ owner: 'user', deceasedBenefit: 21_000, limited: true, ownAmount: 10_000 });
    expect(socialSecurity.survivor!.annualAmount).toBeCloseTo(24_750, 6);
    expect(incomes.map((income) => [income.owner, income.kind, Math.round(income.annualAmount), income.startAge, income.endAge])).toEqual([
      ['user', 'social_security', 10_000, 67, undefined],
      ['partner', 'social_security', 21_000, 62, 80],
      ['user', 'spousal', 5_000, 67, 80],
      ['user', 'survivor', 14_750, 80, undefined],
    ]);
  });

  it('reduces a survivor benefit taken before the survivor\'s full retirement age, alone until their own starts', () => {
    // The partner is ten years older and reaches 75 when the user is 65.
    const partner = { age: 60, planThroughAge: 75, socialSecurity: benefit(30_000, 67) };
    const { incomes, socialSecurity } = householdIncomes({
      user: { socialSecurity: { benefit: { annualAmount: 20_000, startAge: 67 }, claimAge: 67, known: true } },
      household: couple({ currentAge: 50, partner, married: MARRIED }),
      currentAge: 50,
      asOfYear: 2026,
    });
    // 24 of the 84 months between 60 and 67 early: 28.5% x 24/84 less.
    const factor = 1 - (0.285 * 24) / 84;
    expect(socialSecurity.survivor).toMatchObject({ owner: 'user', ownerStartAge: 65, startAge: 65, ownStartAge: 67 });
    expect(socialSecurity.survivor!.reducedTo).toBeCloseTo(factor, 10);
    expect(socialSecurity.survivor!.annualAmount).toBeCloseTo(30_000 * factor, 6);
    expect(incomes.map((income) => [income.owner, income.kind, Math.round(income.annualAmount), income.startAge, income.endAge])).toEqual([
      ['user', 'social_security', 20_000, 67, undefined],
      ['partner', 'social_security', 30_000, 57, 65],
      // The survivor benefit alone until the user's own starts, then the part above it.
      ['user', 'survivor', Math.round(30_000 * factor), 65, 67],
      ['user', 'survivor', Math.round(30_000 * factor - 20_000), 67, undefined],
    ]);
  });

  it('stops nothing when both reach their age together', () => {
    const partner = { age: 60, planThroughAge: 95, socialSecurity: benefit(20_000, 67) };
    const household = couple({ currentAge: 60, partner, married: MARRIED });
    expect(household.timeline.firstDeath).toEqual({ who: 'both', atUserAge: 95 });
    const { incomes, socialSecurity } = householdIncomes({
      user: { socialSecurity: { benefit: { annualAmount: 30_000, startAge: 67 }, claimAge: 67, known: true } },
      household,
      currentAge: 60,
      asOfYear: 2026,
    });
    expect(incomes.every((income) => income.endAge === undefined)).toBe(true);
    expect(socialSecurity.survivor).toBeUndefined();
  });

  it('works the survivor benefit out afresh when a what-if claims the user\'s own later', () => {
    const partner = { age: 60, planThroughAge: 90, socialSecurity: benefit(30_000, 67) };
    const household = couple({ currentAge: 60, partner, married: MARRIED });
    const baseline = householdIncomeStreams(
      [{ label: 'Social Security', annualAmount: 18_000, startAge: 67, inflationAdjusted: true }],
      household,
      { currentAge: 60, asOfYear: 2026 }
    );
    expect(baseline.streams.map((stream) => [stream.label, stream.annualAmount, stream.endAge])).toEqual([
      ['Social Security', 18_000, undefined],
      ['your partner\'s Social Security', 30_000, 90],
      ['survivor benefit on your partner\'s record', 12_000, undefined],
    ]);

    // Claimed at 70 it is $22,320: the survivor benefit above it shrinks to $7,680.
    const claimedLater = rebuildHouseholdStreams(
      baseline.streams.map((stream) => stream.label === 'Social Security' ? { ...stream, annualAmount: 22_320, startAge: 70 } : stream),
      { ...household, socialSecurity: baseline.socialSecurity },
      60
    );
    expect(claimedLater.map((stream) => [stream.label, stream.annualAmount, stream.startAge])).toEqual([
      ['Social Security', 22_320, 70],
      ['your partner\'s Social Security', 30_000, 67],
      ['survivor benefit on your partner\'s record', 7_680, 90],
    ]);
  });

  it('leaves out an income that would stop before it starts', () => {
    // The partner plans through 69 but would claim at 70: never paid.
    const partner = { age: 60, planThroughAge: 69, socialSecurity: benefit(10_000, 70) };
    const household = couple({ currentAge: 60, partner, married: { value: false, origin: 'stated' } });
    const { streams } = householdIncomeStreams(
      [{ label: 'Social Security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true }],
      household,
      { currentAge: 60, asOfYear: 2026 }
    );
    expect(streams.map((stream) => stream.label)).toEqual(['Social Security']);
  });

  it('knows a couple is married from what the user said, then Your numbers, then what Linc remembers', () => {
    expect(resolveMarriage({})).toBeUndefined();
    expect(resolveMarriage({ householdStatus: 'married' })).toEqual({ value: true, origin: 'remembered' });
    expect(resolveMarriage({ householdStatus: 'partnered' })).toEqual({ value: false, origin: 'remembered' });
    expect(resolveMarriage({ householdStatus: 'single' })).toBeUndefined();
    expect(resolveMarriage({ statedFigures: { partnerMarried: saved('not_married') }, householdStatus: 'married' }))
      .toEqual({ value: false, origin: 'saved', savedAt: SAVED_AT });
    expect(resolveMarriage({ stated: true, statedFigures: { partnerMarried: saved('not_married') } }))
      .toEqual({ value: true, origin: 'stated' });
  });

  it('resolves a partner\'s claim age even with no benefit of their own, for a spousal one', () => {
    const partner = partnerOf(resolvePartner({
      stated: { age: 58, socialSecurityAnnual: 0, socialSecurityStartAge: 65, married: true },
      retirementAge: 65,
      currentAge: 60,
    }));
    expect(partner.plan.socialSecurity).toBeUndefined();
    expect(partner.plan.socialSecurityClaimAge).toBe(65);
    // A stated zero is a known benefit of none.
    expect(partner.origins.socialSecurityAnnual).toBe('stated');
    expect(partner.married).toEqual({ value: true, origin: 'stated' });
  });

  it('describes a run recorded before spousal benefits under the rule it ran on', () => {
    const partner = { age: 55, planThroughAge: 95, socialSecurity: benefit(20_000, 67) };
    const household = couple({ currentAge: 60, partner });
    const clauses = describeHouseholdTimeline(
      { ...household, origins: { age: 'stated' } },
      { annual: 80_000 },
      [{ kind: 'social_security', endAge: 95 }, { kind: 'social_security' }]
    );
    expect(clauses).toContain(
      'from when you reach 95, the survivor keeps the larger Social Security benefit, and spending stays $80,000 a year ' +
      'unless you tell me what one of you would spend alone'
    );
  });

  it('offers to save only what the user said about their partner, a moved benefit as it is paid', () => {
    const partner = partnerOf(resolvePartner({
      stated: { age: 50, socialSecurityAnnual: 30_000, socialSecurityAmountAge: 67, socialSecurityStartAge: 70, survivorAnnualSpending: 50_000 },
      statedFigures: { partnerRetirementIncome: saved(12_000) },
      retirementAge: 65,
      currentAge: 52,
      asOfYear: 2026,
    }));
    expect(partnerSavableFigures(partner)).toEqual([
      { key: 'partnerAge', value: 50 },
      { key: 'partnerSocialSecurityAnnual', value: 37_200 },
      { key: 'partnerSocialSecurityStartAge', value: 70 },
      { key: 'survivorAnnualSpending', value: 50_000 },
    ]);
    // A marriage the user stated is offered too.
    const married = partnerOf(resolvePartner({ stated: { age: 50, married: true }, retirementAge: 65, currentAge: 52 }));
    expect(partnerSavableFigures(married)).toEqual([
      { key: 'partnerAge', value: 50 },
      { key: 'partnerMarried', value: 'married' },
    ]);
  });
});

describe('the partner claiming at another age', () => {
  const resolved = (plan: Parameters<typeof partnerClaimingAt>[0]['plan'], married?: boolean) => ({
    plan,
    origins: { age: 'stated' as const, socialSecurityStartAge: 'default' as const },
    ...(married !== undefined && { married: { value: married, origin: 'stated' as const } }),
  });

  it('moves their own benefit from the figure as given, by Social Security\'s rules', () => {
    const partner = resolved({
      age: 48,
      planThroughAge: 95,
      socialSecurity: { annualAmount: 32_000, startAge: 67, quote: { amount: 32_000, age: 67 } },
      socialSecurityClaimAge: 67,
    });
    const later = partnerClaimingAt(partner, 70);
    expect(later.plan.socialSecurity).toMatchObject({
      annualAmount: 39_680,
      startAge: 70,
      quote: { amount: 32_000, age: 67 },
      claiming: { fromAge: 67, toAge: 70, fromAmount: 32_000, amount: 39_680 },
    });
    expect(later.plan.socialSecurityClaimAge).toBe(70);
    expect(later.origins.socialSecurityStartAge).toBe('stated');
    // Back to the age the figure is for, it is the figure itself.
    const back = partnerClaimingAt(later, 67);
    expect(back.plan.socialSecurity).toEqual({ annualAmount: 32_000, startAge: 67, quote: { amount: 32_000, age: 67 } });
  });

  it('moves only when a spousal benefit would start when they have none of their own', () => {
    const partner = resolved({ age: 48, planThroughAge: 95, socialSecurityClaimAge: 67 }, true);
    expect(partnerClaimingAt(partner, 62).plan).toEqual({ age: 48, planThroughAge: 95, socialSecurityClaimAge: 62 });
    expect(partnerClaimingUnavailableReason(partner, 62)).toBeUndefined();
  });

  it('says when there is nobody to move, nothing it would change, or nothing left to move', () => {
    expect(partnerClaimingUnavailableReason(undefined, 70)).toBe(
      'To compare when your partner claims Social Security I need their age.'
    );
    expect(partnerClaimingUnavailableReason(resolved({ age: 48, planThroughAge: 95 }), 70))
      .toContain('no Social Security of their own');
    const paid = resolved({
      age: 68,
      planThroughAge: 95,
      socialSecurity: { annualAmount: 30_000, startAge: 67, quote: { amount: 30_000, age: 67 } },
      socialSecurityClaimAge: 67,
    });
    expect(partnerClaimingUnavailableReason(paid, 70)).toBe(
      'Your partner\'s Social Security is already being paid in this plan, so when they claim cannot change.'
    );
    const notYet = resolved({
      age: 66,
      planThroughAge: 95,
      socialSecurity: { annualAmount: 30_000, startAge: 67, quote: { amount: 30_000, age: 67 } },
      socialSecurityClaimAge: 67,
    });
    expect(partnerClaimingUnavailableReason(notYet, 64)).toBe(
      'Your partner claiming Social Security at 64 is already in the past at 66.'
    );
    expect(partnerClaimingUnavailableReason(notYet, 70)).toBeUndefined();
  });
});
