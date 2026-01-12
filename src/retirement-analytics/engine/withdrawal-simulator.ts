// Withdrawal Simulator
// Phase 4: Withdrawal Simulation

import { PortfolioMapping, HistoricalSequence, PortfolioOutcome } from '../types';

/**
 * Simulate fixed real-dollar withdrawals across a historical sequence
 */
export function simulateWithdrawals(
  portfolioMapping: PortfolioMapping,
  initialPortfolioValue: number,
  sequence: HistoricalSequence,
  annualWithdrawal: number
): PortfolioOutcome {
  let portfolioValue = initialPortfolioValue;
  const monthlyWithdrawal = annualWithdrawal / 12;
  const months = sequence.assetBasketReturns.usEquity.length;
  
  const portfolioValues: number[] = [portfolioValue];
  let peakValue = portfolioValue;
  let maxDrawdown = 0;
  let drawdownStartMonth: number | null = null;
  let recoveryMonth: number | null = null;
  
  for (let month = 0; month < months; month++) {
    // Calculate portfolio return from asset basket
    const usEquityReturn = sequence.assetBasketReturns.usEquity[month] || 0;
    const intlEquityReturn = sequence.assetBasketReturns.internationalEquity[month] || 0;
    const bondReturn = sequence.assetBasketReturns.nominalBonds[month] || 0;
    const cashReturn = sequence.assetBasketReturns.cash[month] || 0;
    
    const portfolioReturn = 
      (portfolioMapping.usEquityWeight * usEquityReturn) +
      (portfolioMapping.internationalEquityWeight * intlEquityReturn) +
      (portfolioMapping.nominalBondsWeight * bondReturn) +
      (portfolioMapping.cashWeight * cashReturn);
    
    // Apply return and withdrawal
    portfolioValue = portfolioValue * (1 + portfolioReturn) - monthlyWithdrawal;
    portfolioValues.push(portfolioValue);
    
    // Track drawdowns
    if (portfolioValue > peakValue) {
      peakValue = portfolioValue;
      if (drawdownStartMonth !== null && recoveryMonth === null) {
        recoveryMonth = month;
      }
    } else {
      const drawdown = (peakValue - portfolioValue) / peakValue;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        if (drawdownStartMonth === null) {
          drawdownStartMonth = month;
        }
      }
    }
    
    // Check for depletion
    if (portfolioValue <= 0) {
      return {
        withdrawalSustainability: false,
        yearsUntilDepletion: month / 12,
        finalValue: 0,
        maximumDrawdown: maxDrawdown,
        timeToRecovery: recoveryMonth ? recoveryMonth - (drawdownStartMonth || 0) : null,
        realReturn: calculateRealReturn(portfolioValues, sequence.inflationRates)
      };
    }
  }
  
  return {
    withdrawalSustainability: true,
    yearsUntilDepletion: null,
    finalValue: portfolioValue,
    maximumDrawdown: maxDrawdown,
    timeToRecovery: recoveryMonth ? recoveryMonth - (drawdownStartMonth || 0) : null,
    realReturn: calculateRealReturn(portfolioValues, sequence.inflationRates)
  };
}

/**
 * Calculate inflation-adjusted (real) annualized return
 */
export function calculateRealReturn(
  portfolioValues: number[],
  inflationRates: number[]
): number {
  if (portfolioValues.length < 2) return 0;
  
  const initialValue = portfolioValues[0];
  const finalValue = portfolioValues[portfolioValues.length - 1];
  
  if (initialValue === 0) return 0;
  
  // Calculate nominal return
  const nominalReturn = (finalValue - initialValue) / initialValue;
  
  // Calculate cumulative inflation over the period
  let cumulativeInflation = 1;
  for (let i = 0; i < Math.min(inflationRates.length, portfolioValues.length - 1); i++) {
    cumulativeInflation *= (1 + inflationRates[i]);
  }
  
  // Real return = (1 + nominal) / (1 + inflation) - 1
  const realReturn = (1 + nominalReturn) / cumulativeInflation - 1;
  
  // Annualize (assuming monthly data)
  const years = portfolioValues.length / 12;
  if (years <= 0) return 0;
  
  const annualizedRealReturn = Math.pow(1 + realReturn, 1 / years) - 1;
  
  return annualizedRealReturn;
}
