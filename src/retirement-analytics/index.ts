// Retirement Portfolio Analysis Module - Main Entry Point
// Orchestrates Phases 1-6

import { RetirementAnalysisInput, RetirementAnalysisOutput } from './types';
import { analyzePortfolio } from './engine/portfolio-analyzer';
import { mapPortfolioToAssetBasket, populateAssumptions } from './engine/portfolio-mapper';
import { DataProviderFactory } from './data/data-provider-factory';
import { FREDProvider } from '../data/providers/fred';
import { generateRollingSequences, snapToHorizonBucket } from './engine/stress-tester';
import { simulateWithdrawals } from './engine/withdrawal-simulator';
import { analyzeOutcomes } from './engine/outcome-analyzer';
import { assessPortfolioCharacteristics } from './engine/characteristics-assessor';
import { formatAnalysisOutput } from './interpretation/analysis-formatter';
import { calculateDataQuality } from './interpretation/uncertainty-quantifier';

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
  const fmpApiKey = process.env.FMP_API_KEY || 'test_fmp_key';
  const alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY;
  
  // Log FMP API key status (without exposing the actual key)
  if (fmpApiKey === 'test_fmp_key' || fmpApiKey.startsWith('test_')) {
    console.warn('⚠️ FMP_API_KEY not set or is test key - FMP metadata will use inference only');
  } else {
    console.log('✅ FMP_API_KEY is set - will attempt to fetch real metadata');
  }
  
  const dataProviderFactory = new DataProviderFactory(tiingoApiKey, fmpApiKey, alphaVantageApiKey);

  // Phase 1: Portfolio metrics & mapping (now with FMP metadata support)
  const portfolioMetrics = await analyzePortfolio(input.holdings, input.securities, dataProviderFactory);
  const totalValue = input.holdings.reduce((sum, h) => sum + (h.institution_value || 0), 0);
  const portfolioMapping = await mapPortfolioToAssetBasket(input.holdings, input.securities, totalValue, dataProviderFactory);
  const assumptions = populateAssumptions(portfolioMapping, input.holdings, input.securities);

  // Calculate timeline metrics
  const withdrawalYearsOriginal = input.lifeExpectancy - input.withdrawalStartAge;
  const timelineBucket = snapToHorizonBucket(withdrawalYearsOriginal);
  const withdrawalYears = parseInt(timelineBucket);
  const timelineBucketNote = withdrawalYearsOriginal !== withdrawalYears
    ? `Analysis uses ${timelineBucket}-year horizon bucket for computational efficiency. Your actual horizon of ${withdrawalYearsOriginal} years was rounded to the nearest supported period.`
    : '';

  const fredApiKey = process.env.FRED_API_KEY || 'test_fred_key';
  const fredProvider = new FREDProvider(fredApiKey);

  // Phase 3: Generate rolling sequences
  const sequences = await generateRollingSequences(
    withdrawalYears,
    dataProviderFactory,
    fredProvider,
    50 // minHistoryYears
  );

  // Phase 4: Simulate withdrawals for each sequence
  const outcomes = sequences.map(sequence => 
    simulateWithdrawals(
      portfolioMapping,
      totalValue,
      sequence,
      input.annualWithdrawalAmount
    )
  );

  // Attach outcomes to sequences
  sequences.forEach((seq, idx) => {
    seq.portfolioOutcome = outcomes[idx];
  });

  // Phase 5: Analyze outcomes and assess characteristics
  const stressTestResults = analyzeOutcomes(outcomes, sequences, sequences.length);
  const assessment = assessPortfolioCharacteristics(
    outcomes,
    stressTestResults,
    portfolioMetrics.equityAllocation,
    timelineBucket
  );

  // Calculate withdrawal sustainability metrics
  const withdrawalRate = totalValue > 0 ? input.annualWithdrawalAmount / totalValue : 0;
  const yearsOfExpenses = input.annualWithdrawalAmount > 0 ? totalValue / input.annualWithdrawalAmount : 0;
  
  // Calculate price history coverage (simplified - would check actual coverage in production)
  const priceHistoryCoverage = 0.8; // Placeholder - would calculate from actual data availability

  // Phase 6: Calculate data quality and format output
  const dataQuality = calculateDataQuality(
    input.holdings,
    input.securities,
    portfolioMapping,
    priceHistoryCoverage,
    assumptions
  );

  const withdrawalMetrics = {
    withdrawalRate,
    yearsOfExpenses,
    historicalWithdrawalRates: stressTestResults.historicalWithdrawalRates,
    withdrawalFailureRate: 1 - stressTestResults.survivalRate,
    worstCaseDepletionYear: stressTestResults.depletionPercentiles.p10
  };

  const timelineMetrics = {
    yearsToRetirement: input.retirementAge ? input.retirementAge - input.currentAge : -1,
    withdrawalYears,
    withdrawalYearsOriginal,
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
    timelineBucketNote
  );
}

// Re-export types for convenience
export * from './types';
