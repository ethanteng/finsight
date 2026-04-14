import { UserTier } from '../data/types';
import { dataOrchestrator } from '../data/orchestrator';
import { Account, Transaction, UnifiedFinancialData, HomeData } from '../services/financial-data-service';
import { TokenStatus } from '../services/token-validation-service';
import { QuestionNeeds, FinancialContextSnapshot, AccountSummaryItem, TransactionSummaryItem, InvestmentSnapshot } from './types';
import type { DemoAccount, DemoTransaction } from '../demo-data';

interface GatherContextArgs {
  userId?: string;
  isDemo: boolean;
  question: string;
  questionNeeds: QuestionNeeds;
  tier: UserTier;
  demoProfile?: string;
  /** When true, always fetch market and RAG context (for Ask Linc financial reasoning pipeline) */
  alwaysIncludeMarketAndRAG?: boolean;
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
    isDemo,
    question,
    questionNeeds,
    tier,
    demoProfile,
    alwaysIncludeMarketAndRAG = false,
    onProgress
  } = args;

  let accounts: Account[] = [];
  let bankingTransactions: Transaction[] = [];
  let investmentsSnapshot: InvestmentSnapshot | undefined;
  let homeValueSummary: string | undefined;
  let metadata: UnifiedFinancialData['metadata'] = { ...DEFAULT_METADATA };
  let financialSummary: { financialOverview?: any; investmentPortfolio?: any } | null = null;

  if (isDemo) {
    const { demoData } = await import('../demo-data');
    accounts = (demoData.accounts || []).map(mapDemoAccount);
    bankingTransactions = (demoData.transactions || []).map(mapDemoTransaction);
    investmentsSnapshot = deriveDemoInvestmentSnapshot(demoData.investments);
    metadata = {
      ...DEFAULT_METADATA,
      lastUpdated: new Date(),
      dataSources: {
        plaid: 'demo',
        snaptrade: 'demo'
      }
    };
    if (questionNeeds.needsHomeValue) {
      homeValueSummary = 'Home value data is not available in demo mode.';
    }
  } else if (userId) {
    // Fetch full snapshot for GPT context (single source of truth, already deduplicated)
    const { SummaryCacheService } = await import('../services/summary-cache-service');
    const snapshot = await SummaryCacheService.getLatestSnapshot(userId, 'full');

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
      
      // Check for duplicates in the snapshot itself (before defensive deduplication)
      const snapshotAccountIds = new Set<string>();
      const snapshotDuplicates: string[] = [];
      accounts.forEach(account => {
        const accountId = account.account_id || (account as any).plaidAccountId || (account as any).persistentAccountId;
        if (accountId) {
          if (snapshotAccountIds.has(accountId)) {
            snapshotDuplicates.push(accountId);
          } else {
            snapshotAccountIds.add(accountId);
          }
        }
      });
      if (snapshotDuplicates.length > 0) {
        console.error(`❌ gatherContextSnapshot: Snapshot contains ${snapshotDuplicates.length} duplicate account_ids in JSON! This indicates the snapshot was created before deduplication fix or has corrupted data.`);
        console.error(`   Duplicate account_ids in snapshot: ${snapshotDuplicates.slice(0, 10).join(', ')}${snapshotDuplicates.length > 10 ? '...' : ''}`);
        console.error(`   Snapshot computedAt: ${(snapshot as any).computedAt}`);
      } else {
        console.log(`✅ gatherContextSnapshot: Snapshot contains ${accounts.length} unique accounts (no duplicates in JSON)`);
      }
      
      // ✅ CRITICAL: snapshot.transactions is stored as JSON in the database
      // When retrieved, Prisma parses it, but we need to ensure it's an array
      const rawTransactions = snapshot.transactions as any;
      bankingTransactions = Array.isArray(rawTransactions) ? rawTransactions as Transaction[] : [];
      
      if (!Array.isArray(rawTransactions)) {
        console.warn(`⚠️ gatherContextSnapshot: Snapshot transactions is not an array (type: ${typeof rawTransactions}), defaulting to empty array`);
      } else {
        console.log(`📊 gatherContextSnapshot: Retrieved ${bankingTransactions.length} transactions from snapshot for user ${userId}`);
      }
      
      metadata = snapshot.meta as UnifiedFinancialData['metadata'];
      
      // ✅ Set financialSummary for prompt builder
      financialSummary = {
        financialOverview: snapshot.financialOverview,
        investmentPortfolio: snapshot.investmentPortfolio
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
            const value = holding.institution_value || 0;
            return `- ${name}: $${value.toFixed(2)}`;
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
        
        // Also check user profile for home address (in case it's there but homeValue fetch failed)
        let homeAddressFromProfile: string | null = null;
        if (userId && !isDemo) {
          try {
            const { ProfileManager } = await import('../profile/manager');
            const profileManager = new ProfileManager();
            const profileText = await profileManager.getOriginalProfile(userId);
            const addressMatch = profileText.match(/HOME_ADDRESS:\s*(.+)/);
            if (addressMatch) {
              homeAddressFromProfile = addressMatch[1].trim();
            }
          } catch (error) {
            // Ignore errors - we'll use homeValue data if available
          }
        }
        
        if (homeValue) {
          if (typeof homeValue === 'number') {
            if (homeValue > 0) {
              homeValueSummary = `Home value: $${new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 0
              }).format(homeValue)}`;
            } else {
              // Value is 0 but address might be available
              const address = homeAddressFromProfile;
              if (address) {
                homeValueSummary = `Home address: ${address}. Home value estimate is not currently available, but the user owns this property.`;
              } else {
                homeValueSummary = 'Home value data is currently unavailable.';
              }
            }
          } else {
            // HomeData object
            if (homeValue.valueMid > 0 || homeValue.valueHigh > 0 || homeValue.valueLow > 0) {
              homeValueSummary = buildHomeValueSummary(homeValue);
            } else if (homeValue.address) {
              // Address exists but value is 0
              homeValueSummary = `Home address: ${homeValue.address}. Home value estimate is not currently available, but the user owns this property.`;
            } else {
              homeValueSummary = 'Home value data is currently unavailable.';
            }
          }
        } else {
          // Check if we have address in profile even without value
          const address = homeAddressFromProfile;
          if (address) {
            homeValueSummary = `Home address: ${address}. Home value estimate is not currently available, but the user owns this property.`;
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

  onProgress?.('Reviewing your transaction history');

  // ✅ CRITICAL: Deduplicate accounts by account_id/plaidAccountId as a safety net
  // Even though the snapshot should already be deduplicated, we add this as a defensive check
  // in case corrupted database records slip through with duplicate account_id values
  // IMPORTANT: Use the same deduplication key logic as SummaryCacheService to ensure consistency
  const accountIdMap = new Map<string, Account>();
  const duplicateAccountIds: string[] = [];
  
  accounts.forEach(account => {
    // ✅ Use the same key logic as SummaryCacheService: account_id || plaidAccountId || persistentAccountId
    // Do NOT use account.id (database ID) as it's unique per record and won't catch duplicates
    const accountId = account.account_id || (account as any).plaidAccountId || (account as any).persistentAccountId;
    if (accountId) {
      if (accountIdMap.has(accountId)) {
        duplicateAccountIds.push(accountId);
        console.warn(`⚠️ gatherContextSnapshot: Duplicate account_id detected: ${accountId} (${account.name}). Snapshot should have deduplicated this!`);
        // Keep the most recent account based on timestamp
        const existing = accountIdMap.get(accountId)!;
        const existingTimestamp = existing.lastSyncedAt || existing.snapshotTimestamp || (existing as any).updatedAt;
        const newTimestamp = account.lastSyncedAt || account.snapshotTimestamp || (account as any).updatedAt;
        if (newTimestamp && (!existingTimestamp || new Date(newTimestamp) > new Date(existingTimestamp))) {
          accountIdMap.set(accountId, account);
        }
      } else {
        accountIdMap.set(accountId, account);
      }
    } else {
      console.warn(`⚠️ gatherContextSnapshot: Account without account_id/plaidAccountId: ${account.name}, skipping`);
    }
  });
  
  const deduplicatedAccounts = Array.from(accountIdMap.values());
  
  if (duplicateAccountIds.length > 0) {
    console.error(`❌ gatherContextSnapshot: Snapshot returned ${duplicateAccountIds.length} duplicate accounts! This indicates corrupted database records or a bug in snapshot deduplication.`);
    console.error(`   Duplicate account_ids: ${duplicateAccountIds.join(', ')}`);
  }
  
  if (accounts.length !== deduplicatedAccounts.length) {
    console.warn(`⚠️ gatherContextSnapshot: Deduplicated ${accounts.length} accounts → ${deduplicatedAccounts.length} unique accounts (removed ${accounts.length - deduplicatedAccounts.length} duplicates)`);
  }
  
  // Filter out pending transactions and deduplicate pending/settled pairs
  // This prevents inflated expense/income calculations in GPT context
  const filteredTransactions = deduplicateTransactions(bankingTransactions);
  
  const sortedTransactions = filteredTransactions
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // ✅ Use deduplicated accounts and sorted transactions directly (no anonymization)
  console.log(`📊 gatherContextSnapshot: Using ${deduplicatedAccounts.length} deduplicated accounts (from ${accounts.length} original)`);

  const accountSummaries = buildAccountSummaries(deduplicatedAccounts, isDemo);
  // Create account map for quick lookup by account_id
  const accountMap = new Map<string, Account>();
  deduplicatedAccounts.forEach(account => {
    const accountId = account.account_id || (account as any).plaidAccountId || (account as any).persistentAccountId || account.id;
    if (accountId) {
      accountMap.set(accountId, account);
    }
  });
  const transactionSummaries = buildTransactionSummaries(sortedTransactions, accountMap).slice(
    0,
    MAX_PROMPT_TRANSACTIONS
  );

  const tierContext = await dataOrchestrator.buildTierAwareContext(
    tier,
    deduplicatedAccounts,
    sortedTransactions.slice(0, MAX_PROMPT_TRANSACTIONS),
    isDemo
  );

  const effectiveQuestionNeeds = alwaysIncludeMarketAndRAG
    ? { ...questionNeeds, needsMarketContext: true, needsSearchContext: true }
    : questionNeeds;
  onProgress?.('Searching financial knowledge base');
  const searchContext = await maybeFetchSearchContext(question, effectiveQuestionNeeds, tier, isDemo);
  onProgress?.('Fetching market context');
  const marketContext = await maybeFetchMarketContext(effectiveQuestionNeeds, tier, isDemo);

  // Fetch user overrides for monthly income/expenses
  let monthlyIncomeOverride: number | null | undefined = undefined;
  let monthlyExpenseOverride: number | null | undefined = undefined;
  
  if (userId && !isDemo) {
    try {
      const { getPrismaClient } = await import('../prisma-client');
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          monthlyIncomeOverride: true,
          monthlyExpenseOverride: true
        }
      });
      
      if (user) {
        monthlyIncomeOverride = user.monthlyIncomeOverride;
        monthlyExpenseOverride = user.monthlyExpenseOverride;
      }
    } catch (error) {
      console.error('Failed to fetch user overrides:', error);
      // Continue without overrides if fetch fails
    }
  }

  const incomeResult = buildIncomeAnalysis(sortedTransactions, monthlyIncomeOverride);
  const expenseResult = buildExpenseAnalysis(sortedTransactions, monthlyExpenseOverride);
  const incomeAnalysis = incomeResult?.text;
  const expenseAnalysis = expenseResult?.text;
  
  // ✅ Pass deduplicated accounts and sorted transactions to loadUserProfile
  // The profile enhancer needs the actual account data, not anonymized tokens
  console.log(`📊 gatherContextSnapshot: Passing ${deduplicatedAccounts.length} deduplicated accounts to loadUserProfile`);
  onProgress?.('Preparing your profile');

  const userProfile = await loadUserProfile({
    userId,
    isDemo,
    demoProfile,
    accounts: deduplicatedAccounts,
    transactions: sortedTransactions
  });

  // Fetch or create retirement analysis if question is retirement-related
  let retirementAnalysis: FinancialContextSnapshot['retirementAnalysis'] | undefined;
  let retirementAnalysisNeedsInfo: FinancialContextSnapshot['retirementAnalysisNeedsInfo'] | undefined;
  
  // Debug logging for retirement analysis trigger
  console.log('🔍 Retirement analysis trigger check:', {
    userId,
    isDemo,
    needsRetirement: questionNeeds.needsRetirement,
    hasInvestments: !!investmentsSnapshot?.holdings,
    holdingsCount: investmentsSnapshot?.holdings?.length || 0,
    question: question.substring(0, 100),
    willTrigger: userId && !isDemo && questionNeeds.needsRetirement && investmentsSnapshot?.holdings && investmentsSnapshot.holdings.length > 0
  });
  
  if (userId && !isDemo && questionNeeds.needsRetirement && investmentsSnapshot?.holdings && investmentsSnapshot.holdings.length > 0) {
    try {
      onProgress?.('Building your retirement snapshot');
      console.log('✅ Retirement analysis conditions met, parsing question...');
      // First check if we have the required parameters
      const { parseRetirementQuestion } = await import('../retirement-analytics/retirement-question-parser');
      const { extractAgeFromProfile, extractRetirementAgeFromProfile } = await import('../retirement-analytics/profile-age-extractor');
      const questionParams = parseRetirementQuestion(question);
      const profileAge = extractAgeFromProfile(userProfile || '');
      const profileRetirementAge = extractRetirementAgeFromProfile(userProfile || '');
      
      console.log('📊 Retirement parameters parsed:', {
        questionParams: {
          hasRetirementIntent: questionParams.hasRetirementIntent,
          currentAge: questionParams.currentAge,
          retirementAge: questionParams.retirementAge,
          annualWithdrawalAmount: questionParams.annualWithdrawalAmount
        },
        profileAge,
        profileRetirementAge
      });
      
      // Calculate portfolio value for withdrawal amount estimation
      const portfolioValue = investmentsSnapshot.totalValue || 
        investmentsSnapshot.holdings.reduce((sum: number, h: any) => sum + (h.institution_value || h.value || 0), 0);
      
      // Apply reasonable defaults for missing parameters
      const currentAge = questionParams.currentAge || profileAge || 45; // Default to 45 if not available
      const retirementAge = questionParams.retirementAge || profileRetirementAge || 65; // Default to 65 if not available
      // Use 4% rule (portfolio value * 0.04) as default annual withdrawal if not specified
      const annualWithdrawalAmount = questionParams.annualWithdrawalAmount || (portfolioValue > 0 ? portfolioValue * 0.04 : undefined);
      const withdrawalStartAge = questionParams.withdrawalStartAge || retirementAge;
      
      // Check what's still missing (after applying defaults)
      const missingParams: Array<'currentAge' | 'retirementAge' | 'annualWithdrawalAmount' | 'withdrawalStartAge'> = [];
      if (!currentAge) missingParams.push('currentAge');
      if (!annualWithdrawalAmount) missingParams.push('annualWithdrawalAmount');
      
      if (missingParams.length > 0) {
        console.log('⚠️ Retirement analysis: Missing parameters after defaults:', missingParams);
        // Set needsInfo flag so Linc will ask
        retirementAnalysisNeedsInfo = {
          missingParams,
          detectedParams: {
            currentAge: currentAge || undefined,
            retirementAge: retirementAge || undefined,
            annualWithdrawalAmount: annualWithdrawalAmount || undefined,
            withdrawalStartAge: withdrawalStartAge || undefined
          }
        };
      } else {
        console.log('✅ Retirement parameters ready (with defaults applied):', {
          currentAge,
          retirementAge,
          annualWithdrawalAmount,
          withdrawalStartAge,
          portfolioValue,
          usedDefaults: {
            currentAge: !questionParams.currentAge && !profileAge,
            retirementAge: !questionParams.retirementAge && !profileRetirementAge,
            annualWithdrawalAmount: !questionParams.annualWithdrawalAmount
          }
        });
        // We have all required info (with defaults), proceed with analysis
        const result = await fetchOrCreateRetirementAnalysis({
          userId,
          question,
          userProfile: userProfile || '',
          holdings: investmentsSnapshot.holdings,
          securities: investmentsSnapshot.securities || []
        });
        retirementAnalysis = result;
        console.log('✅ Retirement analysis completed:', result ? 'Analysis returned' : 'No analysis returned');
      }
    } catch (error) {
      console.error('❌ Error fetching/creating retirement analysis:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      // Don't fail the entire context gathering if retirement analysis fails
    }
  } else if (userId && !isDemo && questionNeeds.needsRetirement) {
    // Log why retirement analysis didn't trigger
    console.log('⚠️ Retirement analysis NOT triggered:', {
      reason: !investmentsSnapshot?.holdings ? 'No investment holdings' : 
              investmentsSnapshot.holdings.length === 0 ? 'Empty holdings array' :
              'Unknown reason',
      hasInvestmentsSnapshot: !!investmentsSnapshot,
      holdingsLength: investmentsSnapshot?.holdings?.length || 0
    });
  }

  // Always fetch existing retirement analysis for investment/portfolio/retirement questions
  // This ensures follow-up questions can reference the analysis even without exact parameter matching
  let retirementPortfolioSnapshot: FinancialContextSnapshot['retirementPortfolioSnapshot'] | undefined;
  let retirementSecurityMetadata: FinancialContextSnapshot['retirementSecurityMetadata'] | undefined;
  let existingAnalysisInput: any = undefined;
  
  if (userId && !isDemo && (questionNeeds.needsRetirement || questionNeeds.needsMarketContext || questionNeeds.needsInvestments)) {
    try {
      console.log('🔍 Checking for existing retirement analysis (triggered by retirement/investment/portfolio question)');
      const existingAnalysisData = await fetchExistingRetirementAnalysis(userId);
      
      if (existingAnalysisData.analysis && !retirementAnalysis) {
        // Use existing analysis if we don't have a new one
        // Attach stored input params to the analysis object for reference
        if (existingAnalysisData.analysisInput) {
          (existingAnalysisData.analysis as any)._storedInputParams = existingAnalysisData.analysisInput;
        }
        retirementAnalysis = existingAnalysisData.analysis;
        existingAnalysisInput = existingAnalysisData.analysisInput;
        console.log('📦 Using existing retirement analysis for investment/portfolio question (no new analysis created)');
      } else if (existingAnalysisData.analysis && retirementAnalysis) {
        // We have both existing and new analysis - log this case
        existingAnalysisInput = existingAnalysisData.analysisInput;
        console.log('📦 Both existing and new retirement analysis available - using new analysis, but existing analysis data also available');
      }
      
      if (existingAnalysisData.portfolioSnapshot) {
        retirementPortfolioSnapshot = existingAnalysisData.portfolioSnapshot;
        console.log(`📊 Including portfolio snapshot: ${retirementPortfolioSnapshot.holdings.length} holdings, ${retirementPortfolioSnapshot.securities.length} securities`);
        
        // Fetch security metadata for all tickers in the portfolio
        const metadataStartTime = Date.now();
        retirementSecurityMetadata = await fetchSecurityMetadataForPortfolio(existingAnalysisData.portfolioSnapshot);
        const metadataFetchTime = Date.now() - metadataStartTime;
        const metadataCount = Object.keys(retirementSecurityMetadata).length;
        console.log(`📋 Fetched security metadata for ${metadataCount} tickers in ${metadataFetchTime}ms`);
        
        // Log cache hit/miss details
        if (metadataCount > 0) {
          console.log(`✅ Security metadata available for tickers: ${Object.keys(retirementSecurityMetadata).slice(0, 10).join(', ')}${metadataCount > 10 ? '...' : ''}`);
        }
      }
    } catch (error) {
      console.error('❌ Error fetching existing retirement analysis:', error);
      // Don't fail if we can't fetch existing analysis
    }
  }

  return {
    accounts: accountSummaries,
    bankingTransactions: transactionSummaries,
    investments: investmentsSnapshot,
    metadata,
    tierContext,
    incomeAnalysis,
    expenseAnalysis,
    averageMonthlyIncome: incomeResult?.averageMonthly ?? null,
    averageMonthlyExpense: expenseResult?.averageMonthly ?? null,
    searchContext,
    marketContext,
    userProfile,
    homeValueSummary,
    financialSummary: financialSummary || undefined,
    retirementAnalysis,
    retirementAnalysisNeedsInfo,
    retirementPortfolioSnapshot,
    retirementSecurityMetadata
  };
}

/**
 * Fetch existing retirement analysis without parameter matching
 * Used to include analysis in context for any investment/portfolio/retirement question
 */
async function fetchExistingRetirementAnalysis(userId: string): Promise<{
  analysis: FinancialContextSnapshot['retirementAnalysis'] | null;
  portfolioSnapshot: { holdings: any[]; securities: any[] } | null;
  analysisInput?: any; // Store input parameters for comparison
}> {
  try {
    const { getPrismaClient } = await import('../prisma-client');
    const prisma = getPrismaClient();
    
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    console.log(`🔍 Checking for existing retirement analysis for user ${userId} (within last 7 days, since ${sevenDaysAgo.toISOString()})`);
    
    const recentAnalysis = await prisma.retirementAnalysis.findFirst({
      where: {
        userId,
        computedAt: {
          gte: sevenDaysAgo
        }
      },
      orderBy: {
        computedAt: 'desc'
      }
    });
    
    if (!recentAnalysis) {
      console.log('📭 No recent retirement analysis found (within 7 days)');
      return { analysis: null, portfolioSnapshot: null };
    }
    
    const ageInDays = Math.floor((Date.now() - recentAnalysis.computedAt.getTime()) / (24 * 60 * 60 * 1000));
    console.log(`✅ Found existing retirement analysis from ${ageInDays} days ago (computed at ${recentAnalysis.computedAt.toISOString()})`);
    
    // Extract analysis from historicalImplications field
    const cachedAnalysis = recentAnalysis.historicalImplications as any;
    const portfolioSnapshot = recentAnalysis.portfolioSnapshot as any;
    const analysisInput = recentAnalysis.analysisInput as any;
    
    console.log('📊 Analysis details:', {
      hasFullAnalysis: !!(cachedAnalysis && cachedAnalysis.summary),
      hasPortfolioSnapshot: !!portfolioSnapshot,
      portfolioSnapshotHoldings: portfolioSnapshot?.holdings?.length || 0,
      portfolioSnapshotSecurities: portfolioSnapshot?.securities?.length || 0,
      storedInputParams: analysisInput ? {
        currentAge: analysisInput.currentAge,
        retirementAge: analysisInput.retirementAge,
        annualWithdrawalAmount: analysisInput.annualWithdrawalAmount,
        withdrawalStartAge: analysisInput.withdrawalStartAge
      } : null
    });
    
    if (cachedAnalysis && cachedAnalysis.summary) {
      // Full analysis result is stored, return it directly
      console.log('✅ Using full stored analysis from historicalImplications field');
      return {
        analysis: cachedAnalysis,
        portfolioSnapshot: portfolioSnapshot || null,
        analysisInput
      };
    }
    
    // Fallback: reconstruct from stored fields if needed
    console.log('⚠️ Full analysis not found in historicalImplications, reconstructing from stored fields');
    const reconstructedAnalysis: FinancialContextSnapshot['retirementAnalysis'] = {
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
        priceHistoryCoverage: 0.8,
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
        missingData: []
      },
      disclaimers: []
    };
    
    return {
      analysis: reconstructedAnalysis,
      portfolioSnapshot: portfolioSnapshot || null,
      analysisInput
    };
  } catch (error) {
    console.error('❌ Error fetching existing retirement analysis:', error);
    return { analysis: null, portfolioSnapshot: null };
  }
}

/**
 * Fetch security metadata for all tickers in a portfolio snapshot
 */
async function fetchSecurityMetadataForPortfolio(portfolioSnapshot: { holdings: any[]; securities: any[] }): Promise<Record<string, any>> {
  const metadataMap: Record<string, any> = {};
  
  try {
    const { dbCache } = await import('../retirement-analytics/data/db-cache');
    
    // Extract unique tickers from holdings
    const tickers = new Set<string>();
    const securityMap = new Map(portfolioSnapshot.securities.map((sec: any) => [sec.security_id, sec]));
    
    for (const holding of portfolioSnapshot.holdings) {
      const security = securityMap.get(holding.security_id);
      const ticker = security?.ticker_symbol?.toUpperCase() || holding.ticker_symbol?.toUpperCase();
      if (ticker && ticker.length > 0 && ticker.length <= 10) {
        tickers.add(ticker);
      }
    }
    
    // Fetch metadata for all tickers in a single batch query (avoids N+1 SELECTs)
    const batchResult = await dbCache.getSecurityMetadataBatch(Array.from(tickers));
    for (const [ticker, metadata] of batchResult) {
      metadataMap[ticker] = metadata;
    }
    
    return metadataMap;
  } catch (error) {
    console.error('Error fetching security metadata for portfolio:', error);
    return metadataMap;
  }
}

/**
 * Fetch existing retirement analysis or create a new one
 */
async function fetchOrCreateRetirementAnalysis(args: {
  userId: string;
  question: string;
  userProfile: string;
  holdings: any[];
  securities: any[];
}): Promise<FinancialContextSnapshot['retirementAnalysis'] | undefined> {
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

  // Calculate portfolio value for withdrawal amount estimation
  const portfolioValue = holdings.reduce((sum: number, h: any) => sum + (h.institution_value || h.value || 0), 0);

  // Extract age from profile if not in question
  const { extractAgeFromProfile, extractRetirementAgeFromProfile } = await import('../retirement-analytics/profile-age-extractor');
  const profileAge = extractAgeFromProfile(userProfile);
  const profileRetirementAge = extractRetirementAgeFromProfile(userProfile);

  // Apply reasonable defaults for missing parameters
  const currentAge = questionParams.currentAge || profileAge || 45; // Default to 45 if not available
  const retirementAge = questionParams.retirementAge || profileRetirementAge || 65; // Default to 65 if not available
  // Use 4% rule (portfolio value * 0.04) as default annual withdrawal if not specified
  const annualWithdrawalAmount = questionParams.annualWithdrawalAmount || (portfolioValue > 0 ? portfolioValue * 0.04 : undefined);
  const withdrawalStartAge = questionParams.withdrawalStartAge || retirementAge;

  // Check what's still missing (after applying defaults)
  const missingParams: Array<'currentAge' | 'retirementAge' | 'annualWithdrawalAmount' | 'withdrawalStartAge'> = [];
  if (!currentAge) missingParams.push('currentAge');
  if (!annualWithdrawalAmount) missingParams.push('annualWithdrawalAmount');
  // retirementAge and withdrawalStartAge are optional (user might already be retired)

  // Log defaults being used
  if (missingParams.length === 0) {
    console.log('✅ Retirement parameters ready (with defaults applied):', {
      currentAge,
      retirementAge,
      annualWithdrawalAmount,
      withdrawalStartAge,
      portfolioValue,
      usedDefaults: {
        currentAge: !questionParams.currentAge && !profileAge,
        retirementAge: !questionParams.retirementAge && !profileRetirementAge,
        annualWithdrawalAmount: !questionParams.annualWithdrawalAmount
      }
    });
  }

  // If we don't have enough info after defaults, return a signal for Linc to ask
  if (missingParams.length > 0) {
    console.log(`Retirement analysis: Missing required parameters after defaults: ${missingParams.join(', ')}`);
    // Return a special indicator that will trigger Linc to ask for missing info
    return {
      needsInfo: true,
      missingParams,
      detectedParams: {
        currentAge: currentAge || undefined,
        retirementAge: retirementAge || undefined,
        annualWithdrawalAmount: annualWithdrawalAmount || undefined,
        withdrawalStartAge: withdrawalStartAge || undefined
      }
    } as any; // Cast to any to match the return type, will be handled in prompt builder
  }

  // Check for recent analysis in database (within last 7 days)
  const { getPrismaClient } = await import('../prisma-client');
  const prisma = getPrismaClient();
  const recentAnalysis = await prisma.retirementAnalysis.findFirst({
    where: {
      userId,
      computedAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
      }
    },
    orderBy: {
      computedAt: 'desc'
    }
  });

  // If recent analysis exists and parameters match, use it
  if (recentAnalysis) {
    const storedInput = recentAnalysis.analysisInput as any;
    if (
      storedInput.currentAge === currentAge &&
      storedInput.retirementAge === retirementAge &&
      storedInput.annualWithdrawalAmount === questionParams.annualWithdrawalAmount &&
      storedInput.withdrawalStartAge === (questionParams.withdrawalStartAge || retirementAge)
    ) {
      console.log('📦 Using cached retirement analysis from database');
      // Return the full analysis output (stored in historicalImplications field as RetirementAnalysisOutput)
      const cachedAnalysis = recentAnalysis.historicalImplications as any;
      if (cachedAnalysis && cachedAnalysis.summary) {
        // Full analysis result is stored, return it directly
        return cachedAnalysis;
      }
      // Fallback: reconstruct from stored fields if needed
      return {
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
          priceHistoryCoverage: 0.8,
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
          missingData: []
        },
        disclaimers: []
      };
    }
  }

  // Create new analysis
  try {
    const { analyzeRetirementPortfolio } = await import('../retirement-analytics');

    const analysisInput = {
      holdings,
      securities,
      currentAge: currentAge!, // Non-null assertion: validated above
      retirementAge,
      lifeExpectancy: questionParams.lifeExpectancy || 95,
      annualWithdrawalAmount: annualWithdrawalAmount!, // Non-null assertion: validated above
      withdrawalStartAge: withdrawalStartAge || retirementAge || currentAge! + 20
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
    await prisma.retirementAnalysis.create({
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
    return analysisResult as any;
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
    
    return undefined;
  }
}



function buildAccountSummaries(accounts: Account[], isDemo: boolean): AccountSummaryItem[] {
  return accounts.map(account => {
    const subtype = account.subtype || account.type;
    const balance =
      typeof account.balance?.available === 'number' &&
      (account.type === 'depository' || account.type === 'checking' || account.type === 'savings')
        ? account.balance.available
        : account.balance?.current ?? 0;

    const summary: AccountSummaryItem = {
      id: account.account_id || account.id,
      name: account.name,
      type: account.type,
      subtype,
      balance,
      institution: account.institution,
      interestRate: (account as any).interestRate
    };

    return summary;
  });
}

/**
 * Deduplicate transactions by removing pending versions when settled versions exist.
 * 
 * Plaid Transaction Behavior:
 * - pending: true → Transaction is pending (authorization hold, not yet settled)
 * - pending: false → Posted/settled transaction
 * - pending_transaction_id: Present on a posted transaction, points to transaction_id of earlier pending version
 * 
 * Strategy:
 * 1. Always filter out pending transactions (pending: true) from GPT context
 * 2. If a settled transaction has pending_transaction_id, it replaces the pending version
 * 3. Keep only settled transactions (pending: false or undefined/null treated as settled)
 */
function deduplicateTransactions(transactions: Transaction[]): Transaction[] {
  // ✅ Defensive check: handle null/undefined/not-array inputs
  if (!transactions || !Array.isArray(transactions)) {
    console.warn('⚠️ deduplicateTransactions: Received invalid transactions input, returning empty array');
    return [];
  }
  
  if (transactions.length === 0) {
    return transactions;
  }

  // Build a map of transaction_id -> transaction for quick lookup
  const txById = new Map<string, Transaction>();
  const pendingTxIds = new Set<string>();
  
  // First pass: identify all transactions and mark pending ones
  for (const transaction of transactions) {
    const txId = transaction.transaction_id || 
                 (transaction as any).id || 
                 (transaction as any).plaidTransactionId;
    
    if (txId) {
      txById.set(txId, transaction);
      // Plaid uses boolean pending field: true = pending, false = settled
      // Also handle edge cases where it might be stored as string
      const isPending = transaction.pending === true || 
                        (transaction as any).pending === true ||
                        String((transaction as any).pending || '').toLowerCase() === 'true';
      if (isPending) {
        pendingTxIds.add(txId);
      }
    }
  }

  const transactionsToKeep = new Set<string>();
  const transactionsToSkip = new Set<string>();

  // Second pass: process each transaction according to Plaid's linking pattern
  for (const transaction of transactions) {
    const txId = transaction.transaction_id || 
                 (transaction as any).id || 
                 (transaction as any).plaidTransactionId;
    
    if (!txId) {
      // Skip transactions without IDs (shouldn't happen, but be safe)
      continue;
    }

    // Check pending status (Plaid uses boolean: true = pending, false = settled)
    const isPending = transaction.pending === true || 
                      (transaction as any).pending === true ||
                      String((transaction as any).pending || '').toLowerCase() === 'true';
    
    // Get pending_transaction_id if present (on settled transactions, points to earlier pending version)
    const pendingTxId = (transaction as any).pendingTransactionId || 
                        (transaction as any).pending_transaction_id;

    if (isPending) {
      // This is a pending transaction (pending: true)
      // Always skip pending transactions - they should not appear in GPT context
      // If a settled version exists (with pending_transaction_id pointing here), it will be kept instead
      transactionsToSkip.add(txId);
    } else {
      // This is a settled transaction (pending: false or undefined/null)
      if (pendingTxId && pendingTxIds.has(pendingTxId)) {
        // This settled transaction replaces a pending one (per Plaid's linking pattern)
        // Keep the settled version, skip the pending version
        transactionsToKeep.add(txId);
        transactionsToSkip.add(pendingTxId);
      } else {
        // No related pending transaction, keep this settled one
        transactionsToKeep.add(txId);
      }
    }
  }

  // Build the final deduplicated array
  const deduplicated = transactions.filter(tx => {
    const txId = tx.transaction_id || 
                 (tx as any).id || 
                 (tx as any).plaidTransactionId;
    
    if (!txId) {
      return false; // Skip transactions without IDs
    }

    // Skip if explicitly marked to skip
    if (transactionsToSkip.has(txId)) {
      return false;
    }

    // Keep if explicitly marked to keep
    if (transactionsToKeep.has(txId)) {
      return true;
    }

    // Safety check: filter out any remaining pending transactions
    // Check multiple possible field names and be strict about pending status
    const isPending = tx.pending === true || 
                      (tx as any).pending === true ||
                      (tx as any).pending === 'true' ||
                      String((tx as any).pending || '').toLowerCase() === 'true';
    
    if (isPending) {
      return false; // Explicitly skip pending transactions
    }
    
    return true;
  });

  if (transactions.length !== deduplicated.length) {
    const pendingCount = transactions.filter(tx => {
      const isPending = tx.pending === true || 
                        (tx as any).pending === true ||
                        (tx as any).pending === 'true' ||
                        String((tx as any).pending || '').toLowerCase() === 'true';
      return isPending;
    }).length;
    console.log(`✅ Filtered transactions: ${transactions.length} → ${deduplicated.length} (removed ${transactions.length - deduplicated.length} transactions, ${pendingCount} were pending)`);
  }

  return deduplicated;
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

function mapDemoAccount(account: DemoAccount): Account {
  const accountId = account.id;
  return {
    account_id: accountId,
    id: accountId,
    name: account.name,
    type: account.type,
    subtype: account.type,
    balance: {
      current: account.balance,
      available: account.type === 'checking' || account.type === 'savings' ? account.balance : undefined,
      iso_currency_code: 'USD'
    },
    institution: account.institution,
    source: 'plaid'
  } as Account;
}

function mapDemoTransaction(tx: DemoTransaction): Transaction {
  const transactionType = tx.amount >= 0 ? 'income' : 'expense';
  return {
    transaction_id: tx.id,
    account_id: tx.accountId,
    amount: tx.amount,
    date: tx.date,
    name: tx.description,
    category: tx.category ? [tx.category] : [],
    pending: false,
    iso_currency_code: 'USD',
    transaction_type: transactionType
  } as Transaction;
}

function deriveDemoInvestmentSnapshot(rawInvestments: Record<string, Array<{ name: string; value: number }>> | undefined): InvestmentSnapshot | undefined {
  if (!rawInvestments) {
    return undefined;
  }

  const lines: string[] = [];
  let totalValue = 0;
  let holdingCount = 0;

  Object.entries(rawInvestments).forEach(([accountId, holdings]) => {
    holdings.forEach(holding => {
      holdingCount += 1;
      totalValue += holding.value || 0;
      lines.push(`- ${accountId} • ${holding.name}: $${(holding.value || 0).toFixed(2)}`);
    });
  });

  if (holdingCount === 0) {
    return undefined;
  }

  return {
    totalValue,
    holdingCount,
    summaryLines: lines.slice(0, 10)
  };
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
  const formatCurrency = (value: number | undefined) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 'Unknown';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value);
  };

  const midValue = formatCurrency(homeData.valueMid ?? homeData.valueHigh ?? homeData.valueLow);
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
  tier: UserTier,
  isDemo: boolean
): Promise<string | undefined> {
  if (!questionNeeds.needsSearchContext) {
    return undefined;
  }

  try {
    const result = await dataOrchestrator.getSearchContext(question, tier, isDemo);
    return result?.summary;
  } catch (error) {
    console.warn('Search context fetch failed', error);
    return undefined;
  }
}

async function maybeFetchMarketContext(
  questionNeeds: QuestionNeeds,
  tier: UserTier,
  isDemo: boolean
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
      return await dataOrchestrator.getMarketContextSummary(tier, isDemo);
    } catch (fallbackError) {
      console.warn('Market context fallback failed', fallbackError);
      return undefined;
    }
  }
}

export interface IncomeExpenseAnalysisResult {
  text: string;
  averageMonthly: number;
}

function buildIncomeAnalysis(transactions: Transaction[], override?: number | null): IncomeExpenseAnalysisResult | undefined {
  // If override is provided (not null/undefined), use it
  if (override !== null && override !== undefined) {
    return {
      text: [
        `Average Monthly Income: $${override.toFixed(2)} (Manual Override)`,
        `Income Transactions Analyzed: N/A (using manual override)`,
        `Months Covered: N/A (using manual override)`,
        `Top Sources: N/A (using manual override)`
      ].join('\n'),
      averageMonthly: override
    };
  }

  if (transactions.length === 0) {
    return undefined;
  }

  const incomeTransactions = transactions.filter(transaction => {
    const type = (transaction as any).transaction_type || transaction.aiCategory;
    const amount = Number(transaction.amount) || 0;
    return typeof type === 'string' && type.toLowerCase() === 'income' && amount > 0;
  });

  if (incomeTransactions.length === 0) {
    return undefined;
  }

  const monthlyTotals = new Map<string, number>();
  const sourceTotals = new Map<string, number>();

  for (const transaction of incomeTransactions) {
    const amount = Number(transaction.amount) || 0;
    const date = new Date(transaction.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + amount);

    const category = deriveCategory(transaction) || 'Income';
    sourceTotals.set(category, (sourceTotals.get(category) || 0) + amount);
  }

  const monthEntries = Array.from(monthlyTotals.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const totalIncome = monthEntries.reduce((sum, [, value]) => sum + value, 0);

  // Calendar months between min and max (inclusive). Jan 31 → Feb 1 = 2 months, not 0.
  // Avoids day-based span (1 day → 0 months → ∞ average).
  const dateSpanMonths = (() => {
    if (incomeTransactions.length === 0) return 0;
    const timestamps = incomeTransactions.map(t => new Date(t.date).getTime());
    const minDate = new Date(Math.min(...timestamps));
    const maxDate = new Date(Math.max(...timestamps));
    return (maxDate.getFullYear() - minDate.getFullYear()) * 12 + (maxDate.getMonth() - minDate.getMonth()) + 1;
  })();
  const averageMonthlyIncome = dateSpanMonths > 0 ? totalIncome / dateSpanMonths : 0;

  const topSources = Array.from(sourceTotals.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([label, value]) => `${label}: $${value.toFixed(2)}`)
    .join(', ');

  return {
    text: [
      `Average Monthly Income: $${averageMonthlyIncome.toFixed(2)}`,
      `Income Transactions Analyzed: ${incomeTransactions.length}`,
      `Months Covered: ${dateSpanMonths} (span from earliest to latest income transaction)`,
      `Top Sources: ${topSources || 'Not available'}`
    ].join('\n'),
    averageMonthly: averageMonthlyIncome
  };
}

function buildExpenseAnalysis(transactions: Transaction[], override?: number | null): IncomeExpenseAnalysisResult | undefined {
  // If override is provided (not null/undefined), use it
  if (override !== null && override !== undefined) {
    return {
      text: [
        `Average Monthly Expenses: $${override.toFixed(2)} (Manual Override)`,
        `Expense Transactions Analyzed: N/A (using manual override)`,
        `Months Covered: N/A (using manual override)`,
        `Top Categories: N/A (using manual override)`
      ].join('\n'),
      averageMonthly: override
    };
  }

  if (transactions.length === 0) {
    return undefined;
  }

  const expenseTransactions = transactions.filter(transaction => {
    const type = (transaction as any).transaction_type || transaction.aiCategory;
    return typeof type === 'string' && (type.toLowerCase() === 'expense' || type.toLowerCase() === 'fee');
  });

  if (expenseTransactions.length === 0) {
    return undefined;
  }

  const monthlyTotals = new Map<string, number>();
  const categoryTotals = new Map<string, number>();

  for (const transaction of expenseTransactions) {
    const amount = Math.abs(Number(transaction.amount) || 0);
    const date = new Date(transaction.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + amount);

    const category = deriveCategory(transaction) || 'Uncategorized';
    categoryTotals.set(category, (categoryTotals.get(category) || 0) + amount);
  }

  const monthEntries = Array.from(monthlyTotals.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const totalExpense = monthEntries.reduce((sum, [, value]) => sum + value, 0);

  // Calendar months between min and max (inclusive). Jan 31 → Feb 1 = 2 months, not 0.
  const dateSpanMonths = (() => {
    if (expenseTransactions.length === 0) return 0;
    const timestamps = expenseTransactions.map(t => new Date(t.date).getTime());
    const minDate = new Date(Math.min(...timestamps));
    const maxDate = new Date(Math.max(...timestamps));
    return (maxDate.getFullYear() - minDate.getFullYear()) * 12 + (maxDate.getMonth() - minDate.getMonth()) + 1;
  })();
  const averageMonthlyExpense = dateSpanMonths > 0 ? totalExpense / dateSpanMonths : 0;

  const topCategories = Array.from(categoryTotals.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([label, value]) => `${label}: $${value.toFixed(2)}`)
    .join(', ');

  return {
    text: [
      `Average Monthly Expenses: $${averageMonthlyExpense.toFixed(2)}`,
      `Expense Transactions Analyzed: ${expenseTransactions.length}`,
      `Months Covered: ${dateSpanMonths} (span from earliest to latest expense transaction)`,
      `Top Categories: ${topCategories || 'Not available'}`
    ].join('\n'),
    averageMonthly: averageMonthlyExpense
  };
}

async function loadUserProfile(params: {
  userId?: string;
  isDemo: boolean;
  demoProfile?: string;
  accounts: Account[];
  transactions: Transaction[];
}): Promise<string | undefined> {
  const { userId, isDemo, demoProfile, accounts, transactions } = params;

  if (isDemo && demoProfile) {
    return demoProfile;
  }

  if (!userId || isDemo) {
    return undefined;
  }

  try {
    const { ProfileManager } = await import('../profile/manager');
    const profileManager = new ProfileManager(userId);

    const rawProfile = await profileManager.getOriginalProfile(userId);
    if (!rawProfile) {
      return undefined;
    }

    try {
      const { PlaidProfileEnhancer } = await import('../profile/plaid-enhancer');
      const enhancer = new PlaidProfileEnhancer();
      
      // ✅ CRITICAL: Deduplicate accounts before passing to profile enhancer
      // The snapshot should already be deduplicated, but add defensive deduplication here
      // to prevent inflated totals in profile text
      const accountMap = new Map<string, typeof accounts[0]>();
      accounts.forEach(account => {
        const accountId = account.account_id || (account as any).plaidAccountId || (account as any).persistentAccountId || account.id;
        if (accountId) {
          if (accountMap.has(accountId)) {
            console.warn(`⚠️ loadUserProfile: Duplicate account_id detected: ${accountId} (${account.name}). Snapshot should have deduplicated this!`);
            // Keep the account with the most recent data (if available)
            const existing = accountMap.get(accountId)!;
            const existingTimestamp = existing.lastSyncedAt || existing.snapshotTimestamp || (existing as any).updatedAt;
            const newTimestamp = account.lastSyncedAt || account.snapshotTimestamp || (account as any).updatedAt;
            if (newTimestamp && (!existingTimestamp || new Date(newTimestamp) > new Date(existingTimestamp))) {
              accountMap.set(accountId, account);
            }
          } else {
            accountMap.set(accountId, account);
          }
        } else {
          console.warn(`⚠️ loadUserProfile: Account without account_id/plaidAccountId: ${account.name}, skipping`);
        }
      });
      const deduplicatedAccounts = Array.from(accountMap.values());
      if (deduplicatedAccounts.length !== accounts.length) {
        console.warn(`⚠️ loadUserProfile: Deduplicated accounts: ${accounts.length} → ${deduplicatedAccounts.length} (removed ${accounts.length - deduplicatedAccounts.length} duplicates)`);
        console.warn(`   This indicates the snapshot JSON contains duplicates. The snapshot should be regenerated.`);
      } else {
        console.log(`✅ loadUserProfile: Received ${accounts.length} accounts, all unique (no deduplication needed)`);
      }
      
      const plaidAccounts = deduplicatedAccounts.map(account => ({
        id: account.account_id || account.id,
        name: account.name,
        type: account.type,
        subtype: account.subtype,
        balance: {
          current: account.balance?.current,
          available: account.balance?.available
        },
        currentBalance: account.balance?.current,
        availableBalance: account.balance?.available,
        institution: account.institution
      }));

      // Filter out pending transactions before passing to profile enhancer
      // This ensures profile enhancement uses only settled transactions (consistent with GPT context)
      const filteredTransactionsForProfile = deduplicateTransactions(transactions);
      
      const plaidTransactions = filteredTransactionsForProfile.map(tx => ({
        id: (tx as any).transaction_id || (tx as any).id || `${tx.account_id}-${tx.date}-${tx.name}`,
        account_id: tx.account_id,
        amount: tx.amount,
        date: tx.date,
        name: tx.name,
        merchant_name: (tx as any).merchant_name,
        category: Array.isArray(tx.category) ? tx.category : undefined,
        pending: Boolean((tx as any).pending),
        enriched_data: tx.enriched_data
      }));

      const enhanced = await enhancer.enhanceProfileFromPlaidData(
        userId,
        plaidAccounts,
        plaidTransactions,
        rawProfile
      );

      if (enhanced && enhanced !== rawProfile) {
        await profileManager.updateProfile(userId, enhanced);
      }
    } catch (enhanceError) {
      console.warn('Profile enhancement failed', enhanceError);
    }

    // ✅ Use original profile (no anonymization)
    const originalProfile = await profileManager.getOriginalProfile(userId);
    
    // ✅ CRITICAL: Normalize and deduplicate profile sections before passing to Claude
    // - Home data: use latest RentCast + latest manual override; rebuild section to eliminate duplicates
    // - Fallback: extract home value from natural language if user specified in prompt
    // - LIABILITIES INFORMATION: GPT may add this section multiple times during profile enhancement
    if (originalProfile) {
      const normalized = profileManager.normalizeProfileHomeDataSection(originalProfile);
      const deduped = profileManager.deduplicateHomeValueManual(normalized);
      return deduplicateLiabilitySections(deduped);
    }
    
    return originalProfile;
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

