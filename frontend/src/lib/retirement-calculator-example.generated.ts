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
    "equity": 53.87286531519804,
    "international": 14.503894678328418,
    "fixedIncome": 30.41508053223752,
    "tips": 4.164702322734085,
    "cash": 2.8101845662376777
  },
  "coverage": {
    "modeledValue": 1809600,
    "unmodeledValue": 464272,
    "valueCoverage": 0.7958231597908765,
    "confidence": "low",
    "unresolved": [
      "Employer Stock Units",
      "Brokerage Holdings Not Itemized"
    ],
    "unsupported": [
      "Inflation Protected Securities Fund (TIPS)",
      "Investment Grade Corporate Bond Fund"
    ]
  },
  "result": {
    "survivalRate": 0.923836389280677,
    "sequencesTested": 709,
    "sequencesSurvived": 655,
    "projectedPortfolioAtRetirement": 2786161.0276904893,
    "firstMonth": "1926-07",
    "lastMonth": "2026-06",
    "primaryObservation": "Balanced allocation pattern with moderate characteristics",
    "confidence": "low",
    "proxiedSeries": [
      {
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
      }
    ]
  }
} as const;
