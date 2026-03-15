// Withdrawal Rate Solver
// Computes historical withdrawal rate distribution via binary search over survival curve

import { PortfolioMapping, HistoricalSequence } from '../types';
import { simulateWithdrawals } from './withdrawal-simulator';

// ============================================================================
// Types
// ============================================================================

export type WithdrawalDistribution = {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
};

// ============================================================================
// Constants
// ============================================================================

const MIN_WITHDRAWAL = 0.02; // 2% - historical rates typically 2–7%
const MAX_WITHDRAWAL = 0.08; // 8%
const TOLERANCE = 0.0001;
const MAX_ITERATIONS = 15;
// Percentile labels (p10, p25, ...) denote position in the withdrawal rate distribution.
// p10 = conservative low rate → need high survival (90%); p90 = aggressive high rate → need low survival (10%).
const TARGET_SURVIVAL = {
  p10: 0.9,   // 90% survive → 10th percentile (conservative low rate)
  p25: 0.75,  // 75% survive → 25th percentile
  p50: 0.5,   // 50% survive → 50th percentile (median)
  p75: 0.25,  // 25% survive → 75th percentile
  p90: 0.1    // 10% survive → 90th percentile (aggressive high rate)
} as const;

const CACHE_KEY_SCALE = 100000;

// ============================================================================
// Helpers
// ============================================================================

function cacheKey(rate: number): number {
  return Math.round(rate * CACHE_KEY_SCALE);
}

/**
 * Evaluate survival fraction at a given withdrawal rate across all sequences
 */
export function evaluateSurvival(
  rate: number,
  sequences: HistoricalSequence[],
  portfolioMapping: PortfolioMapping,
  totalValue: number,
  cache?: Map<number, number>
): number {
  const key = cacheKey(rate);
  const cached = cache?.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const annualWithdrawal = rate * totalValue;
  let survivors = 0;

  for (const sequence of sequences) {
    const outcome = simulateWithdrawals(
      portfolioMapping,
      totalValue,
      sequence,
      annualWithdrawal
    );
    if (outcome.withdrawalSustainability) {
      survivors++;
    }
  }

  const survivalFraction = survivors / sequences.length;
  cache?.set(key, survivalFraction);
  return survivalFraction;
}

/**
 * Find withdrawal rate where targetSurvival fraction of sequences survive
 */
export function findWithdrawalForSurvival(
  targetSurvival: number,
  sequences: HistoricalSequence[],
  portfolioMapping: PortfolioMapping,
  totalValue: number,
  cache: Map<number, number>
): number {
  // Pre-check for unreachable targets
  const minSurvival = evaluateSurvival(
    MAX_WITHDRAWAL,
    sequences,
    portfolioMapping,
    totalValue,
    cache
  );
  const maxSurvival = evaluateSurvival(
    MIN_WITHDRAWAL,
    sequences,
    portfolioMapping,
    totalValue,
    cache
  );

  if (targetSurvival > maxSurvival) return MIN_WITHDRAWAL;
  if (targetSurvival < minSurvival) return MAX_WITHDRAWAL;

  let low = MIN_WITHDRAWAL;
  let high = MAX_WITHDRAWAL;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const rate = (low + high) / 2;
    const survivalFraction = evaluateSurvival(
      rate,
      sequences,
      portfolioMapping,
      totalValue,
      cache
    );

    if (survivalFraction >= targetSurvival) {
      low = rate;
    } else {
      high = rate;
    }

    if (Math.abs(high - low) < TOLERANCE) break;
  }

  return low;
}

/**
 * Compute historical withdrawal rate distribution (p10, p25, p50, p75, p90)
 * using binary search over survival curve. Percentiles solved in order:
 * p50 first, then p25/p75, then p10/p90 for better convergence.
 */
export function computeHistoricalWithdrawalRates(
  sequences: HistoricalSequence[],
  portfolioMapping: PortfolioMapping,
  totalValue: number
): WithdrawalDistribution {
  if (sequences.length === 0) {
    return {
      p10: 0,
      p25: 0,
      p50: 0,
      p75: 0,
      p90: 0
    };
  }

  const cache = new Map<number, number>();

  // Solve p50 first
  const p50 = findWithdrawalForSurvival(
    TARGET_SURVIVAL.p50,
    sequences,
    portfolioMapping,
    totalValue,
    cache
  );

  // Solve p25 and p75
  const p25 = findWithdrawalForSurvival(
    TARGET_SURVIVAL.p25,
    sequences,
    portfolioMapping,
    totalValue,
    cache
  );
  const p75 = findWithdrawalForSurvival(
    TARGET_SURVIVAL.p75,
    sequences,
    portfolioMapping,
    totalValue,
    cache
  );

  // Solve p10 and p90
  const p10 = findWithdrawalForSurvival(
    TARGET_SURVIVAL.p10,
    sequences,
    portfolioMapping,
    totalValue,
    cache
  );
  const p90 = findWithdrawalForSurvival(
    TARGET_SURVIVAL.p90,
    sequences,
    portfolioMapping,
    totalValue,
    cache
  );

  // Enforce monotonicity: p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90
  const results: WithdrawalDistribution = { p10, p25, p50, p75, p90 };
  results.p25 = Math.max(results.p25, results.p10);
  results.p50 = Math.max(results.p50, results.p25);
  results.p75 = Math.max(results.p75, results.p50);
  results.p90 = Math.max(results.p90, results.p75);

  return results;
}
