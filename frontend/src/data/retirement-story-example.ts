/**
 * A fictional household, calculated with the real retirement quick-plan engine.
 * Generated via runRetirementQuickPlan in src/services/retirement-quickplan.ts.
 * Recompute this snapshot when its inputs or historical dataset change.
 * These overlapping historical outcomes are not probabilities of future success.
 */
export const RETIREMENT_STORY_EXAMPLE = {
  "generatedOn": "2026-09-19",
  "datasetSha256": "fa034188badc02bcdbe79d6041bdd7695abe574c66eb19f483565f44da71329f",
  "inputs": {
    "currentAge": 52,
    "retirementAge": 55,
    "investableAssets": 1400000,
    "annualSpending": 84000,
    "annualContributions": 36000,
    "socialSecurityAnnual": 36000,
    "socialSecurityStartAge": 67,
    "lifeExpectancy": 95,
    "allocation": "balanced"
  },
  "history": {
    "firstMonth": "1926-07",
    "lastMonth": "2026-06",
    "sequencesTested": 685,
    "horizonYears": 43,
    "firstStartMonth": "1926-07",
    "lastStartMonth": "1983-07"
  },
  "spendingAlternative": {
  "retirementAge": 55,
  "annualSpending": 72000,
  "sequencesTested": 685,
  "sequencesSurvived": 685,
  "firstYearWithdrawalRate": 0.04189047109873808
},
  "scenarios": [
    {
      "retirementAge": 55,
      "annualSpending": 84000,
      "survivalRate": 0.9051094890510949,
      "sequencesTested": 685,
      "sequencesSurvived": 620,
      "projectedPortfolioAtRetirement": 1718767.9706511812,
      "firstYearPortfolioWithdrawal": 84000,
      "firstYearWithdrawalRate": 0.048872216281861086
    },
    {
      "retirementAge": 57,
      "annualSpending": 84000,
      "survivalRate": 1,
      "sequencesTested": 685,
      "sequencesSurvived": 685,
      "projectedPortfolioAtRetirement": 1971156.8335286865,
      "firstYearPortfolioWithdrawal": 84000,
      "firstYearWithdrawalRate": 0.04261456956198992
    }
  ]
} as const;

export function storyPercent(rate: number) {
  return `${(rate * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

export function storyPortfolio(value: number) {
  return `$${(value / 1_000_000).toFixed(2)}M`;
}
