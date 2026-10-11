import { describe, expect, it } from '@jest/globals';
import {
  applySurvivorRule,
  householdIncomeStreams,
  householdTimeline,
  partnerAgeMissing,
  partnerIncomes,
  partnerSavableFigures,
  resolvePartner,
  withSurvivorRule,
  type ResolvedPartner,
} from '../../services/household';

const SAVED_AT = '2026-09-14T10:00:00.000Z';
const saved = (value: number | string) => ({ value, savedAt: SAVED_AT, source: 'page' as const });

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

  it('keeps the larger benefit for the survivor and stops a pension with its holder', () => {
    const partner = { age: 55, planThroughAge: 95, socialSecurity: { annualAmount: 20_000, startAge: 67, quote: { amount: 20_000, age: 67 } }, pension: { annualAmount: 12_000, startAge: 60, inflationAdjusted: false } };
    const timeline = householdTimeline({ currentAge: 60, userPlanThroughAge: 95, partner });
    const incomes = applySurvivorRule([
      { owner: 'user', kind: 'social_security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true },
      { owner: 'user', kind: 'pension', annualAmount: 10_000, startAge: 65, inflationAdjusted: false },
      ...partnerIncomes(partner, timeline),
    ], timeline);

    expect(incomes).toEqual([
      // The larger benefit is the user's: the survivor keeps it to the end.
      { owner: 'user', kind: 'social_security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true },
      // The user's pension stops when the user reaches 95.
      { owner: 'user', kind: 'pension', annualAmount: 10_000, startAge: 65, inflationAdjusted: false, endAge: 95 },
      // The partner claims at their 67, the user's 72; the smaller benefit stops at the first death.
      { owner: 'partner', kind: 'social_security', annualAmount: 20_000, startAge: 72, inflationAdjusted: true, endAge: 95 },
      // The partner outlives the plan's first death; their pension runs to the end.
      { owner: 'partner', kind: 'pension', annualAmount: 12_000, startAge: 65, inflationAdjusted: false },
    ]);
  });

  it('stops nothing when both reach their age together', () => {
    const partner = { age: 60, planThroughAge: 95, socialSecurity: { annualAmount: 20_000, startAge: 67, quote: { amount: 20_000, age: 67 } } };
    const timeline = householdTimeline({ currentAge: 60, userPlanThroughAge: 95, partner });
    expect(timeline.firstDeath).toEqual({ who: 'both', atUserAge: 95 });
    const incomes = applySurvivorRule([
      { owner: 'user', kind: 'social_security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true },
      ...partnerIncomes(partner, timeline),
    ], timeline);
    expect(incomes.every((income) => income.endAge === undefined)).toBe(true);
  });

  it('reapplies the survivor rule when a what-if makes the other benefit the smaller one', () => {
    const partner = { age: 58, planThroughAge: 95, socialSecurity: { annualAmount: 26_000, startAge: 67, quote: { amount: 26_000, age: 67 } } };
    const timeline = householdTimeline({ currentAge: 60, userPlanThroughAge: 95, partner });
    const baseline = householdIncomeStreams(
      [{ label: 'Social Security', annualAmount: 24_000, startAge: 67, inflationAdjusted: true }],
      partner,
      timeline
    );
    // The user's $24,000 is the smaller, so it stops when the user reaches 95.
    expect(baseline.map((stream) => [stream.label, stream.endAge])).toEqual([
      ['Social Security', 95],
      ['your partner\'s Social Security', undefined],
    ]);

    // Claimed at 70 it is $29,760, larger than the partner's: theirs stops instead.
    const claimedLater = withSurvivorRule(
      baseline.map((stream) => stream.label === 'Social Security' ? { ...stream, annualAmount: 29_760, startAge: 70 } : stream),
      timeline
    );
    expect(claimedLater.map((stream) => [stream.label, stream.endAge])).toEqual([
      ['Social Security', undefined],
      ['your partner\'s Social Security', 95],
    ]);
  });

  it('leaves out an income that would stop before it starts', () => {
    // The partner is 25 years younger and claims at 70: the user reaches 95
    // when the partner is 70, so the smaller benefit is never paid.
    const partner = { age: 35, planThroughAge: 95, socialSecurity: { annualAmount: 10_000, startAge: 71, quote: { amount: 10_000, age: 71 } } };
    const timeline = householdTimeline({ currentAge: 60, userPlanThroughAge: 95, partner });
    const streams = householdIncomeStreams(
      [{ label: 'Social Security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true }],
      partner,
      timeline
    );
    expect(streams.map((stream) => stream.label)).toEqual(['Social Security']);
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
  });
});
