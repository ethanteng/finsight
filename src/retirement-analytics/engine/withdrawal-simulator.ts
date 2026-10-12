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
  SPENDING_CUT_TRIGGER,
  SpendingFlexibility,
  WithdrawalPolicy,
} from '../types';
import { mappingFromResolvedExposures } from './portfolio-mapper';
import { planYearCash, type TaxHousehold, type YearCashPlan } from './retirement-cash-plan';
import { requiredDistributionAge, uniformLifetimeDivisor } from './taxes';
import {
  COBRA_ANNUAL_PREMIUM,
  COBRA_MONTHS,
  marketplaceBenchmarkPremium,
  MEDICARE_AGE,
  MEDICARE_ANNUAL_PREMIUM,
  type PreMedicareCoverage,
} from './healthcare';

export interface WithdrawalSimulationOptions {
  withdrawalDelayMonths?: number;
  withdrawalPolicy?: WithdrawalPolicy;
  /** Annual contribution in today's dollars, applied monthly before withdrawals begin. */
  annualContributionAmount?: number;
  /**
   * Incomes (Social Security, pensions) that pay the household directly and so
   * reduce the portfolio withdrawal from `startMonth` until `endMonth`.
   * An `indexed` amount (the default) is in today's dollars and rises with the
   * sequence's own CPI, exactly like the withdrawal it offsets; otherwise it is
   * a fixed nominal amount for the whole sequence. Income above that month's
   * spending is dropped rather than reinvested -- the portfolio withdrawal is
   * floored at zero -- because a saved surplus is an assumption the caller has
   * not made.
   */
  incomeStreams?: SimulatedIncomeStream[];
  /**
   * Spending scaled by `factor` from `startMonth` on: what one survivor spends
   * against what the couple did. It scales whatever the policy has made the
   * withdrawal by then, so it composes with every policy.
   */
  spendingChange?: { startMonth: number; factor: number };
  /**
   * Spending cut by `cutShare` for any withdrawal year that starts with the
   * portfolio more than `SPENDING_CUT_TRIGGER` below its inflation-adjusted
   * value when withdrawals began. Checked at each withdrawal anniversary after
   * the first, so the first year is never cut, and composes with the policy
   * and any spending change. Income is not cut: only what the household
   * spends.
   */
  spendingFlexibility?: SpendingFlexibility;
  /**
   * What the holdings cost to own a year, as a share of their value: the
   * funds' expense ratios. Taken out of every month's return, a twelfth of the
   * annual drag compounded, before contributions and withdrawals.
   */
  annualFeeRate?: number;
  /**
   * Income tax on what the household draws and is paid. With taxes or
   * healthcare, each withdrawal year is planned once, at its start, in
   * today's dollars (`planYearCash`), and its draws are paid out monthly.
   */
  taxes?: SimulatedTaxes;
  /** Health premiums the household pays on top of its spending. */
  healthcare?: SimulatedHealthcare;
  /**
   * The people in the plan, the user first: their ages for the standard
   * deduction, Medicare and premiums, and when each one's plan ends.
   */
  people?: SimulatedPerson[];
}

export interface SimulatedPerson {
  /** Age at month 0. */
  age: number;
  /** First month the person is no longer in the plan; omitted means never. */
  endMonth?: number;
}

export interface SimulatedTaxes {
  /** The portfolio's shares by tax treatment at month 0, summing to 1. */
  accounts: { taxable: number; pretax: number; roth: number };
  /** Cost basis as a share of the taxable account's value at month 0. */
  taxableBasisShare: number;
  /** How the household files while everyone in it is alive; a survivor files single. */
  filing: TaxHousehold;
  /** State income tax on withdrawals, pensions and gains. */
  stateRate: number;
  /**
   * Calendar year at month 0. Required-distribution ages follow SECURE 2.0 by
   * birth year; the owner is the user while alive, then the survivor, each on
   * their own age at that year.
   */
  asOfYear: number;
}

export interface SimulatedHealthcare {
  coverage: PreMedicareCoverage;
  /** A yearly premium per person before 65 that the user stated, replacing the default. */
  annualPremium?: number;
  /** The month each person first needs their own coverage: when withdrawals begin. */
  startMonth: number;
}

export interface SimulatedIncomeStream {
  annualAmount: number;
  /** Months from the start of the sequence. */
  startMonth: number;
  /** First month it is no longer paid; omitted means never. */
  endMonth?: number;
  /** Rises with CPI when true or omitted; a fixed nominal amount when false. */
  indexed?: boolean;
  /** How it is taxed: Social Security by its own formula, everything else as ordinary income. */
  taxedAs?: 'social_security' | 'ordinary';
}

function validateIncomeStreams(streams: readonly SimulatedIncomeStream[]): void {
  for (const stream of streams) {
    if (!Number.isFinite(stream.annualAmount) || stream.annualAmount < 0) {
      throw new Error('Retirement income must be a finite, non-negative amount');
    }
    if (!Number.isFinite(stream.startMonth) || stream.startMonth < 0) {
      throw new Error('Retirement income start month must be a finite, non-negative number of months');
    }
    if (stream.endMonth !== undefined && (!Number.isFinite(stream.endMonth) || stream.endMonth < stream.startMonth)) {
      throw new Error('Retirement income end month must be a finite month no earlier than its start');
    }
  }
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
  const incomeStreams = options.incomeStreams ?? [];
  validateIncomeStreams(incomeStreams);
  const spendingChange = options.spendingChange;
  if (spendingChange && (!Number.isFinite(spendingChange.factor) || spendingChange.factor < 0 || !Number.isFinite(spendingChange.startMonth))) {
    throw new Error('A spending change must be a finite, non-negative factor from a finite month');
  }
  const spendingFactorAt = (month: number) =>
    spendingChange && month >= Math.round(spendingChange.startMonth) ? spendingChange.factor : 1;
  const flexibility = options.spendingFlexibility;
  if (flexibility && (!Number.isFinite(flexibility.cutShare) || flexibility.cutShare < 0 || flexibility.cutShare >= 1)) {
    throw new Error('A spending cut must be a share of spending from 0 up to, but not including, 100%');
  }
  const annualFeeRate = options.annualFeeRate ?? 0;
  if (!Number.isFinite(annualFeeRate) || annualFeeRate < 0 || annualFeeRate >= 1) {
    throw new Error('A fee must be a share of the portfolio a year, from 0 up to, but not including, 100%');
  }
  // Monthly, so a year of it is exactly the annual rate.
  const monthlyFeeFactor = Math.pow(1 - annualFeeRate, 1 / 12);
  let cuttingThisYear = false;
  let monthsSpendingCut = 0;
  const scheduledIncome = incomeStreams
    .filter((stream) => stream.annualAmount > 0)
    .map((stream) => ({
      monthlyAmount: stream.annualAmount / 12,
      startMonth: Math.round(stream.startMonth),
      endMonth: stream.endMonth === undefined ? Number.POSITIVE_INFINITY : Math.round(stream.endMonth),
      indexed: stream.indexed !== false,
      socialSecurity: stream.taxedAs === 'social_security',
    }));
  const taxes = options.taxes;
  const healthcare = options.healthcare;
  const people = options.people ?? [];
  // Planned years: taxes and premiums depend on the year's draws, so each
  // year is solved once at its start and paid out monthly.
  const plannedYears = Boolean(taxes || healthcare);
  if (taxes) {
    const { taxable, pretax, roth } = taxes.accounts;
    const shares = [taxable, pretax, roth, taxes.taxableBasisShare, taxes.stateRate];
    if (
      shares.some((share) => !Number.isFinite(share) || share < 0) ||
      Math.abs(taxable + pretax + roth - 1) > 1e-6 ||
      !Number.isFinite(taxes.asOfYear)
    ) {
      throw new Error('Account shares must be non-negative and sum to 1, with a finite basis share, state rate and as-of year');
    }
  }
  // Every account holds the same mix, so each simply grows with the portfolio.
  const accountShares = taxes?.accounts ?? { taxable: 0, pretax: 0, roth: 1 };
  let taxableAccount = initialPortfolioValue * accountShares.taxable;
  let pretaxAccount = initialPortfolioValue * accountShares.pretax;
  let rothAccount = initialPortfolioValue * accountShares.roth;
  let taxableBasis = taxableAccount * Math.min(1, Math.max(0, taxes?.taxableBasisShare ?? 1));
  let yearPlan: YearCashPlan | undefined;
  let yearPlanMonthlyTotal = 0;
  let firstYearCosts: PortfolioOutcome['firstYearCosts'];
  let usEquity = initialPortfolioValue * w.usEquityWeight;
  let intlEquity = initialPortfolioValue * w.internationalEquityWeight;
  let bonds = initialPortfolioValue * w.nominalBondsWeight;
  let tips = initialPortfolioValue * w.tipsWeight;
  let cash = initialPortfolioValue * w.cashWeight;

  let monthlyWithdrawal = annualWithdrawal / 12;
  const months = sequence.assetBasketReturns.usEquity.length;
  const withdrawalDelayMonths = Math.max(0, Math.round(options.withdrawalDelayMonths || 0));
  let cumulativeInflation = 1;
  let portfolioValueAtWithdrawalStart = initialPortfolioValue;
  let realPortfolioValueAtWithdrawalStart = initialPortfolioValue;
  let realFirstYearPortfolioWithdrawal = 0;

  const portfolioValues: number[] = [initialPortfolioValue];
  let peakValue = initialPortfolioValue;
  let maxDrawdown = 0;
  let drawdownStartMonth: number | null = null;
  let recoveryMonth: number | null = null;

  /** The withdrawal year starting at `month`, planned in today's dollars. */
  const planYearAt = (month: number, cut: number): YearCashPlan => {
    const priceLevel = cumulativeInflation > 0 ? cumulativeInflation : 1;
    const spending = (monthlyWithdrawal * 12 * spendingFactorAt(month) * cut) / priceLevel;
    let ordinaryIncome = 0;
    let socialSecurity = 0;
    for (let m = month; m < month + 12; m++) {
      for (const stream of scheduledIncome) {
        if (m < stream.startMonth || m >= stream.endMonth) continue;
        const real = stream.indexed ? stream.monthlyAmount : stream.monthlyAmount / priceLevel;
        if (stream.socialSecurity) socialSecurity += real;
        else ordinaryIncome += real;
      }
    }
    const alive = people.filter((person) => person.endMonth === undefined || month < person.endMonth);
    const ageOf = (person: SimulatedPerson) => person.age + month / 12;

    let fixedPremiums = 0;
    let marketplaceBenchmark = 0;
    let marketplacePeople = 0;
    if (healthcare && month >= healthcare.startMonth) {
      for (const person of alive) {
        const age = ageOf(person);
        const monthsBeforeMedicare = Math.min(12, Math.max(0, Math.round((MEDICARE_AGE - age) * 12)));
        fixedPremiums += MEDICARE_ANNUAL_PREMIUM * (12 - monthsBeforeMedicare) / 12;
        if (monthsBeforeMedicare === 0) continue;
        if (healthcare.annualPremium !== undefined) {
          fixedPremiums += healthcare.annualPremium * monthsBeforeMedicare / 12;
          continue;
        }
        if (healthcare.coverage === 'marketplace') {
          marketplaceBenchmark += marketplaceBenchmarkPremium(age) * monthsBeforeMedicare / 12;
          marketplacePeople += monthsBeforeMedicare / 12;
        } else if (healthcare.coverage === 'cobra') {
          const cobraMonths = Math.min(monthsBeforeMedicare, Math.max(0, COBRA_MONTHS - (month - healthcare.startMonth)));
          fixedPremiums += COBRA_ANNUAL_PREMIUM * cobraMonths / 12;
          const marketplaceMonths = monthsBeforeMedicare - cobraMonths;
          marketplaceBenchmark += marketplaceBenchmarkPremium(age) * marketplaceMonths / 12;
          marketplacePeople += marketplaceMonths / 12;
        }
        // An employer retiree plan with no stated premium, or a spouse's
        // plan, adds nothing; the answer says so.
      }
    }

    // Required distributions follow the user while alive, then the survivor,
    // each on their own birth year (SECURE 2.0).
    const owner = alive[0];
    const ownerAge = owner ? ageOf(owner) : undefined;
    const ownerRmdAge = owner && taxes
      ? requiredDistributionAge(taxes.asOfYear - Math.floor(owner.age))
      : undefined;
    const divisor = ownerAge !== undefined && ownerRmdAge !== undefined && ownerAge >= ownerRmdAge
      ? uniformLifetimeDivisor(ownerAge)
      : undefined;
    const pretax = pretaxAccount / priceLevel;
    const household: TaxHousehold = taxes && alive.length >= 2 ? taxes.filing : 'single';
    return planYearCash({
      spending,
      ordinaryIncome,
      socialSecurity,
      balances: { taxable: taxableAccount / priceLevel, pretax, roth: rothAccount / priceLevel },
      taxableBasis: taxableBasis / priceLevel,
      requiredDistribution: divisor ? pretax / divisor : 0,
      ...(taxes && {
        tax: {
          household,
          peopleAged65: alive.filter((person) => ageOf(person) >= 65).length,
          stateRate: taxes.stateRate,
          priceLevel,
        },
      }),
      ...(healthcare && {
        healthcare: {
          fixedPremiums,
          marketplaceBenchmark,
          marketplacePeople,
          householdSize: Math.max(1, alive.length),
        },
      }),
    });
  };

  /**
   * One month of a planned year: a twelfth of each account's draw, in this
   * month's dollars, falling back to the next account in order when one has
   * run dry, and the reinvested distribution added to the taxable account.
   * Returns what leaves the portfolio, including any spending the year could
   * not cover, so a plan that runs out is depleted.
   */
  const payPlannedMonth = (plan: YearCashPlan, perMonth: number): number => {
    const fromTaxable = (amount: number) => {
      const taken = Math.min(amount, taxableAccount);
      if (taxableAccount > 0) taxableBasis -= taxableBasis * (taken / taxableAccount);
      taxableAccount -= taken;
      return amount - taken;
    };
    const fromPretax = (amount: number) => {
      const taken = Math.min(amount, pretaxAccount);
      pretaxAccount -= taken;
      return amount - taken;
    };
    const fromRoth = (amount: number) => {
      const taken = Math.min(amount, rothAccount);
      rothAccount -= taken;
      return amount - taken;
    };
    fromRoth(fromPretax(fromTaxable(plan.draws.taxable * perMonth)));
    fromTaxable(fromRoth(fromPretax(plan.draws.pretax * perMonth)));
    fromTaxable(fromPretax(fromRoth(plan.draws.roth * perMonth)));
    const reinvested = plan.reinvested * perMonth;
    taxableAccount += reinvested;
    taxableBasis += reinvested;
    return Math.max(0, (plan.draws.taxable + plan.draws.pretax + plan.draws.roth - plan.reinvested + plan.shortfall) * perMonth);
  };

  for (let month = 0; month < months; month++) {
    // Each withdrawal anniversary decides the coming year from the balance
    // carried into it -- before this month's return and inflation -- in
    // today's dollars: cut while it is more than the trigger below where the
    // portfolio stood when withdrawals began.
    if (flexibility && month > withdrawalDelayMonths && (month - withdrawalDelayMonths) % 12 === 0) {
      const carried = usEquity + intlEquity + bonds + tips + cash;
      const realCarried = cumulativeInflation > 0 ? carried / cumulativeInflation : carried;
      cuttingThisYear = realCarried < realPortfolioValueAtWithdrawalStart * (1 - SPENDING_CUT_TRIGGER);
    }
    const valueBeforeReturns = usEquity + intlEquity + bonds + tips + cash;
    const usRet = sequence.assetBasketReturns.usEquity[month] ?? 0;
    const intlRet = sequence.assetBasketReturns.internationalEquity[month] ?? 0;
    const bondRet = sequence.assetBasketReturns.nominalBonds[month] ?? 0;
    const tipsRet = sequence.assetBasketReturns.tips[month] ?? 0;
    const cashRet = sequence.assetBasketReturns.cash[month] ?? 0;

    usEquity *= (1 + usRet) * monthlyFeeFactor;
    intlEquity *= (1 + intlRet) * monthlyFeeFactor;
    bonds *= (1 + bondRet) * monthlyFeeFactor;
    tips *= (1 + tipsRet) * monthlyFeeFactor;
    cash *= (1 + cashRet) * monthlyFeeFactor;

    let portfolioValue = usEquity + intlEquity + bonds + tips + cash;
    if (plannedYears && valueBeforeReturns > 0) {
      const growth = portfolioValue / valueBeforeReturns;
      taxableAccount *= growth;
      pretaxAccount *= growth;
      rothAccount *= growth;
    }

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
      tips += monthlyContribution * w.tipsWeight;
      cash += monthlyContribution * w.cashWeight;
      portfolioValue += monthlyContribution;
      if (plannedYears) {
        // New savings go where the existing ones are, in the same proportions.
        const accounts = taxableAccount + pretaxAccount + rothAccount;
        const toTaxable = accounts > 0 ? monthlyContribution * (taxableAccount / accounts) : monthlyContribution * accountShares.taxable;
        const toPretax = accounts > 0 ? monthlyContribution * (pretaxAccount / accounts) : monthlyContribution * accountShares.pretax;
        taxableAccount += toTaxable;
        taxableBasis += toTaxable;
        pretaxAccount += toPretax;
        rothAccount += monthlyContribution - toTaxable - toPretax;
      }
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
    // Indexed income rises on the same cumulative CPI as the withdrawal it
    // offsets, so the two stay in the same real units for the whole sequence; a
    // fixed amount stays nominal and loses ground to that same CPI. Income only
    // applies while withdrawing: before that the household is not drawing on
    // the portfolio, and this simulation does not bank the difference.
    let incomeThisMonth = 0;
    for (const stream of scheduledIncome) {
      if (month >= stream.startMonth && month < stream.endMonth) {
        incomeThisMonth += stream.indexed ? stream.monthlyAmount * cumulativeInflation : stream.monthlyAmount;
      }
    }
    const cut = flexibility && cuttingThisYear ? 1 - flexibility.cutShare : 1;
    if (withdrawing && cut < 1) monthsSpendingCut += 1;
    let withdrawalThisMonth = withdrawing
      ? Math.max(0, monthlyWithdrawal * spendingFactorAt(month) * cut - incomeThisMonth)
      : 0;
    if (plannedYears && withdrawing) {
      if (month === withdrawalDelayMonths || (month - withdrawalDelayMonths) % 12 === 0) {
        yearPlan = planYearAt(month, cut);
        const { draws, reinvested, shortfall } = yearPlan;
        yearPlanMonthlyTotal = (draws.taxable + draws.pretax + draws.roth - reinvested + shortfall) / 12;
        if (month === withdrawalDelayMonths) {
          firstYearCosts = {
            federalTax: yearPlan.federalTax,
            stateTax: yearPlan.stateTax,
            healthcarePremiums: yearPlan.premiums,
            premiumTaxCredit: yearPlan.premiumTaxCredit,
          };
        }
      }
      withdrawalThisMonth = payPlannedMonth(yearPlan!, cumulativeInflation / 12);
    }
    if (withdrawing && month < withdrawalDelayMonths + 12 && cumulativeInflation > 0) {
      realFirstYearPortfolioWithdrawal += withdrawalThisMonth / cumulativeInflation;
    }
    portfolioValue = Math.max(0, portfolioValue - withdrawalThisMonth);

    if (portfolioValue <= 0) {
      // Finish the first-year scheduled draw under this sequence's inflation
      // even though the portfolio is gone. The metric is the plan's need in
      // those twelve months (spending less income), not cash remaining to pay
      // it — otherwise a sequence that fails in month one understates the
      // median first-year figure for underfunded plans.
      const firstYearEnd = withdrawalDelayMonths + 12;
      if (plannedYears) {
        realFirstYearPortfolioWithdrawal += yearPlanMonthlyTotal * Math.max(0, Math.min(months, firstYearEnd) - month - 1);
      }
      for (let m = month + 1; !plannedYears && m < months && m < firstYearEnd; m++) {
        const laterInflation = sequence.inflationRates[m] ?? 0;
        cumulativeInflation *= 1 + laterInflation;
        if (withdrawalPolicy.type === 'historical_cpi' || m <= withdrawalDelayMonths) {
          monthlyWithdrawal *= 1 + laterInflation;
        } else if (
          withdrawalPolicy.type === 'fixed_growth' &&
          m > withdrawalDelayMonths &&
          (m - withdrawalDelayMonths) % 12 === 0
        ) {
          monthlyWithdrawal *= 1 + withdrawalPolicy.annualRate;
        }
        let laterIncome = 0;
        for (const stream of scheduledIncome) {
          if (m >= stream.startMonth && m < stream.endMonth) {
            laterIncome += stream.indexed ? stream.monthlyAmount * cumulativeInflation : stream.monthlyAmount;
          }
        }
        if (cumulativeInflation > 0) {
          realFirstYearPortfolioWithdrawal += Math.max(0, monthlyWithdrawal * spendingFactorAt(m) - laterIncome) / cumulativeInflation;
        }
      }
      return {
        withdrawalSustainability: false,
        yearsUntilDepletion: Math.max(0, month - withdrawalDelayMonths) / 12,
        portfolioValueAtWithdrawalStart,
        realPortfolioValueAtWithdrawalStart,
        realFirstYearPortfolioWithdrawal,
        finalValue: 0,
        maximumDrawdown: maxDrawdown,
        timeToRecovery: recoveryMonth != null ? recoveryMonth - (drawdownStartMonth ?? 0) : null,
        realReturn: calculateRealReturn(portfolioValues, sequence.inflationRates),
        ...(flexibility && { monthsSpendingCut }),
        ...(firstYearCosts && { firstYearCosts }),
      };
    }

    portfolioValues.push(portfolioValue);
    if (plannedYears) {
      // Keep the accounts summing to the portfolio the sleeves hold, and scale
      // basis with the taxable account so a crash cannot inflate the basis share.
      const accounts = taxableAccount + pretaxAccount + rothAccount;
      if (accounts > 0) {
        const scale = portfolioValue / accounts;
        taxableAccount *= scale;
        pretaxAccount *= scale;
        rothAccount *= scale;
        taxableBasis *= scale;
      }
      taxableBasis = Math.min(Math.max(0, taxableBasis), taxableAccount);
    }

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
      tips = portfolioValue * w.tipsWeight;
      cash = portfolioValue * w.cashWeight;
    } else {
      // Withdrawal applied to total; scale sleeves proportionally to match new total
      const scale = portfolioValue / (portfolioValue + withdrawalThisMonth);
      usEquity *= scale;
      intlEquity *= scale;
      bonds *= scale;
      tips *= scale;
      cash *= scale;
    }
  }

  return {
    withdrawalSustainability: true,
    yearsUntilDepletion: null,
    portfolioValueAtWithdrawalStart,
    realPortfolioValueAtWithdrawalStart,
    realFirstYearPortfolioWithdrawal,
    finalValue: usEquity + intlEquity + bonds + tips + cash,
    maximumDrawdown: maxDrawdown,
    timeToRecovery: recoveryMonth != null ? recoveryMonth - (drawdownStartMonth ?? 0) : null,
    realReturn: calculateRealReturn(portfolioValues, sequence.inflationRates),
    ...(flexibility && { monthsSpendingCut }),
    ...(firstYearCosts && { firstYearCosts }),
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
