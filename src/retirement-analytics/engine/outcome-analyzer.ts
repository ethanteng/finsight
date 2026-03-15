// Outcome Analyzer
// Phase 5: Outcome & Characteristics Analysis

import { PortfolioOutcome, StressTestResult, HistoricalSequence } from '../types';

/**
 * Analyze outcomes across all sequences and produce stress test results
 */
export function analyzeOutcomes(
  outcomes: PortfolioOutcome[],
  sequences: HistoricalSequence[],
  totalSequences: number
): StressTestResult {
  if (outcomes.length === 0) {
    return {
      totalSequences: 0,
      survivalRate: 0,
      depletionPercentiles: { p10: null, p25: null, p50: null, p75: null, p90: null },
      worstSequences: {
        byDepletion: [],
        byDrawdown: [],
        byRecovery: []
      },
      historicalWithdrawalRates: { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 }
    };
  }

  // Calculate survival rate
  const survivalRateValue = outcomes.filter(o => o.withdrawalSustainability).length / outcomes.length;

  // Calculate percentiles for depletion years
  const depletionYears = outcomes.map(o => o.yearsUntilDepletion);
  const depletionPercentiles = calculatePercentiles(depletionYears);

  // Find worst sequences by different metrics
  const sequenceIds = sequences.map(s => s.sequenceId);
  const worstByDepletionRaw = findWorstSequences(outcomes, 'yearsUntilDepletion', sequenceIds);
  const worstByDrawdownRaw = findWorstSequences(outcomes, 'maximumDrawdown', sequenceIds);
  const worstByRecoveryRaw = findWorstSequences(outcomes, 'timeToRecovery', sequenceIds);
  
  const worstByDepletion = worstByDepletionRaw.map(w => ({
    sequenceId: w.sequenceId,
    yearsUntilDepletion: w.value
  }));
  
  const worstByDrawdown = worstByDrawdownRaw.map(w => ({
    sequenceId: w.sequenceId,
    maximumDrawdown: w.value
  }));
  
  const worstByRecovery = worstByRecoveryRaw.map(w => ({
    sequenceId: w.sequenceId,
    timeToRecovery: w.value
  }));

  // Calculate historical withdrawal rates
  // Simplified heuristic based on survival patterns
  // Full implementation would require running simulations with varying withdrawal rates
  // to find maximum sustainable rate per sequence (binary search)
  
  // Heuristic: estimate sustainable withdrawal rates based on survival rate
  // Higher survival rate suggests higher sustainable withdrawal rates
  // This is a placeholder - full implementation requires iterative simulation per sequence
  const baseRate = 0.04; // 4% baseline assumption
  const historicalWithdrawalRates = {
    p10: Math.max(0.01, baseRate * 0.7 * Math.sqrt(survivalRateValue)),
    p25: Math.max(0.02, baseRate * 0.85 * Math.sqrt(survivalRateValue)),
    p50: Math.max(0.03, baseRate * Math.sqrt(survivalRateValue)),
    p75: Math.max(0.04, baseRate * 1.15 * Math.sqrt(survivalRateValue)),
    p90: Math.max(0.05, baseRate * 1.3 * Math.sqrt(survivalRateValue))
  };

  return {
    totalSequences,
    survivalRate: survivalRateValue,
    depletionPercentiles,
    worstSequences: {
      byDepletion: worstByDepletion.slice(0, 5),
      byDrawdown: worstByDrawdown.slice(0, 5),
      byRecovery: worstByRecovery.slice(0, 5)
    },
    historicalWithdrawalRates
  };
}

/**
 * Calculate percentiles (p10, p25, p50, p75, p90) from an array of values
 */
export function calculatePercentiles(
  values: (number | null)[]
): {
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
} {
  // Filter out null values and sort
  const numericValues = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  
  if (numericValues.length === 0) {
    return { p10: null, p25: null, p50: null, p75: null, p90: null };
  }

  const getPercentile = (percentile: number): number => {
    const index = Math.floor((percentile / 100) * numericValues.length);
    return numericValues[Math.min(index, numericValues.length - 1)];
  };

  return {
    p10: getPercentile(10),
    p25: getPercentile(25),
    p50: getPercentile(50),
    p75: getPercentile(75),
    p90: getPercentile(90)
  };
}

/**
 * Find worst sequences by a specific metric
 */
export function findWorstSequences(
  outcomes: PortfolioOutcome[],
  metric: 'yearsUntilDepletion' | 'maximumDrawdown' | 'timeToRecovery',
  sequenceIds: string[]
): Array<{ sequenceId: string; value: number }> {
  if (outcomes.length !== sequenceIds.length) {
    throw new Error('Outcomes and sequence IDs must have same length');
  }

  // Create array of { sequenceId, outcome, value } tuples
  const tuples = outcomes.map((outcome, index) => {
    let value: number | null;
    
    switch (metric) {
      case 'yearsUntilDepletion':
        value = outcome.yearsUntilDepletion;
        break;
      case 'maximumDrawdown':
        value = outcome.maximumDrawdown;
        break;
      case 'timeToRecovery':
        value = outcome.timeToRecovery;
        break;
    }

    return {
      sequenceId: sequenceIds[index],
      outcome,
      value: value ?? (metric === 'yearsUntilDepletion' ? Infinity : -Infinity) // Treat null as worst
    };
  });

  // For depletion: exclude survived sequences (Infinity) - only report sequences that actually depleted
  const filteredTuples =
    metric === 'yearsUntilDepletion'
      ? tuples.filter((t) => t.value !== Infinity)
      : tuples;

  // Sort by metric value (worst first)
  // For depletion: lower is worse (depleted sooner)
  // For drawdown: higher is worse (larger drawdown)
  // For recovery: higher is worse (longer recovery)
  filteredTuples.sort((a, b) => {
    if (metric === 'yearsUntilDepletion') {
      return a.value - b.value;
    } else {
      // Higher is worse for drawdown and recovery
      if (a.value === -Infinity) return 1; // nulls go to end
      if (b.value === -Infinity) return -1;
      return b.value - a.value;
    }
  });

  return filteredTuples.map((t) => ({
    sequenceId: t.sequenceId,
    value: t.value === -Infinity ? 0 : t.value
  }));
}
