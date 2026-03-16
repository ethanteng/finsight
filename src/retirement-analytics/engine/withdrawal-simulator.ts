// Withdrawal Simulator
// Phase 4: Withdrawal Simulation
//
// Simulates inflation-adjusted withdrawals with annual portfolio rebalancing.

import { PortfolioMapping, HistoricalSequence, PortfolioOutcome } from '../types';

/**
 * Simulate inflation-adjusted withdrawals across a historical sequence.
 * Withdrawals grow with CPI each month (constant real spending).
 * Portfolio is rebalanced to target weights annually.
 */
export function simulateWithdrawals(
  portfolioMapping: PortfolioMapping,
  initialPortfolioValue: number,
  sequence: HistoricalSequence,
  annualWithdrawal: number
): PortfolioOutcome {
  const w = portfolioMapping;
  let usEquity = initialPortfolioValue * w.usEquityWeight;
  let intlEquity = initialPortfolioValue * w.internationalEquityWeight;
  let bonds = initialPortfolioValue * w.nominalBondsWeight;
  let cash = initialPortfolioValue * w.cashWeight;

  let monthlyWithdrawal = annualWithdrawal / 12;
  const months = sequence.assetBasketReturns.usEquity.length;

  const portfolioValues: number[] = [initialPortfolioValue];
  let peakValue = initialPortfolioValue;
  let maxDrawdown = 0;
  let drawdownStartMonth: number | null = null;
  let recoveryMonth: number | null = null;

  for (let month = 0; month < months; month++) {
    const usRet = sequence.assetBasketReturns.usEquity[month] ?? 0;
    const intlRet = sequence.assetBasketReturns.internationalEquity[month] ?? 0;
    const bondRet = sequence.assetBasketReturns.nominalBonds[month] ?? 0;
    const cashRet = sequence.assetBasketReturns.cash[month] ?? 0;

    usEquity *= 1 + usRet;
    intlEquity *= 1 + intlRet;
    bonds *= 1 + bondRet;
    cash *= 1 + cashRet;

    let portfolioValue = usEquity + intlEquity + bonds + cash;

    const inflationRate = sequence.inflationRates[month] ?? 0;
    monthlyWithdrawal *= 1 + inflationRate;
    portfolioValue -= monthlyWithdrawal;

    if (portfolioValue <= 0) {
      return {
        withdrawalSustainability: false,
        yearsUntilDepletion: month / 12,
        finalValue: 0,
        maximumDrawdown: maxDrawdown,
        timeToRecovery: recoveryMonth != null ? recoveryMonth - (drawdownStartMonth ?? 0) : null,
        realReturn: calculateRealReturn(portfolioValues, sequence.inflationRates),
      };
    }

    portfolioValues.push(portfolioValue);

    const prevPeak = peakValue;
    peakValue = Math.max(peakValue, portfolioValue);
    if (portfolioValue > prevPeak && drawdownStartMonth !== null && recoveryMonth === null) {
      recoveryMonth = month;
    }
    const drawdown = peakValue > 0 ? (peakValue - portfolioValue) / peakValue : 0;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      if (drawdownStartMonth === null) {
        drawdownStartMonth = month;
      }
    }

    if ((month + 1) % 12 === 0 || month === months - 1) {
      usEquity = portfolioValue * w.usEquityWeight;
      intlEquity = portfolioValue * w.internationalEquityWeight;
      bonds = portfolioValue * w.nominalBondsWeight;
      cash = portfolioValue * w.cashWeight;
    } else {
      // Withdrawal applied to total; scale sleeves proportionally to match new total
      const scale = portfolioValue / (portfolioValue + monthlyWithdrawal);
      usEquity *= scale;
      intlEquity *= scale;
      bonds *= scale;
      cash *= scale;
    }
  }

  return {
    withdrawalSustainability: true,
    yearsUntilDepletion: null,
    finalValue: usEquity + intlEquity + bonds + cash,
    maximumDrawdown: maxDrawdown,
    timeToRecovery: recoveryMonth != null ? recoveryMonth - (drawdownStartMonth ?? 0) : null,
    realReturn: calculateRealReturn(portfolioValues, sequence.inflationRates),
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

  const nominalReturn = (finalValue - initialValue) / initialValue;

  let cumulativeInflation = 1;
  for (let i = 0; i < Math.min(inflationRates.length, portfolioValues.length - 1); i++) {
    cumulativeInflation *= 1 + inflationRates[i];
  }

  const realReturn = (1 + nominalReturn) / cumulativeInflation - 1;

  const years = portfolioValues.length / 12;
  if (years <= 0) return 0;

  return Math.pow(1 + realReturn, 1 / years) - 1;
}
