import { TierAwareContext } from '../data/orchestrator';
import { Transaction as UnifiedTransaction, UnifiedFinancialData, Holding, Security, HomeData } from '../services/financial-data-service';
import type { RetirementScenarioExecution } from '../scenarios/retirement-scenario';
import type { ScenarioExecutionRecord } from '../scenarios/calculator-registry';
import type { PlannedSearchQuery } from '../data/search-types';

export interface QuestionNeeds {
  needsMarketContext: boolean;
  needsSearchContext: boolean;
  needsHomeValue: boolean;
  needsInvestments: boolean;
  needsRetirement?: boolean;
  needsAccountDetails: boolean;
  needsTransactionDetails: boolean;
  needsMonthlyCashFlow: boolean;
  needsUserProfile: boolean;
  needsSecondaryValidation: boolean;
}

export interface AccountSummaryItem {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  balance: number | null;
  institution?: string;
  interestRate?: number;
}

export interface TransactionSummaryItem {
  id: string;
  name: string;
  amount: number;
  date: string;
  typeLabel: string;
  categoryLabel?: string;
  merchantName?: string;
  accountName?: string;
  accountInstitution?: string;
}

export interface InvestmentSnapshot {
  totalValue: number;
  holdingCount: number;
  summaryLines: string[];
  holdings?: Holding[];
  securities?: Security[];
  externalData?: InvestmentExternalData;
}

export interface InvestmentExternalData {
  asOf: string;
  sources: Array<'fmp' | 'tiingo'>;
  portfolioExposure?: {
    /**
     * Oldest contributing FMP observation. These aggregates are derived only
     * from fund metadata, so they are no fresher than their stalest input --
     * and never as fresh as the top-level asOf, which includes live quotes.
     */
    metadataAsOf?: string;
    countryAllocations: Array<{ name: string; percentage: number }>;
    sectorAllocations: Array<{ name: string; percentage: number }>;
    countryCoverage: number;
    sectorCoverage: number;
    /** Annual fee drag over the whole portfolio; pair with expenseRatioCoverage. */
    expenseRatioWeighted: number;
    expenseRatioCoverage: number;
  };
  securities: Array<{
    ticker: string;
    name?: string;
    assetClass?: string;
    geographicFocus?: string;
    expenseRatio?: number;
    instrumentType?: string;
    countryAllocations?: Array<{ name: string; weight: number }>;
    sectorAllocations?: Array<{ name: string; weight: number }>;
    countryCoverage?: string;
    sectorCoverage?: string;
    quote?: {
      price: number;
      previousClose?: number;
      changePercent?: number;
      timestamp?: string;
      feed: 'tiingo_iex';
    };
    trailing12MonthReturn?: number;
    performanceThrough?: string;
    /** When the FMP metadata for this security was observed (may be cached). */
    metadataAsOf?: string;
  }>;
}

export interface FinancialContextSnapshot {
  accounts: AccountSummaryItem[];
  bankingTransactions: TransactionSummaryItem[];
  investments?: InvestmentSnapshot;
  metadata: UnifiedFinancialData['metadata'];
  tierContext: TierAwareContext;
  incomeAnalysis?: string;
  expenseAnalysis?: string;
  monthlyCashFlowAnalysis?: string;
  /** Structured numeric values — use these instead of parsing incomeAnalysis/expenseAnalysis strings */
  averageMonthlyIncome?: number | null;
  averageMonthlyExpense?: number | null;
  transactionSummary?: {
    reportingCurrency?: string;
    incomeTotal?: number;
    expenseTotal?: number;
    operatingCashFlow?: number;
    byCategory?: Record<string, number>;
    byMonth?: Record<string, { income?: number; expense?: number; operatingCashFlow?: number }>;
    includedTransactionIds?: string[];
    excludedTransactionIds?: string[];
    unclassifiedTransactionIds?: string[];
    currencyMismatchTransactionIds?: string[];
  };
  contextSelection?: {
    accountsIncluded: boolean;
    transactionDetailsIncluded: boolean;
    investmentDetailsIncluded: boolean;
    marketContextRequested: boolean;
    searchContextRequested: boolean;
  };
  searchContext?: string;
  searchContextMetadata?: {
    queries: PlannedSearchQuery[];
    cacheHits: number;
    providerCalls: number;
    resultCount: number;
    retrievedAt: string;
  };
  marketContext?: string;
  userProfile?: string;
  homeValueSummary?: string;
  /** Structured RentCast value data used for fact provenance and uncertainty bounds. */
  homeValueData?: HomeData;
  retirementAnalysis?: {
    summary: {
      characteristics: {
        growthPotential: 'high' | 'moderate' | 'low';
        drawdownResistance: 'high' | 'moderate' | 'low';
        withdrawalFragility: 'high' | 'moderate' | 'low';
        inflationProtection: 'high' | 'moderate' | 'low';
      };
      tradeoffs: {
        upside: string;
        downside: string;
      };
      primaryObservation: string;
      confidence: 'high' | 'medium' | 'low';
      timelineBucket: '10' | '20' | '30';
      timelineBucketNote: string;
    };
    metrics: {
      equityAllocation: number;
      fixedIncomeAllocation?: number;
      cashAllocation?: number;
      internationalAllocation?: number;
      expenseRatioWeighted?: number;
      expenseRatioCoverage?: number;
      countryAllocation?: Array<{ name: string; percentage: number }>;
      sectorAllocation?: Array<{ name: string; percentage: number }>;
      countryCoverage?: number;
      sectorCoverage?: number;
      withdrawalRate: number;
      yearsOfExpenses: number;
      projectedPortfolioAtWithdrawalStart?: number;
      yearsToWithdrawalStart?: number;
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
      survivalRate: number;
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
      notablePeriods?: Array<{
        period: string;
        rank: number;
        metric: 'depletion' | 'drawdown' | 'recovery';
      }>;
    };
    historicalImplications: Array<{
      category: 'allocation' | 'diversification' | 'expenses' | 'withdrawal';
      observation: string;
      historicalContext: string;
    }>;
    dataQuality: {
      completeness: number;
      priceHistoryCoverage: number;
      metadataConfidence: 'high' | 'medium' | 'low';
      portfolioMappingConfidence: 'high' | 'medium' | 'low';
      proxiedValuePercentage: number;
      proxyUsage: {
        usEquityProxy: string;
        internationalEquityProxy: string;
        bondsProxy: string;
        unmappedHoldings: string[];
        mappingMethod: string;
      };
      assumptions: string[];
      missingData: string[];
    };
    disclaimers: string[];
    _storedInputParams?: {
      currentAge?: number;
      retirementAge?: number | null;
      annualWithdrawalAmount?: number;
      withdrawalStartAge?: number;
      lifeExpectancy?: number;
    };
    _evidence?: {
      recordId: string;
      computedAt: string;
    };
    /**
     * The user's own words behind each input, when they were read from this
     * decision's turns. A projection is only as right as its inputs, so the
     * answer states which words it acted on and the user can correct a misread
     * in one reply instead of finding it in the math.
     */
    _inputSources?: {
      currentAge?: string;
      retirementAge?: string;
      annualWithdrawalAmount?: string;
      withdrawalStartAge?: string;
      lifeExpectancy?: string;
    };
  };
  retirementAnalysisNeedsInfo?: {
    missingParams: Array<'currentAge' | 'retirementAge' | 'annualWithdrawalAmount' | 'withdrawalStartAge'>;
    detectedParams: {
      currentAge?: number;
      retirementAge?: number | null;
      annualWithdrawalAmount?: number;
      withdrawalStartAge?: number;
    };
    confirmationRequiredParams?: Array<'annualWithdrawalAmount'>;
    /** When retirement analysis cannot run despite a retirement question (e.g. no holdings). */
    unavailableReason?: string;
    /** Machine-readable form of unavailableReason: only some causes are the user's to fix. */
    unavailableCode?: 'no_holdings' | 'service_error';
  };
  /** Registry-keyed deterministic what-if results, scoped to this answer and its assumptions. */
  scenarioExecutions?: ScenarioExecutionRecord;
  /** @deprecated Compatibility for snapshots and fixtures created before registry-keyed execution. */
  retirementScenarioExecution?: RetirementScenarioExecution;
  financialSummary?: {
    computedAt?: Date | string;
    asOf?: Date | string | null;
    status?: 'current' | 'stale' | 'partial' | 'unavailable';
    reportingCurrency?: string;
    quality?: {
      staleSourceIds?: string[];
      unavailableSourceIds?: string[];
      requiredUnavailableSourceIds?: string[];
      errors?: Array<{ sourceId: string; message: string }>;
    };
    financialOverview?: {
      netWorth: number;
      totalCash: number;
      totalInvestments: number;
      totalDebt: number;
      homeValue: number | null;
    };
    investmentPortfolio?: {
      totalValue: number;
      holdingCount?: number;
      holdingsCount?: number;
      assetAllocation: Array<{
        type: string;
        value: number;
        percentage: number;
      }>;
      securityCount: number;
    };
  };
}

export interface ConversationEntry {
  id: string;
  question: string;
  answer: string;
  createdAt: Date;
}

export interface PromptPayload {
  systemPrompt: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}
