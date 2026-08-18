import {
  buildPlannerTranscript,
  CONTEXT_PLAN_JSON_SCHEMA,
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
    scenarios: {
      retirement: {
        requested: false,
        primary: { type: 'none', annualRate: null, source: null },
        comparison: { type: 'none', annualRate: null, source: null },
      },
    },
    searchQueries: selected.includes('search_context')
      ? [{ query: 'current Federal Reserve interest rate', purpose: 'rate', freshness: 'pm' }]
      : [],
    summary: 'This continues the retirement decision.',
  };
}

describe('context planner', () => {
  it('builds the strict scenario object from registered calculator ids', () => {
    expect(CONTEXT_PLAN_JSON_SCHEMA.properties.scenarios).toMatchObject({
      required: ['retirement'],
      properties: { retirement: { type: 'object' } },
    });
  });

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
    expect(plan.searchQueries).toEqual([]);
  });

  it('validates standalone semantic search queries with freshness metadata', () => {
    const plan = parseContextPlan(rawPlan(['search_context']));

    expect(plan.searchQueries).toEqual([{
      query: 'current Federal Reserve interest rate',
      purpose: 'rate',
      freshness: 'pm',
    }]);
  });

  it('rejects search selection without a safe public query', () => {
    const raw = rawPlan(['search_context']);
    raw.searchQueries = [];

    expect(() => parseContextPlan(raw)).toThrow('without a valid standalone search query');
  });

  it('rejects obvious private identifiers in generated search queries', () => {
    const raw = rawPlan(['search_context']);
    raw.searchQueries = [{
      query: 'look up statement for customer@example.com',
      purpose: 'other',
      freshness: null,
    }];

    expect(() => parseContextPlan(raw)).toThrow('without a valid standalone search query');
  });

  it('returns a validated retirement withdrawal scenario separately from pack selection', () => {
    const raw = rawPlan();
    raw.scenarios.retirement = {
      requested: true,
      primary: {
        type: 'fixed_growth',
        annualRate: 0.03,
        source: '3% bump per year',
        overrides: {
          annualWithdrawalAmount: null,
          annualContributionAmount: 12_000,
          retirementAge: 65,
          withdrawalStartAge: null,
          lifeExpectancy: null,
          sources: {
            annualWithdrawalAmount: null,
            annualContributionAmount: 'contribute $12,000',
            retirementAge: 'retire at 65',
            withdrawalStartAge: null,
            lifeExpectancy: null,
          },
        },
      },
      comparison: { type: 'flat_nominal', annualRate: null, source: 'flat-dollar version', overrides: {} },
    };
    const plan = parseContextPlan(raw);
    expect(plan.scenarioPlans.retirement).toEqual({
      requested: true,
      primary: {
        type: 'fixed_growth',
        annualRate: 0.03,
        source: '3% bump per year',
        overrides: {
          annualContributionAmount: 12_000,
          retirementAge: 65,
          withdrawalStartAge: 65,
          sources: {
            annualContributionAmount: 'contribute $12,000',
            retirementAge: 'retire at 65',
            withdrawalStartAge: 'retire at 65',
          },
        },
      },
      comparison: { type: 'flat_nominal', source: 'flat-dollar version' },
    });
    expect(plan.requestedPacks).toEqual([]);
    expect(plan.selectedPacks).toContain('retirement_analysis');
    expect(plan.retirementInputs).toMatchObject({
      currentAge: 45,
      annualWithdrawalAmount: 120_000,
    });
    expect(plan.retirementInputs?.retirementAge).toBeUndefined();
    expect(plan.retirementInputs?.withdrawalStartAge).toBeUndefined();
    expect(plan.retirementScenario).toEqual(plan.scenarioPlans.retirement);
  });

  it('still parses the legacy singular retirementScenario planner field', () => {
    const raw = rawPlan();
    delete raw.scenarios;
    raw.retirementScenario = {
      requested: true,
      primary: {
        type: 'flat_nominal',
        annualRate: null,
        source: 'flat-dollar version',
        overrides: {
          annualWithdrawalAmount: null,
          annualContributionAmount: null,
          retirementAge: null,
          withdrawalStartAge: null,
          lifeExpectancy: null,
          sources: {
            annualWithdrawalAmount: null,
            annualContributionAmount: null,
            retirementAge: null,
            withdrawalStartAge: null,
            lifeExpectancy: null,
          },
        },
      },
      comparison: { type: 'none', annualRate: null, source: null, overrides: null },
    };
    const plan = parseContextPlan(raw);
    expect(plan.scenarioPlans.retirement).toMatchObject({
      requested: true,
      primary: { type: 'flat_nominal', source: 'flat-dollar version' },
    });
    expect(plan.retirementScenario).toEqual(plan.scenarioPlans.retirement);
    expect(plan.selectedPacks).toContain('retirement_analysis');
  });

  it('does not let hypothetical inputs rebuild the baseline they are meant to compare with', () => {
    const raw = rawPlan(['retirement_analysis']);
    raw.retirementInputs.retirementAge = 65;
    raw.retirementInputs.annualWithdrawalAmount = 50_000;
    raw.retirementInputs.withdrawalStartAge = 65;
    raw.retirementInputs.sources.retirementAge = 'retire at 65';
    raw.retirementInputs.sources.annualWithdrawalAmount = 'spend $50,000';
    raw.retirementInputs.sources.withdrawalStartAge = 'retire at 65';
    raw.scenarios.retirement = {
      requested: true,
      primary: {
        type: 'historical_cpi',
        annualRate: null,
        source: null,
        overrides: {
          annualWithdrawalAmount: 50_000,
          annualContributionAmount: null,
          retirementAge: 65,
          withdrawalStartAge: 65,
          lifeExpectancy: null,
          sources: {
            annualWithdrawalAmount: 'spend $50,000',
            annualContributionAmount: null,
            retirementAge: 'retire at 65',
            withdrawalStartAge: 'retire at 65',
            lifeExpectancy: null,
          },
        },
      },
      comparison: { type: 'none', annualRate: null, source: null, overrides: {} },
    };

    const plan = parseContextPlan(raw);

    expect(plan.retirementInputs).toEqual({
      currentAge: 45,
      sources: { currentAge: 'I am 45' },
    });
    expect((plan.scenarioPlans.retirement as any)?.primary.overrides).toMatchObject({
      annualWithdrawalAmount: 50_000,
      retirementAge: 65,
      withdrawalStartAge: 65,
    });
  });
});
