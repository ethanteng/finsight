// Withdrawal Simulator
// Phase 4: Withdrawal Simulation
//
// Simulates explicit withdrawal-growth policies with annual portfolio rebalancing.
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

import {
  DEFAULT_WITHDRAWAL_POLICY,
  PortfolioMapping,
  HistoricalSequence,
  PortfolioOutcome,
  WithdrawalPolicy,
} from '../types';
import { mappingFromResolvedExposures } from './portfolio-mapper';

export interface WithdrawalSimulationOptions {
  withdrawalDelayMonths?: number;
  withdrawalPolicy?: WithdrawalPolicy;
  /** Annual contribution in today's dollars, applied monthly before withdrawals begin. */
  annualContributionAmount?: number;
  /**
   * A COLA-indexed income (Social Security, a pension) that pays the household
   * directly and so reduces the portfolio withdrawal from `startMonth` onward.
   * `annualAmount` is in today's dollars and is indexed by the sequence's own
   * CPI, exactly like the withdrawal it offsets. Income above that month's
   * spending is dropped rather than reinvested -- the portfolio withdrawal is
   * floored at zero -- because a saved surplus is an assumption the caller has
   * not made.
   */
  incomeOffset?: { annualAmount: number; startMonth: number };
}

function validateWithdrawalPolicy(policy: WithdrawalPolicy): void {
  if (
    policy.type === 'fixed_growth' &&
    (!Number.isFinite(policy.annualRate) || policy.annualRate <= -1 || policy.annualRate > 1)
  ) {
    throw new Error('Fixed withdrawal growth must be greater than -100% and no more than 100% per year');
  }
}

/**
 * Simulate a withdrawal policy across a historical sequence. The default grows
 * withdrawals with CPI each month (constant real spending).
 * Portfolio is rebalanced to target weights annually.
 *
 * Withdrawal timing: End-of-period (returns applied first, then withdrawal).
 * See module comment for comparison to Trinity-style beginning-of-period.
 */
export function simulateWithdrawals(
  portfolioMapping: PortfolioMapping,
  initialPortfolioValue: number,
  sequence: HistoricalSequence,
  annualWithdrawal: number,
  options: WithdrawalSimulationOptions = {}
): PortfolioOutcome {
  const w = mappingFromResolvedExposures(portfolioMapping);
  const withdrawalPolicy = options.withdrawalPolicy ?? DEFAULT_WITHDRAWAL_POLICY;
  validateWithdrawalPolicy(withdrawalPolicy);
  const annualContributionAmount = options.annualContributionAmount ?? 0;
  if (!Number.isFinite(annualContributionAmount) || annualContributionAmount < 0) {
    throw new Error('Annual contributions must be a finite, non-negative amount');
  }
  const incomeOffset = options.incomeOffset;
  if (incomeOffset) {
    if (!Number.isFinite(incomeOffset.annualAmount) || incomeOffset.annualAmount < 0) {
      throw new Error('Retirement income must be a finite, non-negative amount');
    }
    if (!Number.isFinite(incomeOffset.startMonth) || incomeOffset.startMonth < 0) {
      throw new Error('Retirement income start month must be a finite, non-negative number of months');
    }
  }
  const incomeStartMonth = incomeOffset ? Math.round(incomeOffset.startMonth) : 0;
  let usEquity = initialPortfolioValue * w.usEquityWeight;
  let intlEquity = initialPortfolioValue * w.internationalEquityWeight;
  let bonds = initialPortfolioValue * w.nominalBondsWeight;
  let cash = initialPortfolioValue * w.cashWeight;

  let monthlyWithdrawal = annualWithdrawal / 12;
  const months = sequence.assetBasketReturns.usEquity.length;
  const withdrawalDelayMonths = Math.max(0, Math.round(options.withdrawalDelayMonths || 0));
  let cumulativeInflation = 1;
  let portfolioValueAtWithdrawalStart = initialPortfolioValue;
  let realPortfolioValueAtWithdrawalStart = initialPortfolioValue;

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
    cumulativeInflation *= 1 + monthlyInflation;
    const withdrawing = month >= withdrawalDelayMonths;

    // Contributions are expressed in today's dollars, just like the starting
    // withdrawal. Index them with the historical sequence's CPI and invest them
    // at the target allocation after this month's returns. They stop before the
    // first withdrawal so the two phases never overlap.
    if (!withdrawing && annualContributionAmount > 0) {
      const monthlyContribution = (annualContributionAmount / 12) * cumulativeInflation;
      usEquity += monthlyContribution * w.usEquityWeight;
      intlEquity += monthlyContribution * w.internationalEquityWeight;
      bonds += monthlyContribution * w.nominalBondsWeight;
      cash += monthlyContribution * w.cashWeight;
      portfolioValue += monthlyContribution;
    }

    // Through the first withdrawal, keep the user's today-dollar spending
    // target level with the sequence's CPI for every policy. After that first
    // payment, the selected policy alone controls how the nominal amount
    // changes. This makes comparisons isolate the policy instead of changing
    // first-year purchasing power too.
    if (withdrawalPolicy.type === 'historical_cpi' || month <= withdrawalDelayMonths) {
      monthlyWithdrawal *= 1 + monthlyInflation;
    } else if (
      withdrawalPolicy.type === 'fixed_growth' &&
      month > withdrawalDelayMonths &&
      (month - withdrawalDelayMonths) % 12 === 0
    ) {
      monthlyWithdrawal *= 1 + withdrawalPolicy.annualRate;
    }
    if (month + 1 === withdrawalDelayMonths) {
      portfolioValueAtWithdrawalStart = portfolioValue;
      realPortfolioValueAtWithdrawalStart = cumulativeInflation > 0
        ? portfolioValue / cumulativeInflation
        : portfolioValue;
    }
    // Income indexed on the same cumulative CPI as the withdrawal it offsets, so
    // the two stay in the same real units for the whole sequence. It only
    // applies while withdrawing: before that the household is not drawing on
    // the portfolio, and this simulation does not bank the difference.
    const incomeThisMonth = incomeOffset && month >= incomeStartMonth
      ? (incomeOffset.annualAmount / 12) * cumulativeInflation
      : 0;
    const withdrawalThisMonth = withdrawing
      ? Math.max(0, monthlyWithdrawal - incomeThisMonth)
      : 0;
    portfolioValue = Math.max(0, portfolioValue - withdrawalThisMonth);

    if (portfolioValue <= 0) {
      return {
        withdrawalSustainability: false,
        yearsUntilDepletion: Math.max(0, month - withdrawalDelayMonths) / 12,
        portfolioValueAtWithdrawalStart,
        realPortfolioValueAtWithdrawalStart,
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
      const scale = portfolioValue / (portfolioValue + withdrawalThisMonth);
      usEquity *= scale;
      intlEquity *= scale;
      bonds *= scale;
      cash *= scale;
    }
  }

  return {
    withdrawalSustainability: true,
    yearsUntilDepletion: null,
    portfolioValueAtWithdrawalStart,
    realPortfolioValueAtWithdrawalStart,
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
