import { UserTier } from '../data/types';
import { dataOrchestrator } from '../data/orchestrator';
import { Account, Transaction, UnifiedFinancialData, HomeData } from '../services/financial-data-service';
import { TokenStatus } from '../services/token-validation-service';
import { QuestionNeeds, FinancialContextSnapshot, TransactionSummaryItem, InvestmentSnapshot } from './types';
import { buildAccountSummaries } from './account-summary';
import { buildCanonicalCashFlowAnalyses } from './cash-flow-context';
import { resolveRetirementInputs, retirementPortfolioFingerprint } from './retirement-inputs';

interface GatherContextArgs {
  userId?: string;
  question: string;
  questionNeeds: QuestionNeeds;
  tier: UserTier;
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
    onProgress
  } = args;

  let accounts: Account[] = [];
  let bankingTransactions: Transaction[] = [];
  let investmentsSnapshot: InvestmentSnapshot | undefined;
  let homeValueSummary: string | undefined;
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
            const valueLine = `Home value: ${new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0
            }).format(homeValue)}`;
            homeValueSummary = storedHome?.address
              ? `Home address: ${storedHome.address}\n${valueLine}`
              : valueLine;
          } else {
            // HomeData object
            if (typeof homeValue.valueMid === 'number') {
              homeValueSummary = buildHomeValueSummary(homeValue);
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
  if (questionNeeds.needsSearchContext) onProgress?.('Searching financial knowledge base');
  if (questionNeeds.needsMarketContext) onProgress?.('Fetching market context');
  if (questionNeeds.needsUserProfile) onProgress?.('Preparing your profile');

  const tierContextAccounts = questionNeeds.needsAccountDetails ? accounts : [];
  const tierContextTransactions = questionNeeds.needsTransactionDetails
    ? sortedTransactions.slice(0, MAX_PROMPT_TRANSACTIONS)
    : [];

  const [tierContext, searchContext, marketContext, userOverrides, userProfile] = await Promise.all([
    dataOrchestrator.buildTierAwareContext(
      tier,
      tierContextAccounts,
      tierContextTransactions,
      { includeMarketContext: false }
    ),
    maybeFetchSearchContext(question, questionNeeds, tier),
    maybeFetchMarketContext(questionNeeds, tier),
    fetchUserOverrides(),
    questionNeeds.needsUserProfile
      ? loadUserProfile(userId)
      : Promise.resolve(undefined)
  ]);

  const monthlyIncomeOverride = userOverrides.monthlyIncomeOverride;
  const monthlyExpenseOverride = userOverrides.monthlyExpenseOverride;

  if (questionNeeds.needsHomeValue && userProfile && homeValueSummary === 'Home value data is currently unavailable.') {
    const address = userProfile.match(/HOME_ADDRESS:\s*(.+)/)?.[1]?.trim();
    if (address) {
      homeValueSummary = `Home address: ${address}. Home value estimate is not currently available, but the user owns this property.`;
    }
  }

  const { incomeResult, expenseResult, monthlyAnalysis } = buildCanonicalCashFlowAnalyses(
    transactionSummary,
    monthlyIncomeOverride,
    monthlyExpenseOverride,
    questionNeeds.needsMonthlyCashFlow
  );
  const incomeAnalysis = incomeResult?.text;
  const expenseAnalysis = expenseResult?.text;

  // Fetch or create deterministic retirement analysis only for retirement questions.
  let retirementAnalysis: FinancialContextSnapshot['retirementAnalysis'] | undefined;
  let retirementAnalysisNeedsInfo: FinancialContextSnapshot['retirementAnalysisNeedsInfo'] | undefined;

  if (userId && questionNeeds.needsRetirement && investmentsSnapshot?.holdings && investmentsSnapshot.holdings.length > 0) {
    try {
      onProgress?.('Building your retirement snapshot');
      const result = await fetchOrCreateRetirementAnalysis({
        userId,
        question,
        userProfile: userProfile || '',
        holdings: investmentsSnapshot.holdings,
        securities: investmentsSnapshot.securities || [],
      });
      if (result.needsInfo) {
        retirementAnalysisNeedsInfo = result.needsInfo;
      } else {
        retirementAnalysis = result.analysis;
      }
    } catch (error) {
      console.error('❌ Error fetching/creating retirement analysis:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      retirementAnalysisNeedsInfo = {
        missingParams: [],
        detectedParams: {},
        unavailableReason:
          'Retirement analysis could not be completed because the portfolio analysis service failed. Ask the user to try again later instead of estimating from aggregates alone.',
      };
    }
  } else if (userId && questionNeeds.needsRetirement) {
    // Log why retirement analysis didn't trigger
    console.log('⚠️ Retirement analysis NOT triggered:', {
      reason: !investmentsSnapshot?.holdings ? 'No investment holdings' :
              investmentsSnapshot.holdings.length === 0 ? 'Empty holdings array' :
              'Unknown reason',
      hasInvestmentsSnapshot: !!investmentsSnapshot,
      holdingsLength: investmentsSnapshot?.holdings?.length || 0
    });
    retirementAnalysisNeedsInfo = {
      missingParams: [],
      detectedParams: {},
      unavailableReason:
        'No linked investment holdings are available for retirement analysis. Ask the user to connect investment accounts or provide portfolio details instead of estimating from net-worth aggregates alone.',
    };
  }

  return {
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
    searchContext,
    marketContext,
    userProfile,
    homeValueSummary,
    financialSummary: financialSummary || undefined,
    retirementAnalysis,
    retirementAnalysisNeedsInfo,
  };
}

type RetirementAnalysis = NonNullable<FinancialContextSnapshot['retirementAnalysis']>;

interface RetirementAnalysisResolution {
  analysis?: RetirementAnalysis;
  needsInfo?: FinancialContextSnapshot['retirementAnalysisNeedsInfo'];
}

/** Fetch a matching retirement analysis or create one from explicit, persisted inputs. */
async function fetchOrCreateRetirementAnalysis(args: {
  userId: string;
  question: string;
  userProfile: string;
  holdings: any[];
  securities: any[];
}): Promise<RetirementAnalysisResolution> {
  const { userId, question, userProfile, holdings, securities } = args;

  // Parse retirement parameters from question
  const { parseRetirementQuestion } = await import('../retirement-analytics/retirement-question-parser');
  const questionParams = parseRetirementQuestion(question);

  console.log('📋 Retirement question parser result:', {
    hasRetirementIntent: questionParams.hasRetirementIntent,
    currentAge: questionParams.currentAge,
    retirementAge: questionParams.retirementAge,
    annualWithdrawalAmount: questionParams.annualWithdrawalAmount,
    withdrawalStartAge: questionParams.withdrawalStartAge
  });

  // Note: We already check for retirement keywords at the trigger level,
  // so we proceed with parameter extraction even if parser doesn't detect intent

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
  const storedInput = (recentAnalysis?.analysisInput || {}) as Record<string, number | null | undefined>;
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
    allowStoredAnnualWithdrawal: confirmsStoredAnnualWithdrawal,
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

  // If recent analysis exists and parameters match, use it
  if (recentAnalysis) {
    const storedPortfolio = recentAnalysis.portfolioSnapshot as any;
    const portfolioMatches = Array.isArray(storedPortfolio?.holdings)
      && Array.isArray(storedPortfolio?.securities)
      && retirementPortfolioFingerprint(holdings, securities) === retirementPortfolioFingerprint(
        storedPortfolio.holdings,
        storedPortfolio.securities
      );
    if (
      portfolioMatches &&
      storedInput.currentAge === currentAge &&
      storedInput.retirementAge === retirementAge &&
      storedInput.annualWithdrawalAmount === annualWithdrawalAmount &&
      storedInput.withdrawalStartAge === withdrawalStartAge &&
      (storedInput.lifeExpectancy ?? 95) === lifeExpectancy
    ) {
      console.log('📦 Using cached retirement analysis from database');
      const cachedAnalysis = recentAnalysis.historicalImplications as any;
      if (cachedAnalysis && cachedAnalysis.summary) {
        return {
          analysis: {
            ...cachedAnalysis,
            _storedInputParams: storedInput,
            _evidence: {
              recordId: recentAnalysis.id,
              computedAt: recentAnalysis.computedAt.toISOString(),
            },
          },
        };
      }
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
        dataQuality: {
          completeness: recentAnalysis.dataQualityScore,
          // Legacy rows predate measured proxy coverage. Report it as unknown
          // rather than preserving the former hardcoded 80% claim.
          priceHistoryCoverage: 0,
          metadataConfidence: 'medium' as const,
          portfolioMappingConfidence: 'medium' as const,
          proxiedValuePercentage: 0,
          proxyUsage: {
            usEquityProxy: 'VTI',
            internationalEquityProxy: 'VXUS',
            bondsProxy: 'AGG',
            unmappedHoldings: [],
            mappingMethod: 'direct'
          },
          assumptions: [],
          missingData: ['Historical proxy coverage was not recorded for this legacy analysis']
        },
        disclaimers: [],
        _storedInputParams: storedInput,
        _evidence: {
          recordId: recentAnalysis.id,
          computedAt: recentAnalysis.computedAt.toISOString(),
        },
      };
      return { analysis: reconstructed };
    }
  }

  // Create new analysis
  try {
    const { analyzeRetirementPortfolio } = await import('../retirement-analytics');

    const analysisInput = {
      holdings,
      securities,
      currentAge,
      retirementAge,
      lifeExpectancy,
      annualWithdrawalAmount,
      withdrawalStartAge
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
    return { analysis: resultWithInputs };
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

    // Log specific error details for common failure modes
    if (errorMessage.includes('Failed to fetch required asset basket data')) {
      console.error('💡 Retirement analysis failed due to missing asset basket data (VTI/VXUS/AGG). ' +
        'This usually indicates: 1) Tiingo API rate limits, 2) Missing API key, 3) Network issues, or 4) Empty API response.');
    } else if (errorMessage.includes('No price data returned')) {
      console.error('💡 Retirement analysis failed due to empty price data from Tiingo API. ' +
        'Check Tiingo API status and rate limits.');
    }

    return {
      needsInfo: {
        missingParams: [],
        detectedParams: {},
        unavailableReason:
          'Retirement analysis could not be completed because the portfolio analysis service failed. Ask the user to try again later instead of estimating from aggregates alone.',
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

  // Common patterns to infer category
  if (transactionName.includes('rent') || transactionName.includes('apartment') || transactionName.includes('housing')) {
    return 'RENT_AND_UTILITIES';
  }
  if (transactionName.includes('electric') || transactionName.includes('gas') || transactionName.includes('water') || transactionName.includes('utility')) {
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
  const rangeLine =
    lowValue && highValue ? `Estimated range: ${lowValue} – ${highValue}` : undefined;

  const lastUpdated = homeData.lastUpdated
    ? new Date(homeData.lastUpdated).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : undefined;

  const lines = [
    `Address: ${homeData.address}`,
    `Estimated value: ${midValue}`,
    rangeLine,
    lastUpdated ? `Last updated: ${lastUpdated}` : undefined
  ].filter(Boolean) as string[];

  return lines.join('\n');
}

async function maybeFetchSearchContext(
  question: string,
  questionNeeds: QuestionNeeds,
  tier: UserTier
): Promise<string | undefined> {
  if (!questionNeeds.needsSearchContext) {
    return undefined;
  }

  try {
    const result = await dataOrchestrator.getSearchContext(question, tier);
    return result?.summary;
  } catch (error) {
    console.warn('Search context fetch failed', error);
    return undefined;
  }
}

async function maybeFetchMarketContext(
  questionNeeds: QuestionNeeds,
  tier: UserTier
): Promise<string | undefined> {
  if (!questionNeeds.needsMarketContext) {
    return undefined;
  }

  try {
    const { MarketNewsManager } = await import('../market-news/manager');
    const marketNewsManager = new MarketNewsManager();
    return await marketNewsManager.getMarketContext(tier);
  } catch (primaryError) {
    console.warn('Market news context failed, attempting orchestrator fallback', primaryError);
    try {
      return await dataOrchestrator.getMarketContextSummary(tier);
    } catch (fallbackError) {
      console.warn('Market context fallback failed', fallbackError);
      return undefined;
    }
  }
}

async function loadUserProfile(userId?: string): Promise<string | undefined> {
  if (!userId) {
    return undefined;
  }

  try {
    const { ProfileManager } = await import('../profile/manager');
    const profileManager = new ProfileManager();

    const profile = await profileManager.getOriginalProfile(userId);
    if (profile) {
      const normalized = profileManager.normalizeProfileHomeDataSection(profile);
      const deduped = profileManager.deduplicateHomeValueManual(normalized);
      return deduplicateLiabilitySections(deduped);
    }
    return undefined;
  } catch (error) {
    console.warn('Profile load failed', error);
    return undefined;
  }
}

/**
 * Remove duplicate "LIABILITIES INFORMATION" sections from profile text
 * GPT may add this section multiple times during profile enhancement
 */
function deduplicateLiabilitySections(profileText: string): string {
  // Match "LIABILITIES INFORMATION:" followed by content until the next section header or end
  // Pattern: "LIABILITIES INFORMATION:" followed by text (including newlines) until next section marker or end
  const liabilityPattern = /LIABILITIES INFORMATION:[\s\S]*?(?=\n\n(?:# |[A-Z][A-Z\s]+:)|$)/gi;
  const matches = [...profileText.matchAll(liabilityPattern)];

  if (!matches || matches.length <= 1) {
    // No duplicates found
    return profileText;
  }

  // Keep only the most complete version (longest one)
  const sortedMatches = matches.map(m => ({
    text: m[0],
    index: m.index!,
    length: m[0].length
  })).sort((a, b) => b.length - a.length);

  const keepMatch = sortedMatches[0];
  const removeMatches = sortedMatches.slice(1);

  // Build deduplicated text by removing duplicates
  let deduplicated = profileText;

  // Remove duplicates in reverse order (to preserve indices)
  for (const match of removeMatches.sort((a, b) => b.index - a.index)) {
    // Remove the match, preserving surrounding structure
    const before = deduplicated.slice(0, match.index);
    const after = deduplicated.slice(match.index + match.text.length);

    // Clean up any double newlines that might result
    deduplicated = (before.trimEnd() + '\n\n' + after.trimStart()).replace(/\n{3,}/g, '\n\n');
  }

  // Ensure we have the kept match (in case it was removed)
  if (!deduplicated.includes('LIABILITIES INFORMATION:')) {
    // Find insertion point (before "# Accounts" section if present, or after User Profile)
    const accountsIndex = deduplicated.indexOf('# Accounts');
    if (accountsIndex > 0) {
      const beforeAccounts = deduplicated.slice(0, accountsIndex).trimEnd();
      const afterAccounts = deduplicated.slice(accountsIndex);
      deduplicated = beforeAccounts + '\n\n' + keepMatch.text.trim() + '\n\n' + afterAccounts;
    } else {
      // Insert after User Profile section if present
      const userProfileEnd = deduplicated.indexOf('# User Profile');
      if (userProfileEnd >= 0) {
        const nextSectionMatch = deduplicated.slice(userProfileEnd).match(/\n\n# [A-Z]/);
        if (nextSectionMatch && nextSectionMatch.index) {
          const insertIndex = userProfileEnd + nextSectionMatch.index;
          deduplicated = deduplicated.slice(0, insertIndex) + '\n\n' + keepMatch.text.trim() + deduplicated.slice(insertIndex);
        } else {
          deduplicated = deduplicated.trimEnd() + '\n\n' + keepMatch.text.trim();
        }
      } else {
        deduplicated = deduplicated.trimEnd() + '\n\n' + keepMatch.text.trim();
      }
    }
  }

  // Final cleanup of excessive newlines
  deduplicated = deduplicated.replace(/\n{3,}/g, '\n\n');

  console.warn(`⚠️ deduplicateLiabilitySections: Removed ${removeMatches.length} duplicate "LIABILITIES INFORMATION" section(s) from profile`);

  return deduplicated;
}
