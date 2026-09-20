/** Fictional inputs, calculated with runRetirementQuickPlan on 2026-09-20.
 * Historical US returns July 1926–June 2026. Overlapping histories are not future probabilities.
 * Recompute when changing inputs or the historical dataset. */
export const DEMO_RETIREMENT_RESULTS = [
  {
    "inputs": {
      "currentAge": 48,
      "retirementAge": 55,
      "investableAssets": 2291203,
      "annualSpending": 150000,
      "annualContributions": 45000,
      "socialSecurityAnnual": 60000,
      "socialSecurityStartAge": 67,
      "lifeExpectancy": 95,
      "allocation": "balanced"
    },
    "result": {
      "retirementAge": 55,
      "annualSpending": 150000,
      "survivalRate": 0.9560439560439561,
      "sequencesTested": 637,
      "sequencesSurvived": 609,
      "projectedPortfolioAtRetirement": 3397514.252937222,
      "firstYearWithdrawalRate": 0.044149925160820704
    },
    "history": {
      "firstMonth": "1926-07",
      "lastMonth": "2026-06",
      "sequencesTested": 637,
      "horizonYears": 47,
      "firstStartMonth": "1926-07",
      "lastStartMonth": "1979-07"
    }
  },
  {
    "inputs": {
      "currentAge": 48,
      "retirementAge": 58,
      "investableAssets": 2291203,
      "annualSpending": 150000,
      "annualContributions": 45000,
      "socialSecurityAnnual": 60000,
      "socialSecurityStartAge": 67,
      "lifeExpectancy": 95,
      "allocation": "balanced"
    },
    "result": {
      "retirementAge": 58,
      "annualSpending": 150000,
      "survivalRate": 1,
      "sequencesTested": 637,
      "sequencesSurvived": 637,
      "projectedPortfolioAtRetirement": 4222931.374573112,
      "firstYearWithdrawalRate": 0.035520349893245234
    },
    "history": {
      "firstMonth": "1926-07",
      "lastMonth": "2026-06",
      "sequencesTested": 637,
      "horizonYears": 47,
      "firstStartMonth": "1926-07",
      "lastStartMonth": "1979-07"
    }
  },
  {
    "inputs": {
      "currentAge": 48,
      "retirementAge": 58,
      "investableAssets": 2291203,
      "annualSpending": 150000,
      "annualContributions": 5000,
      "socialSecurityAnnual": 60000,
      "socialSecurityStartAge": 67,
      "lifeExpectancy": 95,
      "allocation": "balanced"
    },
    "result": {
      "retirementAge": 58,
      "annualSpending": 150000,
      "survivalRate": 1,
      "sequencesTested": 637,
      "sequencesSurvived": 637,
      "projectedPortfolioAtRetirement": 3682231.268402594,
      "firstYearWithdrawalRate": 0.04073617029086611
    },
    "history": {
      "firstMonth": "1926-07",
      "lastMonth": "2026-06",
      "sequencesTested": 637,
      "horizonYears": 47,
      "firstStartMonth": "1926-07",
      "lastStartMonth": "1979-07"
    }
  },
  {
    "inputs": {
      "currentAge": 48,
      "retirementAge": 55,
      "investableAssets": 2291203,
      "annualSpending": 130000,
      "annualContributions": 45000,
      "socialSecurityAnnual": 60000,
      "socialSecurityStartAge": 67,
      "lifeExpectancy": 95,
      "allocation": "balanced"
    },
    "result": {
      "retirementAge": 55,
      "annualSpending": 130000,
      "survivalRate": 1,
      "sequencesTested": 637,
      "sequencesSurvived": 637,
      "projectedPortfolioAtRetirement": 3397514.252937222,
      "firstYearWithdrawalRate": 0.038263268472711276
    },
    "history": {
      "firstMonth": "1926-07",
      "lastMonth": "2026-06",
      "sequencesTested": 637,
      "horizonYears": 47,
      "firstStartMonth": "1926-07",
      "lastStartMonth": "1979-07"
    }
  }
] as const;
