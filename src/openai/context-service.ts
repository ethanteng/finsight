import { UserTier } from '../data/types';
import { dataOrchestrator } from '../data/orchestrator';
import { FinancialDataService, Account, Transaction, UnifiedFinancialData, HomeData } from '../services/financial-data-service';
import { AnonymizationService } from '../services/anonymization-service';
import { TokenStatus } from '../services/token-validation-service';
import { QuestionNeeds, FinancialContextSnapshot, AccountSummaryItem, TransactionSummaryItem, InvestmentSnapshot } from './types';
import type { DemoAccount, DemoTransaction } from '../demo-data';

interface GatherContextArgs {
  userId?: string;
  isDemo: boolean;
  question: string;
  questionNeeds: QuestionNeeds;
  tier: UserTier;
  anonymizationService: AnonymizationService;
  demoProfile?: string;
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
    anonymizationService,
    demoProfile
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
    // Try to use cached financial summary first (reduces GPT prompt size)
    try {
      const { FinancialSummaryService } = await import('../services/financial-summary-service');
      const summaryService = new FinancialSummaryService();
      const summary = await summaryService.getUserSummary(userId);
      financialSummary = {
        financialOverview: summary.financialOverview,
        investmentPortfolio: summary.investmentPortfolio
      };
    } catch (error) {
      console.warn('Failed to load financial summary, falling back to full data fetch:', error);
    }

    const financialDataService = new FinancialDataService();
    const unified = await financialDataService.getUserFinancialData(userId, {
      includeTransactions: true,
      includeInvestments: true,
      includeHomeValue: questionNeeds.needsHomeValue,
      collectCategorizationDetails: false,
      shouldPersistTransactions: true
    });

    accounts = unified.accounts;
    bankingTransactions = unified.bankingTransactions;
    metadata = unified.metadata;

    // Use summary data for investment totals if available, otherwise derive from holdings
    if (financialSummary?.investmentPortfolio && questionNeeds.needsInvestments) {
      // Use summary portfolio totals, but still include top holdings for context
      const topHoldings = unified.investments?.holdings?.slice(0, 10).map((holding: any) => {
        const name = holding.security_name || holding.ticker_symbol || 'Holding';
        const value = holding.institution_value || 0;
        return `- ${name}: $${value.toFixed(2)}`;
      }) || [];
      
      investmentsSnapshot = {
        totalValue: financialSummary.investmentPortfolio.totalValue,
        holdingCount: financialSummary.investmentPortfolio.holdingsCount,
        summaryLines: topHoldings.length > 0 ? topHoldings : [
          `Total Portfolio Value: $${financialSummary.investmentPortfolio.totalValue.toFixed(2)}`,
          `Holdings: ${financialSummary.investmentPortfolio.holdingsCount}`,
          `Securities: ${financialSummary.investmentPortfolio.securityCount}`
        ]
      };
    } else if (questionNeeds.needsInvestments && unified.investments?.holdings?.length) {
      investmentsSnapshot = deriveInvestmentSnapshot(unified.investments);
    }

    if (questionNeeds.needsHomeValue) {
      // Use summary home value if available, otherwise use unified data
      const homeValue = financialSummary?.financialOverview?.homeValue !== null && financialSummary?.financialOverview?.homeValue !== undefined
        ? financialSummary.financialOverview.homeValue 
        : unified.homeValue;
      
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
            const homeData = unified.homeValue;
            const address = (homeData && homeData.address) || homeAddressFromProfile;
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
        const homeData = unified.homeValue;
        const address = (homeData && homeData.address) || homeAddressFromProfile;
        if (address) {
          homeValueSummary = `Home address: ${address}. Home value estimate is not currently available, but the user owns this property.`;
        } else {
          homeValueSummary = 'Home value data is currently unavailable.';
        }
      }
    }
  }

  // ✅ CRITICAL: Deduplicate accounts by account_id as a safety net
  // Even though FinancialDataService should deduplicate, corrupted database records might slip through
  // if they have different account_id values (due to corrupted plaidAccountId pointing to other account IDs)
  const accountIdMap = new Map<string, Account>();
  const duplicateAccountIds: string[] = [];
  
  accounts.forEach(account => {
    const accountId = account.account_id || account.id;
    if (accountId) {
      if (accountIdMap.has(accountId)) {
        duplicateAccountIds.push(accountId);
        console.warn(`⚠️ gatherContextSnapshot: Duplicate account_id detected: ${accountId} (${account.name}). FinancialDataService should have deduplicated this!`);
        // Keep the most recent account based on timestamp
        const existing = accountIdMap.get(accountId)!;
        const existingTimestamp = existing.lastSyncedAt || existing.snapshotTimestamp;
        const newTimestamp = account.lastSyncedAt || account.snapshotTimestamp;
        if (newTimestamp && (!existingTimestamp || newTimestamp > existingTimestamp)) {
          accountIdMap.set(accountId, account);
        }
      } else {
        accountIdMap.set(accountId, account);
      }
    } else {
      console.warn(`⚠️ gatherContextSnapshot: Account without account_id: ${account.name}, skipping`);
    }
  });
  
  const deduplicatedAccounts = Array.from(accountIdMap.values());
  
  if (duplicateAccountIds.length > 0) {
    console.error(`❌ gatherContextSnapshot: FinancialDataService returned ${duplicateAccountIds.length} duplicate accounts! This indicates corrupted database records or a bug in deduplication.`);
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

  const anonymizedAccounts = !isDemo && userId
    ? anonymizeAccounts(deduplicatedAccounts, userId, anonymizationService)
    : deduplicatedAccounts;

  const anonymizedTransactions = !isDemo && userId
    ? anonymizeTransactions(sortedTransactions, userId, anonymizationService)
    : sortedTransactions;

  const accountSummaries = buildAccountSummaries(anonymizedAccounts, isDemo);
  const transactionSummaries = buildTransactionSummaries(anonymizedTransactions).slice(
    0,
    MAX_PROMPT_TRANSACTIONS
  );

  const tierContext = await dataOrchestrator.buildTierAwareContext(
    tier,
    anonymizedAccounts,
    anonymizedTransactions.slice(0, MAX_PROMPT_TRANSACTIONS),
    isDemo
  );

  const searchContext = await maybeFetchSearchContext(question, questionNeeds, tier, isDemo);
  const marketContext = await maybeFetchMarketContext(questionNeeds, tier, isDemo);

  const incomeAnalysis = buildIncomeAnalysis(sortedTransactions);
  const userProfile = await loadUserProfile({
    userId,
    isDemo,
    demoProfile,
    anonymizationService,
    accounts: anonymizedAccounts,
    transactions: anonymizedTransactions
  });

  return {
    accounts: accountSummaries,
    bankingTransactions: transactionSummaries,
    investments: investmentsSnapshot,
    metadata,
    tierContext,
    incomeAnalysis,
    searchContext,
    marketContext,
    userProfile,
    homeValueSummary,
    financialSummary: financialSummary || undefined
  };
}


function anonymizeAccounts(
  accounts: Account[],
  userId: string,
  anonymizationService: AnonymizationService
): Account[] {
  return accounts.map(account => ({
    ...account,
    name: anonymizationService.tokenizeAccount(userId, account.name, account.institution),
    institution: account.institution
      ? anonymizationService.tokenizeInstitution(userId, String(account.institution))
      : account.institution
  }));
}

function anonymizeTransactions(
  transactions: Transaction[],
  userId: string,
  anonymizationService: AnonymizationService
): Transaction[] {
  return transactions.map(transaction => {
    const name = transaction.name
      ? anonymizationService.tokenizeMerchant(userId, transaction.name)
      : 'Unknown';

    const merchantName = (transaction as any).merchantName
      ? anonymizationService.tokenizeMerchant(userId, (transaction as any).merchantName)
      : undefined;

    const enriched = transaction.enriched_data
      ? {
          ...transaction.enriched_data,
          merchant_name: transaction.enriched_data.merchant_name
            ? anonymizationService.tokenizeMerchant(userId, transaction.enriched_data.merchant_name)
            : undefined,
          brand_name: transaction.enriched_data.brand_name
            ? anonymizationService.tokenizeMerchant(userId, transaction.enriched_data.brand_name)
            : undefined
        }
      : undefined;

    return {
      ...transaction,
      name,
      merchantName,
      enriched_data: enriched
    };
  });
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
      institution: account.institution
    };

    if (isDemo && (account as any).interestRate) {
      summary.name = `${summary.name} (Rate: ${(account as any).interestRate}%)`;
    }

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

function buildTransactionSummaries(transactions: Transaction[]): TransactionSummaryItem[] {
  return transactions.map(transaction => {
    const id =
      transaction.transaction_id ||
      (transaction as any).id ||
      `${transaction.account_id}-${transaction.date}-${transaction.name}`;

    const amount = Number(transaction.amount) || 0;
    const typeLabel = deriveTransactionTypeLabel(transaction);
    const categoryLabel = deriveCategory(transaction);

    return {
      id,
      name: transaction.name || 'Unknown',
      amount,
      date: transaction.date,
      typeLabel,
      categoryLabel
    };
  });
}

function deriveTransactionTypeLabel(transaction: Transaction): string {
  // ✅ CRITICAL: Prioritize manual corrections over AI categorization
  // If aiCategoryReason indicates manual correction, always use aiCategory
  const isManualCorrection = transaction.aiCategoryReason?.toLowerCase().includes('manually corrected') ||
                             transaction.aiCategoryReason?.toLowerCase().includes('corrected by user');
  
  // Use aiCategory if it's a manual correction, otherwise check transaction_type then aiCategory
  const rawType = isManualCorrection 
    ? transaction.aiCategory 
    : ((transaction as any).transaction_type || transaction.aiCategory);
  
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
  if (Array.isArray(transaction.category) && transaction.category.length > 0) {
    return transaction.category.join(' > ');
  }
  if ((transaction as any).personal_finance_category?.primary) {
    const primary = (transaction as any).personal_finance_category.primary;
    const detailed = (transaction as any).personal_finance_category.detailed;
    return detailed ? `${primary} > ${detailed}` : primary;
  }
  if (transaction.enriched_data?.category && transaction.enriched_data.category.length > 0) {
    return transaction.enriched_data.category.join(' > ');
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

function buildIncomeAnalysis(transactions: Transaction[]): string | undefined {
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
  const averageMonthlyIncome =
    monthEntries.length > 0 ? totalIncome / monthEntries.length : 0;

  const topSources = Array.from(sourceTotals.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([label, value]) => `${label}: $${value.toFixed(2)}`)
    .join(', ');

  return [
    `Average Monthly Income: $${averageMonthlyIncome.toFixed(2)}`,
    `Income Transactions Analyzed: ${incomeTransactions.length}`,
    `Months Covered: ${monthEntries.length}`,
    `Top Sources: ${topSources || 'Not available'}`
  ].join('\n');
}

async function loadUserProfile(params: {
  userId?: string;
  isDemo: boolean;
  demoProfile?: string;
  anonymizationService: AnonymizationService;
  accounts: Account[];
  transactions: Transaction[];
}): Promise<string | undefined> {
  const { userId, isDemo, demoProfile, anonymizationService, accounts, transactions } = params;

  if (isDemo && demoProfile) {
    return demoProfile;
  }

  if (!userId || isDemo) {
    return undefined;
  }

  try {
    const { ProfileManager } = await import('../profile/manager');
    const profileManager = new ProfileManager(userId, anonymizationService);

    const rawProfile = await profileManager.getOriginalProfile(userId);
    if (!rawProfile) {
      return undefined;
    }

    try {
      const { PlaidProfileEnhancer } = await import('../profile/plaid-enhancer');
      const enhancer = new PlaidProfileEnhancer();
      const plaidAccounts = accounts.map(account => ({
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

    return profileManager.getAnonymizedProfile(userId);
  } catch (error) {
    console.warn('Profile load failed', error);
    return undefined;
  }
}

