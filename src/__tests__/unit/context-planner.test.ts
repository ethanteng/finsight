import {
  buildPlannerTranscript,
  fallbackContextPlan,
  parseContextPlan,
} from '../../openai/context-planner';
import { CONTEXT_PACK_IDS } from '../../openai/context-packs';

function rawPlan(selected: string[] = []): any {
  return {
    packs: Object.fromEntries(CONTEXT_PACK_IDS.map((pack) => [pack, selected.includes(pack)])),
    needsSecondaryValidation: true,
    retirementInputs: {
      currentAge: 45,
      retirementAge: 62,
      annualWithdrawalAmount: 120_000,
      withdrawalStartAge: null,
      lifeExpectancy: null,
      sources: {
        currentAge: 'I am 45',
        retirementAge: 'retire at 62',
        annualWithdrawalAmount: '$10,000 each month in retirement',
        withdrawalStartAge: null,
        lifeExpectancy: null,
      },
    },
    retirementScenario: {
      requested: false,
      primary: { type: 'none', annualRate: null, source: null },
      comparison: { type: 'none', annualRate: null, source: null },
    },
    summary: 'This continues the retirement decision.',
  };
}

describe('context planner', () => {
  it('reads the active decision oldest first with assistant answers intact', () => {
    const transcript = buildPlannerTranscript('Re-run it.', [
      { question: '$10,000 per month.', answer: 'I will use that retirement spending target.' },
      { question: 'Can I retire at 62?', answer: 'What annual spending should the projection use?' },
    ]);
    expect(transcript.indexOf('Can I retire at 62?')).toBeLessThan(transcript.indexOf('$10,000 per month.'));
    expect(transcript).toContain('Assistant: What annual spending should the projection use?');
    expect(transcript.endsWith('User: Re-run it.')).toBe(true);
  });

  it('keeps the full current message while capping only prior history', () => {
    const current = `Revise retirement age to 67. ${'x'.repeat(1200)}`;
    const priorQuestion = `Earlier question ${'y'.repeat(1200)}`;
    const priorAnswer = `Earlier answer ${'z'.repeat(1600)}`;
    const transcript = buildPlannerTranscript(current, [
      { question: priorQuestion, answer: priorAnswer },
    ]);
    expect(transcript).toContain(current);
    expect(transcript).not.toContain(priorQuestion);
    expect(transcript).toContain(priorQuestion.slice(0, 1000));
    expect(transcript).toContain(`${priorAnswer.slice(0, 1500)}…`);
    expect(transcript).not.toContain(priorAnswer);
  });

  it('normalizes pack dependencies and validates extracted retirement inputs', () => {
    const plan = parseContextPlan(rawPlan(['retirement_analysis']), 12, 'gpt-test');
    expect(plan.requestedPacks).toEqual(['retirement_analysis']);
    expect(plan.selectedPacks).toEqual([
      'account_details',
      'investment_details',
      'user_profile',
      'retirement_analysis',
      'market_context',
    ]);
    expect(plan.questionNeeds).toMatchObject({
      needsRetirement: true,
      needsInvestments: true,
      needsAccountDetails: true,
      needsUserProfile: true,
      needsMarketContext: true,
    });
    expect(plan.retirementInputs).toMatchObject({
      currentAge: 45,
      retirementAge: 62,
      annualWithdrawalAmount: 120_000,
      withdrawalStartAge: 62,
    });
  });

  it('falls back to every pack without consulting language rules', () => {
    const plan = fallbackContextPlan(30);
    expect(plan.source).toBe('fallback_all');
    expect(plan.selectedPacks).toEqual([...CONTEXT_PACK_IDS]);
    expect(Object.values(plan.questionNeeds).every(Boolean)).toBe(true);
  });

  it('returns a validated retirement withdrawal scenario separately from pack selection', () => {
    const raw = rawPlan(['retirement_analysis']);
    raw.retirementScenario = {
      requested: true,
      primary: { type: 'fixed_growth', annualRate: 0.03, source: '3% bump per year' },
      comparison: { type: 'flat_nominal', annualRate: null, source: 'flat-dollar version' },
    };
    const plan = parseContextPlan(raw);
    expect(plan.retirementScenario).toEqual({
      requested: true,
      primary: { type: 'fixed_growth', annualRate: 0.03, source: '3% bump per year' },
      comparison: { type: 'flat_nominal', source: 'flat-dollar version' },
    });
  });
});
