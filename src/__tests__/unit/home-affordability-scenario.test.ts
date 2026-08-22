import { buildCanonicalFactPack, validateCanonicalFactPack } from '../../openai/canonical-facts';
import { questionNeedsFromPacks } from '../../openai/context-packs';
import {
  DEFAULT_CLOSING_COST_PERCENT,
  DEFAULT_DOWN_PAYMENT_PERCENT,
  DEFAULT_EMERGENCY_FUND_MONTHS,
  DEFAULT_LOAN_TERM_YEARS,
  describeHomeAffordabilityScenarioExecution,
  homeAffordabilityScenarioCanonicalFacts,
  parseHomeAffordabilityScenarioPlan,
  runHomeAffordabilityScenario,
} from '../../scenarios/home-affordability-scenario';

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    accounts: [],
    bankingTransactions: [],
    averageMonthlyIncome: 15_000,
    averageMonthlyExpense: 8_000,
    metadata: {
      lastUpdated: new Date('2026-08-20T00:00:00.000Z'),
      dataSources: {},
      errors: [],
    },
    tierContext: {
      marketContext: {
        economicIndicators: {
          mortgageRate: {
            value: 6.5,
            date: '2026-08-20',
            source: 'FRED',
            lastUpdated: '2026-08-20T00:00:00.000Z',
          },
        },
      },
      tierInfo: { currentTier: 'premium', availableSources: [] },
      upgradeHints: [],
    },
    financialSummary: {
      financialOverview: {
        netWorth: 1_000_000,
        totalCash: 300_000,
        totalInvestments: 800_000,
        totalDebt: 100_000,
        homeValue: null,
      },
    },
    ...overrides,
  } as any;
}

function variant(values: Record<string, number | null>, sources: Record<string, string | null>) {
  return { overrides: { ...values, sources } };
}

describe('home affordability scenario runner', () => {
  it('accepts only bounded values with matching user-source wording', () => {
    const plan = parseHomeAffordabilityScenarioPlan({
      requested: true,
      primary: variant(
        {
          homePrice: 700_000,
          downPaymentAmount: null,
          downPaymentPercent: 15,
          mortgageRatePercent: 6.5,
          loanTermYears: 30,
          propertyTaxAnnual: 8_400,
          retirementContributionMonthly: 1_000,
          emergencyFundMonths: 120,
        },
        {
          homePrice: '$700,000 home',
          downPaymentAmount: null,
          downPaymentPercent: '15% down',
          mortgageRatePercent: null,
          loanTermYears: '30-year loan',
          propertyTaxAnnual: '$8,400 taxes',
          retirementContributionMonthly: '$1,000 monthly checking-to-IRA transfer',
          emergencyFundMonths: '120 months',
        }
      ),
      comparison: variant({}, {}),
    });

    expect(plan).toEqual({
      requested: true,
      primary: {
        overrides: {
          homePrice: 700_000,
          downPaymentPercent: 15,
          loanTermYears: 30,
          propertyTaxAnnual: 8_400,
          retirementContributionMonthly: 1_000,
          sources: {
            homePrice: '$700,000 home',
            downPaymentPercent: '15% down',
            loanTermYears: '30-year loan',
            propertyTaxAnnual: '$8,400 taxes',
            retirementContributionMonthly: '$1,000 monthly checking-to-IRA transfer',
          },
        },
      },
    });
    expect(parseHomeAffordabilityScenarioPlan({ requested: false })).toBeUndefined();
  });

  it('calculates a complete target-home case from connected cash flow and explicit ownership costs', async () => {
    const execution = await runHomeAffordabilityScenario(snapshot(), {
      requested: true,
      primary: {
        overrides: {
          homePrice: 700_000,
          downPaymentPercent: 20,
          propertyTaxAnnual: 8_400,
          homeownersInsuranceAnnual: 2_400,
          hoaMonthly: 0,
          mortgageInsuranceMonthly: 0,
          currentHousingCostMonthly: 2_500,
          sources: {
            homePrice: '$700,000 home',
            downPaymentPercent: '20% down',
            propertyTaxAnnual: '$8,400 taxes',
            homeownersInsuranceAnnual: '$2,400 insurance',
            hoaMonthly: 'no HOA',
            mortgageInsuranceMonthly: 'no PMI',
            currentHousingCostMonthly: '$2,500 rent',
          },
        },
      },
    });

    expect(execution.status).toBe('completed');
    if (execution.status !== 'completed') return;
    const result = execution.scenarios[0];
    expect(result.costCoverage).toBe('complete');
    expect(result.missingInputs).toEqual([]);
    expect(result.metrics).toMatchObject({
      homePrice: 700_000,
      downPaymentAmount: 140_000,
      loanAmount: 560_000,
      closingCosts: 21_000,
      upfrontCashNeeded: 161_000,
      cashRemaining: 139_000,
      propertyTaxMonthly: 700,
      homeownersInsuranceMonthly: 200,
    });
    expect(result.metrics.principalAndInterestMonthly).toBeCloseTo(3_539.58, 2);
    expect(result.metrics.maintenanceMonthly).toBeCloseTo(583.33, 2);
    expect(result.metrics.allInHousingMonthly).toBeCloseTo(5_022.91, 2);
    expect(result.metrics.postPurchaseMonthlyExpenses).toBeCloseTo(10_522.91, 2);
    expect(result.metrics.postPurchaseMonthlySurplus).toBeCloseTo(4_477.09, 2);
    expect(result.metrics.reserveMonths).toBeCloseTo(13.21, 1);
    expect(result.assessment).toBe('supported');
    expect(result.constraints).toEqual({
      upfrontCashCovered: true,
      emergencyReserveCovered: true,
      monthlyCashFlowNonnegative: true,
    });
    expect(describeHomeAffordabilityScenarioExecution(execution)).toContain(
      'A separate take-home-funded retirement contribution is tested only when the user supplies it explicitly.'
    );
  });

  it('keeps sum(inputs) facts consistent after rounding money components to cents', async () => {
    // round(sum(unrounded P&I + maintenance + ...)) disagreed with
    // sum(round(each component)) for many ordinary price/rate pairs, and
    // validateCanonicalFactPack then aborted the whole Ask Linc request.
    const execution = await runHomeAffordabilityScenario(snapshot(), {
      requested: true,
      primary: {
        overrides: {
          homePrice: 100_000,
          downPaymentPercent: 20,
          mortgageRatePercent: 3,
          propertyTaxAnnual: 1_200,
          homeownersInsuranceAnnual: 1_200,
          hoaMonthly: 0,
          mortgageInsuranceMonthly: 0,
          currentHousingCostMonthly: 1_200,
          sources: {
            homePrice: '$100,000 home',
            downPaymentPercent: '20% down',
            mortgageRatePercent: '3% mortgage',
            propertyTaxAnnual: '$1,200 taxes',
            homeownersInsuranceAnnual: '$1,200 insurance',
            hoaMonthly: 'no HOA',
            mortgageInsuranceMonthly: 'no PMI',
            currentHousingCostMonthly: '$1,200 rent',
          },
        },
      },
    });

    expect(execution.status).toBe('completed');
    if (execution.status !== 'completed') return;
    const facts = homeAffordabilityScenarioCanonicalFacts(execution);
    const allIn = facts.find((fact) => fact.id.endsWith('_all_in_monthly_housing_cost'));
    const upfront = facts.find((fact) => fact.id.endsWith('_upfront_cash_needed'));
    expect(allIn).toBeDefined();
    expect(upfront).toBeDefined();
    expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);
    expect(allIn!.value).toBe(
      Number(
        (
          facts.find((fact) => fact.id.endsWith('_principal_and_interest_monthly'))!.value
          + facts.find((fact) => fact.id.endsWith('_property_tax_monthly'))!.value
          + facts.find((fact) => fact.id.endsWith('_homeowners_insurance_monthly'))!.value
          + facts.find((fact) => fact.id.endsWith('_assumption_hoa_monthly'))!.value
          + facts.find((fact) => fact.id.endsWith('_assumption_mortgage_insurance_monthly'))!.value
          + facts.find((fact) => fact.id.endsWith('_maintenance_monthly'))!.value
        ).toFixed(2)
      )
    );
  });

  it('uses named defaults but marks omitted taxes and insurance as a lower bound', async () => {
    const execution = await runHomeAffordabilityScenario(snapshot(), {
      requested: true,
      primary: {
        overrides: {
          homePrice: 500_000,
          sources: { homePrice: '$500,000 home' },
        },
      },
    });

    expect(execution.status).toBe('completed');
    if (execution.status !== 'completed') return;
    const result = execution.scenarios[0];
    expect(result.metrics).toMatchObject({
      downPaymentAmount: 100_000,
      downPaymentPercent: DEFAULT_DOWN_PAYMENT_PERCENT,
      closingCosts: 15_000,
      upfrontCashNeeded: 115_000,
      reserveBasis: 'current_spending',
    });
    expect(result.assumptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'loan_term_years', value: DEFAULT_LOAN_TERM_YEARS, origin: 'default' }),
      expect.objectContaining({ key: 'closing_cost_percent', value: DEFAULT_CLOSING_COST_PERCENT, origin: 'default' }),
      expect.objectContaining({ key: 'emergency_fund_months', value: DEFAULT_EMERGENCY_FUND_MONTHS, origin: 'default' }),
      expect.objectContaining({ key: 'mortgage_rate_percent', value: 6.5, origin: 'external' }),
    ]));
    expect(result.costCoverage).toBe('lower_bound');
    expect(result.assessment).toBe('incomplete');
    expect(result.missingInputs).toEqual(expect.arrayContaining([
      'property taxes',
      'homeowners insurance',
      'current monthly housing cost',
    ]));

    const facts = homeAffordabilityScenarioCanonicalFacts(execution);
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: expect.stringMatching(/annual property taxes/i),
        displayable: false,
      }),
      expect.objectContaining({
        label: expect.stringMatching(/annual homeowners insurance/i),
        displayable: false,
      }),
      expect.objectContaining({
        label: expect.stringMatching(/monthly property taxes included/i),
        displayable: false,
      }),
      expect.objectContaining({
        label: expect.stringMatching(/monthly homeowners insurance included/i),
        displayable: false,
      }),
    ]));
    expect(facts.find((fact) => fact.id.endsWith('_all_in_monthly_housing_cost'))?.caveat)
      .toMatch(/lower-bound ownership cost/i);
    expect(facts.find((fact) => fact.id.endsWith('_reserve_months'))?.caveat)
      .toMatch(/current average spending/i);
    expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);

    const data = snapshot();
    data.scenarioExecutions = { home_affordability: execution };
    const pack = buildCanonicalFactPack(
      data,
      'Can I afford the $500,000 home?',
      questionNeedsFromPacks(['market_context'], true)
    );
    expect(pack.facts).toContainEqual(expect.objectContaining({
      id: expect.stringMatching(/home_affordability_scenario_.*_upfront_cash_needed/),
      value: 115_000,
      provenance: expect.objectContaining({ calculatorId: 'home_affordability' }),
    }));
    expect(validateCanonicalFactPack(pack)).toEqual([]);
  });

  it('makes the percentage implied by a dollar down payment available as canonical evidence', async () => {
    const execution = await runHomeAffordabilityScenario(snapshot(), {
      requested: true,
      primary: {
        overrides: {
          homePrice: 500_000,
          downPaymentAmount: 75_000,
          sources: {
            homePrice: '$500,000 home',
            downPaymentAmount: '$75,000 down',
          },
        },
      },
    });

    expect(execution.status).toBe('completed');
    if (execution.status !== 'completed') return;
    const facts = homeAffordabilityScenarioCanonicalFacts(execution);
    expect(facts).toContainEqual(expect.objectContaining({
      label: expect.stringMatching(/down payment rate/i),
      value: 15,
      unit: 'percent',
      provenance: expect.objectContaining({
        kind: 'scenario_calculation',
        formula: 'input[0] / input[1] * 100',
      }),
    }));
    expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);
  });

  it('inherits the target home into a two-case down-payment comparison', async () => {
    const execution = await runHomeAffordabilityScenario(snapshot(), {
      requested: true,
      primary: {
        overrides: {
          homePrice: 700_000,
          downPaymentPercent: 15,
          currentHousingCostMonthly: 2_500,
          sources: {
            homePrice: '$700,000 home',
            downPaymentPercent: '15% down',
            currentHousingCostMonthly: '$2,500 rent',
          },
        },
      },
      comparison: {
        overrides: {
          downPaymentPercent: 20,
          sources: { downPaymentPercent: 'versus 20% down' },
        },
      },
    });

    expect(execution.status).toBe('completed');
    if (execution.status !== 'completed') return;
    expect(execution.scenarios).toHaveLength(2);
    expect(execution.scenarios.map((scenario) => scenario.metrics.homePrice)).toEqual([700_000, 700_000]);
    expect(execution.scenarios.map((scenario) => scenario.metrics.downPaymentAmount)).toEqual([105_000, 140_000]);
    expect(execution.scenarios[0].missingInputs).toContain('mortgage insurance');
    expect(execution.scenarios[1].missingInputs).not.toContain('mortgage insurance');

    const facts = homeAffordabilityScenarioCanonicalFacts(execution);
    expect(facts).toContainEqual(expect.objectContaining({
      label: expect.stringMatching(/absolute monthly ownership-cost gap/i),
      provenance: expect.objectContaining({
        kind: 'scenario_calculation',
        calculatorId: 'home_affordability',
      }),
    }));
    expect(facts).toContainEqual(expect.objectContaining({
      label: expect.stringMatching(/absolute upfront-cash gap/i),
      value: 35_000,
    }));
  });

  it('returns an actionable unavailable result when price or rate is absent', async () => {
    const noPrice = await runHomeAffordabilityScenario(snapshot(), {
      requested: true,
      primary: {},
    });
    expect(noPrice).toMatchObject({ status: 'unavailable', reason: expect.stringMatching(/home price/i) });

    const noRate = await runHomeAffordabilityScenario(snapshot({
      tierContext: {
        marketContext: {},
        tierInfo: { currentTier: 'starter', availableSources: [] },
        upgradeHints: [],
      },
    }), {
      requested: true,
      primary: {
        overrides: {
          homePrice: 500_000,
          sources: { homePrice: '$500,000 home' },
        },
      },
    });
    expect(noRate).toMatchObject({ status: 'unavailable', reason: expect.stringMatching(/mortgage rate/i) });
  });

  it('reports whether a stated take-home-funded retirement contribution still fits after the purchase', async () => {
    const execution: any = await runHomeAffordabilityScenario(snapshot(), {
      requested: true,
      primary: variant(
        {
          homePrice: 700_000,
          downPaymentPercent: 20,
          mortgageRatePercent: 6.5,
          propertyTaxAnnual: 8_400,
          homeownersInsuranceAnnual: 2_400,
          hoaMonthly: 0,
          currentHousingCostMonthly: 2_500,
          retirementContributionMonthly: 2_000,
        },
        {
          homePrice: '$700,000 home',
          downPaymentPercent: '20% down',
          mortgageRatePercent: '6.5%',
          propertyTaxAnnual: '$8,400 taxes',
          homeownersInsuranceAnnual: '$2,400 insurance',
          hoaMonthly: 'no HOA',
          currentHousingCostMonthly: '$2,500 rent',
          retirementContributionMonthly: '$2,000 a month from checking into an IRA',
        }
      ),
    } as any);

    expect(execution.status).toBe('completed');
    const [scenario] = execution.scenarios;
    expect(scenario.metrics.surplusAfterRetirementContribution).toBe(
      Number((scenario.metrics.postPurchaseMonthlySurplus - 2_000).toFixed(2))
    );
    expect(scenario.constraints.retirementContributionCovered).toBe(true);
    expect(scenario.assessment).toBe('supported');
    expect(scenario.bindingConstraint).toBe('none');
    expect(describeHomeAffordabilityScenarioExecution(execution)).toContain(
      'No modeled constraint binds: upfront cash, monthly cash flow, '
      + 'the take-home-funded retirement contribution being preserved, the emergency-fund floor all clear.'
    );

    const facts = homeAffordabilityScenarioCanonicalFacts(execution);
    const surplusFact = facts.find((fact) =>
      fact.id.endsWith('_surplus_after_retirement_contribution')
    );
    expect(surplusFact).toBeDefined();
    expect(surplusFact?.caveat).toContain('excluded from operating expenses');
    expect(surplusFact?.caveat).toContain('must not be entered here');
    expect(validateCanonicalFactPack({ version: 1, facts })).toEqual([]);
  });

  it('names the take-home-funded retirement contribution as the binding constraint when it no longer fits', async () => {
    const execution: any = await runHomeAffordabilityScenario(
      snapshot({ averageMonthlyIncome: 11_000 }),
      {
        requested: true,
        primary: variant(
          {
            homePrice: 700_000,
            downPaymentPercent: 20,
            mortgageRatePercent: 6.5,
            propertyTaxAnnual: 8_400,
            homeownersInsuranceAnnual: 2_400,
            hoaMonthly: 0,
            currentHousingCostMonthly: 2_500,
            retirementContributionMonthly: 3_000,
          },
          {
            homePrice: '$700,000 home',
            downPaymentPercent: '20% down',
            mortgageRatePercent: '6.5%',
            propertyTaxAnnual: '$8,400 taxes',
            homeownersInsuranceAnnual: '$2,400 insurance',
            hoaMonthly: 'no HOA',
            currentHousingCostMonthly: '$2,500 rent',
            retirementContributionMonthly: '$3,000 a month from checking into an IRA',
          }
        ),
      } as any
    );

    const [scenario] = execution.scenarios;
    expect(scenario.metrics.postPurchaseMonthlySurplus).toBeGreaterThanOrEqual(0);
    expect(scenario.constraints.retirementContributionCovered).toBe(false);
    expect(scenario.assessment).toBe('not_supported');
    expect(scenario.bindingConstraint).toBe('retirement_contribution');
    expect(describeHomeAffordabilityScenarioExecution(execution)).toContain(
      'limited by the take-home-funded retirement contribution being preserved'
    );
  });

  it('reports upfront cash as the binding constraint ahead of the reserve floor', async () => {
    const execution: any = await runHomeAffordabilityScenario(
      snapshot({ financialSummary: { financialOverview: { totalCash: 40_000 } } }),
      {
        requested: true,
        primary: variant(
          {
            homePrice: 700_000,
            downPaymentPercent: 20,
            mortgageRatePercent: 6.5,
            propertyTaxAnnual: 8_400,
            homeownersInsuranceAnnual: 2_400,
            hoaMonthly: 0,
            currentHousingCostMonthly: 2_500,
          },
          {
            homePrice: '$700,000 home',
            downPaymentPercent: '20% down',
            mortgageRatePercent: '6.5%',
            propertyTaxAnnual: '$8,400 taxes',
            homeownersInsuranceAnnual: '$2,400 insurance',
            hoaMonthly: 'no HOA',
            currentHousingCostMonthly: '$2,500 rent',
          }
        ),
      } as any
    );

    const [scenario] = execution.scenarios;
    expect(scenario.constraints).toMatchObject({
      upfrontCashCovered: false,
      emergencyReserveCovered: false,
    });
    expect(scenario.bindingConstraint).toBe('upfront_cash');
  });

  it('keeps the priceable results when the stated housing cost exceeds tracked spending', async () => {
    const execution: any = await runHomeAffordabilityScenario(
      snapshot({ averageMonthlyExpense: 2_000 }),
      {
        requested: true,
        primary: variant(
          { homePrice: 700_000, mortgageRatePercent: 6.5, currentHousingCostMonthly: 3_400 },
          {
            homePrice: '$700,000 home',
            mortgageRatePercent: '6.5%',
            currentHousingCostMonthly: '$3,400 rent',
          }
        ),
      } as any
    );

    expect(execution.status).toBe('completed');
    const [scenario] = execution.scenarios;
    expect(scenario.metrics.upfrontCashNeeded).toBe(161_000);
    expect(scenario.metrics.allInHousingMonthly).toBeGreaterThan(0);
    expect(scenario.metrics.postPurchaseMonthlyExpenses).toBeUndefined();
    expect(scenario.assessment).toBe('incomplete');
    expect(scenario.bindingConstraint).toBeUndefined();
    expect(scenario.missingInputs).toContain(
      'a tracked spending baseline that covers the stated current housing cost'
    );
  });

  it('keeps a valid primary case when only the comparison case is unusable', async () => {
    const execution: any = await runHomeAffordabilityScenario(snapshot(), {
      requested: true,
      primary: variant(
        { homePrice: 700_000, mortgageRatePercent: 6.5 },
        { homePrice: '$700,000 home', mortgageRatePercent: '6.5%' }
      ),
      comparison: variant(
        { downPaymentAmount: 900_000 },
        { downPaymentAmount: '$900,000 down' }
      ),
    } as any);

    expect(execution.status).toBe('completed');
    expect(execution.scenarios).toHaveLength(1);
    expect(execution.comparisonUnavailableReason).toContain('down payment cannot exceed');
    expect(describeHomeAffordabilityScenarioExecution(execution)).toContain(
      'could not run the requested comparison case'
    );
  });

  it('prices an all-cash purchase without requiring a benchmark rate', async () => {
    const cashOnly = snapshot({
      tierContext: {
        marketContext: { economicIndicators: {} },
        tierInfo: { currentTier: 'starter', availableSources: [] },
        upgradeHints: [],
      },
    });
    const execution: any = await runHomeAffordabilityScenario(cashOnly, {
      requested: true,
      primary: variant(
        { homePrice: 700_000, downPaymentPercent: 100 },
        { homePrice: '$700,000 home', downPaymentPercent: 'paying all cash' }
      ),
    } as any);

    expect(execution.status).toBe('completed');
    const [scenario] = execution.scenarios;
    expect(scenario.metrics.loanAmount).toBe(0);
    expect(scenario.metrics.principalAndInterestMonthly).toBe(0);
    const rateAssumption = scenario.assumptions.find(
      (assumption: any) => assumption.key === 'mortgage_rate_percent'
    );
    expect(rateAssumption).toMatchObject({
      value: 0,
      origin: 'default',
      source: 'No mortgage required for an all-cash purchase',
    });
    const facts = homeAffordabilityScenarioCanonicalFacts(execution);
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: expect.stringMatching(/assumption_mortgage_rate_percent$/),
        displayable: false,
      }),
      expect.objectContaining({
        id: expect.stringMatching(/assumption_loan_term_years$/),
        displayable: false,
      }),
    ]));
    expect(validateCanonicalFactPack({
      version: 1,
      facts,
    })).toEqual([]);
    expect(describeHomeAffordabilityScenarioExecution(execution)).not.toContain('30-year loan');
  });

  it('refuses a non-positive benchmark rate instead of pricing an interest-free mortgage', async () => {
    const execution: any = await runHomeAffordabilityScenario(
      snapshot({
        tierContext: {
          marketContext: {
            economicIndicators: {
              mortgageRate: { value: 0, date: '2026-08-20', source: 'FRED', lastUpdated: '2026-08-20T00:00:00.000Z' },
            },
          },
          tierInfo: { currentTier: 'premium', availableSources: [] },
          upgradeHints: [],
        },
      }),
      {
        requested: true,
        primary: variant({ homePrice: 700_000 }, { homePrice: '$700,000 home' }),
      } as any
    );

    expect(execution.status).toBe('unavailable');
    expect(execution.reason).toContain('mortgage rate is required');
  });
});
