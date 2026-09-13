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
    "modeledValue": 1904300,
    "unmodeledValue": 369572,
    "valueCoverage": 0.8374701830182174,
    "confidence": "low",
    "unresolved": [
      "Employer Stock Units",
      "Brokerage Holdings Not Itemized"
    ],
    "unsupported": [
      "Investment Grade Corporate Bond Fund"
    ]
  },
  "result": {
    "survivalRate": 0.9703808180535967,
    "sequencesTested": 709,
    "sequencesSurvived": 688,
    "projectedPortfolioAtRetirement": 2900878.4850188014,
    "firstMonth": "1926-07",
    "lastMonth": "2026-06",
    "primaryObservation": "Balanced allocation pattern with moderate characteristics",
    "confidence": "low",
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
      "survivalRate": 0.6403385049365303,
      "sequencesTested": 709,
      "sequencesSurvived": 454,
      "projectedPortfolioAtRetirement": 2211287.861151734
    },
    {
      "age": 58,
      "survivalRate": 0.8321579689703809,
      "sequencesTested": 709,
      "sequencesSurvived": 590,
      "projectedPortfolioAtRetirement": 2536494.6016703495
    },
    {
      "age": 60,
      "survivalRate": 0.9703808180535967,
      "sequencesTested": 709,
      "sequencesSurvived": 688,
      "projectedPortfolioAtRetirement": 2900878.4850188014
    },
    {
      "age": 62,
      "survivalRate": 1,
      "sequencesTested": 709,
      "sequencesSurvived": 709,
      "projectedPortfolioAtRetirement": 3346114.832766099
    }
  ]
} as const;
