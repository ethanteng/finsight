import {
  ScenarioCalculatorRegistry,
  scenarioCalculatorRegistry,
} from '../../scenarios/calculator-registry';
import {
  RETIREMENT_CALCULATOR_ID,
  retirementScenarioCalculator,
  type RetirementScenarioPlan,
} from '../../scenarios/retirement-scenario';

describe('scenario calculator registry', () => {
  it('publishes the retirement calculator contract from one declaration', () => {
    expect(scenarioCalculatorRegistry.ids()).toEqual([RETIREMENT_CALCULATOR_ID]);
    expect(scenarioCalculatorRegistry.manifests()).toContainEqual(expect.objectContaining({
      id: 'retirement',
      version: 2,
      requiredPacks: ['retirement_analysis'],
      supportedOverrides: expect.arrayContaining([
        expect.objectContaining({ id: 'withdrawal_policy' }),
        expect.objectContaining({ id: 'annual_contribution_amount' }),
        expect.objectContaining({ id: 'retirement_age' }),
        expect.objectContaining({ id: 'life_expectancy' }),
      ]),
      defaults: expect.arrayContaining([
        expect.objectContaining({ id: 'annual_contribution_amount', value: 0 }),
        expect.objectContaining({ id: 'annual_withdrawal_growth_rate', value: 0.03 }),
      ]),
      outputs: expect.arrayContaining([
        expect.objectContaining({ id: 'survival_rate', unit: 'percent' }),
        expect.objectContaining({ id: 'projected_portfolio_at_withdrawal_start', unit: 'usd' }),
      ]),
    }));
  });

  it('uses the registered parser instead of accepting arbitrary override values', () => {
    const plan = scenarioCalculatorRegistry.parsePlan<RetirementScenarioPlan>('retirement', {
      requested: true,
      primary: {
        type: 'historical_cpi',
        annualRate: null,
        source: 'retire at 65 and keep contributing $12,000',
        overrides: {
          annualWithdrawalAmount: null,
          annualContributionAmount: 12_000,
          retirementAge: 65,
          withdrawalStartAge: null,
          lifeExpectancy: 100,
          sources: {
            annualWithdrawalAmount: null,
            annualContributionAmount: 'keep contributing $12,000',
            retirementAge: 'retire at 65',
            withdrawalStartAge: null,
            lifeExpectancy: 'plan through age 100',
          },
        },
      },
      comparison: { type: 'none', annualRate: null, source: null, overrides: null },
    });

    expect(plan?.primary.overrides).toMatchObject({
      annualContributionAmount: 12_000,
      retirementAge: 65,
      withdrawalStartAge: 65,
      lifeExpectancy: 100,
    });
  });

  it('rejects duplicate calculator ids at registry construction', () => {
    expect(() => new ScenarioCalculatorRegistry([
      retirementScenarioCalculator,
      retirementScenarioCalculator,
    ])).toThrow('Duplicate scenario calculator id: retirement');
  });
});
