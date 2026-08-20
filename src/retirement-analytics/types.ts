// Retirement Portfolio Analysis Module - Type Definitions
// Phase 0: Scaffolding & Contracts

import { Holding, Security } from '../services/financial-data-service';
import type { UnmodeledInvestmentValue } from '../services/investment-coverage';

/**
 * How retirement spending changes after withdrawals begin.
 *
 * All policies start from the same amount in today's dollars. When retirement
 * is in the future, that amount is indexed by the historical sequence's CPI up
 * to the withdrawal start so policy comparisons begin with the same purchasing
 * power. The policy controls increases after that point.
 */
export type WithdrawalPolicy =
  | { type: 'historical_cpi' }
  | { type: 'flat_nominal' }
  | { type: 'fixed_growth'; annualRate: number };

export const DEFAULT_WITHDRAWAL_POLICY: WithdrawalPolicy = { type: 'historical_cpi' };

// ============================================================================
// Input Types (Section 2.1)
// ============================================================================

export interface RetirementAnalysisInput {
  // Portfolio data (from FinancialSummarySnapshot)
  holdings: Holding[];
  securities: Security[];
  
  // User profile (required)
  currentAge: number;
  retirementAge: number | null; // null if already retired
  lifeExpectancy: number; // default: 95 if not provided
  
  // Withdrawal assumptions (required)
  annualWithdrawalAmount: number; // in today's dollars
  withdrawalStartAge: number; // when withdrawals begin
  withdrawalPolicy?: WithdrawalPolicy; // defaults to historical CPI (constant real spending)
  /** Annual pre-withdrawal contribution in today's dollars; defaults to zero. */
  annualContributionAmount?: number;
  
  /**
   * Investment value deliberately left out of this projection because its
   * asset mix is unknown. Measured by the caller from the canonical snapshot;
   * the engine reports it and never models it.
   */
  unmodeledInvestments?: UnmodeledInvestmentValue | null;

  // Optional overrides
  inflationAssumption?: number; // override FRED data
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive'; // user preference
}

// ============================================================================
// Portfolio Composition Metrics (Section 2.3)
// ============================================================================

export interface PortfolioCompositionMetrics {
  equityAllocation: number; // percentage (stocks + stock ETFs)
  fixedIncomeAllocation: number; // percentage (bonds + bond ETFs)
  cashAllocation: number; // percentage
  internationalAllocation: number; // percentage (non-US holdings)
  concentrationRisk: number; // Herfindahl-Hirschman Index (HHI) across top 10 holdings
  /**
   * Annual fee drag over the WHOLE portfolio: sum of (holding weight x fund fee)
   * for holdings with a known fee. This is not an average across covered
   * holdings — read it together with expenseRatioCoverage.
   */
  expenseRatioWeighted: number;
  /** Portfolio weight with a known fund fee or a direct-security zero fee (0-1). */
  expenseRatioCoverage: number;
  /** Look-through country exposure for the portion of the portfolio covered by FMP. */
  countryAllocation: PortfolioExposure[];
  /** Look-through sector exposure for the portion of the portfolio covered by FMP. */
  sectorAllocation: PortfolioExposure[];
  /** Portfolio weight for which FMP supplied usable country allocations (0-1). */
  countryCoverage: number;
  /** Portfolio weight for which FMP supplied usable sector allocations (0-1). */
  sectorCoverage: number;
}

export interface PortfolioExposure {
  name: string;
  /** Percentage of the whole portfolio, not merely of covered holdings. */
  percentage: number;
}

export interface TimelineMetrics {
  yearsToRetirement: number; // or negative if retired
  withdrawalYears: number; // exact horizon (lifeExpectancy - withdrawalStartAge)
  withdrawalYearsOriginal: number; // same as withdrawalYears (no bucketing)
  withdrawalMonths: number; // withdrawalYears * 12, for simulation granularity
  timelineBucket: string; // string representation of withdrawal years (e.g. '27')
}

export interface HistoricalPerformanceMetrics {
  tenYearReturn: number; // median annualized return across 10-year rolling windows
  tenYearVolatility: number; // median standard deviation of monthly returns across 10-year windows
  worstDrawdown: number; // maximum peak-to-trough decline observed in 10-year windows
  inflationAdjustedReturn: number; // median real return (nominal - inflation) across historical windows
}

export interface WithdrawalSustainabilityMetrics {
  withdrawalRate: number; // annualWithdrawalAmount / portfolioValue (descriptive, not prescriptive)
  yearsOfExpenses: number; // naive ratio: portfolioValue / annualWithdrawalAmount. Ignores returns, inflation, sequence risk. Not a longevity estimate.
  projectedPortfolioAtWithdrawalStart: number; // median real value across historical accumulation sequences
  yearsToWithdrawalStart: number;
  historicalWithdrawalRates: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  withdrawalFailureRate: number; // percentage of historical sequences where portfolio depleted before withdrawal period ended
  worstCaseDepletionYear: number | null; // year (relative to withdrawal start) when portfolio would deplete in worst historical sequence
}

// ============================================================================
// Portfolio Mapping (Section 4.2)
// ============================================================================

export interface AssetBasket {
  usEquity: string; // e.g., "VTI" or "SPY" as proxy
  internationalEquity: string; // historical return series used for international exposure
  nominalBonds: string; // e.g., "AGG" or "BND" as proxy
  cash: string; // "CASHX" or use treasury bill rate
}

export interface PortfolioMapping {
  usEquityWeight: number; // 0-1
  internationalEquityWeight: number; // 0-1
  nominalBondsWeight: number; // 0-1
  cashWeight: number; // 0-1
  mappingConfidence: 'high' | 'medium' | 'low'; // based on how well holdings map
  unmappedHoldings: string[]; // tickers that couldn't be mapped
  mappingMethod: 'direct' | 'inferred' | 'proxy'; // how mapping was determined
}

// ============================================================================
// Historical Sequences & Outcomes (Section 4.1)
// ============================================================================

export interface HistoricalSequence {
  startDate: Date;
  endDate: Date;
  sequenceId: string; // e.g., "1970-01_to_1985-01"
  assetBasketReturns: {
    usEquity: number[]; // monthly returns
    internationalEquity: number[]; // monthly returns
    nominalBonds: number[]; // monthly returns
    cash: number[]; // monthly returns (near-zero)
  };
  inflationRates: number[]; // monthly inflation
  portfolioOutcome?: PortfolioOutcome; // computed after simulation
}

export interface PortfolioOutcome {
  withdrawalSustainability: boolean;
  yearsUntilDepletion: number | null; // measured from withdrawal start, not current age
  portfolioValueAtWithdrawalStart: number;
  realPortfolioValueAtWithdrawalStart: number;
  finalValue: number; // inflation-adjusted
  maximumDrawdown: number; // peak-to-trough decline
  timeToRecovery: number | null; // months until recovery from worst drawdown
  realReturn: number; // inflation-adjusted annualized return
}

// ============================================================================
// Stress Test Results (Section 4.1)
// ============================================================================

export interface StressTestResult {
  totalSequences: number;
  survivalRate: number; // 0-1
  depletionPercentiles: {
    p10: number | null;
    p25: number | null;
    p50: number | null;
    p75: number | null;
    p90: number | null;
  };
  worstSequences: {
    byDepletion: Array<{ sequenceId: string; yearsUntilDepletion: number }>;
    byDrawdown: Array<{ sequenceId: string; maximumDrawdown: number }>;
    byRecovery: Array<{ sequenceId: string; timeToRecovery: number }>;
  };
  // Named crises only if they appear in worst sequences
  notablePeriods?: Array<{
    period: string; // e.g., "2008 Financial Crisis"
    rank: number; // rank among worst sequences
    metric: 'depletion' | 'drawdown' | 'recovery';
  }>;
  historicalWithdrawalRates: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
}

// ============================================================================
// Portfolio Characteristics (Section 2.4)
// ============================================================================

export interface PortfolioCharacteristics {
  growthPotential: 'high' | 'moderate' | 'low';
  drawdownResistance: 'high' | 'moderate' | 'low';
  withdrawalFragility: 'high' | 'moderate' | 'low';
  inflationProtection: 'high' | 'moderate' | 'low';
}

export interface PortfolioTradeoffs {
  upside: string; // What this allocation historically provided
  downside: string; // What this allocation historically lacked or risked
}

export interface PortfolioAssessment {
  characteristics: PortfolioCharacteristics;
  tradeoffs: PortfolioTradeoffs;
  primaryObservation: string; // Descriptive, not prescriptive
}

// ============================================================================
// Data Quality (Section 6.2)
// ============================================================================

export interface DataQualityReport {
  completeness: number; // 0-1 (percentage of holdings with full metadata)
  priceHistoryCoverage: number; // 0-1 (percentage with 10+ years of data)
  metadataConfidence: 'high' | 'medium' | 'low'; // based on provider source
  portfolioMappingConfidence: 'high' | 'medium' | 'low';
  proxiedValuePercentage: number; // 0-1 (percentage of portfolio value mapped via proxies/inference)
  proxyUsage: {
    usEquityProxy: string; // e.g., "VTI"
    internationalEquityProxy: string; // exact historical series/proxy used
    bondsProxy: string; // e.g., "AGG"
    unmappedHoldings: string[];
    mappingMethod: string;
  };
  /**
   * Portfolio value this analysis actually modeled, and the investment value
   * excluded from it. Excluded value is real -- it is in net worth -- but has
   * no known asset class, so every metric below is computed on `modeledValue`
   * alone and understates what the full portfolio would support.
   */
  modeledValue: number;
  unmodeledValue: number;
  /**
   * Dollar-weighted share of canonical investments this analysis modeled, 0-1.
   * Distinct from `completeness`, which counts holdings: a portfolio can have
   * metadata for every position it received while a fifth of the money is
   * missing entirely.
   */
  valueCoverage: number;
  /** Accounts contributing excluded value, largest first. */
  unmodeledReasons: Array<{ label: string; amount: number; kind: string }>;
  assumptions: string[]; // Explicit assumptions made during mapping/analysis
  // Examples:
  // "Unclassified equity holdings split 70% US / 30% international based on historical averages"
  // "Bond exposure modeled using nominal bond index proxy"
  // "Cash holdings assumed to earn treasury bill rate"
  missingData: string[]; // list of tickers with incomplete data
}

export interface HistoricalDataSummary {
  firstMonth: string;
  lastMonth: string;
  sourceRetrievedAt: string;
  monthlyStartWindowsOverlap: true;
  series: Record<string, {
    source: string;
    description: string;
    firstMonth: string;
    lastMonth: string;
  }>;
}

// ============================================================================
// Output Format (Section 6.3)
// ============================================================================

export interface RetirementAnalysisOutput {
  summary: {
    characteristics: PortfolioCharacteristics;
    tradeoffs: PortfolioTradeoffs;
    primaryObservation: string; // Descriptive, not prescriptive (e.g., "historically fragile given withdrawal timing")
    confidence: 'high' | 'medium' | 'low'; // Must respect confidence ceiling rules
    timelineBucket: string;
    timelineBucketNote: string;
  };
  
  metrics: {
    equityAllocation: number;
    fixedIncomeAllocation?: number;
    cashAllocation?: number;
    internationalAllocation?: number;
    expenseRatioWeighted?: number;
    expenseRatioCoverage?: number;
    countryAllocation?: PortfolioExposure[];
    sectorAllocation?: PortfolioExposure[];
    countryCoverage?: number;
    sectorCoverage?: number;
    withdrawalRate: number; // annual withdrawal / median real portfolio at withdrawal start
    yearsOfExpenses: number; // median real portfolio at withdrawal start / annual withdrawal
    projectedPortfolioAtWithdrawalStart: number;
    yearsToWithdrawalStart: number;
    historicalWithdrawalRates: {
      p10: number;
      p25: number;
      p50: number;
      p75: number;
      p90: number;
    };
  };
  
  stressTest: {
    totalSequences: number;
    survivalRate: number; // 0-1
    depletionPercentiles: {
      p10: number | null;
      p25: number | null;
      p50: number | null;
      p75: number | null;
      p90: number | null;
    };
    worstSequences: {
      byDepletion: Array<{ sequenceId: string; yearsUntilDepletion: number }>;
      byDrawdown: Array<{ sequenceId: string; maximumDrawdown: number }>;
      byRecovery: Array<{ sequenceId: string; timeToRecovery: number }>;
    };
    // Named crises only if they appear in worst sequences
    notablePeriods?: Array<{
      period: string; // e.g., "2008 Financial Crisis"
      rank: number; // rank among worst sequences
      metric: 'depletion' | 'drawdown' | 'recovery';
    }>;
  };
  
  historicalImplications: Array<{
    category: 'allocation' | 'diversification' | 'expenses' | 'withdrawal';
    observation: string; // Pattern-based observation, conditional on historical data
    historicalContext: string; // Historical pattern that supports the observation
  }>;
  
  dataQuality: DataQualityReport;

  /** Source range and methodology supplied to the LLM with historical results. */
  historicalData?: HistoricalDataSummary;
  
  disclaimers: string[]; // Pre-formatted disclaimer text
}

// ============================================================================
// Price History & Metadata (Section 5.2)
// ============================================================================

export interface PriceTimeSeries {
  ticker: string;
  dates: Date[];
  prices: number[];
  returns: number[]; // monthly returns
  provider: 'polygon' | 'tiingo';
}

export interface SecurityMetadata {
  tickerSymbol: string;
  securityName: string;
  assetClass?: string; // 'Equity', 'Fixed Income', 'Cash'
  fundCategory?: string; // 'Large Cap Blend', etc.
  expenseRatio?: number;
  geographicFocus?: string; // 'US', 'International', 'Global'
  isETF: boolean;
  fundData?: FundExposureData;
  metadataVersion?: number;
  provider: 'fmp' | 'inferred';
  lastUpdated: Date;
}

export interface FundExposure {
  name: string;
  /** Normalized fraction from 0 to 1. */
  weight: number;
}

export interface FundExposureData {
  instrumentType: 'etf' | 'mutual_fund' | 'equity' | 'unknown';
  assetUnderManagement?: number;
  nav?: number;
  currency?: string;
  holdingsCount?: number;
  inceptionDate?: string;
  countryAllocations: FundExposure[];
  sectorAllocations: FundExposure[];
  countryCoverage: 'available' | 'unavailable' | 'degenerate';
  sectorCoverage: 'available' | 'unavailable' | 'degenerate';
}

export interface PriceHistory {
  ticker: string;
  startDate: Date;
  endDate: Date;
  data: PriceTimeSeries;
}

// ============================================================================
// Portfolio Snapshot (Section 5.2)
// ============================================================================

export interface PortfolioSnapshot {
  holdings: Holding[];
  securities: Security[];
  totalValue: number;
  computedAt: Date;
}

// ============================================================================
// Internal Heuristics (Section 2.3 - not exposed to users)
// ============================================================================

export interface InternalHeuristics {
  _internalEquityRiskHeuristic: number; // internal only, used for sorting/comparison
  _internalSequenceRiskHeuristic: number; // internal only, used for identifying worst-case sequences
}

// ============================================================================
// Helper Types
// ============================================================================

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type TimelineBucket = string; // e.g. '10', '20', '27' (exact years)
export type CharacteristicLevel = 'high' | 'moderate' | 'low';
export type MappingMethod = 'direct' | 'inferred' | 'proxy';
