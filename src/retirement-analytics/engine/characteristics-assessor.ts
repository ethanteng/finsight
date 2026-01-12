// Characteristics Assessor
// Phase 5: Outcome & Characteristics Analysis

import { PortfolioOutcome, StressTestResult, PortfolioAssessment, PortfolioCharacteristics, PortfolioTradeoffs } from '../types';

/**
 * Assess portfolio characteristics based on historical outcomes
 * All assessments are relative to comparison cohort (similar equity allocation, same horizon)
 */
export function assessPortfolioCharacteristics(
  outcomes: PortfolioOutcome[],
  stressTestResults: StressTestResult,
  equityAllocation: number,
  horizonBucket: '10' | '20' | '30'
): PortfolioAssessment {
  const characteristics: PortfolioCharacteristics = {
    growthPotential: assessGrowthPotential(outcomes, equityAllocation, horizonBucket),
    drawdownResistance: assessDrawdownResistance(outcomes, equityAllocation, horizonBucket),
    withdrawalFragility: assessWithdrawalFragility(outcomes, stressTestResults, equityAllocation, horizonBucket),
    inflationProtection: assessInflationProtection(outcomes, equityAllocation, horizonBucket)
  };

  const tradeoffs = generateTradeoffs(characteristics, equityAllocation, stressTestResults);
  
  const primaryObservation = generatePrimaryObservation(characteristics, stressTestResults);

  return {
    characteristics,
    tradeoffs,
    primaryObservation
  };
}

/**
 * Assess growth potential relative to comparison cohort
 */
export function assessGrowthPotential(
  outcomes: PortfolioOutcome[],
  equityAllocation: number,
  horizonBucket: '10' | '20' | '30'
): 'high' | 'moderate' | 'low' {
  if (outcomes.length === 0) return 'moderate';

  // Calculate median real return
  const realReturns = outcomes.map(o => o.realReturn).filter(r => isFinite(r));
  if (realReturns.length === 0) return 'moderate';

  realReturns.sort((a, b) => a - b);
  const medianRealReturn = realReturns[Math.floor(realReturns.length / 2)];

  // Compare to cohort expectations (simplified - in production would compare to actual cohort data)
  // Higher equity allocation typically has higher growth potential
  // For now, use equity allocation as proxy for expected growth
  
  if (equityAllocation >= 70 && medianRealReturn > 0.03) {
    return 'high';
  } else if (equityAllocation >= 40 && medianRealReturn > 0.01) {
    return 'moderate';
  } else {
    return 'low';
  }
}

/**
 * Assess drawdown resistance relative to comparison cohort
 */
export function assessDrawdownResistance(
  outcomes: PortfolioOutcome[],
  equityAllocation: number,
  horizonBucket: '10' | '20' | '30'
): 'high' | 'moderate' | 'low' {
  if (outcomes.length === 0) return 'moderate';

  // Calculate median maximum drawdown
  const drawdowns = outcomes.map(o => o.maximumDrawdown).filter(d => isFinite(d));
  if (drawdowns.length === 0) return 'moderate';

  drawdowns.sort((a, b) => a - b);
  const medianDrawdown = drawdowns[Math.floor(drawdowns.length / 2)];

  // Lower equity allocation typically has higher drawdown resistance
  // Lower median drawdown = higher resistance
  
  if (equityAllocation <= 30 && medianDrawdown < 0.15) {
    return 'high';
  } else if (equityAllocation <= 60 && medianDrawdown < 0.30) {
    return 'moderate';
  } else {
    return 'low';
  }
}

/**
 * Assess withdrawal fragility relative to comparison cohort
 */
export function assessWithdrawalFragility(
  outcomes: PortfolioOutcome[],
  stressTestResults: StressTestResult,
  equityAllocation: number,
  horizonBucket: '10' | '20' | '30'
): 'high' | 'moderate' | 'low' {
  // Use survival rate as primary indicator
  // Lower survival rate = higher fragility
  
  if (stressTestResults.survivalRate >= 0.85) {
    return 'low';
  } else if (stressTestResults.survivalRate >= 0.70) {
    return 'moderate';
  } else {
    return 'high';
  }
}

/**
 * Assess inflation protection relative to comparison cohort
 */
export function assessInflationProtection(
  outcomes: PortfolioOutcome[],
  equityAllocation: number,
  horizonBucket: '10' | '20' | '30'
): 'high' | 'moderate' | 'low' {
  if (outcomes.length === 0) return 'moderate';

  // Calculate percentage of outcomes with positive real returns
  const positiveRealReturns = outcomes.filter(o => o.realReturn > 0).length;
  const positiveReturnRate = positiveRealReturns / outcomes.length;

  // Higher equity allocation typically provides better inflation protection
  // Higher percentage of positive real returns = better protection
  
  if (equityAllocation >= 60 && positiveReturnRate >= 0.80) {
    return 'high';
  } else if (equityAllocation >= 30 && positiveReturnRate >= 0.60) {
    return 'moderate';
  } else {
    return 'low';
  }
}

/**
 * Generate explicit tradeoffs (upside + downside)
 */
export function generateTradeoffs(
  characteristics: PortfolioCharacteristics,
  equityAllocation: number,
  stressTestResults: StressTestResult
): PortfolioTradeoffs {
  // Build upside from positive characteristics
  const upsideParts: string[] = [];
  if (characteristics.growthPotential === 'high') {
    upsideParts.push('strong growth potential');
  }
  if (characteristics.drawdownResistance === 'high') {
    upsideParts.push('high drawdown resistance');
  }
  if (characteristics.withdrawalFragility === 'low') {
    upsideParts.push('low withdrawal fragility');
  }
  if (characteristics.inflationProtection === 'high') {
    upsideParts.push('strong inflation protection');
  }

  // Build downside from negative characteristics
  const downsideParts: string[] = [];
  if (characteristics.growthPotential === 'low') {
    downsideParts.push('growth-constrained');
  }
  if (characteristics.drawdownResistance === 'low') {
    downsideParts.push('sequence-sensitive');
  }
  if (characteristics.withdrawalFragility === 'high') {
    downsideParts.push('historically fragile given withdrawal timing');
  }
  if (characteristics.inflationProtection === 'low') {
    downsideParts.push('limited inflation protection');
  }

  // If balanced, use default tradeoff
  if (upsideParts.length === 0 && downsideParts.length === 0) {
    return {
      upside: 'Balanced allocation pattern with moderate characteristics across dimensions',
      downside: 'Does not maximize long-term growth or minimize short-term drawdowns'
    };
  }

  return {
    upside: upsideParts.length > 0 
      ? upsideParts.join(', ')
      : 'Moderate characteristics across dimensions',
    downside: downsideParts.length > 0
      ? downsideParts.join(', ')
      : 'Moderate tradeoffs across dimensions'
  };
}

/**
 * Generate primary observation based on characteristics and stress test results
 */
function generatePrimaryObservation(
  characteristics: PortfolioCharacteristics,
  stressTestResults: StressTestResult
): string {
  // Prioritize most significant characteristic
  if (characteristics.withdrawalFragility === 'high') {
    return 'Historically fragile given withdrawal timing';
  } else if (characteristics.growthPotential === 'low' && characteristics.drawdownResistance === 'high') {
    return 'Growth-constrained but drawdown-resistant';
  } else if (characteristics.growthPotential === 'high' && characteristics.drawdownResistance === 'low') {
    return 'Return-efficient but sequence-sensitive';
  } else {
    return 'Balanced allocation pattern with moderate characteristics';
  }
}
