import { describe, expect, it } from '@jest/globals';
import { planDetailsInputRequest } from '../../services/calculator-plan-details';
import { parseInputRequest } from '../../openai/input-request';
import type { CoastFireLeadRecord } from '../../services/coast-fire-leads';
import type { RetirementLeadRecord } from '../../services/retirement-leads';

/**
 * The form a calculator run's first decision carries: the details the
 * calculator page showed locked beside the result.
 */

function coastFireLead(annualRetirementIncome: number): CoastFireLeadRecord {
  return {
    token: 'c'.repeat(48),
    email: 'reader@example.com',
    inputs: {
      currentAge: 52,
      retirementAge: 67,
      currentSavings: 900_000,
      annualRetirementSpending: 90_000,
      annualRetirementIncome,
      realReturnRate: 5,
      withdrawalRate: 4,
    },
    coastFireNumber: 577_220.91,
    retirementTarget: 1_200_000,
    projectedSavingsAtRetirement: 1_871_034.62,
    hasReachedCoastFire: true,
    tokenDisclosed: false,
  } as CoastFireLeadRecord;
}

function retirementLead(): RetirementLeadRecord {
  return {
    token: 'a'.repeat(48),
    email: 'reader@example.com',
    inputs: {
      currentAge: 54,
      retirementAge: 60,
      investableAssets: 2_273_872,
      annualSpending: 132_000,
      annualContributions: 48_000,
      socialSecurityAnnual: 41_400,
      socialSecurityStartAge: 67,
      lifeExpectancy: 95,
      allocation: 'balanced',
    },
  } as RetirementLeadRecord;
}

const ids = (request: { fields: Array<{ id: string }> }) => request.fields.map((field) => field.id);

describe('planDetailsInputRequest', () => {
  it('asks nothing the answer already stands without', () => {
    for (const request of [
      planDetailsInputRequest({ kind: 'coast-fire', lead: coastFireLead(0) }),
      planDetailsInputRequest({ kind: 'retirement', lead: retirementLead() }),
    ]) {
      expect(request.fields.every((field) => !field.required)).toBe(true);
      expect(request.fields.every((field) => field.sentence.includes('{value}'))).toBe(true);
    }
  });

  /* Stored with the decision and re-validated on every read, so it has to survive the parser. */
  it('survives the stored-form parser whole', () => {
    for (const request of [
      planDetailsInputRequest({ kind: 'coast-fire', lead: coastFireLead(0) }),
      planDetailsInputRequest({ kind: 'coast-fire', lead: coastFireLead(42_000) }),
      planDetailsInputRequest({ kind: 'retirement', lead: retirementLead() }),
    ]) {
      expect(parseInputRequest(JSON.parse(JSON.stringify(request)))).toEqual(request);
    }
  });

  it('re-asks the decision’s own question', () => {
    expect(planDetailsInputRequest({ kind: 'coast-fire', lead: coastFireLead(0) }).question)
      .toBe('Have I reached Coast FIRE?');
    expect(planDetailsInputRequest({ kind: 'retirement', lead: retirementLead() }).question)
      .toBe('Can I retire at 60?');
  });

  /*
   * The retirement calculator took Social Security and contributions, so the
   * form does not ask for them again.
   */
  it('leaves out what the retirement calculator already took', () => {
    const fields = ids(planDetailsInputRequest({ kind: 'retirement', lead: retirementLead() }));
    expect(fields).not.toContain('socialSecurityAnnual');
    expect(fields).not.toContain('annualContributions');
    expect(fields).toEqual(expect.arrayContaining([
      'lifeExpectancy', 'pensionAnnual', 'spendingCutPercent', 'partnerAge', 'stateIncomeTaxPercent',
    ]));
  });

  it('asks a Coast FIRE run with no income for both incomes', () => {
    const fields = ids(planDetailsInputRequest({ kind: 'coast-fire', lead: coastFireLead(0) }));
    expect(fields).toEqual(expect.arrayContaining([
      'annualContribution', 'socialSecurityAnnual', 'socialSecurityStartAge', 'annualRetirementIncome',
    ]));
  });

  /*
   * Partner Social Security without a claim age defaults to 67, and coverage
   * without a premium prices employer/spouse plans as $0. Both figures are
   * supported inputs; asking for the amount or coverage type alone is not enough.
   */
  it('asks when a partner claims Social Security, and what coverage costs', () => {
    const fields = ids(planDetailsInputRequest({ kind: 'retirement', lead: retirementLead() }));
    expect(fields).toEqual(expect.arrayContaining([
      'partnerSocialSecurityAnnual', 'partnerSocialSecurityStartAge',
      'preMedicareCoverage', 'preMedicareAnnualPremium',
    ]));
    const claimAge = planDetailsInputRequest({ kind: 'retirement', lead: retirementLead() })
      .fields.find((field) => field.id === 'partnerSocialSecurityStartAge');
    expect(claimAge?.sentence).toBe('My partner claims Social Security at {value}.');
  });

  /*
   * Each sits beside the figure it qualifies, on both calculators' forms, and
   * a blank premium says what it counts: nothing for retiree or spouse
   * coverage, which is not "priced".
   */
  it('puts the claim age and the premium beside what they qualify', () => {
    for (const request of [
      planDetailsInputRequest({ kind: 'coast-fire', lead: coastFireLead(0) }),
      planDetailsInputRequest({ kind: 'retirement', lead: retirementLead() }),
    ]) {
      const fields = ids(request);
      expect(fields.indexOf('partnerSocialSecurityStartAge')).toBe(fields.indexOf('partnerSocialSecurityAnnual') + 1);
      expect(fields.indexOf('preMedicareAnnualPremium')).toBe(fields.indexOf('preMedicareCoverage') + 1);
      expect(request.fields.find((field) => field.id === 'preMedicareAnnualPremium')?.defaultNote)
        .toContain('no premium for retiree or spouse coverage');
    }
  });

  /*
   * One figure that may be Social Security, a pension, or both: asking for
   * either beside it would count the same dollars twice, so only its timing
   * is asked, with the amount named in the sentence.
   */
  it('asks only when a Coast FIRE run’s stated income starts, and names it', () => {
    const request = planDetailsInputRequest({ kind: 'coast-fire', lead: coastFireLead(42_000) });
    const fields = ids(request);
    expect(fields).not.toContain('socialSecurityAnnual');
    expect(fields).not.toContain('annualRetirementIncome');
    const startAge = request.fields.find((field) => field.id === 'retirementIncomeStartAge');
    expect(startAge?.sentence).toBe('The $42,000 a year of retirement income I mentioned starts at age {value}.');
  });
});
