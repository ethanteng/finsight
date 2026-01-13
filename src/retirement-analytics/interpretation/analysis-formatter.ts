// Analysis Formatter
// Phase 6: Formatter & Confidence Enforcement

import {
  RetirementAnalysisOutput,
  PortfolioAssessment,
  StressTestResult,
  PortfolioCompositionMetrics,
  TimelineMetrics,
  WithdrawalSustainabilityMetrics,
  DataQualityReport
} from '../types';
import { calculateConfidenceCeiling, generateDisclaimers } from './uncertainty-quantifier';

/**
 * Format analysis results for LLM consumption
 * Enforces confidence ceiling rules
 */
export function formatAnalysisOutput(
  assessment: PortfolioAssessment,
  stressTestResults: StressTestResult,
  portfolioMetrics: PortfolioCompositionMetrics,
  timelineMetrics: TimelineMetrics,
  withdrawalMetrics: WithdrawalSustainabilityMetrics,
  dataQuality: DataQualityReport,
  timelineBucketNote?: string
): RetirementAnalysisOutput {
  // Enforce confidence ceiling
  const confidence = calculateConfidenceCeiling(dataQuality);

  // Generate disclaimers
  const disclaimers = generateDisclaimers(dataQuality, timelineBucketNote);

  // Generate historical implications (pattern-based observations)
  const historicalImplications = generateHistoricalImplications(
    assessment,
    stressTestResults,
    portfolioMetrics,
    withdrawalMetrics
  );

  return {
    summary: {
      characteristics: assessment.characteristics,
      tradeoffs: assessment.tradeoffs,
      primaryObservation: assessment.primaryObservation,
      confidence,
      timelineBucket: timelineMetrics.timelineBucket,
      timelineBucketNote: timelineBucketNote || ''
    },
    metrics: {
      equityAllocation: portfolioMetrics.equityAllocation,
      withdrawalRate: withdrawalMetrics.withdrawalRate,
      yearsOfExpenses: withdrawalMetrics.yearsOfExpenses,
      historicalWithdrawalRates: withdrawalMetrics.historicalWithdrawalRates
    },
    stressTest: {
      totalSequences: stressTestResults.totalSequences,
      survivalRate: stressTestResults.survivalRate,
      depletionPercentiles: stressTestResults.depletionPercentiles,
      worstSequences: stressTestResults.worstSequences,
      notablePeriods: stressTestResults.notablePeriods
    },
    historicalImplications,
    dataQuality,
    disclaimers
  };
}

/**
 * Generate historical implications (pattern-based observations, not recommendations)
 */
function generateHistoricalImplications(
  assessment: PortfolioAssessment,
  stressTestResults: StressTestResult,
  portfolioMetrics: PortfolioCompositionMetrics,
  withdrawalMetrics: WithdrawalSustainabilityMetrics
): Array<{
  category: 'allocation' | 'diversification' | 'expenses' | 'withdrawal';
  observation: string;
  historicalContext: string;
}> {
  const implications: Array<{
    category: 'allocation' | 'diversification' | 'expenses' | 'withdrawal';
    observation: string;
    historicalContext: string;
  }> = [];

  // Allocation implications
  if (assessment.characteristics.growthPotential === 'low' && portfolioMetrics.equityAllocation < 30) {
    implications.push({
      category: 'allocation',
      observation: 'Portfolio shows growth-constrained characteristics relative to portfolios with similar equity allocations and horizon',
      historicalContext: `Historical analysis shows portfolios with ${Math.round(portfolioMetrics.equityAllocation)}% equity allocation had median real returns below inflation in the majority of sequences`
    });
  }

  if (assessment.characteristics.withdrawalFragility === 'high') {
    implications.push({
      category: 'withdrawal',
      observation: 'Portfolio shows historically fragile withdrawal sustainability relative to portfolios with similar equity allocations and horizon',
      historicalContext: `Historical analysis shows ${Math.round((1 - stressTestResults.survivalRate) * 100)}% of sequences resulted in portfolio depletion before withdrawal period ended`
    });
  }

  // Diversification implications
  if (portfolioMetrics.concentrationRisk > 0.3) {
    implications.push({
      category: 'diversification',
      observation: 'Portfolio shows high concentration risk',
      historicalContext: `Top 10 holdings represent ${Math.round(portfolioMetrics.concentrationRisk * 100)}% of portfolio concentration (HHI). Diversified portfolios historically showed lower volatility`
    });
  }

  if (portfolioMetrics.internationalAllocation < 10 && portfolioMetrics.equityAllocation > 50) {
    implications.push({
      category: 'diversification',
      observation: 'Portfolio shows low international diversification relative to equity-heavy allocations',
      historicalContext: 'Portfolios with higher international diversification historically showed different drawdown patterns during US market downturns'
    });
  }

  // Withdrawal rate implications
  if (withdrawalMetrics.withdrawalRate > 0.05) {
    implications.push({
      category: 'withdrawal',
      observation: 'Withdrawal rate exceeds historical sustainable rates for similar allocations',
      historicalContext: `Historical analysis shows withdrawal rates above 5% failed in the majority of sequences for similar equity allocations`
    });
  }

  return implications;
}

