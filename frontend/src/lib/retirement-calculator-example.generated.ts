/**
 * GENERATED FILE — do not edit by hand.
 *
 * Written by `npm run build:retirement-example`, which runs the real
 * `analyzeRetirementPortfolio` against the example book in
 * `scripts/build-retirement-example.ts`. The /retirement-calculator page
 * shows these numbers as what the model says once it can read actual accounts,
 * and that claim is only true while this file is the engine's own output.
 *
 * To change the profile, edit the script and re-run it.
 */

export type RetirementCalculatorExample = typeof RETIREMENT_CALCULATOR_EXAMPLE;

export const RETIREMENT_CALCULATOR_EXAMPLE = {
  "asOfDate": "2026-09-01",
  "plan": {
    "currentAge": 54,
    "retirementAge": 60,
    "lifeExpectancy": 95,
    "annualSpending": 132000,
    "annualContributions": 48000,
    "socialSecurityAnnual": 41400,
    "socialSecurityStartAge": 67
  },
  "portfolio": {
    "accountCount": 4,
    "holdingCount": 12,
    "totalInvestments": 2273872
  },
  "allocation": {
    "equity": 60.38915119232745,
    "international": 21.020180555457827,
    "fixedIncome": 36.80066424143487,
    "tips": 4.164702322734085,
    "cash": 2.8101845662376777
  },
  "coverage": {
    "modeledValue": 2273872,
    "unmodeledValue": 0,
    "valueCoverage": 1,
    "confidence": "medium",
    "unresolved": [],
    "unsupported": [],
    "partiallyMapped": []
  },
  "result": {
    "survivalRate": 1,
    "sequencesTested": 709,
    "sequencesSurvived": 709,
    "projectedPortfolioAtRetirement": 3326191.6349441237,
    "firstMonth": "1926-07",
    "lastMonth": "2026-06",
    "primaryObservation": "Balanced allocation pattern with moderate characteristics",
    "confidence": "medium",
    "proxiedSeries": [
      {
        "series": "intl_equity",
        "description": "International equity returns outside the series's own span use the US market return; those months carry no distinct international behaviour",
        "months": 588,
        "windowMonths": 1200,
        "ranges": [
          {
            "firstMonth": "1926-07",
            "lastMonth": "1974-12",
            "months": 582
          },
          {
            "firstMonth": "2026-01",
            "lastMonth": "2026-06",
            "months": 6
          }
        ]
      },
      {
        "series": "tips",
        "description": "TIPS returns before 2003 use the nominal 10-year government bond series; those months carry no inflation indexation, which understates TIPS in inflationary sequences",
        "months": 919,
        "windowMonths": 1200,
        "ranges": [
          {
            "firstMonth": "1926-07",
            "lastMonth": "2003-01",
            "months": 919
          }
        ]
      }
    ]
  },
  "byRetirementAge": [
    {
      "age": 56,
      "survivalRate": 0.8194640338504936,
      "sequencesTested": 709,
      "sequencesSurvived": 581,
      "projectedPortfolioAtRetirement": 2612384.6500311457
    },
    {
      "age": 58,
      "survivalRate": 0.9605077574047954,
      "sequencesTested": 709,
      "sequencesSurvived": 681,
      "projectedPortfolioAtRetirement": 2962845.469553962
    },
    {
      "age": 60,
      "survivalRate": 1,
      "sequencesTested": 709,
      "sequencesSurvived": 709,
      "projectedPortfolioAtRetirement": 3326191.6349441237
    },
    {
      "age": 62,
      "survivalRate": 1,
      "sequencesTested": 709,
      "sequencesSurvived": 709,
      "projectedPortfolioAtRetirement": 3876901.150649065
    }
  ]
} as const;
