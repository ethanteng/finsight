// Outcome Analyzer
// Phase 5: Outcome & Characteristics Analysis

import { PortfolioOutcome, StressTestResult, HistoricalSequence } from '../types';
import type { WithdrawalDistribution } from './withdrawal-rate-solver';

/**
 * Analyze outcomes across all sequences and produce stress test results
 */
export function analyzeOutcomes(
  outcomes: PortfolioOutcome[],
  sequences: HistoricalSequence[],
  totalSequences: number,
  historicalWithdrawalRates: WithdrawalDistribution
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
      historicalWithdrawalRates
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

  // Linear interpolation: index = (p/100) * (n-1). Matches Excel PERCENTILE.INC / R type 6.
  const getPercentile = (percentile: number): number => {
    const n = numericValues.length;
    if (n === 1) return numericValues[0];
    const index = (percentile / 100) * (n - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return numericValues[lower];
    const frac = index - lower;
    return numericValues[lower] + frac * (numericValues[upper] - numericValues[lower]);
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
