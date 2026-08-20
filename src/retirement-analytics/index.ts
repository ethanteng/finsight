// Retirement Portfolio Analysis Module - Main Entry Point
// Orchestrates Phases 1-6

import { RetirementAnalysisInput, RetirementAnalysisOutput } from './types';
import { analyzePortfolio } from './engine/portfolio-analyzer';
import { mapPortfolioToAssetBasket, populateAssumptions } from './engine/portfolio-mapper';
import { DataProviderFactory } from './data/data-provider-factory';
import {
  calculateHistoricalPriceCoverage,
  generateRollingSequences,
  sliceHistoricalSequence,
  snapToHorizonBucket,
} from './engine/stress-tester';
import { computeHistoricalWithdrawalRates } from './engine/withdrawal-rate-solver';
import { simulateWithdrawals } from './engine/withdrawal-simulator';
import { analyzeOutcomes } from './engine/outcome-analyzer';
import { assessPortfolioCharacteristics } from './engine/characteristics-assessor';
import { formatAnalysisOutput } from './interpretation/analysis-formatter';
import { calculateDataQuality } from './interpretation/uncertainty-quantifier';

export function buildRetirementTimeline(input: Pick<
  RetirementAnalysisInput,
  'currentAge' | 'retirementAge' | 'withdrawalStartAge' | 'lifeExpectancy'
>) {
  const yearsToWithdrawalStart = Math.max(0, input.withdrawalStartAge - input.currentAge);
  const withdrawalYears = input.lifeExpectancy - input.withdrawalStartAge;
  const totalAnalysisYears = yearsToWithdrawalStart + withdrawalYears;
  if (withdrawalYears <= 0 || totalAnalysisYears <= 0) {
    throw new Error('Withdrawal start age must be before life expectancy');
  }
  return {
    yearsToRetirement: input.retirementAge ? input.retirementAge - input.currentAge : -1,
    yearsToWithdrawalStart,
    withdrawalYears,
    totalAnalysisYears,
    withdrawalDelayMonths: Math.round(yearsToWithdrawalStart * 12),
  };
}

/**
 * Main entry point for retirement portfolio analysis
 * 
 * @param input - User inputs including portfolio data, age, withdrawal assumptions
 * @returns Structured analysis output ready for LLM consumption
 */
export async function analyzeRetirementPortfolio(
  input: RetirementAnalysisInput
): Promise<RetirementAnalysisOutput> {
  // Phase 2: Initialize data providers (needed for FMP metadata)
  const tiingoApiKey = process.env.TIINGO_API_KEY || 'test_tiingo_key';
  // Missing production configuration is not a test fixture. Passing an empty
  // key lets FMPProvider degrade to explicitly inferred metadata.
  const fmpApiKey = process.env.FMP_API_KEY?.trim() || '';
  
  // Log FMP API key status (without exposing the actual key)
  if (!fmpApiKey) {
    console.warn('⚠️ FMP_API_KEY not set - FMP metadata will use inference only');
  } else {
    console.log('✅ FMP_API_KEY is set - will attempt to fetch real metadata');
  }
  
  const dataProviderFactory = new DataProviderFactory(tiingoApiKey, fmpApiKey);

  // OPTIMIZATION: Fetch FMP metadata once for all unique tickers, then share between functions
  // This avoids duplicate API calls between analyzePortfolio and mapPortfolioToAssetBasket
  const tickerToMetadata = new Map<string, any>();
  if (dataProviderFactory) {
    const uniqueTickers = new Set<string>();
    const securityMap = new Map(input.securities.map(sec => [sec.security_id, sec]));
    
    for (const holding of input.holdings) {
      const security = securityMap.get(holding.security_id);
      const ticker = security?.ticker_symbol?.toUpperCase() || holding.ticker_symbol?.toUpperCase();
      if (ticker && ticker.length > 0 && ticker.length <= 10) {
        uniqueTickers.add(ticker);
      }
    }

    if (uniqueTickers.size > 0) {
      console.log(`📊 FMP: Fetching metadata once for ${uniqueTickers.size} unique tickers: ${Array.from(uniqueTickers).slice(0, 10).join(', ')}${uniqueTickers.size > 10 ? '...' : ''}`);
      // Use batch fetch to avoid N+1 queries on security_metadata
      const batchResult = await dataProviderFactory.getSecurityMetadataBatch(Array.from(uniqueTickers));
      for (const [ticker, metadata] of batchResult) {
        tickerToMetadata.set(ticker, metadata);
      }
      console.log(`✅ FMP: Successfully fetched metadata for ${batchResult.size}/${uniqueTickers.size} tickers (batch, shared across functions)`);
    }
  }

  // Phase 1: Portfolio metrics & mapping (now with FMP metadata support)
  const portfolioMetrics = await analyzePortfolio(input.holdings, input.securities, dataProviderFactory, tickerToMetadata);
  const totalValue = input.holdings.reduce((sum, h) => sum + (h.institution_value || 0), 0);
  // Passed explicitly rather than left to the mapper's clock default. The
  // glidepath split depends on the year, and a cached analysis compared or
  // replayed across a year boundary must resolve the same split it was built
  // with -- a parameter that only the tests supply is not determinism.
  // UTC to match snapshotYear() / scenario baselineYear — local getFullYear()
  // would disagree near a year boundary on a non-UTC host.
  const asOfYear = input.asOfYear ?? new Date().getUTCFullYear();
  const portfolioMapping = await mapPortfolioToAssetBasket(input.holdings, input.securities, totalValue, dataProviderFactory, tickerToMetadata, asOfYear);
  const assumptions = populateAssumptions(portfolioMapping, input.holdings, input.securities);
  const withdrawalPolicy = input.withdrawalPolicy ?? { type: 'historical_cpi' as const };
  const annualContributionAmount = input.annualContributionAmount ?? 0;
  if (!Number.isFinite(annualContributionAmount) || annualContributionAmount < 0) {
    throw new Error('Annual contributions must be a finite, non-negative amount');
  }
  assumptions.push(
    withdrawalPolicy.type === 'historical_cpi'
      ? 'Retirement spending rises with each historical sequence\'s CPI after withdrawals begin (constant real spending)'
      : withdrawalPolicy.type === 'flat_nominal'
        ? 'Retirement spending stays at the same nominal dollar amount after withdrawals begin'
        : `Retirement spending rises ${withdrawalPolicy.annualRate * 100}% on each withdrawal anniversary`
  );

  // Model the full path from today through life expectancy, including explicit
  // pre-withdrawal contributions when the scenario supplies them.
  const timeline = buildRetirementTimeline(input);
  const { yearsToWithdrawalStart, withdrawalYears, totalAnalysisYears, withdrawalDelayMonths } = timeline;
  if (yearsToWithdrawalStart > 0) {
    assumptions.push(
      annualContributionAmount > 0
        ? `Portfolio grows for ${yearsToWithdrawalStart} years before withdrawals begin with $${annualContributionAmount.toLocaleString('en-US')} in annual contributions, indexed with historical CPI`
        : `Portfolio grows for ${yearsToWithdrawalStart} years before withdrawals begin; no additional contributions are assumed`
    );
  }
  const timelineBucket = snapToHorizonBucket(withdrawalYears);
  const timelineBucketNote = yearsToWithdrawalStart > 0
    ? annualContributionAmount > 0
      ? `Historical sequences include ${yearsToWithdrawalStart} years of pre-withdrawal growth with $${annualContributionAmount.toLocaleString('en-US')} in annual contributions, stated in today's dollars, before the ${withdrawalYears}-year withdrawal period.`
      : `Historical sequences include ${yearsToWithdrawalStart} years of pre-withdrawal growth with no additional contributions before the ${withdrawalYears}-year withdrawal period.`
    : 'Withdrawals begin immediately; no pre-withdrawal accumulation period is modeled.';

  // Phase 3: Generate rolling sequences (with graceful degradation)
  const {
    sequences,
    missingData: stressTestMissingData,
    historicalData,
  } = await generateRollingSequences(
    totalAnalysisYears,
    portfolioMapping,
    50 // minHistoryYears
  );
  if (historicalData) {
    assumptions.push(
      `Historical simulation uses ${historicalData.firstMonth} through ${historicalData.lastMonth}; ` +
      'monthly rolling start windows overlap and are not statistically independent observations'
    );
  }

  // Phase 3b: Compute historical withdrawal rate distribution (before user scenario)
  const withdrawalSequences = withdrawalDelayMonths > 0
    ? sequences.map(sequence => sliceHistoricalSequence(sequence, withdrawalDelayMonths))
    : sequences;
  const historicalWithdrawalRates = computeHistoricalWithdrawalRates(
    withdrawalSequences,
    portfolioMapping,
    totalValue,
    withdrawalPolicy
  );

  // Phase 4: Simulate withdrawals for user scenario
  const outcomes = sequences.map(sequence => 
    simulateWithdrawals(
      portfolioMapping,
      totalValue,
      sequence,
      input.annualWithdrawalAmount,
      { withdrawalDelayMonths, withdrawalPolicy, annualContributionAmount }
    )
  );

  // Attach outcomes to sequences
  sequences.forEach((seq, idx) => {
    seq.portfolioOutcome = outcomes[idx];
  });

  // Phase 5: Analyze outcomes and assess characteristics
  const stressTestResults = analyzeOutcomes(
    outcomes,
    sequences,
    sequences.length,
    historicalWithdrawalRates
  );
  const assessment = assessPortfolioCharacteristics(
    outcomes,
    stressTestResults,
    portfolioMetrics.equityAllocation,
    timelineBucket
  );

  // Calculate withdrawal sustainability metrics
  const projectedStartValues = outcomes
    .map(outcome => outcome.realPortfolioValueAtWithdrawalStart)
    .filter(value => Number.isFinite(value))
    .sort((left, right) => left - right);
  const medianProjectedStartValue = projectedStartValues.length === 0
    ? totalValue
    : projectedStartValues[Math.floor(projectedStartValues.length / 2)];
  const withdrawalRate = medianProjectedStartValue > 0
    ? input.annualWithdrawalAmount / medianProjectedStartValue
    : 0;
  const yearsOfExpenses = input.annualWithdrawalAmount > 0
    ? medianProjectedStartValue / input.annualWithdrawalAmount
    : 0;

  const priceHistoryCoverage = calculateHistoricalPriceCoverage(portfolioMapping);

  // Phase 6: Calculate data quality and format output
  // Include missing data from stress test in data quality report
  const dataQuality = calculateDataQuality(
    input.holdings,
    input.securities,
    portfolioMapping,
    priceHistoryCoverage,
    assumptions,
    stressTestMissingData,
    // Value the caller measured as unmodellable. The engine never simulates
    // it -- it reports it, so the results read as a floor rather than an
    // estimate. See docs/FINANCIAL_TRUTH_CONTRACT.md.
    input.unmodeledInvestments
  );

  const withdrawalMetrics = {
    withdrawalRate,
    yearsOfExpenses,
    projectedPortfolioAtWithdrawalStart: medianProjectedStartValue,
    yearsToWithdrawalStart,
    historicalWithdrawalRates: stressTestResults.historicalWithdrawalRates,
    withdrawalFailureRate: 1 - stressTestResults.survivalRate,
    worstCaseDepletionYear: stressTestResults.depletionPercentiles.p10
  };

  const timelineMetrics = {
    yearsToRetirement: timeline.yearsToRetirement,
    withdrawalYears,
    withdrawalYearsOriginal: withdrawalYears,
    withdrawalMonths: withdrawalYears * 12,
    timelineBucket
  };

  return formatAnalysisOutput(
    assessment,
    stressTestResults,
    portfolioMetrics,
    timelineMetrics,
    withdrawalMetrics,
    dataQuality,
    timelineBucketNote,
    historicalData
  );
}

// Re-export types for convenience
export * from './types';
