/**
 * Direct Function Test for Retirement Portfolio Analysis
 * 
 * This script tests the retirement analysis module directly without requiring API setup.
 * 
 * Usage:
 *   npx ts-node src/retirement-analytics/__tests__/test-analysis.ts [userId]
 * 
 * Or set USER_ID environment variable:
 *   USER_ID=your-user-id npx ts-node src/retirement-analytics/__tests__/test-analysis.ts
 * 
 * Example:
 *   npx ts-node src/retirement-analytics/__tests__/test-analysis.ts clx1234567890abcdef
 */

import { analyzeRetirementPortfolio } from '../index';
import { FinancialDataService } from '../../services/financial-data-service';
import { RetirementAnalysisInput } from '../types';

// Default test parameters (can be overridden)
const DEFAULT_TEST_PARAMS = {
  currentAge: 48,
  retirementAge: 68,
  lifeExpectancy: 95,
  annualWithdrawalAmount: 100000,
  withdrawalStartAge: 68
};

/**
 * Get user ID from command line args or environment variable
 */
function getUserId(): string | null {
  // Try command line argument first
  const args = process.argv.slice(2);
  if (args.length > 0) {
    return args[0];
  }
  
  // Try environment variable
  if (process.env.USER_ID) {
    return process.env.USER_ID;
  }
  
  return null;
}

/**
 * Get test parameters from environment variables or use defaults
 */
function getTestParams() {
  return {
    currentAge: parseInt(process.env.CURRENT_AGE || String(DEFAULT_TEST_PARAMS.currentAge)),
    retirementAge: process.env.RETIREMENT_AGE 
      ? parseInt(process.env.RETIREMENT_AGE) 
      : DEFAULT_TEST_PARAMS.retirementAge,
    lifeExpectancy: parseInt(process.env.LIFE_EXPECTANCY || String(DEFAULT_TEST_PARAMS.lifeExpectancy)),
    annualWithdrawalAmount: parseFloat(process.env.ANNUAL_WITHDRAWAL || String(DEFAULT_TEST_PARAMS.annualWithdrawalAmount)),
    withdrawalStartAge: parseInt(process.env.WITHDRAWAL_START_AGE || String(DEFAULT_TEST_PARAMS.withdrawalStartAge))
  };
}

/**
 * Format analysis result for display
 */
function formatAnalysisResult(result: any): string {
  const sections: string[] = [];
  
  sections.push('='.repeat(80));
  sections.push('RETIREMENT PORTFOLIO ANALYSIS RESULTS');
  sections.push('='.repeat(80));
  sections.push('');
  
  // Summary
  sections.push('📊 SUMMARY');
  sections.push('-'.repeat(80));
  sections.push(`Primary Observation: ${result.summary.primaryObservation}`);
  sections.push(`Confidence: ${result.summary.confidence.toUpperCase()}`);
  sections.push(`Timeline Bucket: ${result.summary.timelineBucket} years`);
  if (result.summary.timelineBucketNote) {
    sections.push(`Note: ${result.summary.timelineBucketNote}`);
  }
  sections.push('');
  
  // Characteristics
  sections.push('🎯 PORTFOLIO CHARACTERISTICS');
  sections.push('-'.repeat(80));
  sections.push(`Growth Potential: ${result.summary.characteristics.growthPotential.toUpperCase()}`);
  sections.push(`Drawdown Resistance: ${result.summary.characteristics.drawdownResistance.toUpperCase()}`);
  sections.push(`Withdrawal Fragility: ${result.summary.characteristics.withdrawalFragility.toUpperCase()}`);
  sections.push(`Inflation Protection: ${result.summary.characteristics.inflationProtection.toUpperCase()}`);
  sections.push('');
  
  // Tradeoffs
  sections.push('⚖️  TRADEOFFS');
  sections.push('-'.repeat(80));
  sections.push(`Upside: ${result.summary.tradeoffs.upside}`);
  sections.push(`Downside: ${result.summary.tradeoffs.downside}`);
  sections.push('');
  
  // Metrics
  sections.push('📈 PORTFOLIO METRICS');
  sections.push('-'.repeat(80));
  sections.push(`Equity Allocation: ${result.metrics.equityAllocation.toFixed(1)}%`);
  sections.push(`Withdrawal Rate: ${(result.metrics.withdrawalRate * 100).toFixed(2)}%`);
  sections.push(`Years of Expenses: ${result.metrics.yearsOfExpenses.toFixed(1)} years`);
  sections.push('');
  sections.push('Historical Sustainable Withdrawal Rates (percentiles):');
  sections.push(`  10th percentile: ${(result.metrics.historicalWithdrawalRates.p10 * 100).toFixed(2)}%`);
  sections.push(`  25th percentile: ${(result.metrics.historicalWithdrawalRates.p25 * 100).toFixed(2)}%`);
  sections.push(`  50th percentile (median): ${(result.metrics.historicalWithdrawalRates.p50 * 100).toFixed(2)}%`);
  sections.push(`  75th percentile: ${(result.metrics.historicalWithdrawalRates.p75 * 100).toFixed(2)}%`);
  sections.push(`  90th percentile: ${(result.metrics.historicalWithdrawalRates.p90 * 100).toFixed(2)}%`);
  sections.push('');
  
  // Stress Test Results
  sections.push('🔬 STRESS TEST RESULTS');
  sections.push('-'.repeat(80));
  sections.push(`Total Sequences Analyzed: ${result.stressTest.totalSequences}`);
  sections.push(`Survival Rate: ${(result.stressTest.survivalRate * 100).toFixed(1)}%`);
  sections.push('');
  sections.push('Depletion Percentiles (years until depletion):');
  sections.push(`  10th percentile: ${result.stressTest.depletionPercentiles.p10?.toFixed(1) || 'N/A'} years`);
  sections.push(`  25th percentile: ${result.stressTest.depletionPercentiles.p25?.toFixed(1) || 'N/A'} years`);
  sections.push(`  50th percentile (median): ${result.stressTest.depletionPercentiles.p50?.toFixed(1) || 'N/A'} years`);
  sections.push(`  75th percentile: ${result.stressTest.depletionPercentiles.p75?.toFixed(1) || 'N/A'} years`);
  sections.push(`  90th percentile: ${result.stressTest.depletionPercentiles.p90?.toFixed(1) || 'N/A'} years`);
  sections.push('');
  
  if (result.stressTest.worstSequences.byDepletion.length > 0) {
    sections.push('Worst Sequences by Depletion:');
    result.stressTest.worstSequences.byDepletion.slice(0, 3).forEach((seq: any, idx: number) => {
      sections.push(`  ${idx + 1}. ${seq.sequenceId}: Depleted in ${seq.yearsUntilDepletion.toFixed(1)} years`);
    });
    sections.push('');
  }
  
  // Historical Implications
  if (result.historicalImplications && result.historicalImplications.length > 0) {
    sections.push('💡 HISTORICAL IMPLICATIONS');
    sections.push('-'.repeat(80));
    result.historicalImplications.forEach((impl: any) => {
      sections.push(`${impl.category.toUpperCase()}: ${impl.observation}`);
      sections.push(`  Context: ${impl.historicalContext}`);
      sections.push('');
    });
  }
  
  // Data Quality
  sections.push('🔍 DATA QUALITY');
  sections.push('-'.repeat(80));
  sections.push(`Completeness: ${(result.dataQuality.completeness * 100).toFixed(1)}%`);
  sections.push(`Price History Coverage: ${(result.dataQuality.priceHistoryCoverage * 100).toFixed(1)}%`);
  sections.push(`Metadata Confidence: ${result.dataQuality.metadataConfidence.toUpperCase()}`);
  sections.push(`Portfolio Mapping Confidence: ${result.dataQuality.portfolioMappingConfidence.toUpperCase()}`);
  sections.push(`Proxied Value Percentage: ${(result.dataQuality.proxiedValuePercentage * 100).toFixed(1)}%`);
  
  if (result.dataQuality.assumptions.length > 0) {
    sections.push('');
    sections.push('Assumptions:');
    result.dataQuality.assumptions.forEach((assumption: string) => {
      sections.push(`  - ${assumption}`);
    });
  }
  
  if (result.dataQuality.missingData.length > 0) {
    sections.push('');
    sections.push(`Missing Data (${result.dataQuality.missingData.length} holdings):`);
    result.dataQuality.missingData.forEach((ticker: string) => {
      sections.push(`  - ${ticker}`);
    });
  }
  sections.push('');
  
  // Disclaimers
  sections.push('⚠️  DISCLAIMERS');
  sections.push('-'.repeat(80));
  result.disclaimers.forEach((disclaimer: string) => {
    sections.push(`  • ${disclaimer}`);
  });
  sections.push('');
  
  sections.push('='.repeat(80));
  
  return sections.join('\n');
}

/**
 * Main test function
 */
async function testRetirementAnalysis() {
  console.log('🚀 Starting Retirement Portfolio Analysis Test\n');
  
  // Get user ID
  const userId = getUserId();
  if (!userId) {
    console.error('❌ Error: User ID required');
    console.log('');
    console.log('Usage:');
    console.log('  npx ts-node src/retirement-analytics/__tests__/test-analysis.ts [userId]');
    console.log('');
    console.log('Or set USER_ID environment variable:');
    console.log('  USER_ID=your-user-id npx ts-node src/retirement-analytics/__tests__/test-analysis.ts');
    console.log('');
    console.log('Optional environment variables:');
    console.log('  CURRENT_AGE=45');
    console.log('  RETIREMENT_AGE=65');
    console.log('  LIFE_EXPECTANCY=95');
    console.log('  ANNUAL_WITHDRAWAL=50000');
    console.log('  WITHDRAWAL_START_AGE=65');
    process.exit(1);
  }
  
  console.log(`👤 User ID: ${userId}`);
  
  // Get test parameters
  const params = getTestParams();
  console.log('📋 Test Parameters:');
  console.log(`   Current Age: ${params.currentAge}`);
  console.log(`   Retirement Age: ${params.retirementAge || 'Not specified (already retired)'}`);
  console.log(`   Life Expectancy: ${params.lifeExpectancy}`);
  console.log(`   Annual Withdrawal Amount: $${params.annualWithdrawalAmount.toLocaleString()}`);
  console.log(`   Withdrawal Start Age: ${params.withdrawalStartAge}`);
  console.log('');
  
  try {
    // Step 1: Get financial data
    console.log('📊 Fetching financial data...');
    const financialDataService = new FinancialDataService();
    const financialData = await financialDataService.getUserFinancialData(userId, {
      includeInvestments: true,
      includeTransactions: false,
      includeHomeValue: false
    });
    
    if (!financialData.investments?.holdings || financialData.investments.holdings.length === 0) {
      console.error('❌ Error: No investment holdings found for this user');
      console.log('');
      console.log('The user must have investment accounts connected via Plaid or SnapTrade');
      console.log('with actual holdings to run retirement analysis.');
      process.exit(1);
    }
    
    const holdingsCount = financialData.investments.holdings.length;
    const securitiesCount = financialData.investments.securities?.length || 0;
    const totalValue = financialData.investments.holdings.reduce(
      (sum: number, h: { institution_value?: number }) => sum + (h.institution_value || 0), 
      0
    );
    
    console.log(`✅ Found ${holdingsCount} holdings across ${securitiesCount} securities`);
    console.log(`   Total Portfolio Value: $${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log('');
    
    // Step 2: Prepare analysis input
    console.log('🔧 Preparing analysis input...');
    const analysisInput: RetirementAnalysisInput = {
      holdings: financialData.investments.holdings,
      securities: financialData.investments.securities || [],
      currentAge: params.currentAge,
      retirementAge: params.retirementAge || null,
      lifeExpectancy: params.lifeExpectancy,
      annualWithdrawalAmount: params.annualWithdrawalAmount,
      withdrawalStartAge: params.withdrawalStartAge
    };
    
    console.log('✅ Analysis input prepared');
    console.log('');
    
    // Step 3: Run analysis
    console.log('⚙️  Running retirement analysis...');
    console.log('   (This may take 30-60 seconds on first run as it fetches historical data)');
    console.log('');
    
    const startTime = Date.now();
    const result = await analyzeRetirementPortfolio(analysisInput);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Analysis completed in ${duration} seconds`);
    console.log('');
    
    // Step 4: Display results
    console.log(formatAnalysisResult(result));
    
    // Step 5: Save full JSON result (optional)
    if (process.env.SAVE_JSON === 'true') {
      const fs = require('fs');
      const path = require('path');
      const outputPath = path.join(__dirname, `analysis-result-${Date.now()}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`💾 Full JSON result saved to: ${outputPath}`);
      console.log('');
    }
    
    console.log('✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed with error:');
    console.error('');
    
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    } else {
      console.error(error);
    }
    
    console.error('');
    console.error('Troubleshooting:');
    console.error('  1. Verify the user ID exists in the database');
    console.error('  2. Check that the user has investment holdings');
    console.error('  3. Verify environment variables are set (TIINGO_API_KEY, FMP_API_KEY)');
    console.error('  4. Check database connection');
    console.error('  5. Review error stack trace above');
    
    process.exit(1);
  }
}

// Run the test
testRetirementAnalysis()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
