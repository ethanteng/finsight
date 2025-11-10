import { UserTier } from '../data/types';
import { dataOrchestrator } from '../data/orchestrator';
import { FinancialDataService, Account, Transaction, UnifiedFinancialData } from '../services/financial-data-service';
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
  let metadata: UnifiedFinancialData['metadata'] = { ...DEFAULT_METADATA };

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
  } else if (userId) {
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

    if (questionNeeds.needsInvestments && unified.investments?.holdings?.length) {
      investmentsSnapshot = deriveInvestmentSnapshot(unified.investments);
    }
  }

  const dedupedAccounts = deduplicateAccounts(accounts);
  const sortedTransactions = bankingTransactions
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const anonymizedAccounts = !isDemo && userId
    ? anonymizeAccounts(dedupedAccounts, userId, anonymizationService)
    : dedupedAccounts;

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
    userProfile
  };
}

function deduplicateAccounts(accounts: Account[]): Account[] {
  const map = new Map<string, Account>();
  for (const account of accounts) {
    const key = account.account_id || account.id;
    if (!key) {
      continue;
    }
    const existing = map.get(key);
    if (!existing) {
      map.set(key, account);
      continue;
    }
    const existingBalance = existing.balance?.current ?? 0;
    const candidateBalance = account.balance?.current ?? 0;
    if (candidateBalance >= existingBalance) {
      map.set(key, account);
    }
  }
  return Array.from(map.values());
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
  const rawType = (transaction as any).transaction_type || transaction.aiCategory;
  const normalized = typeof rawType === 'string' ? rawType.toLowerCase() : '';

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

      const plaidTransactions = transactions.map(tx => ({
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

