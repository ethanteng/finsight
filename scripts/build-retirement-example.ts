/**
 * Regenerate the connected-accounts example shown on /retirement-calculator.
 *
 *   npm run build:retirement-example
 *
 * The landing page's own result is computed live from six numbers. The panel
 * beneath it shows what the same question looks like once the model can read
 * actual accounts, and that panel has to be static — a marketing page cannot
 * hold someone's portfolio. Static is not the same as invented: this script
 * runs the real `analyzeRetirementPortfolio` against the book below and writes
 * its output to the data file the page imports. Every number the page shows
 * came out of the engine.
 *
 * To publish a different profile — a real account's holdings, say — replace
 * EXAMPLE_BOOK and EXAMPLE_PLAN and re-run. Do not edit the generated file by
 * hand; the page's claim that these are engine outputs depends on it.
 *
 * A note on what to put here. The book is deliberately awkward in the ways real
 * feeds are: a fund whose sleeve the engine cannot simulate, a single-stock
 * position with no resolvable geography, and a chunk the custodian never
 * itemised. Those are the whole point. A tidy book would produce a tidier
 * answer and would misrepresent what connecting real accounts actually does.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { analyzeRetirementPortfolio } from '../src/retirement-analytics';
import type { Holding, Security } from '../src/services/financial-data-service';

const OUTPUT_PATH = join(
  __dirname,
  '..',
  'frontend',
  'src',
  'lib',
  'retirement-calculator-example.generated.ts'
);

/**
 * [id, account, security name, declared type, market value]
 *
 * The account column is not decoration. The panel says how many accounts the
 * model read, and that number is counted from these rather than asserted, so a
 * book split across fewer accounts cannot leave the page claiming more.
 */
type BookEntry = [string, string, string, string, number];

const EXAMPLE_BOOK: BookEntry[] = [
  ['tsm', '401k-current', 'Vanguard Total Stock Market Index Fund', 'equity', 486_000],
  ['sp500', '401k-current', 'Fidelity S&P 500 Index Fund', 'equity', 312_400],
  ['agg', '401k-current', 'US Aggregate Bond Index Fund', 'fixed income', 402_100],
  ['smid', 'rollover-ira', 'Russell 2000 Small Cap Index', 'equity', 96_800],
  ['intl', 'rollover-ira', 'International Developed Markets Index Fund', 'equity', 241_500],
  ['em', 'rollover-ira', 'Emerging Markets Stock Index Fund', 'equity', 88_300],
  ['gov', 'roth-ira', 'Intermediate Term Government Bond Fund', 'fixed income', 118_600],
  ['tips', 'roth-ira', 'Inflation Protected Securities Fund (TIPS)', 'fixed income', 94_700],
  ['corp', 'taxable-brokerage', 'Investment Grade Corporate Bond Fund', 'fixed income', 76_200],
  ['cash', 'taxable-brokerage', 'Money Market Cash Reserves', 'cash', 63_900],
  ['emp', 'employer-equity', 'Employer Stock Units', 'equity', 45_200],
  ['misc', 'legacy-brokerage', 'Brokerage Holdings Not Itemized', 'unknown', 248_172],
];

/** The same shape of plan the landing-page form collects. */
const EXAMPLE_PLAN = {
  currentAge: 54,
  retirementAge: 60,
  lifeExpectancy: 95,
  annualSpending: 132_000,
  annualContributions: 48_000,
  socialSecurityAnnual: 41_400,
  socialSecurityStartAge: 67,
};

function buildPortfolio(book: BookEntry[]) {
  const holdings: Holding[] = book.map(([id, account, name, type, value]) => ({
    id,
    account_id: account,
    security_id: id,
    institution_value: value,
    institution_price: null,
    institution_price_as_of: new Date().toISOString().slice(0, 10),
    cost_basis: null,
    quantity: null,
    iso_currency_code: 'USD',
    security_name: name,
    security_type: type,
  }));
  const securities: Security[] = book.map(([id, , name, type]) => ({
    security_id: id,
    name,
    type,
    iso_currency_code: 'USD',
  }));
  return { holdings, securities };
}

async function main() {
  const { holdings, securities } = buildPortfolio(EXAMPLE_BOOK);
  const totalInvestments = EXAMPLE_BOOK.reduce((sum, [, , , , value]) => sum + value, 0);
  const accountCount = new Set(EXAMPLE_BOOK.map(([, account]) => account)).size;

  const analysis = await analyzeRetirementPortfolio({
    holdings,
    securities,
    currentAge: EXAMPLE_PLAN.currentAge,
    retirementAge: EXAMPLE_PLAN.retirementAge,
    withdrawalStartAge: EXAMPLE_PLAN.retirementAge,
    lifeExpectancy: EXAMPLE_PLAN.lifeExpectancy,
    annualWithdrawalAmount: EXAMPLE_PLAN.annualSpending,
    annualContributionAmount: EXAMPLE_PLAN.annualContributions,
    retirementIncome: {
      annualAmount: EXAMPLE_PLAN.socialSecurityAnnual,
      startAge: EXAMPLE_PLAN.socialSecurityStartAge,
    },
  });

  const { dataQuality, metrics, stressTest, summary, historicalData } = analysis;

  const example = {
    generatedAt: new Date().toISOString().slice(0, 10),
    plan: {
      currentAge: EXAMPLE_PLAN.currentAge,
      retirementAge: EXAMPLE_PLAN.retirementAge,
      lifeExpectancy: EXAMPLE_PLAN.lifeExpectancy,
      annualSpending: EXAMPLE_PLAN.annualSpending,
      annualContributions: EXAMPLE_PLAN.annualContributions,
      socialSecurityAnnual: EXAMPLE_PLAN.socialSecurityAnnual,
      socialSecurityStartAge: EXAMPLE_PLAN.socialSecurityStartAge,
    },
    portfolio: {
      accountCount,
      holdingCount: EXAMPLE_BOOK.length,
      totalInvestments,
    },
    // Two of these are subsets, not siblings: `international` is part of
    // `equity`, and `fixedIncome` already counts `tips` (plus any credit and
    // international bonds) — see `portfolio-analyzer.ts`. The panel has to
    // render them as subsets or the column adds up to a mix nobody holds.
    allocation: {
      equity: metrics.equityAllocation,
      international: metrics.internationalAllocation ?? 0,
      fixedIncome: metrics.fixedIncomeAllocation ?? 0,
      tips: metrics.tipsAllocation ?? 0,
      cash: metrics.cashAllocation ?? 0,
    },
    coverage: {
      modeledValue: dataQuality.modeledValue,
      unmodeledValue: dataQuality.unmodeledValue,
      valueCoverage: dataQuality.valueCoverage,
      confidence: dataQuality.portfolioMappingConfidence,
      /** Holdings whose asset class or geography the engine could not resolve. */
      unresolved: dataQuality.proxyUsage.unmappedHoldings,
      /** Holdings with a known class the engine has no return series for. */
      unsupported: dataQuality.proxyUsage.unsupportedHoldings,
    },
    result: {
      survivalRate: stressTest.survivalRate,
      sequencesTested: stressTest.totalSequences,
      projectedPortfolioAtRetirement: metrics.projectedPortfolioAtWithdrawalStart,
      firstMonth: historicalData?.firstMonth ?? 'unknown',
      lastMonth: historicalData?.lastMonth ?? 'unknown',
      primaryObservation: summary.primaryObservation,
      confidence: summary.confidence,
    },
  };

  const file = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Written by \`npm run build:retirement-example\`, which runs the real
 * \`analyzeRetirementPortfolio\` against the example book in
 * \`scripts/build-retirement-example.ts\`. The /retirement-calculator page
 * shows these numbers as what the model says once it can read actual accounts,
 * and that claim is only true while this file is the engine's own output.
 *
 * To change the profile, edit the script and re-run it.
 */

export type RetirementCalculatorExample = typeof RETIREMENT_CALCULATOR_EXAMPLE;

export const RETIREMENT_CALCULATOR_EXAMPLE = ${JSON.stringify(example, null, 2)} as const;
`;

  writeFileSync(OUTPUT_PATH, file, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(
    `  ${EXAMPLE_BOOK.length} holdings · $${totalInvestments.toLocaleString('en-US')} invested · ` +
      `${(example.coverage.valueCoverage * 100).toFixed(1)}% modeled · ` +
      `${example.result.sequencesTested} sequences · ` +
      `${(example.result.survivalRate * 100).toFixed(1)}% survived`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
