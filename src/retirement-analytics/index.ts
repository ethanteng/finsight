// Retirement Portfolio Analysis Module - Main Entry Point
// Orchestrates Phases 1-6

import {
  DEFAULT_SHORT_SERIES_POLICY,
  PortfolioOutcome,
  RetirementAnalysisInput,
  RetirementAnalysisOutput,
  SPENDING_CUT_TRIGGER,
  SpendingFlexibility,
  SpendingFlexibilityOutcome,
} from './types';
import { analyzePortfolio } from './engine/portfolio-analyzer';
import {
  mapPortfolioToAssetBasket,
  NoSupportedSimulationValueError,
  populateAssumptions,
} from './engine/portfolio-mapper';
import { DataProviderFactory } from './data/data-provider-factory';
import { isTreasuryCusip, treasuryProvider } from './data/providers/treasury-provider';
import {
  calculateHistoricalPriceCoverage,
  generateRollingSequences,
  sliceHistoricalSequence,
  snapToHorizonBucket,
} from './engine/stress-tester';
import { computeHistoricalWithdrawalRates } from './engine/withdrawal-rate-solver';
import {
  simulateWithdrawals,
  type SimulatedHealthcare,
  type SimulatedPerson,
  type SimulatedTaxes,
} from './engine/withdrawal-simulator';
import { requiredDistributionAge } from './engine/taxes';
import { analyzeOutcomes } from './engine/outcome-analyzer';
import { assessPortfolioCharacteristics } from './engine/characteristics-assessor';
import { formatAnalysisOutput } from './interpretation/analysis-formatter';
import { calculateDataQuality } from './interpretation/uncertainty-quantifier';
import { ensureAppliedRegistryEntries } from '../services/target-date-registry-store';

export function buildRetirementTimeline(input: Pick<
  RetirementAnalysisInput,
  'currentAge' | 'retirementAge' | 'withdrawalStartAge' | 'lifeExpectancy'
>) {
  const yearsToWithdrawalStart = Math.max(0, input.withdrawalStartAge - input.currentAge);
  const withdrawalYears = input.lifeExpectancy - input.withdrawalStartAge;
  const totalAnalysisYears = yearsToWithdrawalStart + withdrawalYears;
  if (withdrawalYears <= 0 || totalAnalysisYears <= 0) {
    throw new Error('Withdrawal start age must be before life expectancy');
  }
  return {
    yearsToRetirement: input.retirementAge ? input.retirementAge - input.currentAge : -1,
    yearsToWithdrawalStart,
    withdrawalYears,
    totalAnalysisYears,
    withdrawalDelayMonths: Math.round(yearsToWithdrawalStart * 12),
  };
}

/**
 * Main entry point for retirement portfolio analysis
 * 
 * @param input - User inputs including portfolio data, age, withdrawal assumptions
 * @returns Structured analysis output ready for LLM consumption
 */
export async function analyzeRetirementPortfolio(
  input: RetirementAnalysisInput
): Promise<RetirementAnalysisOutput> {
  // Phase 2: Initialize data providers (needed for FMP metadata)
  const tiingoApiKey = process.env.TIINGO_API_KEY || 'test_tiingo_key';
  // Missing production configuration is not a test fixture. Passing an empty
  // key lets FMPProvider degrade to explicitly inferred metadata.
  const fmpApiKey = process.env.FMP_API_KEY?.trim() || '';
  
  // Log FMP API key status (without exposing the actual key)
  if (!fmpApiKey) {
    console.warn('⚠️ FMP_API_KEY not set - FMP metadata will use inference only');
  } else {
    console.log('✅ FMP_API_KEY is set - will attempt to fetch real metadata');
  }
  
  const dataProviderFactory = new DataProviderFactory(tiingoApiKey, fmpApiKey);

  // OPTIMIZATION: Fetch FMP metadata once for all unique tickers, then share between functions
  // This avoids duplicate API calls between analyzePortfolio and mapPortfolioToAssetBasket
  const tickerToMetadata = new Map<string, any>();
  if (dataProviderFactory) {
    const uniqueTickers = new Set<string>();
    const securityMap = new Map(input.securities.map(sec => [sec.security_id, sec]));
    
    for (const holding of input.holdings) {
      const security = securityMap.get(holding.security_id);
      const ticker = security?.ticker_symbol?.toUpperCase() || holding.ticker_symbol?.toUpperCase();
      if (ticker && ticker.length > 0 && ticker.length <= 10) {
        uniqueTickers.add(ticker);
      }
    }

    if (uniqueTickers.size > 0) {
      console.log(`📊 FMP: Fetching metadata once for ${uniqueTickers.size} unique tickers: ${Array.from(uniqueTickers).slice(0, 10).join(', ')}${uniqueTickers.size > 10 ? '...' : ''}`);
      // Use batch fetch to avoid N+1 queries on security_metadata
      const batchResult = await dataProviderFactory.getSecurityMetadataBatch(Array.from(uniqueTickers));
      for (const [ticker, metadata] of batchResult) {
        tickerToMetadata.set(ticker, metadata);
      }
      console.log(`✅ FMP: Successfully fetched metadata for ${batchResult.size}/${uniqueTickers.size} tickers (batch, shared across functions)`);
    }
  }

  // Target-date publications applied from the admin panel live in the
  // database; the registry lookup inside the mapper reads an in-memory copy.
  await ensureAppliedRegistryEntries();

  // Phase 1: Resolve holdings once, then derive both simulation weights and
  // published composition metrics from that same auditable mapping.
  const totalValue = input.holdings.reduce((sum, h) => sum + (h.institution_value || 0), 0);
  // Passed explicitly rather than left to the mapper's clock default. The
  // registry must not use an allocation published after the snapshot, and a
  // replay must select the same newest-eligible entry. Legacy year-only callers
  // are interpreted at year-end; production supplies the full UTC date.
  const asOfDate = input.asOfDate
    ?? (input.asOfYear != null ? input.asOfYear : new Date().toISOString().slice(0, 10));
  // Resolve every Treasury CUSIP in the book against the issuer's auction
  // records. Individual Treasury lines carry no ticker, so nothing above
  // reaches them; this is the only evidence that separates a TIPS issue from
  // the nominal note its name is indistinguishable from. An unreachable
  // service yields an empty map and classification falls back to the name.
  const cusips = input.securities
    .map(security => security.cusip)
    .filter((cusip): cusip is string => typeof cusip === 'string' && cusip.trim().length > 0);
  // Lines no CUSIP can speak for, offered to the same records by name. Only
  // Plaid sends a CUSIP, so on a SnapTrade book this is every Treasury in it.
  // The provider decides which of these labels name a Treasury at all; sending
  // the whole set spares this layer a second reading of the same strings.
  const treasuryLabels = input.securities
    .filter(security => !isTreasuryCusip(String(security.cusip ?? '')))
    .map(security => String(security.name ?? ''))
    .filter(name => name.trim().length > 0);
  const {
    securities: treasuryByCusip,
    byLabel: treasuryByLabel,
    degraded: treasuryEvidenceDegraded,
  } = cusips.length > 0 || treasuryLabels.length > 0
    ? await treasuryProvider.getTreasurySecurityBatch(cusips, treasuryLabels)
    : { securities: new Map(), byLabel: new Map(), degraded: false };
  if (treasuryByCusip.size > 0 || treasuryByLabel.size > 0) {
    console.log(
      `🏛️ Treasury: resolved ${treasuryByCusip.size} securities from auction records ` +
      `(${treasuryByLabel.size} by name)`,
    );
  }

  const portfolioMapping = await mapPortfolioToAssetBasket(input.holdings, input.securities, totalValue, dataProviderFactory, tickerToMetadata, asOfDate, treasuryByCusip, treasuryByLabel);
  const modeledValue = portfolioMapping.mappedValue;
  // Classification may leave only TIPS / credit / international bonds / real
  // assets / unresolved geography. Those are disclosed, not simulated — a
  // zero starting basis would make every sequence deplete and pin the solver
  // at its 2% floor.
  if (!(modeledValue > 0.005)) {
    throw new NoSupportedSimulationValueError(
      portfolioMapping.totalValue,
      portfolioMapping.unsupportedValue,
      portfolioMapping.unrecognizedValue,
    );
  }
  const portfolioMetrics = await analyzePortfolio(
    input.holdings,
    input.securities,
    dataProviderFactory,
    tickerToMetadata,
    portfolioMapping.holdingExposures,
    asOfDate,
  );
  const assumptions = populateAssumptions(portfolioMapping, input.holdings, input.securities);
  // What the funds cost to own, taken out of every month's return. Only fees
  // the data names are known; the rest of the portfolio is counted as free,
  // and the assumption says how much that is.
  const annualFeeRate = Number.isFinite(portfolioMetrics.expenseRatioWeighted) && portfolioMetrics.expenseRatioWeighted > 0
    ? Math.min(portfolioMetrics.expenseRatioWeighted, 0.05)
    : 0;
  assumptions.push(
    annualFeeRate > 0
      ? `Fund fees of ${(annualFeeRate * 100).toFixed(2)}% a year are taken out of returns, from the expense ratios of ` +
        `holdings making up ${Math.round(portfolioMetrics.expenseRatioCoverage * 100)}% of the portfolio; the rest is counted as costing nothing`
      : `No fund fees are taken out of returns: none of the holdings has a known expense ratio above zero ` +
        `(${Math.round(portfolioMetrics.expenseRatioCoverage * 100)}% of the portfolio has a known fee)`
  );
  const withdrawalPolicy = input.withdrawalPolicy ?? { type: 'historical_cpi' as const };
  const annualContributionAmount = input.annualContributionAmount ?? 0;
  if (!Number.isFinite(annualContributionAmount) || annualContributionAmount < 0) {
    throw new Error('Annual contributions must be a finite, non-negative amount');
  }
  assumptions.push(
    withdrawalPolicy.type === 'historical_cpi'
      ? 'Retirement spending rises with each historical sequence\'s CPI after withdrawals begin (constant real spending)'
      : withdrawalPolicy.type === 'flat_nominal'
        ? 'Retirement spending stays at the same nominal dollar amount after withdrawals begin'
        : `Retirement spending rises ${withdrawalPolicy.annualRate * 100}% on each withdrawal anniversary`
  );

  // Income the household receives directly. It never adds to the portfolio; it
  // only reduces what the portfolio has to pay out while it is paid, which is
  // why each stream is expressed to the simulator as months from today.
  const paidIncome = (input.incomeStreams ?? []).filter((stream) => {
    if (!Number.isFinite(stream.annualAmount) || stream.annualAmount < 0) {
      throw new Error('Retirement income must be a finite, non-negative amount');
    }
    if (!Number.isFinite(stream.startAge)) {
      throw new Error('Retirement income start age must be a finite age');
    }
    if (stream.endAge !== undefined && (!Number.isFinite(stream.endAge) || stream.endAge <= stream.startAge)) {
      throw new Error('Retirement income must end after it starts');
    }
    return stream.annualAmount > 0 && (stream.endAge === undefined || stream.endAge > input.currentAge);
  });
  const monthsFromNow = (age: number) => Math.max(0, Math.round((age - input.currentAge) * 12));
  const incomeStreams = paidIncome.map((stream) => ({
    annualAmount: stream.annualAmount,
    startMonth: monthsFromNow(stream.startAge),
    ...(stream.endAge !== undefined && { endMonth: monthsFromNow(stream.endAge) }),
    indexed: stream.inflationAdjusted !== false,
    taxedAs: stream.taxedAs ?? (/social security|spousal|survivor/i.test(stream.label ?? '') ? 'social_security' as const : 'ordinary' as const),
  }));

  // Spending after the first death, as a share of what the couple spends, so
  // it follows whatever path the withdrawal policy gives the couple's amount.
  const survivorSpending = input.survivorSpending;
  if (survivorSpending && (
    !Number.isFinite(survivorSpending.annualAmount) || survivorSpending.annualAmount < 0 ||
    !Number.isFinite(survivorSpending.fromAge)
  )) {
    throw new Error('Survivor spending must be a finite, non-negative amount from a finite age');
  }
  const spendingChange = survivorSpending && input.annualWithdrawalAmount > 0
    ? { startMonth: monthsFromNow(survivorSpending.fromAge), factor: survivorSpending.annualAmount / input.annualWithdrawalAmount }
    : undefined;

  // Model the full path from today through life expectancy, including explicit
  // pre-withdrawal contributions when the scenario supplies them.
  const timeline = buildRetirementTimeline(input);

  // Taxes and premiums: who is in the plan, how the money is held, and what
  // coverage costs from the first withdrawal on.
  const people: SimulatedPerson[] = [
    {
      age: input.currentAge,
      ...(input.people?.userPlanThroughAge !== undefined && input.people.userPlanThroughAge < input.lifeExpectancy && {
        endMonth: monthsFromNow(input.people.userPlanThroughAge),
      }),
    },
    ...(input.people?.partner ? [{
      age: input.people.partner.age,
      ...(input.people.partner.planEndsAtUserAge < input.lifeExpectancy && {
        endMonth: monthsFromNow(input.people.partner.planEndsAtUserAge),
      }),
    }] : []),
  ];
  const asOfYear = typeof asOfDate === 'number' ? asOfDate : Number(String(asOfDate).slice(0, 4));
  const simulatedTaxes: SimulatedTaxes | undefined = input.taxes && {
    ...input.taxes,
    requiredDistributionAge: requiredDistributionAge((Number.isFinite(asOfYear) ? asOfYear : new Date().getUTCFullYear()) - input.currentAge),
  };
  const simulatedHealthcare: SimulatedHealthcare | undefined = input.healthcare && {
    coverage: input.healthcare.coverage,
    ...(input.healthcare.annualPremium !== undefined && { annualPremium: input.healthcare.annualPremium }),
    startMonth: timeline.withdrawalDelayMonths,
  };
  if (simulatedTaxes) {
    const { taxable, pretax, roth } = simulatedTaxes.accounts;
    const share = (value: number) => `${Math.round(value * 100)}%`;
    assumptions.push(
      `Income tax on each year's draws and income at 2026 federal rates held level in today's dollars ` +
      `(${simulatedTaxes.filing === 'joint' ? 'married filing jointly' : simulatedTaxes.filing === 'separate_singles' ? 'two single returns' : 'single'}` +
      `${simulatedTaxes.stateRate > 0 ? `, plus ${(simulatedTaxes.stateRate * 100).toFixed(2)}% state tax` : ''}); ` +
      `accounts ${share(taxable)} taxable, ${share(pretax)} pre-tax and ${share(roth)} Roth, drawn in that order, with ` +
      `required minimum distributions from ${simulatedTaxes.requiredDistributionAge}`
    );
  }
  if (simulatedHealthcare) {
    assumptions.push(
      `Health premiums on top of spending from the first withdrawal: ${simulatedHealthcare.coverage.replace('_', ' ')} coverage ` +
      'before 65, then Medicare Part B and Part D base premiums'
    );
  }
  if (simulatedTaxes || simulatedHealthcare) {
    // The solver's rates come from withdrawals alone, so they stay before tax
    // and premiums; solving them after both would plan every year of every
    // candidate rate.
    assumptions.push('Historical sustainable withdrawal rates are before income tax and health premiums');
  }
  const { yearsToWithdrawalStart, withdrawalYears, totalAnalysisYears, withdrawalDelayMonths } = timeline;
  if (yearsToWithdrawalStart > 0) {
    assumptions.push(
      annualContributionAmount > 0
        ? `Portfolio grows for ${yearsToWithdrawalStart} years before withdrawals begin with $${annualContributionAmount.toLocaleString('en-US')} in annual contributions, indexed with historical CPI`
        : `Portfolio grows for ${yearsToWithdrawalStart} years before withdrawals begin; no additional contributions are assumed`
    );
  }
  for (const stream of paidIncome) {
    const startAge = Math.max(input.currentAge, stream.startAge);
    const amount = `$${Math.round(stream.annualAmount).toLocaleString('en-US')}`;
    const what = stream.label ?? 'retirement income';
    const period = stream.endAge !== undefined
      ? `from age ${startAge} until age ${stream.endAge}`
      : `from age ${startAge}`;
    assumptions.push(
      (stream.inflationAdjusted !== false
        ? `${amount} a year of ${what} in today's dollars is paid ${period} and rises with each historical sequence's CPI`
        : `${amount} a year of ${what} is paid ${period} as a fixed dollar amount, so each historical sequence's inflation erodes it, including before it starts`) +
      '; it reduces that month\'s portfolio withdrawal, and income above that month\'s spending is not reinvested'
    );
  }
  if (survivorSpending && spendingChange) {
    assumptions.push(
      `From age ${survivorSpending.fromAge}, spending is $${Math.round(survivorSpending.annualAmount).toLocaleString('en-US')} ` +
      'a year in today\'s dollars, what one survivor spends, in place of the couple\'s amount'
    );
  }
  const spendingFlexibility = input.spendingFlexibility;
  const flexibilityComparison = spendingFlexibility ? undefined : input.spendingFlexibilityComparison;
  for (const flexibility of [spendingFlexibility, flexibilityComparison]) {
    if (flexibility && (!Number.isFinite(flexibility.cutShare) || flexibility.cutShare <= 0 || flexibility.cutShare >= 1)) {
      throw new Error('A spending cut must be a share of spending above 0 and below 100%');
    }
  }
  if (spendingFlexibility) {
    assumptions.push(
      `Spending is cut ${Math.round(spendingFlexibility.cutShare * 100)}% for any withdrawal year that starts with the portfolio ` +
      `more than ${Math.round(SPENDING_CUT_TRIGGER * 100)}% below its inflation-adjusted value when withdrawals began, ` +
      'and is full again once it recovers'
    );
  }

  const timelineBucket = snapToHorizonBucket(withdrawalYears);
  const timelineBucketNote = yearsToWithdrawalStart > 0
    ? annualContributionAmount > 0
      ? `Historical sequences include ${yearsToWithdrawalStart} years of pre-withdrawal growth with $${annualContributionAmount.toLocaleString('en-US')} in annual contributions, stated in today's dollars, before the ${withdrawalYears}-year withdrawal period.`
      : `Historical sequences include ${yearsToWithdrawalStart} years of pre-withdrawal growth with no additional contributions before the ${withdrawalYears}-year withdrawal period.`
    : 'Withdrawals begin immediately; no pre-withdrawal accumulation period is modeled.';

  // Phase 3: Generate rolling sequences (with graceful degradation)
  const {
    sequences,
    missingData: stressTestMissingData,
    historicalData,
  } = await generateRollingSequences(
    totalAnalysisYears,
    portfolioMapping,
    50, // minHistoryYears
    input.shortSeriesPolicy ?? DEFAULT_SHORT_SERIES_POLICY
  );
  if (historicalData) {
    assumptions.push(
      `Historical simulation uses ${historicalData.firstMonth} through ${historicalData.lastMonth}; ` +
      'monthly rolling start windows overlap and are not statistically independent observations'
    );
    // A substituted sleeve is an assumption about the tested window, so it is
    // stated alongside the window rather than left in the structured output for
    // a caller to find.
    for (const proxied of historicalData.proxiedSeries ?? []) {
      const periods = proxied.ranges
        .map(range => (range.months === 1 ? range.firstMonth : `${range.firstMonth} through ${range.lastMonth}`))
        .join(' and ');
      assumptions.push(
        `${proxied.description} — ${periods} (${proxied.months} of ` +
        `${proxied.windowMonths} months tested)`
      );
    }
  }

  // Phase 3b: Compute historical withdrawal rate distribution (before user scenario)
  const withdrawalSequences = withdrawalDelayMonths > 0
    ? sequences.map(sequence => sliceHistoricalSequence(sequence, withdrawalDelayMonths))
    : sequences;
  const historicalWithdrawalRates = computeHistoricalWithdrawalRates(
    withdrawalSequences,
    portfolioMapping,
    modeledValue,
    withdrawalPolicy,
    annualFeeRate
  );

  // Phase 4: Simulate withdrawals for user scenario
  const simulate = (flexibility?: SpendingFlexibility) => sequences.map(sequence =>
    simulateWithdrawals(
      portfolioMapping,
      modeledValue,
      sequence,
      input.annualWithdrawalAmount,
      {
        withdrawalDelayMonths,
        withdrawalPolicy,
        annualContributionAmount,
        incomeStreams,
        ...(annualFeeRate > 0 && { annualFeeRate }),
        ...(simulatedTaxes && { taxes: simulatedTaxes }),
        ...(simulatedHealthcare && { healthcare: simulatedHealthcare }),
        ...((simulatedTaxes || simulatedHealthcare) && { people }),
        ...(spendingChange && { spendingChange }),
        ...(flexibility && { spendingFlexibility: flexibility }),
      }
    )
  );
  const outcomes = simulate(spendingFlexibility);
  // The comparison is the same plan with a cut: survival and how often it
  // cut, never the plan's own figures.
  const comparisonOutcomes = flexibilityComparison ? simulate(flexibilityComparison) : undefined;

  // Attach outcomes to sequences
  sequences.forEach((seq, idx) => {
    seq.portfolioOutcome = outcomes[idx];
  });

  // Phase 5: Analyze outcomes and assess characteristics
  const stressTestResults = analyzeOutcomes(
    outcomes,
    sequences,
    sequences.length,
    historicalWithdrawalRates
  );
  const modeledEquityAllocation =
    (portfolioMapping.usEquityWeight + portfolioMapping.internationalEquityWeight) * 100;
  const assessment = assessPortfolioCharacteristics(
    outcomes,
    stressTestResults,
    modeledEquityAllocation,
    timelineBucket
  );

  // Calculate withdrawal sustainability metrics
  const projectedStartValues = outcomes
    .map(outcome => outcome.realPortfolioValueAtWithdrawalStart)
    .filter(value => Number.isFinite(value))
    .sort((left, right) => left - right);
  const medianProjectedStartValue = projectedStartValues.length === 0
    ? modeledValue
    : projectedStartValues[Math.floor(projectedStartValues.length / 2)];
  const withdrawalRate = medianProjectedStartValue > 0
    ? input.annualWithdrawalAmount / medianProjectedStartValue
    : 0;
  const yearsOfExpenses = input.annualWithdrawalAmount > 0
    ? medianProjectedStartValue / input.annualWithdrawalAmount
    : 0;
  const firstYearWithdrawals = outcomes
    .map(outcome => outcome.realFirstYearPortfolioWithdrawal)
    .filter(value => Number.isFinite(value))
    .sort((left, right) => left - right);
  // Summed from twelve monthly draws, so rounded to cents rather than
  // reporting $95,000.00000000001 for a plan that withdraws exactly $95,000.
  const medianFirstYearPortfolioWithdrawal = firstYearWithdrawals.length === 0
    ? 0
    : Math.round(firstYearWithdrawals[Math.floor(firstYearWithdrawals.length / 2)] * 100) / 100;

  const priceHistoryCoverage = calculateHistoricalPriceCoverage(portfolioMapping);

  // Phase 6: Calculate data quality and format output
  // Include missing data from stress test in data quality report
  const dataQuality = calculateDataQuality(
    input.holdings,
    input.securities,
    portfolioMapping,
    priceHistoryCoverage,
    assumptions,
    stressTestMissingData,
    // Value the caller measured as unmodellable. The engine never simulates
    // it -- it reports it, so the results read as a floor rather than an
    // estimate. See docs/FINANCIAL_TRUTH_CONTRACT.md.
    input.unmodeledInvestments
  );

  const withdrawalMetrics = {
    withdrawalRate,
    yearsOfExpenses,
    projectedPortfolioAtWithdrawalStart: medianProjectedStartValue,
    firstYearPortfolioWithdrawal: medianFirstYearPortfolioWithdrawal,
    yearsToWithdrawalStart,
    historicalWithdrawalRates: stressTestResults.historicalWithdrawalRates,
    withdrawalFailureRate: 1 - stressTestResults.survivalRate,
    worstCaseDepletionYear: stressTestResults.depletionPercentiles.p10
  };

  const timelineMetrics = {
    yearsToRetirement: timeline.yearsToRetirement,
    withdrawalYears,
    withdrawalYearsOriginal: withdrawalYears,
    withdrawalMonths: withdrawalYears * 12,
    timelineBucket
  };

  const analysis = formatAnalysisOutput(
    assessment,
    stressTestResults,
    portfolioMetrics,
    timelineMetrics,
    withdrawalMetrics,
    dataQuality,
    timelineBucketNote,
    historicalData,
    modeledEquityAllocation,
  );

  // Only set when true, so an analysis that used every source it wanted
  // serializes exactly as it did before.
  return {
    ...analysis,
    feesDeducted: { annualRate: annualFeeRate, coverage: portfolioMetrics.expenseRatioCoverage },
    ...((simulatedTaxes || simulatedHealthcare) && { firstYearCosts: medianFirstYearCosts(outcomes) }),
    ...(treasuryEvidenceDegraded && { evidenceDegraded: true }),
    ...(spendingFlexibility && { spendingFlexibility: summarizeSpendingCuts(outcomes, spendingFlexibility) }),
    ...(flexibilityComparison && comparisonOutcomes && {
      spendingFlexibilityComparison: summarizeSpendingCuts(comparisonOutcomes, flexibilityComparison),
    }),
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/** The first withdrawal year's tax and premiums, each the median across sequences. */
export function medianFirstYearCosts(
  outcomes: readonly PortfolioOutcome[]
): NonNullable<RetirementAnalysisOutput['firstYearCosts']> {
  const costs = outcomes.flatMap((outcome) => (outcome.firstYearCosts ? [outcome.firstYearCosts] : []));
  return {
    federalTax: median(costs.map((cost) => cost.federalTax)),
    stateTax: median(costs.map((cost) => cost.stateTax)),
    healthcarePremiums: median(costs.map((cost) => cost.healthcarePremiums)),
    premiumTaxCredit: median(costs.map((cost) => cost.premiumTaxCredit)),
  };
}

/** How often a spending cut lasted and how much of the time it was in force. */
export function summarizeSpendingCuts(
  outcomes: readonly PortfolioOutcome[],
  flexibility: SpendingFlexibility
): SpendingFlexibilityOutcome {
  const yearsCut = outcomes.map((outcome) => (outcome.monthsSpendingCut ?? 0) / 12);
  const cut = yearsCut.filter((years) => years > 0).sort((left, right) => left - right);
  const survived = outcomes.filter((outcome) => outcome.withdrawalSustainability).length;
  const median = cut.length === 0
    ? 0
    : cut.length % 2 === 1
      ? cut[(cut.length - 1) / 2]
      : (cut[cut.length / 2 - 1] + cut[cut.length / 2]) / 2;
  return {
    cutShare: flexibility.cutShare,
    triggerDrawdown: SPENDING_CUT_TRIGGER,
    survivalRate: outcomes.length === 0 ? 0 : survived / outcomes.length,
    sequencesTested: outcomes.length,
    sequencesSurvived: survived,
    sequencesWithCuts: cut.length,
    medianYearsCut: median,
    mostYearsCut: cut.length === 0 ? 0 : cut[cut.length - 1],
  };
}

// Re-export types for convenience
export * from './types';
export { RETIREMENT_ANALYSIS_VERSION } from './version';
export { NoSupportedSimulationValueError } from './engine/portfolio-mapper';
