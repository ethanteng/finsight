// Withdrawal Simulator
// Phase 4: Withdrawal Simulation
//
// Simulates inflation-adjusted withdrawals with annual portfolio rebalancing.
//
// WITHDRAWAL TIMING: End-of-period withdrawals.
// Order each month: (1) apply returns to portfolio, (2) subtract withdrawal.
// This differs from Trinity-style / Bengen 4% rule, which typically assumes
// beginning-of-period withdrawals (withdraw first, then earn returns).
// End-of-period is slightly more favorable to the retiree; survival rates
// may be marginally higher than Trinity-style studies.
//
// INFLATION: sequence.inflationRates[] are MONTHLY (CPI_t/CPI_(t-1) - 1).
// Source: build-market-dataset.ts from Shiller ie_data.xls. Do NOT treat as annual.
//
// DEPLETION: portfolioValue clamped at zero (max(0, value - withdrawal)). Prevents
// rebalancing or compounding negative assets; sequence is marked depleted and returns.

import { PortfolioMapping, HistoricalSequence, PortfolioOutcome } from '../types';

/**
 * Simulate inflation-adjusted withdrawals across a historical sequence.
 * Withdrawals grow with CPI each month (constant real spending).
 * Portfolio is rebalanced to target weights annually.
 *
 * Withdrawal timing: End-of-period (returns applied first, then withdrawal).
 * See module comment for comparison to Trinity-style beginning-of-period.
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

    // inflationRates[] are monthly (CPI_t/CPI_(t-1) - 1 from build-market-dataset). Not annual.
    const monthlyInflation = sequence.inflationRates[month] ?? 0;
    monthlyWithdrawal *= 1 + monthlyInflation;
    portfolioValue = Math.max(0, portfolioValue - monthlyWithdrawal);

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

  const years = (portfolioValues.length - 1) / 12;
  if (years <= 0) return 0;

  return Math.pow(1 + realReturn, 1 / years) - 1;
}
