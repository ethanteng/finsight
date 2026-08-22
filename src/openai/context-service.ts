import * as Sentry from '@sentry/node';
import { UserTier } from '../data/types';
import { dataOrchestrator } from '../data/orchestrator';
import { Account, Transaction, UnifiedFinancialData, HomeData } from '../services/financial-data-service';
import { TokenStatus } from '../services/token-validation-service';
import { QuestionNeeds, FinancialContextSnapshot, TransactionSummaryItem, InvestmentSnapshot } from './types';
import { buildAccountSummaries } from './account-summary';
import {
  describeUnmodeledInvestmentValue,
  summarizeUnmodeledInvestmentValue,
  UNMODELED_VALUE_NOTE_PREFIX,
  type UnmodeledInvestmentValue,
} from '../services/investment-coverage';
import { buildCanonicalCashFlowAnalyses } from './cash-flow-context';
import { resolveRetirementInputs, retirementPortfolioFingerprint, resolveStoredAsOfDate } from './retirement-inputs';
import { generateDisclaimers, calculateConfidenceCeiling } from '../retirement-analytics/interpretation/uncertainty-quantifier';
import type { DataQualityReport } from '../retirement-analytics/types';
import { RETIREMENT_ANALYSIS_VERSION } from '../retirement-analytics/version';
import type { ExtractedRetirementInputs } from './retirement-input-extraction';
import type { PlannedSearchQuery, SearchQueryEvidence } from '../data/search-types';
import { compactSearchQueryEvidence } from '../data/search-types';
import type { SearchContext } from '../data/orchestrator';

interface GatherContextArgs {
  userId?: string;
  question: string;
  questionNeeds: QuestionNeeds;
  tier: UserTier;
  /**
   * Earlier turns of this decision, most recent first. Inputs stated a turn or
   * two ago belong to the question being asked now.
   *
   * The answers travel with the questions because a short reply only means
   * something next to what was asked: "62" is an age or a dollar figure
   * depending entirely on the question above it.
   */
  recentTurns?: Array<{ question: string; answer?: string }>;
  /** Semantic inputs already read by the context planner; avoids reading the transcript twice. */
  plannedRetirementInputs?: ExtractedRetirementInputs;
  /** Standalone public queries produced by the two-pass semantic planner. */
  searchQueries?: readonly PlannedSearchQuery[];
  /** Do not call an external search provider until the primary audit is final. */
  deferSearchContext?: boolean;
  /** Load typed economic observations for a deterministic calculator consumer. */
  includeStructuredMarketContext?: boolean;
  /** Skip the expensive/persisted retirement calculation until scenario planning is final. */
  deferRetirementAnalysis?: boolean;
  /** A scenario compares with the existing baseline, so its stored spending can be reused. */
  useExistingRetirementBaseline?: boolean;
  /** Optional callback for progress updates (e.g. for SSE streaming) */
  onProgress?: (message: string) => void;
}

const MAX_PROMPT_TRANSACTIONS = parseInt(process.env.MAX_PROMPT_TRANSACTIONS || '75', 10);

const DEFAULT_METADATA: UnifiedFinancialData['metadata'] = {
  lastUpdated: new Date(),
  tokenHealth: {
    plaid: [],
    snaptrade: {
      userId: '',
      status: TokenStatus.ERROR,
      error: undefined,
      lastChecked: new Date()
    }
  },
  errors: {
    plaid: [],
    snaptrade: [],
    homeValue: null
  },
  partialData: false,
  performance: {
    totalDuration: 0,
    plaidDuration: 0,
    snaptradeDuration: 0
  },
  dataSources: {
    plaid: 'unknown',
    snaptrade: 'unknown'
  },
  persistedAsOf: null
};

export async function gatherContextSnapshot(args: GatherContextArgs): Promise<FinancialContextSnapshot> {
  const {
    userId,
    question,
    questionNeeds,
    tier,
    recentTurns = [],
    plannedRetirementInputs,
    searchQueries = [],
    deferSearchContext = false,
    includeStructuredMarketContext = false,
    deferRetirementAnalysis = false,
    useExistingRetirementBaseline = false,
    onProgress
  } = args;

  let accounts: Account[] = [];
  let bankingTransactions: Transaction[] = [];
  let investmentsSnapshot: InvestmentSnapshot | undefined;
  /** Per-account holdings residuals from the canonical portfolio, for coverage. */
  let investmentCoverageGaps: Array<{ accountId?: string | null; unexplainedValue?: number | null }> | undefined;
  let homeValueSummary: string | undefined;
  let homeValueData: HomeData | undefined;
  let metadata: UnifiedFinancialData['metadata'] = { ...DEFAULT_METADATA };
  let financialSummary: FinancialContextSnapshot['financialSummary'] | null = null;
  let transactionSummary: FinancialContextSnapshot['transactionSummary'];
  let accountDisplayBalances: Record<string, unknown> = {};

  if (userId) {
    // Fetch the canonical snapshot with only the large JSON columns this
    // question needs. Aggregate financial and cash-flow truth is always loaded.
    const { getFinancialSnapshotForAnalysis } = await import('../services/financial-snapshot-persistence');
    const snapshot = await getFinancialSnapshotForAnalysis(userId, {
      includeAccounts: questionNeeds.needsAccountDetails,
      includeTransactions: questionNeeds.needsTransactionDetails,
      includeInvestments: questionNeeds.needsInvestments || Boolean(questionNeeds.needsRetirement),
    });

    if (snapshot) {
      // Log snapshot metadata for debugging
      console.log(`📊 gatherContextSnapshot: Snapshot found for user ${userId}`, {
        computedAt: snapshot.computedAt,
        hasHoldings: !!snapshot.holdings,
        holdingsType: Array.isArray(snapshot.holdings) ? 'array' : typeof snapshot.holdings,
        holdingsLength: Array.isArray(snapshot.holdings) ? snapshot.holdings.length : 'N/A',
        hasSecurities: !!snapshot.securities,
        securitiesType: Array.isArray(snapshot.securities) ? 'array' : typeof snapshot.securities,
        securitiesLength: Array.isArray(snapshot.securities) ? snapshot.securities.length : 'N/A',
        hasInvestmentPortfolio: !!snapshot.investmentPortfolio
      });

      // ✅ CRITICAL: snapshot.accounts is stored as JSON in the database
      // When retrieved, Prisma parses it, but we need to ensure it's an array
      const rawAccounts = snapshot.accounts as any;
      accounts = Array.isArray(rawAccounts) ? rawAccounts as Account[] : [];

      // Log account count and check for duplicates in snapshot
      console.log(`📊 gatherContextSnapshot: Retrieved ${accounts.length} accounts from snapshot for user ${userId}`);


      // ✅ CRITICAL: snapshot.transactions is stored as JSON in the database
      // When retrieved, Prisma parses it, but we need to ensure it's an array
      const rawTransactions = snapshot.transactions as any;
      bankingTransactions = Array.isArray(rawTransactions) ? rawTransactions as Transaction[] : [];
      transactionSummary = snapshot.transactionsSummary && typeof snapshot.transactionsSummary === 'object'
        ? snapshot.transactionsSummary as FinancialContextSnapshot['transactionSummary']
        : undefined;
      const snapshotMeta = snapshot.meta && typeof snapshot.meta === 'object' ? snapshot.meta as any : {};
      accountDisplayBalances = snapshotMeta.accountDisplayBalances && typeof snapshotMeta.accountDisplayBalances === 'object'
        ? snapshotMeta.accountDisplayBalances
        : {};

      if (questionNeeds.needsTransactionDetails && !Array.isArray(rawTransactions)) {
        console.warn(`⚠️ gatherContextSnapshot: Snapshot transactions is not an array (type: ${typeof rawTransactions}), defaulting to empty array`);
      } else if (Array.isArray(rawTransactions)) {
        console.log(`📊 gatherContextSnapshot: Retrieved ${bankingTransactions.length} transactions from snapshot for user ${userId}`);
      }

      metadata = {
        ...DEFAULT_METADATA,
        lastUpdated: new Date(snapshot.computedAt),
        persistedAsOf: snapshot.asOf ? new Date(snapshot.asOf) : null,
      };

      // ✅ Set financialSummary for prompt builder
      financialSummary = {
        computedAt: snapshot.computedAt,
        asOf: snapshot.asOf,
        status: snapshot.status
          ? (snapshot.status as 'current' | 'stale' | 'partial' | 'unavailable')
          : undefined,
        reportingCurrency: snapshot.reportingCurrency,
        quality: snapshot.quality as NonNullable<FinancialContextSnapshot['financialSummary']>['quality'],
        financialOverview: snapshot.financialOverview as NonNullable<FinancialContextSnapshot['financialSummary']>['financialOverview'],
        investmentPortfolio: snapshot.investmentPortfolio as NonNullable<FinancialContextSnapshot['financialSummary']>['investmentPortfolio']
      };

      // Load investments if needed for investments OR retirement analysis
      if (questionNeeds.needsInvestments || questionNeeds.needsRetirement) {
        const holdings = (snapshot.holdings as any[] || []);
        const securities = (snapshot.securities as any[] || []);

        // Debug logging for retirement analysis
        if (questionNeeds.needsRetirement) {
          console.log('📊 Loading investments for retirement analysis:', {
            needsInvestments: questionNeeds.needsInvestments,
            needsRetirement: questionNeeds.needsRetirement,
            holdingsCount: holdings.length,
            securitiesCount: securities.length,
            hasHoldings: Array.isArray(holdings) && holdings.length > 0,
            holdingsType: typeof snapshot.holdings,
            snapshotComputedAt: snapshot.computedAt,
            investmentPortfolioTotalValue: (snapshot.investmentPortfolio as any)?.totalValue
          });
        }

        // Coverage is measured once account display balances are resolved,
        // below, because an account with no holdings at all is only visible there.
        investmentCoverageGaps = (snapshot.investmentPortfolio as any).holdingsCoverageGaps;
        investmentsSnapshot = {
          totalValue: (snapshot.investmentPortfolio as any).totalValue || 0,
          holdingCount: (snapshot.investmentPortfolio as any).holdingCount || 0,
          summaryLines: holdings.slice(0, 10).map((holding: any) => {
            const name = holding.security_name || holding.ticker_symbol || 'Holding';
            const value = holding.institution_value;
            return typeof value === 'number' && Number.isFinite(value)
              ? `- ${name}: $${value.toFixed(2)}`
              : `- ${name}: Value unavailable`;
          }),
          holdings: holdings,
          securities: securities,
        };

        if (questionNeeds.needsRetirement) {
          console.log('✅ Investments snapshot created:', {
            totalValue: investmentsSnapshot.totalValue,
            holdingCount: investmentsSnapshot.holdingCount,
            holdingsLength: investmentsSnapshot.holdings?.length || 0,
            securitiesLength: investmentsSnapshot.securities?.length || 0
          });
        }
      }

      if (questionNeeds.needsHomeValue) {
        const homeValue = (snapshot.financialOverview as any).homeValue;
        const storedHome = snapshotMeta.home && typeof snapshotMeta.home === 'object'
          ? snapshotMeta.home as any
          : null;
        if (homeValue !== null && homeValue !== undefined) {
          if (typeof homeValue === 'number' && Number.isFinite(homeValue)) {
            const isManualOverride = Boolean(storedHome?.isManualOverride);
            homeValueData = {
              address: typeof storedHome?.address === 'string' ? storedHome.address : '',
              propertyId: typeof storedHome?.propertyId === 'string' ? storedHome.propertyId : null,
              valueMid: homeValue,
              valueLow: !isManualOverride && typeof storedHome?.valueLow === 'number' && Number.isFinite(storedHome.valueLow)
                ? storedHome.valueLow
                : null,
              valueHigh: !isManualOverride && typeof storedHome?.valueHigh === 'number' && Number.isFinite(storedHome.valueHigh)
                ? storedHome.valueHigh
                : null,
              lastUpdated: typeof storedHome?.lastUpdated === 'string' ? storedHome.lastUpdated : null,
              isManualOverride,
            };
            homeValueSummary = buildHomeValueSummary(homeValueData);
          } else {
            // HomeData object
            if (typeof homeValue.valueMid === 'number') {
              const normalizedHomeValue: HomeData = {
                ...homeValue,
                propertyId: typeof homeValue.propertyId === 'string' ? homeValue.propertyId : null,
              };
              homeValueData = normalizedHomeValue;
              homeValueSummary = buildHomeValueSummary(normalizedHomeValue);
            } else if (homeValue.address) {
              // Address exists but value is 0
              homeValueSummary = `Home address: ${homeValue.address}. Home value estimate is not currently available, but the user owns this property.`;
            } else {
              homeValueSummary = 'Home value data is currently unavailable.';
            }
          }
        } else {
          if (storedHome?.address) {
            homeValueSummary = `Home address: ${storedHome.address}. Home value estimate is not currently available, but the user owns this property.`;
          } else {
            homeValueSummary = 'Home value data is currently unavailable.';
          }
        }
      }
    } else {
      console.warn(`ContextService: No financial snapshot found for user ${userId}.`);
      // Fallback to empty data if no snapshot exists
      // Try to get token health from TokenValidationService
      let tokenHealth = DEFAULT_METADATA.tokenHealth;
      try {
        const { TokenValidationService } = await import('../services/token-validation-service');
        const tokenService = new TokenValidationService();
        const plaidTokens = await tokenService.validatePlaidTokens(userId);
        tokenHealth = {
          plaid: plaidTokens.map((t: any) => ({
            tokenId: t.tokenId,
            status: t.status,
            error: t.error,
            lastChecked: t.lastChecked
          })),
          snaptrade: DEFAULT_METADATA.tokenHealth.snaptrade
        };
      } catch (error) {
        console.warn('ContextService: Failed to get token health, using defaults:', error);
      }

      metadata = {
        ...DEFAULT_METADATA,
        tokenHealth,
        errors: { plaid: [], snaptrade: [], homeValue: { error: 'No snapshot available', timestamp: new Date() } },
        partialData: true,
      };
      if (questionNeeds.needsHomeValue) {
        homeValueSummary = 'Home value data is not estimated yet.';
      }
    }
  }

  onProgress?.(questionNeeds.needsTransactionDetails
    ? 'Reviewing your transaction history'
    : 'Preparing your financial context');

  // Canonical snapshot persistence owns account identity and pending/posted
  // transaction resolution. Context assembly only selects and orders facts.
  const sortedTransactions = bankingTransactions
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const accountSummaries = buildAccountSummaries(accounts, accountDisplayBalances);
  if (investmentsSnapshot) {
    // A position-level consumer sees only the itemized holdings. Measure what
    // that leaves out of the canonical total so the exclusion can be stated as
    // a quantified choice rather than silently understating a projection.
    const measured = investmentsSnapshot;
    investmentsSnapshot = {
      ...measured,
      unmodeledInvestments: summarizeUnmodeledInvestmentValue({
        totalInvestments: measured.totalValue,
        holdings: measured.holdings || [],
        accounts: accountSummaries,
        coverageGaps: investmentCoverageGaps,
        reportingCurrency: financialSummary?.reportingCurrency,
      }),
    };
  }
  const accountMap = new Map<string, Account>();
  accounts.forEach(account => {
    const accountId = account.account_id || (account as any).plaidAccountId || account.persistentAccountId || account.id;
    if (accountId) accountMap.set(accountId, account);
  });
  const transactionSummaries = buildTransactionSummaries(sortedTransactions, accountMap).slice(
    0,
    MAX_PROMPT_TRANSACTIONS
  );

  // Fetch user overrides for monthly income/expenses (isolated so a failure
  // doesn't reject the whole parallel batch — preserves prior behavior).
  const fetchUserOverrides = async (): Promise<{
    monthlyIncomeOverride?: number | null;
    monthlyExpenseOverride?: number | null;
  }> => {
    if (!userId) return {};
    try {
      const { getPrismaClient } = await import('../prisma-client');
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { monthlyIncomeOverride: true, monthlyExpenseOverride: true }
      });
      return user
        ? { monthlyIncomeOverride: user.monthlyIncomeOverride, monthlyExpenseOverride: user.monthlyExpenseOverride }
        : {};
    } catch (error) {
      console.error('Failed to fetch user overrides:', error);
      return {};
    }
  };

  // These operations are independent of one another — run them concurrently
  // instead of serially to cut the time spent gathering context before the LLM call.
  if (questionNeeds.needsSearchContext && !deferSearchContext) onProgress?.('Searching financial knowledge base');
  if (questionNeeds.needsMarketContext) onProgress?.('Fetching market context');
  if (questionNeeds.needsUserProfile) onProgress?.('Preparing remembered personal context');

  const tierContextAccounts = questionNeeds.needsAccountDetails ? accounts : [];
  const tierContextTransactions = questionNeeds.needsTransactionDetails
    ? sortedTransactions.slice(0, MAX_PROMPT_TRANSACTIONS)
    : [];

  const [tierContext, searchRetrieval, marketContextResult, userOverrides, userProfile, investmentExternalData] = await Promise.all([
    dataOrchestrator.buildTierAwareContext(
      tier,
      tierContextAccounts,
      tierContextTransactions,
      // The narrative market pack and typed economic observations have
      // different consumers. Avoid fetching every FRED series for ordinary
      // market-context questions; a deterministic calculator must opt in.
      {
        includeMarketContext:
          questionNeeds.needsMarketContext && includeStructuredMarketContext,
      }
    ),
    maybeFetchSearchContext(searchQueries, questionNeeds, tier, deferSearchContext),
    maybeFetchMarketContext(questionNeeds, tier),
    fetchUserOverrides(),
    questionNeeds.needsUserProfile
      ? loadPersonalContext(userId)
      : Promise.resolve(undefined),
    questionNeeds.needsInvestments && investmentsSnapshot?.holdings?.length
      ? import('../investments/market-enrichment').then(({ enrichInvestmentSnapshot }) =>
          enrichInvestmentSnapshot(investmentsSnapshot!.holdings || [], investmentsSnapshot!.securities || [])
        ).catch(error => {
          console.warn('Investment market enrichment failed:', error);
          return undefined;
        })
      : Promise.resolve(undefined),
  ]);

  if (investmentsSnapshot && investmentExternalData) {
    investmentsSnapshot.externalData = investmentExternalData;
  }

  const { context: searchContext, queryOutcomes: searchQueryOutcomes } = searchRetrieval;

  const monthlyIncomeOverride = userOverrides.monthlyIncomeOverride;
  const monthlyExpenseOverride = userOverrides.monthlyExpenseOverride;

  const { incomeResult, expenseResult, monthlyAnalysis } = buildCanonicalCashFlowAnalyses(
    transactionSummary,
    monthlyIncomeOverride,
    monthlyExpenseOverride,
    questionNeeds.needsMonthlyCashFlow
  );
  const incomeAnalysis = incomeResult?.text;
  const expenseAnalysis = expenseResult?.text;

  const assembledSnapshot: FinancialContextSnapshot = {
    accounts: accountSummaries,
    bankingTransactions: transactionSummaries,
    investments: investmentsSnapshot,
    metadata,
    tierContext,
    incomeAnalysis,
    expenseAnalysis,
    monthlyCashFlowAnalysis: monthlyAnalysis,
    averageMonthlyIncome: incomeResult?.averageMonthly ?? null,
    averageMonthlyExpense: expenseResult?.averageMonthly ?? null,
    transactionSummary,
    contextSelection: {
      accountsIncluded: questionNeeds.needsAccountDetails,
      transactionDetailsIncluded: questionNeeds.needsTransactionDetails,
      investmentDetailsIncluded: questionNeeds.needsInvestments || Boolean(questionNeeds.needsRetirement),
      marketContextRequested: questionNeeds.needsMarketContext,
      searchContextRequested: questionNeeds.needsSearchContext,
    },
    searchContext: searchContext?.summary,
    ...(searchContext && {
      searchContextMetadata: {
        queries: searchContext.queries,
        cacheHits: searchContext.cacheHits,
        providerCalls: searchContext.providerCalls,
        resultCount: searchContext.results.length,
        retrievedAt: searchContext.lastUpdate.toISOString(),
        ...(searchQueryOutcomes.length > 0 && {
          queryOutcomes: compactSearchQueryEvidence(searchQueryOutcomes),
        }),
      },
    }),
    ...(!searchContext && searchQueryOutcomes.length > 0 && {
      searchQueryOutcomes: compactSearchQueryEvidence(searchQueryOutcomes),
    }),
    marketContext: marketContextResult?.text,
    marketContextMetadata: marketContextResult?.metadata,
    userProfile,
    homeValueSummary,
    homeValueData,
    financialSummary: financialSummary || undefined,
  };

  if (deferRetirementAnalysis) return assembledSnapshot;
  return completeRetirementAnalysis(assembledSnapshot, {
    userId,
    question,
    questionNeeds,
    recentTurns,
    plannedRetirementInputs,
    useExistingRetirementBaseline,
    onProgress,
  });
}

type RetirementAnalysis = NonNullable<FinancialContextSnapshot['retirementAnalysis']>;

interface RetirementAnalysisResolution {
  analysis?: RetirementAnalysis;
  needsInfo?: FinancialContextSnapshot['retirementAnalysisNeedsInfo'];
}

export interface CompleteRetirementAnalysisArgs {
  userId?: string;
  question: string;
  questionNeeds: QuestionNeeds;
  recentTurns?: Array<{ question: string; answer?: string }>;
  plannedRetirementInputs?: ExtractedRetirementInputs;
  useExistingRetirementBaseline?: boolean;
  onProgress?: (message: string) => void;
}

/**
 * Complete only the deferred retirement baseline using context already loaded
 * for the primary pack audit. This avoids repeating snapshot, profile, search,
 * market, and cash-flow retrieval when the pack selection did not widen.
 */
export async function completeRetirementAnalysis(
  snapshot: FinancialContextSnapshot,
  args: CompleteRetirementAnalysisArgs
): Promise<FinancialContextSnapshot> {
  const {
    userId,
    question,
    questionNeeds,
    recentTurns = [],
    plannedRetirementInputs,
    useExistingRetirementBaseline = false,
    onProgress,
  } = args;
  if (!userId || !questionNeeds.needsRetirement) return snapshot;

  const holdings = snapshot.investments?.holdings;
  const securities = snapshot.investments?.securities ?? [];
  if (!holdings?.length) {
    console.log('⚠️ Retirement analysis NOT triggered:', {
      reason: !holdings ? 'No investment holdings' : 'Empty holdings array',
      hasInvestmentsSnapshot: Boolean(snapshot.investments),
      holdingsLength: holdings?.length ?? 0,
    });
    return {
      ...snapshot,
      retirementAnalysis: undefined,
      retirementAnalysisNeedsInfo: {
        missingParams: [],
        detectedParams: {},
        unavailableReason:
          'No linked investment holdings are available for retirement analysis. Ask the user to connect investment accounts or provide portfolio details instead of estimating from net-worth aggregates alone.',
        unavailableCode: 'no_holdings',
      },
    };
  }

  try {
    onProgress?.('Building your retirement snapshot');
    const result = await fetchOrCreateRetirementAnalysis({
      userId,
      question,
      recentTurns,
      plannedRetirementInputs,
      useExistingRetirementBaseline,
      userProfile: snapshot.userProfile || '',
      holdings,
      securities,
      unmodeledInvestments: snapshot.investments?.unmodeledInvestments,
      // The registry is dated, so take the full UTC date from the snapshot.
      // This prevents look-ahead and keeps replays deterministic.
      asOfDate: snapshotDate(snapshot),
    });
    return {
      ...snapshot,
      retirementAnalysis: result.analysis,
      retirementAnalysisNeedsInfo: result.needsInfo,
    };
  } catch (error) {
    console.error('❌ Error fetching/creating retirement analysis:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return {
      ...snapshot,
      retirementAnalysis: undefined,
      retirementAnalysisNeedsInfo: {
        missingParams: [],
        detectedParams: {},
        unavailableReason:
          'Retirement analysis could not be completed because the portfolio analysis service failed. Ask the user to try again later instead of estimating from aggregates alone.',
        unavailableCode: 'service_error',
      },
    };
  }
}

/**
 * UTC date of the snapshot an analysis is built from, when it is known.
 *
 * Undefined leaves the engine on its current-date default, which is right for
 * a context with no snapshot behind it.
 */
function snapshotDate(snapshot: FinancialContextSnapshot): string | undefined {
  const computedAt = snapshot.financialSummary?.computedAt;
  if (!computedAt) return undefined;
  const parsed = computedAt instanceof Date ? computedAt : new Date(computedAt);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

/** Fetch a matching retirement analysis or create one from explicit, persisted inputs. */
async function fetchOrCreateRetirementAnalysis(args: {
  userId: string;
  question: string;
  recentTurns?: Array<{ question: string; answer?: string }>;
  plannedRetirementInputs?: ExtractedRetirementInputs;
  useExistingRetirementBaseline?: boolean;
  userProfile: string;
  holdings: any[];
  securities: any[];
  unmodeledInvestments?: UnmodeledInvestmentValue | null;
  asOfDate?: string;
}): Promise<RetirementAnalysisResolution> {
  const {
    userId,
    question,
    recentTurns = [],
    plannedRetirementInputs,
    useExistingRetirementBaseline = false,
    userProfile,
    holdings,
    securities,
    unmodeledInvestments,
    asOfDate,
  } = args;

  // Parse retirement parameters from the question and the turns that set it up.
  // A number the user gave two messages ago is an answer to this question, not
  // a reason to ask them for it again.
  const { parseRetirementConversation } = await import('../retirement-analytics/retirement-question-parser');
  // The preflight planner reads inputs from the same active decision used for
  // pack selection. Only its recall-safe all-pack fallback reaches this method
  // without semantic inputs, in which case the deterministic parser recovers
  // what it can instead of making a second model call.
  const extracted = plannedRetirementInputs;
  const questionParams = extracted
    ? {
        hasRetirementIntent: true,
        currentAge: extracted.currentAge,
        retirementAge: extracted.retirementAge,
        annualWithdrawalAmount: extracted.annualWithdrawalAmount,
        withdrawalStartAge: extracted.withdrawalStartAge,
        lifeExpectancy: extracted.lifeExpectancy,
      }
    : parseRetirementConversation(question, recentTurns.map(turn => turn.question));

  console.log('📋 Retirement inputs:', {
    source: extracted ? 'context_planner' : 'deterministic_fallback',
    currentAge: questionParams.currentAge,
    retirementAge: questionParams.retirementAge,
    annualWithdrawalAmount: questionParams.annualWithdrawalAmount,
    withdrawalStartAge: questionParams.withdrawalStartAge,
    // Which inputs were quoted, not the quotes: those are the user's own words
    // about their finances and do not belong in server logs.
    quotedFields: extracted ? Object.keys(extracted.sources) : undefined,
  });

  // The semantic planner already selected the retirement pack, so parameter
  // resolution proceeds even when the deterministic fallback parser would not
  // recognize the current message in isolation.

  // Attach the words each input came from, so the answer can state what it
  // acted on. Only present when the extractor read them from this decision.
  const inputSources = extracted?.sources && Object.keys(extracted.sources).length > 0
    ? extracted.sources
    : undefined;
  /**
   * Re-state what this projection excludes, on every path that returns one.
   *
   * The excluded value is a property of the portfolio as it stands now, not of
   * the analysis that was computed from it: a cached or reconstructed result
   * can be reused while balances and holdings coverage have moved. Recomputing
   * it here keeps the caveat present and current even when the numbers beside
   * it came out of the database -- a reused analysis that dropped its caveat
   * while keeping its understated figures is the worst of both.
   */
  const withCoverage = (analysis: RetirementAnalysis): RetirementAnalysis => {
    const carried = (analysis.disclaimers || [])
      .filter(disclaimer => !disclaimer.startsWith(UNMODELED_VALUE_NOTE_PREFIX));
    const internalReasons = (analysis.dataQuality?.unmodeledReasons || [])
      .filter(reason =>
        reason.kind === 'unrecognized-holdings' ||
        reason.kind === 'unsupported-asset-class'
      );
    const internallyUnmodeledValue = internalReasons
      .reduce((sum, reason) => sum + (Number.isFinite(reason.amount) ? reason.amount : 0), 0);
    const itemizedValue = unmodeledInvestments?.modeledValue ??
      ((analysis.dataQuality?.modeledValue ?? 0) + internallyUnmodeledValue);
    const modeledValue = Math.max(0, itemizedValue - internallyUnmodeledValue);
    const externallyUnmodeledValue = unmodeledInvestments?.unmodeledValue ?? 0;
    const unmodeledValue = internallyUnmodeledValue + externallyUnmodeledValue;
    const totalInvestments = modeledValue + unmodeledValue;
    const dataQuality = {
      ...analysis.dataQuality,
      modeledValue,
      unmodeledValue,
      valueCoverage: totalInvestments > 0 ? modeledValue / totalInvestments : 1,
      unmodeledReasons: [
        ...(unmodeledInvestments?.reasons ?? []).map(reason => ({
          label: reason.label,
          amount: reason.amount,
          kind: reason.kind,
        })),
        ...internalReasons,
      ],
    };
    const note = describeUnmodeledInvestmentValue({
      totalInvestments,
      modeledValue,
      unmodeledValue,
      valueCoverage: dataQuality.valueCoverage,
      reasons: dataQuality.unmodeledReasons.map(reason => ({
        accountId: '',
        label: reason.label,
        amount: reason.amount,
        kind: reason.kind === 'no-holdings'
          ? 'no-holdings'
          : reason.kind === 'unrecognized-holdings'
            ? 'unrecognized-holdings'
            : reason.kind === 'unsupported-asset-class'
              ? 'unsupported-asset-class'
              : 'partial-holdings',
      })),
    });
    // Coverage is restated on cache hits too; re-apply the ceiling so a stored
    // "high" cannot outlive data quality that now forbids it. A ceiling only
    // caps: preserve a stored confidence when it is lower than the newly
    // calculated ceiling rather than promoting it.
    const ceiling = calculateConfidenceCeiling(dataQuality as DataQualityReport);
    const rank: Record<string, number> = { low: 0, medium: 1, high: 2 };
    const stored = analysis.summary?.confidence;
    const confidence = stored && rank[stored] < rank[ceiling] ? stored : ceiling;
    return {
      ...analysis,
      summary: {
        ...analysis.summary,
        confidence,
      },
      dataQuality,
      disclaimers: note ? [note, ...carried] : carried,
    };
  };
  const withSources = (analysis: RetirementAnalysis): RetirementAnalysisResolution => {
    const covered = withCoverage(analysis);
    return inputSources ? { analysis: { ...covered, _inputSources: inputSources } } : { analysis: covered };
  };

  // Extract age from profile if not in question
  const { extractAgeFromProfile, extractRetirementAgeFromProfile } = await import('../retirement-analytics/profile-age-extractor');
  const profileAge = extractAgeFromProfile(userProfile);
  const profileRetirementAge = extractRetirementAgeFromProfile(userProfile);

  const { getPrismaClient } = await import('../prisma-client');
  const prisma = getPrismaClient();
  const recentAnalysis = await prisma.retirementAnalysis.findFirst({
    where: {
      userId,
      computedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    },
    orderBy: { computedAt: 'desc' }
  });
  const storedAnalysisInput = (recentAnalysis?.analysisInput || {}) as Record<string, unknown>;
  const storedInput = storedAnalysisInput as Record<string, number | null | undefined>;
  const { getHistoricalDatasetVersion } = await import('../retirement-analytics/engine/historical-data-loader');
  const historicalDatasetVersion = getHistoricalDatasetVersion();
  const confirmsStoredAnnualWithdrawal =
    /\b(?:yes|same|unchanged|continue|keep (?:it|that|the same)|use (?:it|that|the same|my previous|the previous)(?: amount)?)\b/i.test(question);
  const {
    currentAge,
    retirementAge,
    annualWithdrawalAmount,
    withdrawalStartAge,
    lifeExpectancy,
    missingParams,
    confirmationRequiredParams,
  } = resolveRetirementInputs({
    questionParams,
    profileAge,
    profileRetirementAge,
    storedInput,
    allowStoredAnnualWithdrawal: confirmsStoredAnnualWithdrawal || useExistingRetirementBaseline,
  });

  if (
    missingParams.length > 0 ||
    currentAge == null ||
    retirementAge == null ||
    annualWithdrawalAmount == null ||
    withdrawalStartAge == null
  ) {
    console.log(`Retirement analysis: Missing required parameters: ${missingParams.join(', ')}`);
    return {
      needsInfo: {
        missingParams,
        detectedParams: {
          currentAge: currentAge ?? undefined,
          retirementAge: retirementAge ?? undefined,
          annualWithdrawalAmount: annualWithdrawalAmount
            ?? (confirmationRequiredParams.includes('annualWithdrawalAmount')
              ? storedInput.annualWithdrawalAmount ?? undefined
              : undefined),
          withdrawalStartAge: withdrawalStartAge ?? undefined
        },
        confirmationRequiredParams,
      }
    };
  }

  // Resolve once so cache matching and the stored input use the same evidence
  // boundary as the engine. A full date prevents a January snapshot from
  // selecting an allocation that was not published until June.
  const effectiveAsOfDate = asOfDate ?? new Date().toISOString().slice(0, 10);

  // If recent analysis exists and parameters match, use it
  if (recentAnalysis) {
    const storedPortfolio = recentAnalysis.portfolioSnapshot as any;
    const portfolioMatches = Array.isArray(storedPortfolio?.holdings)
      && Array.isArray(storedPortfolio?.securities)
      && retirementPortfolioFingerprint(holdings, securities) === retirementPortfolioFingerprint(
        storedPortfolio.holdings,
        storedPortfolio.securities
      );
    const storedAsOfDate = resolveStoredAsOfDate(storedAnalysisInput, recentAnalysis.computedAt);
    if (
      portfolioMatches &&
      storedInput.currentAge === currentAge &&
      storedInput.retirementAge === retirementAge &&
      storedInput.annualWithdrawalAmount === annualWithdrawalAmount &&
      storedInput.withdrawalStartAge === withdrawalStartAge &&
      (storedInput.lifeExpectancy ?? 95) === lifeExpectancy &&
      storedAnalysisInput.analysisVersion === RETIREMENT_ANALYSIS_VERSION &&
      storedAnalysisInput.historicalDatasetVersion === historicalDatasetVersion &&
      storedAsOfDate === effectiveAsOfDate
    ) {
      console.log('📦 Using cached retirement analysis from database');
      const cachedAnalysis = recentAnalysis.historicalImplications as any;
      if (cachedAnalysis && cachedAnalysis.summary) {
        return withSources({
          ...cachedAnalysis,
          _storedInputParams: storedInput,
          _evidence: {
            recordId: recentAnalysis.id,
            computedAt: recentAnalysis.computedAt.toISOString(),
          },
        });
      }
      const reconstructedDataQuality = {
        completeness: recentAnalysis.dataQualityScore,
        // Legacy rows predate measured proxy coverage. Report it as unknown
        // rather than preserving the former hardcoded 80% claim.
        priceHistoryCoverage: 0,
        modeledValue: unmodeledInvestments?.modeledValue ?? 0,
        unmodeledValue: unmodeledInvestments?.unmodeledValue ?? 0,
        valueCoverage: unmodeledInvestments?.valueCoverage ?? 1,
        unmodeledReasons: (unmodeledInvestments?.reasons ?? []).map(reason => ({
          label: reason.label,
          amount: reason.amount,
          kind: reason.kind,
        })),
        metadataConfidence: 'medium' as const,
        portfolioMappingConfidence: 'medium' as const,
        proxiedValuePercentage: 0,
        proxyUsage: {
          usEquityProxy: 'VTI',
          internationalEquityProxy: 'VXUS',
          bondsProxy: 'AGG',
          unmappedHoldings: [],
          unsupportedHoldings: [],
          usListingFallbackHoldings: [],
          mappingMethod: 'direct',
        },
        assumptions: [],
        missingData: ['Historical proxy coverage was not recorded for this legacy analysis'],
      };
      const reconstructed: RetirementAnalysis = {
        summary: {
          characteristics: recentAnalysis.characteristics as any,
          tradeoffs: (recentAnalysis.characteristics as any).tradeoffs || cachedAnalysis?.summary?.tradeoffs || { upside: '', downside: '' },
          primaryObservation: (recentAnalysis.characteristics as any).primaryObservation || cachedAnalysis?.summary?.primaryObservation || '',
          confidence: cachedAnalysis?.summary?.confidence || 'medium' as const,
          timelineBucket: cachedAnalysis?.summary?.timelineBucket || '20' as const,
          timelineBucketNote: cachedAnalysis?.summary?.timelineBucketNote || ''
        },
        metrics: recentAnalysis.portfolioMetrics as any,
        stressTest: recentAnalysis.stressTestResults as any,
        historicalImplications: Array.isArray(cachedAnalysis?.historicalImplications) ? cachedAnalysis.historicalImplications : [],
        dataQuality: reconstructedDataQuality,
        // Regenerated rather than left empty. A legacy row stored no disclaimer
        // text, but the standing limitations of this analysis -- proxies, no
        // taxes or fees, not advice -- hold for a reconstructed result exactly
        // as they do for a fresh one, and dropping them silently presents the
        // numbers as better supported than they are.
        disclaimers: generateDisclaimers(reconstructedDataQuality),
        _storedInputParams: storedInput,
        _evidence: {
          recordId: recentAnalysis.id,
          computedAt: recentAnalysis.computedAt.toISOString(),
        },
      };
      return withSources(reconstructed);
    }
  }

  // Create new analysis
  try {
    const { analyzeRetirementPortfolio } = await import('../retirement-analytics');

    const analysisInput = {
      holdings,
      securities,
      unmodeledInvestments,
      // Persist the full evidence boundary used by the registry so a later
      // cache lookup cannot substitute a different allocation.
      asOfDate: effectiveAsOfDate,
      currentAge,
      retirementAge,
      lifeExpectancy,
      annualWithdrawalAmount,
      withdrawalStartAge,
      analysisVersion: RETIREMENT_ANALYSIS_VERSION,
      historicalDatasetVersion,
    };

    console.log('🔄 Running new retirement analysis for user:', userId);
    console.log('📋 Analysis input:', {
      holdingsCount: analysisInput.holdings.length,
      securitiesCount: analysisInput.securities.length,
      currentAge: analysisInput.currentAge,
      retirementAge: analysisInput.retirementAge,
      annualWithdrawalAmount: analysisInput.annualWithdrawalAmount,
      withdrawalStartAge: analysisInput.withdrawalStartAge
    });
    const analysisResult = await analyzeRetirementPortfolio(analysisInput);
    console.log('✅ Retirement analysis completed successfully');

    // Store in database
    // Note: Store full analysis result in historicalImplications field for retrieval
    const createdAnalysis = await prisma.retirementAnalysis.create({
      data: {
        userId,
        analysisInput: analysisInput as any,
        portfolioSnapshot: { holdings, securities } as any,
        portfolioMetrics: {
          equityAllocation: analysisResult.metrics.equityAllocation,
          tipsAllocation: analysisResult.metrics.tipsAllocation,
          tipsAllocationStatus: analysisResult.metrics.tipsAllocationStatus,
          withdrawalRate: analysisResult.metrics.withdrawalRate,
          yearsOfExpenses: analysisResult.metrics.yearsOfExpenses,
          historicalWithdrawalRates: analysisResult.metrics.historicalWithdrawalRates
        } as any,
        characteristics: {
          ...analysisResult.summary.characteristics,
          tradeoffs: analysisResult.summary.tradeoffs,
          primaryObservation: analysisResult.summary.primaryObservation
        } as any,
        stressTestResults: analysisResult.stressTest as any,
        historicalImplications: analysisResult as any, // Store full result for retrieval
        dataQualityScore: analysisResult.dataQuality.completeness,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Expires in 7 days
      }
    });

    console.log('💾 Retirement analysis completed and stored in database');
    const resultWithInputs = analysisResult as RetirementAnalysis;
    resultWithInputs._storedInputParams = {
      currentAge: analysisInput.currentAge,
      retirementAge: analysisInput.retirementAge,
      annualWithdrawalAmount: analysisInput.annualWithdrawalAmount,
      withdrawalStartAge: analysisInput.withdrawalStartAge,
      lifeExpectancy: analysisInput.lifeExpectancy,
    };
    resultWithInputs._evidence = {
      recordId: createdAnalysis.id,
      computedAt: createdAnalysis.computedAt.toISOString(),
    };
    return withSources(resultWithInputs);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : 'No stack trace';

    console.error('❌ Error creating retirement analysis:', {
      error: errorMessage,
      stack: errorStack,
      userId,
      holdingsCount: holdings.length,
      securitiesCount: securities.length
    });

    // Every failure below becomes a user-facing "I could not run this", which
    // makes the run that produced it invisible unless it is reported: the
    // misclassified cash balance that stopped this analysis reached Sentry
    // only as an unrelated provider warning from a different code path.
    // Typed conditions describe the user's data and ride at warning level;
    // anything unrecognized is a defect until proven otherwise.
    const { InsufficientHistoricalDataError } = await import(
      '../retirement-analytics/engine/stress-tester'
    );
    const { NoSupportedSimulationValueError, UnmappedNegativeHoldingError } = await import(
      '../retirement-analytics/engine/portfolio-mapper'
    );
    const isClassifiedDataCondition = error instanceof InsufficientHistoricalDataError
      || error instanceof NoSupportedSimulationValueError
      || error instanceof UnmappedNegativeHoldingError;
    Sentry.captureException(error, {
      level: isClassifiedDataCondition ? 'warning' : 'error',
      tags: { area: 'retirement_analysis' },
      extra: { holdingsCount: holdings.length, securitiesCount: securities.length },
    });

    // Log specific error details for common failure modes
    if (errorMessage.includes('Failed to fetch required asset basket data')) {
      console.error('💡 Retirement analysis failed due to missing asset basket data (VTI/VXUS/AGG). ' +
        'This usually indicates: 1) Tiingo API rate limits, 2) Missing API key, 3) Network issues, or 4) Empty API response.');
    } else if (errorMessage.includes('No price data returned')) {
      console.error('💡 Retirement analysis failed due to empty price data from Tiingo API. ' +
        'Check Tiingo API status and rate limits.');
    }

    if (error instanceof InsufficientHistoricalDataError) {
      const { maxTimelineYears } = error;
      // The engine knows exactly how far the record reaches. Carry that through
      // as data so the ask can name a timeline rather than say "shorter".
      const maxTimelineAge = maxTimelineYears > 0 && currentAge != null
        ? currentAge + maxTimelineYears
        : undefined;
      return {
        needsInfo: {
          missingParams: [],
          detectedParams: {},
          unavailableReason: maxTimelineYears > 0
            ? `${errorMessage}. Ask the user to model through age ${maxTimelineAge ?? `${maxTimelineYears} years out`} ` +
              'or earlier instead of estimating beyond the available history.'
            : `${errorMessage}. Do not estimate beyond the available history.`,
          unavailableCode: 'insufficient_history',
          historyLimit: {
            maxTimelineYears,
            maxTimelineAge,
            firstMonth: error.firstMonth ?? undefined,
            lastMonth: error.lastMonth ?? undefined,
            limitedByInternationalHistory: error.limitedByInternationalHistory,
          },
        },
      };
    }

    if (error instanceof NoSupportedSimulationValueError) {
      return {
        needsInfo: {
          missingParams: [],
          detectedParams: {},
          unavailableReason:
            `${errorMessage}. Do not invent a historical projection for unsupported or unresolved sleeves.`,
          unavailableCode: 'no_supported_simulation',
        },
      };
    }

    if (error instanceof UnmappedNegativeHoldingError) {
      return {
        needsInfo: {
          missingParams: [],
          detectedParams: {},
          // Not a retry: the same holding blocks the same way every time.
          unavailableReason:
            `${errorMessage}. Name the holding for the user and say that retrying will not help, ` +
            'instead of estimating the projection from aggregates.',
          unavailableCode: 'unmapped_negative_holding',
          blockingHoldingLabel: error.label,
        },
      };
    }

    return {
      needsInfo: {
        missingParams: [],
        detectedParams: {},
        unavailableReason:
          'Retirement analysis could not be completed because the portfolio analysis service failed. Ask the user to try again later instead of estimating from aggregates alone.',
        unavailableCode: 'service_error',
      },
    };
  }
}
function buildTransactionSummaries(transactions: Transaction[], accountMap?: Map<string, Account>): TransactionSummaryItem[] {
  return transactions.map(transaction => {
    const id =
      transaction.transaction_id ||
      (transaction as any).id ||
      `${transaction.account_id}-${transaction.date}-${transaction.name}`;

    const amount = Number(transaction.amount) || 0;
    const typeLabel = deriveTransactionTypeLabel(transaction);
    const categoryLabel = deriveCategory(transaction);

    // Extract merchant name from transaction
    const merchantName = (transaction as any).merchantName ||
                        (transaction.enriched_data as any)?.merchant_name ||
                        (transaction.enriched_data as any)?.brand_name;

    // Look up account information if accountMap is provided
    let accountName: string | undefined;
    let accountInstitution: string | undefined;
    if (accountMap && transaction.account_id) {
      const account = accountMap.get(transaction.account_id);
      if (account) {
        accountName = account.name;
        accountInstitution = account.institution;
      }
    }

    return {
      id,
      name: transaction.name || 'Unknown',
      amount,
      date: transaction.date,
      typeLabel,
      categoryLabel,
      merchantName,
      accountName,
      accountInstitution
    };
  });
}

function deriveTransactionTypeLabel(transaction: Transaction): string {
  // ✅ CRITICAL: Prioritize aiCategory first (this is the source of truth from our categorization service)
  // aiCategory stores the transaction type: income, expense, transfer_in, transfer_out, buy, sell, etc.
  // This ensures we use the AI-categorized type, which respects manual corrections and proper categorization

  // Check for manual corrections first (highest priority)
  const isManualCorrection = transaction.aiCategoryReason?.toLowerCase().includes('manually corrected') ||
                             transaction.aiCategoryReason?.toLowerCase().includes('corrected by user');

  // Priority order:
  // 1. aiCategory (if manual correction, or if available)
  // 2. transaction_type (fallback, may be set from aiCategory when loading from DB)
  // 3. undefined (will result in (OTHER))
  const rawType = transaction.aiCategory || (transaction as any).transaction_type;

  const normalized = typeof rawType === 'string' ? rawType.toLowerCase().trim() : '';

  switch (normalized) {
    case 'income':
      return '(INCOME)';
    case 'expense':
      return '(EXPENSE)';
    case 'fee':
      return '(FEE)';
    case 'transfer_in':
      return '(TRANSFER_IN)';
    case 'transfer_out':
      return '(TRANSFER_OUT)';
    case 'deposit':
      return '(DEPOSIT)';
    case 'withdrawal':
      return '(WITHDRAWAL)';
    case 'buy':
      return '(BUY)';
    case 'sell':
      return '(SELL)';
    case 'refund':
      return '(REFUND)';
    case 'adjustment':
      return '(ADJUSTMENT)';
    default:
      return '(OTHER)';
  }
}

function deriveCategory(transaction: Transaction): string | undefined {
  // ✅ Check category array first (most direct)
  if (Array.isArray(transaction.category) && transaction.category.length > 0) {
    // Filter out empty/null/0 values
    const validCategories = transaction.category.filter(cat => cat && String(cat).trim() !== '' && cat !== '0');
    if (validCategories.length > 0) {
      return validCategories.join(' > ');
    }
  }

  // ✅ CRITICAL FIX: Handle category as string (comma-separated from database)
  // When loading from database, category is stored as "FOOD_AND_DRINK, FOOD_AND_DRINK_COFFEE"
  // Note: Transaction interface defines category as string[], but database stores it as string
  const categoryValue = transaction.category as string | string[] | undefined;
  if (typeof categoryValue === 'string' && categoryValue.trim() !== '') {
    const categoryParts = categoryValue.split(',').map((item: string) => item.trim()).filter(Boolean);
    const validCategories = categoryParts.filter((cat: string) => cat !== '0');
    if (validCategories.length > 0) {
      return validCategories.join(' > ');
    }
  }

  // ✅ Check personal_finance_category directly on transaction
  if ((transaction as any).personal_finance_category?.primary) {
    const primary = (transaction as any).personal_finance_category.primary;
    const detailed = (transaction as any).personal_finance_category.detailed;
    return detailed ? `${primary} > ${detailed}` : primary;
  }

  // ✅ CRITICAL FIX: Check personal_finance_category in enriched_data (where it's stored from database)
  if (transaction.enriched_data && typeof transaction.enriched_data === 'object') {
    const enriched = transaction.enriched_data as any;
    if (enriched.personal_finance_category?.primary) {
      const primary = enriched.personal_finance_category.primary;
      const detailed = enriched.personal_finance_category.detailed;
      return detailed ? `${primary} > ${detailed}` : primary;
    }

    // ✅ Also check category array in enriched_data
    if (Array.isArray(enriched.category) && enriched.category.length > 0) {
      const validCategories = enriched.category.filter((cat: any) => cat && String(cat).trim() !== '' && cat !== '0');
      if (validCategories.length > 0) {
        return validCategories.join(' > ');
      }
    }

    // ✅ Also check category as string in enriched_data
    if (typeof enriched.category === 'string' && enriched.category.trim() !== '') {
      const categoryString = enriched.category as string;
      const categoryParts = categoryString.split(',').map((item: string) => item.trim()).filter(Boolean);
      const validCategories = categoryParts.filter((cat: string) => cat !== '0');
      if (validCategories.length > 0) {
        return validCategories.join(' > ');
      }
    }
  }

  // ✅ FALLBACK: If no category found, try to infer from transaction name or merchant
  // This helps GPT categorize transactions even when Plaid didn't provide a category
  const transactionName = (transaction.name || '').toLowerCase();
  const merchantName = ((transaction as any).merchant_name || (transaction as any).merchantName || '').toLowerCase();

  // "gas" is ambiguous: it matches both a gas utility bill and a filling station.
  // The utility rule below used to match a bare "gas" and runs first, which made
  // the transportation rule's own 'gas' keyword unreachable — "Shell Gas Station"
  // and "Costco Gas" were filed as housing/utilities, so fuel spending reached the
  // model as a housing cost. Only utility phrasing counts as a gas bill now; a
  // bare "gas" falls through to transportation.
  //
  // Every phrase here can actually decide a match. 'gas & electric' and
  // 'gas utility' are deliberately absent: any name containing them also contains
  // "electric" or "utility", which the rule already matches on its own, so they
  // could be deleted with every test still green.
  const gasUtilityPhrases = [
    'natural gas',
    'gas bill',
    'gas company',
    'gas service'
  ];
  const looksLikeGasUtility = gasUtilityPhrases.some(phrase => transactionName.includes(phrase));

  // Common patterns to infer category
  if (transactionName.includes('rent') || transactionName.includes('apartment') || transactionName.includes('housing')) {
    return 'RENT_AND_UTILITIES';
  }
  if (transactionName.includes('electric') || looksLikeGasUtility || transactionName.includes('water') || transactionName.includes('utility')) {
    return 'RENT_AND_UTILITIES';
  }
  if (transactionName.includes('grocery') || transactionName.includes('supermarket') || transactionName.includes('food') || transactionName.includes('restaurant') || transactionName.includes('cafe')) {
    return 'FOOD_AND_DRINK';
  }
  if (transactionName.includes('gas') || transactionName.includes('fuel') || transactionName.includes('shell') || transactionName.includes('chevron') || transactionName.includes('exxon')) {
    return 'TRANSPORTATION';
  }
  if (transactionName.includes('amazon') || transactionName.includes('target') || transactionName.includes('walmart') || transactionName.includes('shopping')) {
    return 'GENERAL_MERCHANDISE';
  }
  if (merchantName) {
    // If we have a merchant name but no category, use the merchant name as a hint
    return `MERCHANT: ${merchantName}`;
  }

  return undefined;
}

function deriveInvestmentSnapshot(data: any): InvestmentSnapshot | undefined {
  const holdings = data?.holdings;
  if (!holdings || holdings.length === 0) {
    return undefined;
  }

  const totalValue = holdings.reduce(
    (sum: number, holding: any) => sum + (holding.institution_value || 0),
    0
  );
  const holdingCount = holdings.length;

  const summaryLines = holdings
    .slice(0, 10)
    .map((holding: any) => {
      const name = holding.security_name || holding.ticker_symbol || 'Holding';
      const value = holding.institution_value || 0;
      return `- ${name}: $${value.toFixed(2)}`;
    });

  return {
    totalValue,
    holdingCount,
    summaryLines
  };
}

function buildHomeValueSummary(homeData: HomeData): string {
  const formatCurrency = (value: number | null | undefined) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 'Unknown';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value);
  };

  const midValue = formatCurrency(homeData.valueMid);
  const lowValue = typeof homeData.valueLow === 'number' ? formatCurrency(homeData.valueLow) : undefined;
  const highValue = typeof homeData.valueHigh === 'number' ? formatCurrency(homeData.valueHigh) : undefined;
  const rangeLine = !homeData.isManualOverride && lowValue && highValue
    ? `Estimated range (85% confidence): ${lowValue} – ${highValue}`
    : undefined;

  const lastUpdatedDate = homeData.lastUpdated ? new Date(homeData.lastUpdated) : null;
  const lastUpdated = lastUpdatedDate && !Number.isNaN(lastUpdatedDate.getTime())
    ? lastUpdatedDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : undefined;

  // The numeric snapshot path has no stored address for some users; an empty
  // "Address:" line only adds a blank field to the model's context.
  const address = homeData.address?.trim();

  const lines = [
    address ? `Address: ${address}` : undefined,
    `${homeData.isManualOverride ? 'User-provided value' : 'Estimated value'}: ${midValue}`,
    rangeLine,
    `Source: ${homeData.isManualOverride ? 'User-provided manual value' : 'RentCast automated valuation model'}`,
    lastUpdated ? `Last updated: ${lastUpdated}` : undefined
  ].filter(Boolean) as string[];

  return lines.join('\n');
}

/**
 * Retrieval plus the per-query record of it. The outcomes survive a null
 * context so a plan that reached Brave and came back empty is still visible in
 * the evidence manifest, rather than looking like a search that never ran.
 */
async function maybeFetchSearchContext(
  searchQueries: readonly PlannedSearchQuery[],
  questionNeeds: QuestionNeeds,
  tier: UserTier,
  deferred: boolean
): Promise<{ context?: SearchContext; queryOutcomes: SearchQueryEvidence[] }> {
  if (!questionNeeds.needsSearchContext || deferred || searchQueries.length === 0) {
    return { queryOutcomes: [] };
  }

  let queryOutcomes: SearchQueryEvidence[] = [];
  try {
    const context = await dataOrchestrator.getSearchContextForQueries(searchQueries, tier, {
      onQueryOutcomes: (outcomes) => { queryOutcomes = outcomes; },
    }) ?? undefined;
    return { context, queryOutcomes };
  } catch (error) {
    console.warn('Search context fetch failed', error);
    return { queryOutcomes };
  }
}

async function maybeFetchMarketContext(
  questionNeeds: QuestionNeeds,
  tier: UserTier
): Promise<{
  text: string;
  metadata: NonNullable<FinancialContextSnapshot['marketContextMetadata']>;
} | undefined> {
  if (!questionNeeds.needsMarketContext) {
    return undefined;
  }

  try {
    const { MarketNewsManager } = await import('../market-news/manager');
    const marketNewsManager = new MarketNewsManager();
    const observation = await marketNewsManager.getMarketContextObservation(tier);
    if (observation?.contextText.trim()) {
      return {
        text: observation.contextText,
        metadata: {
          id: observation.id,
          tier,
          lastUpdate: observation.lastUpdate.toISOString(),
          source: 'stored',
        },
      };
    }
    throw new Error(`No stored market-news context is available for ${tier}`);
  } catch (primaryError) {
    console.warn('Market news context failed, attempting orchestrator fallback', primaryError);
    try {
      const text = await dataOrchestrator.getMarketContextSummary(tier);
      return text.trim() ? {
        text,
        metadata: {
          tier,
          lastUpdate: new Date().toISOString(),
          source: 'fallback',
        },
      } : undefined;
    } catch (fallbackError) {
      console.warn('Market context fallback failed', fallbackError);
      return undefined;
    }
  }
}

async function loadPersonalContext(userId?: string): Promise<string | undefined> {
  if (!userId) {
    return undefined;
  }

  try {
    const { ProfileManager } = await import('../profile/manager');
    const profileManager = new ProfileManager();

    const personalContext = await profileManager.getPersonalContextForModel(userId);
    if (personalContext) return personalContext;
    return undefined;
  } catch (error) {
    console.warn('Remembered personal context load failed', error);
    return undefined;
  }
}

// Exported for unit testing. These are the pure helpers behind
// gatherContextSnapshot — category derivation, transaction summarisation,
// investment and home-value formatting. Exporting
// them lets the tests exercise the logic directly rather than through the
// orchestrator's network and database calls. Same convention as src/plaid.ts.
export {
  buildTransactionSummaries,
  deriveTransactionTypeLabel,
  deriveCategory,
  deriveInvestmentSnapshot,
  buildHomeValueSummary
};
