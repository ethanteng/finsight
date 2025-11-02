import { PrismaClient } from '@prisma/client';
import { Configuration, PlaidApi, PlaidEnvironments, CountryCode } from 'plaid';
import { SnapTradeService } from '../snaptrade';
import { BalanceService } from './balance-service';
import { TokenValidationService, TokenStatus, PlaidTokenHealth, SnapTradeTokenHealth } from './token-validation-service';
import { TransactionNormalizationService } from './transaction-normalization-service';
import { TransactionCategorizationService, CategorizationDetail } from './transaction-categorization-service';
import { persistTransactionsToDb, persistSnapTradeActivitiesToDb } from '../data/persistence';

const prisma = new PrismaClient();

// Plaid configuration
const plaidMode = process.env.PLAID_MODE || 'sandbox';
const useSandbox = plaidMode === 'sandbox';

const getPlaidCredentials = () => {
  if (plaidMode === 'production') {
    return {
      clientId: process.env.PLAID_CLIENT_ID_PROD || process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET_PROD || process.env.PLAID_SECRET,
      env: process.env.PLAID_ENV_PROD || 'production'
    };
  } else {
    return {
      clientId: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      env: 'sandbox'
    };
  }
};

const credentials = getPlaidCredentials();
const configuration = new Configuration({
  basePath: useSandbox ? PlaidEnvironments.sandbox : PlaidEnvironments[credentials.env as keyof typeof PlaidEnvironments],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': credentials.clientId,
      'PLAID-SECRET': credentials.secret,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

// Type definitions
export interface Account {
  account_id: string;
  id: string; // Alias for account_id for compatibility
  name: string;
  type: string;
  subtype: string;
  balance: {
    current: number;
    available?: number;
    limit?: number;
    iso_currency_code: string;
    unofficial_currency_code?: string;
  };
  institution?: string;
  institution_id?: string;
  institution_logo?: string;
  institution_url?: string;
  source: 'plaid' | 'snaptrade';
}

export interface Balance {
  current: number;
  available?: number;
  limit?: number;
  iso_currency_code: string;
}

export interface Holding {
  id: string;
  account_id: string;
  security_id: string;
  institution_value: number;
  institution_price: number;
  institution_price_as_of: string;
  cost_basis: number;
  quantity: number;
  iso_currency_code: string;
  security_name?: string;
  security_type?: string;
  ticker_symbol?: string;
  snapTradeData?: any;
}

export interface Security {
  security_id: string;
  name: string;
  type: string;
  ticker_symbol?: string;
  iso_currency_code: string;
  close_price?: number;
  close_price_as_of?: string;
  unofficial_currency_code?: string | null;
}

export interface Transaction {
  transaction_id?: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  category?: string[];
  payment_channel?: string;
  pending?: boolean;
  iso_currency_code: string;
  [key: string]: any;
}

export interface PortfolioAnalysis {
  totalValue: number;
  assetAllocation: Array<{
    type: string;
    value: number;
    percentage: number;
  }>;
  holdingCount: number;
  securityCount: number;
}

export interface HomeData {
  address: string;
  valueLow: number;
  valueMid: number;
  valueHigh: number;
  lastUpdated: string;
}

export interface ErrorDetail {
  tokenId?: string;
  accountId?: string;
  error: string;
  timestamp: Date;
}

export interface UnifiedFinancialData {
  accounts: Account[];
  balances: Record<string, Balance>;
  investments: {
    holdings: Holding[];
    securities: Security[];
    portfolio: PortfolioAnalysis;
    transactions: Transaction[];
  };
  bankingTransactions: Transaction[];
  homeValue: HomeData | null;
  categorizationDetails?: {
    transactions: CategorizationDetail[];
    summary: {
      total: number;
      gptCategorized: number;
      plaidFallback: number;
      averageConfidence: number;
    };
  };
  metadata: {
    lastUpdated: Date;
    tokenHealth: {
      plaid: PlaidTokenHealth[];
      snaptrade: SnapTradeTokenHealth;
    };
    errors: {
      plaid: ErrorDetail[];
      snaptrade: ErrorDetail[];
      homeValue: ErrorDetail | null;
    };
    partialData: boolean;
    performance: {
      totalDuration: number;
      plaidDuration: number;
      snaptradeDuration: number;
    };
  };
}

// Investment account subtypes
const INVESTMENT_SUBTYPES = [
  '401k', 'ira', 'roth', 'roth 401k', 'rollover ira', 'traditional ira',
  'brokerage', '529', 'hsa', 'pension', 'profit sharing plan',
  'stock plan', 'trust', 'ugma', 'utma', 'variable annuity'
];

export class FinancialDataService {
  private balanceService: BalanceService;
  private tokenValidationService: TokenValidationService;
  private transactionNormalizationService: TransactionNormalizationService;
  private transactionCategorizationService: TransactionCategorizationService;

  constructor() {
    this.balanceService = new BalanceService();
    this.tokenValidationService = new TokenValidationService();
    this.transactionNormalizationService = new TransactionNormalizationService();
    this.transactionCategorizationService = new TransactionCategorizationService();
  }

  /**
   * Get all financial data for a user from all sources
   */
  async getUserFinancialData(userId: string, options?: {
    includeTransactions?: boolean;
    includeInvestments?: boolean;
    includeHomeValue?: boolean;
    skipCategorization?: boolean; // ✅ NEW: Skip categorization for UI-only requests (performance optimization)
    collectCategorizationDetails?: boolean; // ✅ NEW: Collect detailed categorization results for logging/debugging
    shouldPersistTransactions?: boolean; // ✅ NEW: Only persist transactions when called from GPT prompts, not display-only views
  }): Promise<UnifiedFinancialData> {
    const startTime = Date.now();
    console.log('FinancialDataService: Starting fetch', { userId, timestamp: new Date().toISOString() });

    const opts = {
      includeTransactions: options?.includeTransactions ?? true,
      includeInvestments: options?.includeInvestments ?? true,
      includeHomeValue: options?.includeHomeValue ?? true
    };

    // Fetch data from all sources in parallel
    const [plaidResult, snapTradeResult, homeValueResult, tokenHealth] = await Promise.allSettled([
      this.fetchPlaidData(userId, opts),
      this.fetchSnapTradeData(userId, opts),
      opts.includeHomeValue ? this.fetchHomeValue(userId) : Promise.resolve(null),
      this.tokenValidationService.getTokenHealth(userId)
    ]);

    // Process results
    const plaidData = plaidResult.status === 'fulfilled' ? plaidResult.value : null;
    const snapTradeData = snapTradeResult.status === 'fulfilled' ? snapTradeResult.value : null;
    const homeValue = homeValueResult.status === 'fulfilled' ? homeValueResult.value : null;
    const tokens = tokenHealth.status === 'fulfilled' ? tokenHealth.value : { plaid: [], snaptrade: { userId, status: TokenStatus.ERROR, error: 'Unknown', lastChecked: new Date() } };

    // Merge data
    const mergedData = this.mergeFinancialData(plaidData, snapTradeData, homeValue);

    // ✅ STEP 1: Categorize transactions BEFORE normalization (skip for UI-only requests)
    // This ensures we have transaction_type available for normalization and filtering
    console.log(`FinancialDataService: skipCategorization flag = ${options?.skipCategorization}, banking transactions = ${mergedData.bankingTransactions.length}, investment transactions = ${mergedData.investments.transactions.length}`);
    if (!options?.skipCategorization && (mergedData.bankingTransactions.length > 0 || mergedData.investments.transactions.length > 0)) {
      const accountsMap = new Map(mergedData.accounts.map(acc => [acc.account_id, acc]));
      
      // ✅ CRITICAL: Load manual corrections from database before categorizing
      // Merge aiCategory (transaction_type) from database into transactions to preserve manual corrections
      try {
        // ✅ Get all transaction IDs - Plaid uses transaction_id, investment uses investment_transaction_id or id
        // We need to normalize to what's stored as plaidTransactionId in DB
        const transactionIds: string[] = [];
        const transactionIdMap = new Map<string, { source: 'banking' | 'investment', index: number }>();
        
        // Banking transactions: use transaction_id (Plaid's field) or id if set
        mergedData.bankingTransactions.forEach((tx, idx) => {
          const txId = (tx as any).transaction_id || tx.id || tx.transaction_id;
          if (txId && !txId.startsWith('snaptrade-')) {
            transactionIds.push(txId);
            transactionIdMap.set(txId, { source: 'banking', index: idx });
          }
        });
        
        // Investment transactions: use id or transaction_id, but handle Plaid investment_transaction_id
        mergedData.investments.transactions.forEach((tx, idx) => {
          // Plaid investment transactions use investment_transaction_id, but we might have stored as id
          const txId = (tx as any).investment_transaction_id || (tx as any).id || tx.transaction_id || tx.id;
          if (txId) {
            transactionIds.push(txId);
            transactionIdMap.set(txId, { source: 'investment', index: idx });
          }
        });
        
        if (transactionIds.length > 0) {
          // ✅ Load ALL existing categorizations (both manual corrections and previous GPT categorizations)
          // We need to preserve all of them, not just manual corrections
          // Manual corrections will override GPT, but we also want to preserve previous GPT categorizations
          // if the user hasn't manually corrected them
          const dbTransactions = await prisma.transaction.findMany({
            where: {
              plaidTransactionId: { in: transactionIds },
              aiCategory: { not: null } // Fetch all transactions with any categorization (manual or GPT)
            },
            select: {
              plaidTransactionId: true,
              aiCategory: true,
              aiCategoryReason: true
            }
          });
          
          // Create a map of transaction ID -> existing categorization
          // These will be loaded into transactions before categorization
          // If aiCategoryReason contains "Manually corrected", categorization service will use it
          // Otherwise, categorization will re-run (allowing GPT to update previous categorizations)
          const existingCategorizationsMap = new Map(
            dbTransactions.map(dbTx => [dbTx.plaidTransactionId, {
              aiCategory: dbTx.aiCategory,
              aiCategoryReason: dbTx.aiCategoryReason
            }])
          );
          
          // Merge existing categorizations into transactions using the map
          // The categorization service will check for aiCategory and use it if it's a manual correction
          // If it's a previous GPT categorization, it will be overwritten by new GPT categorization
          mergedData.bankingTransactions = mergedData.bankingTransactions.map(tx => {
            const txId = (tx as any).transaction_id || tx.id || tx.transaction_id;
            if (!txId || txId.startsWith('snaptrade-')) return tx;
            const existingCategorization = existingCategorizationsMap.get(txId);
            if (existingCategorization) {
              // ✅ Check if this is a manual correction (user explicitly set it)
              // Manual corrections have reason containing "Manually corrected" or "corrected by user"
              const isManualCorrection = existingCategorization.aiCategoryReason?.toLowerCase().includes('manually corrected') ||
                                       existingCategorization.aiCategoryReason?.toLowerCase().includes('corrected by user');
              
              if (isManualCorrection) {
                // Manual correction - always preserve it
                return { 
                  ...tx, 
                  aiCategory: existingCategorization.aiCategory, 
                  aiCategoryReason: existingCategorization.aiCategoryReason 
                };
              }
              // Previous GPT categorization - let categorization service re-categorize
              // Don't set aiCategory here, so GPT can update it
            }
            return tx;
          });
          
          mergedData.investments.transactions = mergedData.investments.transactions.map(tx => {
            // For investment transactions, try both investment_transaction_id and id
            const txId = (tx as any).investment_transaction_id || (tx as any).id || tx.transaction_id || tx.id;
            if (!txId) return tx;
            const existingCategorization = existingCategorizationsMap.get(txId);
            if (existingCategorization) {
              // ✅ Check if this is a manual correction
              const isManualCorrection = existingCategorization.aiCategoryReason?.toLowerCase().includes('manually corrected') ||
                                       existingCategorization.aiCategoryReason?.toLowerCase().includes('corrected by user');
              
              if (isManualCorrection) {
                // Manual correction - always preserve it
                return { 
                  ...tx, 
                  aiCategory: existingCategorization.aiCategory, 
                  aiCategoryReason: existingCategorization.aiCategoryReason 
                };
              }
              // Previous GPT categorization - let categorization service re-categorize
            }
            return tx;
          });
          
          const manualCorrectionCount = Array.from(existingCategorizationsMap.values())
            .filter(ec => ec.aiCategoryReason?.toLowerCase().includes('manually corrected') || 
                         ec.aiCategoryReason?.toLowerCase().includes('corrected by user'))
            .length;
          
          console.log(`FinancialDataService: Loaded ${existingCategorizationsMap.size} existing categorizations (${manualCorrectionCount} manual corrections) from database`);
        }
      } catch (error) {
        console.error('FinancialDataService: Error loading manual corrections from database:', error);
        // Continue with categorization even if loading corrections fails
      }
      
      console.log('FinancialDataService: Categorizing transactions before normalization');
      
      // Collect all categorization details if requested
      const allCategorizationDetails: CategorizationDetail[] = [];
      let gptCategorizedCount = 0;
      let plaidFallbackCount = 0;
      let totalConfidence = 0;
      
      // Categorize banking transactions
      if (mergedData.bankingTransactions.length > 0) {
        if (options?.collectCategorizationDetails) {
          // Use detailed categorization method
          const result = await this.transactionCategorizationService.categorizeTransactionBatchWithDetails(
            mergedData.bankingTransactions,
            accountsMap
          );
          mergedData.bankingTransactions = result.transactions.map(tx => ({
            ...tx,
            iso_currency_code: tx.iso_currency_code || 'USD'
          }));
          allCategorizationDetails.push(...result.details);
          gptCategorizedCount += result.summary.gptCategorized;
          plaidFallbackCount += result.summary.plaidFallback;
          totalConfidence += result.summary.averageConfidence * result.summary.total;
        } else {
          // Use regular categorization method (faster)
          const categorized = await this.transactionCategorizationService.categorizeTransactionBatch(
            mergedData.bankingTransactions,
            accountsMap
          );
          mergedData.bankingTransactions = categorized.map(tx => ({
            ...tx,
            iso_currency_code: tx.iso_currency_code || 'USD'
          }));
        }
      }
      
      // Categorize investment transactions
      if (mergedData.investments.transactions.length > 0) {
        if (options?.collectCategorizationDetails) {
          // Use detailed categorization method
          const result = await this.transactionCategorizationService.categorizeTransactionBatchWithDetails(
            mergedData.investments.transactions,
            accountsMap
          );
          mergedData.investments.transactions = result.transactions.map(tx => ({
            ...tx,
            iso_currency_code: tx.iso_currency_code || 'USD'
          }));
          allCategorizationDetails.push(...result.details);
          gptCategorizedCount += result.summary.gptCategorized;
          plaidFallbackCount += result.summary.plaidFallback;
          totalConfidence += result.summary.averageConfidence * result.summary.total;
        } else {
          // Use regular categorization method (faster)
          const categorized = await this.transactionCategorizationService.categorizeTransactionBatch(
            mergedData.investments.transactions,
            accountsMap
          );
          mergedData.investments.transactions = categorized.map(tx => ({
            ...tx,
            iso_currency_code: tx.iso_currency_code || 'USD'
          }));
        }
      }
      
      console.log('FinancialDataService: Categorization complete');
      
      // Store categorization details if collected
      if (options?.collectCategorizationDetails && allCategorizationDetails.length > 0) {
        mergedData.categorizationDetails = {
          transactions: allCategorizationDetails,
          summary: {
            total: allCategorizationDetails.length,
            gptCategorized: gptCategorizedCount,
            plaidFallback: plaidFallbackCount,
            averageConfidence: allCategorizationDetails.length > 0 ? totalConfidence / allCategorizationDetails.length : 0
          }
        };
        console.log('FinancialDataService: Categorization details collected:', mergedData.categorizationDetails.summary);
      }
    } else if (options?.skipCategorization) {
      console.log('FinancialDataService: Skipping categorization (UI-only request)');
    }

    // ✅ STEP 2: Normalize transactions (now with transaction_type available)
    if (mergedData.bankingTransactions.length > 0 || mergedData.investments.transactions.length > 0) {
      const accountsMap = new Map(mergedData.accounts.map(acc => [acc.account_id, acc]));
      
      mergedData.bankingTransactions = this.transactionNormalizationService.normalizeTransactionBatch(
        mergedData.bankingTransactions,
        accountsMap
      );
      
      mergedData.investments.transactions = this.transactionNormalizationService.normalizeTransactionBatch(
        mergedData.investments.transactions,
        accountsMap
      );
      
      // ✅ CRITICAL FIX: Update categorization details with normalized amounts
      // The categorization details were collected before normalization, so we need to sync the amounts
      if (mergedData.categorizationDetails && mergedData.categorizationDetails.transactions.length > 0) {
        // Create a map of normalized transactions by ID for quick lookup
        const normalizedTxMap = new Map<string, { amount: number }>();
        [...mergedData.bankingTransactions, ...mergedData.investments.transactions].forEach(tx => {
          const txId = (tx as any).id || (tx as any).transaction_id || '';
          if (txId) {
            normalizedTxMap.set(txId, { amount: tx.amount });
          }
        });
        
        // Update categorization details with normalized amounts
        mergedData.categorizationDetails.transactions.forEach(detail => {
          const txId = detail.transaction.id;
          const normalizedTx = normalizedTxMap.get(txId);
          if (normalizedTx) {
            detail.transaction.amount = normalizedTx.amount;
          }
        });
        
        console.log('FinancialDataService: Updated categorization details with normalized amounts');
      }
    }

    // ✅ STEP 3: Persist transactions to database ONLY when:
    // 1. PERSIST_TRANSACTIONS env var is set to 'true'
    // 2. shouldPersistTransactions option is explicitly true (called from GPT prompts, not display-only views)
    // This prevents saving transactions when just displaying data in /app or /profile pages
    if (process.env.PERSIST_TRANSACTIONS === 'true' && 
        options?.shouldPersistTransactions === true &&
        (mergedData.bankingTransactions.length > 0 || mergedData.investments.transactions.length > 0)) {
      try {
        console.log('FinancialDataService: Persisting transactions to database');
        
        // Persist banking transactions (from Plaid)
        if (mergedData.bankingTransactions.length > 0) {
          // Extract Plaid transactions (those with transaction_id or id that matches plaidTransactionId pattern)
          const plaidBankingTransactions = mergedData.bankingTransactions
            .filter(tx => {
              const txId = (tx as any).transaction_id || (tx as any).id;
              // Plaid transactions have IDs like "abc123" (not "snaptrade-...")
              return txId && !txId.startsWith('snaptrade-');
            })
            .map(tx => {
              // ✅ Ensure transaction_id is set correctly (this is what we use as plaidTransactionId in DB)
              const plaidTransactionId = (tx as any).transaction_id || (tx as any).id;
              
              return {
                ...tx,
                id: plaidTransactionId,
                transaction_id: plaidTransactionId, // ✅ Use transaction_id as the canonical ID
                // Ensure all required fields are present for persistence
                account_id: tx.account_id,
                amount: tx.amount,
                date: tx.date,
                name: tx.name,
                category: tx.category || [],
                pending: (tx as any).pending || false,
                iso_currency_code: tx.iso_currency_code || 'USD',
                merchant_name: (tx as any).merchant_name || (tx as any).merchantName,
                payment_channel: (tx as any).payment_channel,
                enriched_data: (tx as any).enriched_data,
                // Include transaction_type (stored in aiCategory field for persistence)
                // ✅ CRITICAL: Only set aiCategory if transaction was categorized
                // If transaction already has aiCategory (manual correction), preserve it
                // Otherwise, use transaction_type from categorization
                // Use undefined if neither exists (so persistence logic can preserve existing manual corrections)
                aiCategory: (tx as any).aiCategory || (tx as any).transaction_type || undefined,
                aiCategoryReason: (tx as any).aiCategoryReason || (tx as any).categorization_reason || undefined,
                categoryComparedAt: ((tx as any).transaction_type || (tx as any).aiCategory) ? new Date() : undefined
              };
            });
          
          if (plaidBankingTransactions.length > 0) {
            await persistTransactionsToDb(userId, plaidBankingTransactions, mergedData.accounts);
          }
        }
        
        // Persist SnapTrade activities (investment transactions)
        if (mergedData.investments.transactions.length > 0) {
          const snapTradeTransactions = mergedData.investments.transactions
            .filter(tx => {
              const txId = (tx as any).id || (tx as any).transaction_id;
              return txId && txId.startsWith('snaptrade-');
            })
            .map(tx => ({
              ...tx,
              id: (tx as any).id || (tx as any).transaction_id,
              // Extract SnapTrade activity ID from transaction id format "snaptrade-{activityId}"
              activityId: ((tx as any).id || '').replace('snaptrade-', '')
            }));
          
          if (snapTradeTransactions.length > 0) {
            await persistSnapTradeActivitiesToDb(userId, snapTradeTransactions);
          }
        }
        
        console.log('FinancialDataService: Transaction persistence complete');
      } catch (error) {
        console.error('FinancialDataService: Error persisting transactions to database:', error);
        // Don't throw - persistence errors shouldn't block data retrieval
      }
    }

    // Calculate performance metrics
    const totalDuration = Date.now() - startTime;
    const plaidDuration = plaidData?.performance?.duration || 0;
    const snaptradeDuration = snapTradeData?.performance?.duration || 0;

    // Build error details
    const errors = {
      plaid: this.extractPlaidErrors(plaidData, plaidResult),
      snaptrade: this.extractSnapTradeErrors(snapTradeData, snapTradeResult),
      homeValue: homeValueResult.status === 'rejected' ? {
        error: homeValueResult.reason?.message || 'Failed to fetch home value',
        timestamp: new Date()
      } : null
    };

    const partialData = errors.plaid.length > 0 || errors.snaptrade.length > 0 || errors.homeValue !== null;

    console.log('FinancialDataService: Merge complete', {
      totalAccounts: mergedData.accounts.length,
      totalHoldings: mergedData.investments.holdings.length,
      totalBankingTransactions: mergedData.bankingTransactions.length,
      totalInvestmentTransactions: mergedData.investments.transactions.length,
      partialData,
      duration: totalDuration
    });

    return {
      ...mergedData,
      metadata: {
        lastUpdated: new Date(),
        tokenHealth: tokens,
        errors,
        partialData,
        performance: {
          totalDuration,
          plaidDuration,
          snaptradeDuration
        }
      }
    };
  }

  /**
   * Fetch data from Plaid
   */
  private async fetchPlaidData(userId: string, options: any): Promise<any> {
    const startTime = Date.now();
    console.log('FinancialDataService: Fetching Plaid data', { userId });

    try {
      const accessTokens = await prisma.accessToken.findMany({
        where: { userId }
      });

      if (accessTokens.length === 0) {
        console.log('FinancialDataService: No Plaid tokens found');
        return {
          accounts: [],
          balances: {},
          holdings: [],
          securities: [],
          transactions: [],
          errors: [],
          performance: { duration: Date.now() - startTime }
        };
      }

      const accounts: any[] = [];
      const balances: Record<string, any> = {};
      const holdings: any[] = [];
      const securities: any[] = [];
      const transactions: any[] = [];
      const errors: ErrorDetail[] = [];

      // Fetch data for each token
      for (const tokenRecord of accessTokens) {
        try {
          // Get accounts
          const accountsResponse = await plaidClient.accountsGet({
            access_token: tokenRecord.token
          });

          // Get institution data for these accounts
          const item = await plaidClient.itemGet({ access_token: tokenRecord.token });
          const institution = await plaidClient.institutionsGetById({
            institution_id: item.data.item.institution_id!,
            country_codes: ['US' as CountryCode]
          });

          for (const account of accountsResponse.data.accounts) {
            accounts.push({
              account_id: account.account_id,
              id: account.account_id, // Alias for compatibility
              name: account.name,
              type: account.type,
              subtype: account.subtype,
              balance: {
                current: account.balances.current || 0,
                available: account.balances.available,
                limit: account.balances.limit,
                iso_currency_code: account.balances.iso_currency_code || 'USD',
                unofficial_currency_code: account.balances.unofficial_currency_code
              },
              institution: institution.data.institution.name,
              institution_id: institution.data.institution.institution_id,
              institution_logo: institution.data.institution.logo || undefined,
              institution_url: institution.data.institution.url || undefined,
              source: 'plaid'
            });

            balances[account.account_id] = account.balances;
          }

          // Get investments if this is an investment account and option is enabled
          if (options.includeInvestments) {
            const hasInvestmentAccounts = accountsResponse.data.accounts.some(acc =>
              acc.type === 'investment' || (acc.subtype && INVESTMENT_SUBTYPES.includes(acc.subtype.toLowerCase()))
            );

            if (hasInvestmentAccounts) {
              try {
                const holdingsResponse = await plaidClient.investmentsHoldingsGet({
                  access_token: tokenRecord.token
                });

                // ✅ First, process securities into a lookup map for efficient access
                const securityMap = new Map();
                for (const security of holdingsResponse.data.securities) {
                  securityMap.set(security.security_id, security);
                  
                  securities.push({
                    security_id: security.security_id,
                    name: security.name,
                    type: security.type,
                    ticker_symbol: security.ticker_symbol,
                    iso_currency_code: security.iso_currency_code,
                    close_price: security.close_price,
                    close_price_as_of: security.close_price_as_of,
                    unofficial_currency_code: security.unofficial_currency_code
                  });
                }

                // ✅ Process holdings and include security details from the securityMap
                for (const holding of holdingsResponse.data.holdings) {
                  const security = securityMap.get(holding.security_id);
                  
                  holdings.push({
                    id: `${holding.account_id}_${holding.security_id}_${holding.quantity}_${holding.institution_value}`,
                    account_id: holding.account_id,
                    security_id: holding.security_id,
                    institution_value: holding.institution_value,
                    institution_price: holding.institution_price,
                    institution_price_as_of: holding.institution_price_as_of,
                    cost_basis: holding.cost_basis,
                    quantity: holding.quantity,
                    iso_currency_code: holding.iso_currency_code,
                    // ✅ CRITICAL FIX: Add security details to each holding so frontend can display them
                    security_name: security?.name || 'Unknown Security',
                    security_type: security?.type || 'Unknown',
                    ticker_symbol: security?.ticker_symbol || undefined
                  });
                }
                
                // ✅ Fetch investment transactions if includeTransactions is enabled
                if (options.includeTransactions) {
                  try {
                    const endDate = new Date().toISOString().split('T')[0];
                    const investmentHistoryYears = parseInt(process.env.INVESTMENT_HISTORY_YEARS || '2', 10);
                    const investmentHistoryDays = investmentHistoryYears * 365;
                    const startDate = new Date(Date.now() - investmentHistoryDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    
                    console.log(`FinancialDataService: Fetching Plaid investment transactions from ${startDate} to ${endDate} (${investmentHistoryYears} years)`);
                    
                    const investmentTransactionsResponse = await plaidClient.investmentsTransactionsGet({
                      access_token: tokenRecord.token,
                      start_date: startDate,
                      end_date: endDate
                    });
                    
                    console.log(`FinancialDataService: Found ${investmentTransactionsResponse.data.investment_transactions.length} investment transactions for token ${tokenRecord.id}`);
                    
                    // Add investment transactions to the transactions array
                    // These will be distinguished from banking transactions by their structure
                    for (const invTxn of investmentTransactionsResponse.data.investment_transactions) {
                      transactions.push({
                        id: invTxn.investment_transaction_id,
                        transaction_id: invTxn.investment_transaction_id, // ✅ Add both id and transaction_id for consistency
                        investment_transaction_id: invTxn.investment_transaction_id, // ✅ Preserve original field
                        account_id: invTxn.account_id,
                        security_id: invTxn.security_id,
                        amount: invTxn.amount,
                        date: invTxn.date,
                        name: invTxn.name,
                        quantity: invTxn.quantity,
                        price: invTxn.price,
                        fees: invTxn.fees,
                        type: invTxn.type,
                        subtype: invTxn.subtype,
                        iso_currency_code: invTxn.iso_currency_code,
                        unofficial_currency_code: invTxn.unofficial_currency_code,
                        // Mark as investment transaction for processing
                        isInvestmentTransaction: true
                      });
                    }
                  } catch (invTransactionError: any) {
                    console.error('Error fetching investment transactions for token:', invTransactionError?.response?.data?.error_code);
                    errors.push({
                      tokenId: tokenRecord.id,
                      error: invTransactionError?.response?.data?.error_message || invTransactionError.message,
                      timestamp: new Date()
                    });
                  }
                }
              } catch (investmentError: any) {
                const errorCode = investmentError?.response?.data?.error_code;
                if (errorCode !== 'PRODUCTS_NOT_SUPPORTED') {
                  console.error('Error fetching investments for token:', errorCode);
                  errors.push({
                    tokenId: tokenRecord.id,
                    error: investmentError?.response?.data?.error_message || investmentError.message,
                    timestamp: new Date()
                  });
                }
              }
            }
          }

          // Get transactions if option is enabled
          if (options.includeTransactions) {
            try {
              const endDate = new Date().toISOString().split('T')[0];
              const transactionHistoryDays = parseInt(process.env.TRANSACTION_HISTORY_DAYS || '90', 10);
              const startDate = new Date(Date.now() - transactionHistoryDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
              
              console.log(`FinancialDataService: Fetching Plaid banking transactions from ${startDate} to ${endDate} (${transactionHistoryDays} days)`);

              const transactionsResponse = await plaidClient.transactionsGet({
                access_token: tokenRecord.token,
                start_date: startDate,
                end_date: endDate,
                options: {
                  count: 500, // Get up to 500 transactions
                  include_personal_finance_category: true // ✅ CRITICAL: Include categories from Plaid!
                }
              });

              // ✅ DEBUG: Check if Plaid is returning categories
              if (transactionsResponse.data.transactions.length > 0) {
                const sampleTxn = transactionsResponse.data.transactions[0];
                console.log(`FinancialDataService: Sample Plaid transaction structure:`, {
                  name: sampleTxn.name,
                  amount: sampleTxn.amount,
                  category: sampleTxn.category,
                  category_id: sampleTxn.category_id,
                  personal_finance_category: (sampleTxn as any).personal_finance_category,
                  allKeys: Object.keys(sampleTxn)
                });
              }

              // ✅ CRITICAL: Ensure Plaid transactions have both id and transaction_id fields for consistent ID matching
              // Plaid returns transaction_id, but we also set id for consistency
              transactions.push(...transactionsResponse.data.transactions.map((tx: any) => ({
                ...tx,
                id: tx.transaction_id, // ✅ Set id to transaction_id for consistency
                transaction_id: tx.transaction_id // ✅ Ensure transaction_id is present
              })));
            } catch (transactionError: any) {
              console.error('Error fetching transactions for token:', transactionError?.response?.data?.error_code);
              errors.push({
                tokenId: tokenRecord.id,
                error: transactionError?.response?.data?.error_message || transactionError.message,
                timestamp: new Date()
              });
            }
          }
        } catch (error: any) {
          const errorCode = error?.response?.data?.error_code;
          console.error('Error fetching Plaid data for token:', errorCode);
          errors.push({
            tokenId: tokenRecord.id,
            error: error?.response?.data?.error_message || error.message,
            timestamp: new Date()
          });
        }
      }

      const duration = Date.now() - startTime;
      console.log('FinancialDataService: Plaid fetch complete', {
        duration,
        accountCount: accounts.length,
        holdingCount: holdings.length,
        transactionCount: transactions.length,
        errorCount: errors.length,
        success: errors.length === 0
      });

      return {
        accounts,
        balances,
        holdings,
        securities,
        transactions,
        errors,
        performance: { duration }
      };
    } catch (error: any) {
      console.error('FinancialDataService: Fatal error fetching Plaid data:', error);
      return {
        accounts: [],
        balances: {},
        holdings: [],
        securities: [],
        transactions: [],
        errors: [{ error: error.message, timestamp: new Date() }],
        performance: { duration: Date.now() - startTime }
      };
    }
  }

  /**
   * Fetch data from SnapTrade
   */
  private async fetchSnapTradeData(userId: string, options: any): Promise<any> {
    const startTime = Date.now();
    console.log('FinancialDataService: Fetching SnapTrade data', { userId });

    try {
      const snapTradeUser = await prisma.snapTradeUser.findUnique({
        where: { userId }
      });

      if (!snapTradeUser || !snapTradeUser.userSecret) {
        console.log('FinancialDataService: No SnapTrade user found');
        return {
          accounts: [],
          holdings: [],
          securities: [],
          transactions: [],
          errors: [],
          performance: { duration: Date.now() - startTime }
        };
      }

      const snapTradeService = new SnapTradeService();
      const errors: ErrorDetail[] = [];
      const accounts: any[] = [];
      const holdings: any[] = [];
      const securities: any[] = [];
      const transactions: any[] = [];

      // ✅ Get accounts once and reuse them for holdings and activities
      let accountsData: any = null;
      
      try {
        const accountsResult = await snapTradeService.getUserAccounts(userId, snapTradeUser.userSecret);
        accountsData = accountsResult; // Store for later reuse
        
        if (accountsResult.success && accountsResult.data?.accounts) {
          for (const account of accountsResult.data.accounts) {
            const balance = account.balance?.value || account.currentBalance || 0;
            const accountId = `snaptrade-${account.id}`;
            accounts.push({
              account_id: accountId,
              id: accountId, // Alias for compatibility
              name: account.name,
              type: 'investment',
              subtype: 'brokerage',
              balance: {
                current: balance,
                available: balance,
                iso_currency_code: 'USD'
              },
              institution: 'SnapTrade',
              source: 'snaptrade'
            });
          }
        } else {
          errors.push({
            error: accountsResult.error || 'Failed to fetch SnapTrade accounts',
            timestamp: new Date()
          });
        }
      } catch (accountError: any) {
        console.error('Error fetching SnapTrade accounts:', accountError);
        errors.push({
          error: accountError.message || 'Failed to fetch SnapTrade accounts',
          timestamp: new Date()
        });
      }

      // Get holdings if option is enabled
      if (options.includeInvestments) {
        try {
          const holdingsResult = await snapTradeService.getUserHoldings(userId, snapTradeUser.userSecret);
          
          if (holdingsResult.success && holdingsResult.data) {
            // ✅ Build a map to update account balances with total_value from holdings
            const accountBalanceMap = new Map<string, number>();
            
            for (const accountHolding of holdingsResult.data) {
              // ✅ Store total_value for this account if available
              const accountId = `snaptrade-${accountHolding.account?.id}`;
              const totalValue = accountHolding.total_value?.value || 0;
              if (totalValue > 0) {
                accountBalanceMap.set(accountId, totalValue);
              }
              
              // Process positions
              if (accountHolding.positions && Array.isArray(accountHolding.positions)) {
                for (const position of accountHolding.positions) {
                  // ✅ Get security type from SnapTrade API (correct path: position.symbol.symbol.type.description)
                  let securityType = position.symbol?.symbol?.type?.description || position.symbol?.type?.description;
                  
                  // If type not provided, infer from account name and security details
                  if (!securityType || securityType === 'Unknown') {
                    const accountName = (accountHolding.account?.name || '').toLowerCase();
                    const securityName = (position.symbol?.symbol?.description || position.symbol?.description || '').toLowerCase();
                    const ticker = (position.symbol?.symbol?.symbol || position.symbol?.symbol || '').toUpperCase();
                    
                    // Infer from account name
                    if (accountName.includes('treasury') || accountName.includes('bond')) {
                      securityType = 'Fixed Income';
                    } else if (accountName.includes('brokerage')) {
                      // For brokerage accounts, try to infer from security name
                      if (securityName.includes('treasury') || securityName.includes('bond') || securityName.includes('fixed income')) {
                        securityType = 'Fixed Income';
                      } else if (securityName.includes('etf') || ticker.includes('ETF')) {
                        securityType = 'ETF';
                      } else if (securityName.includes('mutual fund') || securityName.includes('fund')) {
                        securityType = 'Mutual Fund';
                      } else if (securityName.includes('stock') || securityName.includes('equity')) {
                        securityType = 'Equity';
                      } else {
                        securityType = 'Equity'; // Default for brokerage accounts
                      }
                    } else {
                      securityType = 'Unknown';
                    }
                  }
                  
                  // ✅ Normalize security type descriptions to standard categories
                  // SnapTrade returns types like "Common Stock", "Preferred Stock", "ETF", etc.
                  const typeNormalized = (securityType || '').toLowerCase();
                  if (typeNormalized.includes('stock') || typeNormalized.includes('equity')) {
                    securityType = 'Equity';
                  } else if (typeNormalized.includes('bond') || typeNormalized.includes('treasury') || typeNormalized.includes('fixed income')) {
                    securityType = 'Fixed Income';
                  } else if (typeNormalized.includes('etf')) {
                    securityType = 'ETF';
                  } else if (typeNormalized.includes('mutual fund') || typeNormalized.includes('fund')) {
                    securityType = 'Mutual Fund';
                  } else if (typeNormalized.includes('option')) {
                    securityType = 'Options';
                  } else if (typeNormalized.includes('crypto')) {
                    securityType = 'Cryptocurrency';
                  }
                  // If still Unknown after all checks, keep it as Unknown
                  
                  const holding = {
                    id: `snaptrade-${accountHolding.account?.id}-${position.symbol?.id || position.symbol?.symbol?.symbol}`,
                    account_id: `snaptrade-${accountHolding.account?.id}`,
                    security_id: position.symbol?.id || position.symbol?.symbol?.symbol || 'unknown',
                    institution_value: (position.price || 0) * (position.units || 0),
                    institution_price: position.price || 0,
                    institution_price_as_of: new Date().toISOString(),
                    cost_basis: (position.average_purchase_price || 0) * (position.units || 0),
                    quantity: position.units || 0,
                    iso_currency_code: position.currency?.code || 'USD',
                    security_name: position.symbol?.symbol?.description || position.symbol?.description || 'Unknown',
                    security_type: securityType,
                    ticker_symbol: position.symbol?.symbol?.symbol || position.symbol?.symbol,
                    snapTradeData: {
                      open_pnl: position.open_pnl,
                      average_purchase_price: position.average_purchase_price,
                      account_name: accountHolding.account?.name,
                      account_number: accountHolding.account?.number
                    }
                  };

                  holdings.push(holding);

                  // Add security if not already added
                  const securityExists = securities.some(s => s.security_id === holding.security_id);
                  if (!securityExists) {
                    securities.push({
                      security_id: holding.security_id,
                      name: holding.security_name,
                      type: holding.security_type,
                      ticker_symbol: holding.ticker_symbol,
                      iso_currency_code: holding.iso_currency_code,
                      close_price: holding.institution_price,
                      close_price_as_of: holding.institution_price_as_of
                    });
                  }
                }
              }

              // Process cash balances
              if (accountHolding.balances && Array.isArray(accountHolding.balances)) {
                const cashBalance = accountHolding.balances.find((b: any) => b.currency?.code === 'USD' && b.cash > 0);
                if (cashBalance) {
                  const cashHolding = {
                    id: `snaptrade-${accountHolding.account?.id}-cash`,
                    account_id: `snaptrade-${accountHolding.account?.id}`,
                    security_id: 'cash',
                    institution_value: cashBalance.cash,
                    institution_price: 1,
                    institution_price_as_of: new Date().toISOString(),
                    cost_basis: cashBalance.cash,
                    quantity: cashBalance.cash,
                    iso_currency_code: 'USD',
                    security_name: 'Cash',
                    security_type: 'Cash',
                    ticker_symbol: 'CASH',
                    snapTradeData: {
                      account_name: accountHolding.account?.name,
                      account_number: accountHolding.account?.number
                    }
                  };

                  holdings.push(cashHolding);

                  // Add cash security if not already added
                  const cashSecurityExists = securities.some(s => s.security_id === 'cash');
                  if (!cashSecurityExists) {
                    securities.push({
                      security_id: 'cash',
                      name: 'Cash',
                      type: 'Cash',
                      ticker_symbol: 'CASH',
                      iso_currency_code: 'USD',
                      close_price: 1,
                      close_price_as_of: new Date().toISOString()
                    });
                  }
                }
              }
            }
            
            // ✅ Update account balances with total_value from holdings
            console.log(`FinancialDataService: Updating ${accountBalanceMap.size} SnapTrade account balances`);
            for (const account of accounts) {
              if (account.source === 'snaptrade' && accountBalanceMap.has(account.account_id)) {
                const totalValue = accountBalanceMap.get(account.account_id)!;
                console.log(`FinancialDataService: Updating account ${account.name} balance from ${account.balance.current} to ${totalValue}`);
                account.balance.current = totalValue;
                account.balance.available = totalValue;
              }
            }
          } else {
            errors.push({
              error: holdingsResult.error || 'Failed to fetch SnapTrade holdings',
              timestamp: new Date()
            });
          }
        } catch (holdingError: any) {
          console.error('Error fetching SnapTrade holdings:', holdingError);
          errors.push({
            error: holdingError.message || 'Failed to fetch SnapTrade holdings',
            timestamp: new Date()
          });
        }
      }

      // ✅ Get transactions/activities if option is enabled
      if (options.includeTransactions && accountsData) {
        try {
          // ✅ Pass pre-fetched accounts to avoid redundant API call
          const activitiesResult = await snapTradeService.getUserActivities(userId, snapTradeUser.userSecret, accountsData);
          
          if (activitiesResult.success && activitiesResult.data?.activities) {
            for (const activity of activitiesResult.data.activities) {
              // ✅ SnapTrade getAccountActivities API response structure
              // Documentation: https://docs.snaptrade.com/reference/account-information_getaccountactivities
              
              // Get security information from symbol object
              const symbol = activity.symbol;
              const securityId = symbol?.id || symbol?.symbol || 'unknown';
              const securityName = symbol?.description || symbol?.raw_symbol || 'Unknown';
              
              // Get transaction type (BUY, SELL, DIVIDEND, CONTRIBUTION, WITHDRAWAL, REI, INTEREST, FEE, etc.)
              const transactionType = activity.type || 'unknown';
              
              // Get quantity (units field)
              const quantity = activity.units || 0;
              
              // Get price per unit
              const price = activity.price || 0;
              
              // Get total amount (already calculated by SnapTrade)
              const amount = activity.amount || (price * quantity);
              
              // Get date (prefer trade_date, fallback to settlement_date)
              const date = activity.trade_date || activity.settlement_date || new Date().toISOString();
              
              // Normalize amount sign based on transaction type
              // SELL/WITHDRAWAL/FEE should be negative, BUY/CONTRIBUTION/DIVIDEND should be positive
              let normalizedAmount = amount;
              if (transactionType === 'SELL' || transactionType === 'WITHDRAWAL' || transactionType === 'FEE') {
                normalizedAmount = -Math.abs(amount);
              } else if (transactionType === 'BUY' || transactionType === 'CONTRIBUTION' || transactionType === 'DIVIDEND' || transactionType === 'INTEREST' || transactionType === 'REI') {
                normalizedAmount = Math.abs(amount);
              }
              
              // Build transaction name
              let transactionName = activity.description || `${transactionType} ${securityName}`;
              if (activity.option_type) {
                transactionName = `${activity.option_type} ${securityName}`;
              }
              
              // Convert SnapTrade activity to standard transaction format
              transactions.push({
                id: activity.id || `snaptrade-${date}-${securityId}`,
                account_id: `snaptrade-${activity.account_id || 'unknown'}`,
                security_id: securityId,
                amount: normalizedAmount,
                date: date,
                name: transactionName.trim(),
                quantity: quantity,
                price: price,
                fees: activity.fee || 0,
                type: transactionType.toLowerCase(),
                subtype: activity.option_type?.toLowerCase(),
                iso_currency_code: activity.currency?.code || symbol?.currency?.code || 'USD',
                unofficial_currency_code: activity.currency?.code !== 'USD' ? activity.currency?.code : undefined,
                snapTradeData: {
                  type: transactionType,
                  option_type: activity.option_type,
                  description: activity.description,
                  trade_date: activity.trade_date,
                  settlement_date: activity.settlement_date,
                  fx_rate: activity.fx_rate,
                  institution: activity.institution,
                  external_reference_id: activity.external_reference_id,
                  account_name: activity.account_name
                }
              });
            }
            
            console.log(`FinancialDataService: Processed ${transactions.length} SnapTrade transactions`);
          } else {
            errors.push({
              error: activitiesResult.error || 'Failed to fetch SnapTrade activities',
              timestamp: new Date()
            });
          }
        } catch (activityError: any) {
          console.error('Error fetching SnapTrade activities:', activityError);
          errors.push({
            error: activityError.message || 'Failed to fetch SnapTrade activities',
            timestamp: new Date()
          });
        }
      }

      const duration = Date.now() - startTime;
      console.log('FinancialDataService: SnapTrade fetch complete', {
        duration,
        accountCount: accounts.length,
        holdingCount: holdings.length,
        transactionCount: transactions.length,
        errorCount: errors.length,
        success: errors.length === 0
      });

      return {
        accounts,
        holdings,
        securities,
        transactions,
        errors,
        performance: { duration }
      };
    } catch (error: any) {
      console.error('FinancialDataService: Fatal error fetching SnapTrade data:', error);
      return {
        accounts: [],
        holdings: [],
        securities: [],
        transactions: [],
        errors: [{ error: error.message, timestamp: new Date() }],
        performance: { duration: Date.now() - startTime }
      };
    }
  }

  /**
   * Fetch home value
   */
  private async fetchHomeValue(userId: string): Promise<HomeData | null> {
    try {
      // Check if home data exists in user profile
      const userProfile = await prisma.userProfile.findUnique({
        where: { userId },
        select: { profileText: true }
      });

      if (!userProfile || !userProfile.profileText) {
        return null;
      }

      // Parse home value from profile data
      const profileData = userProfile.profileText;
      const addressMatch = profileData.match(/HOME_ADDRESS:\s*(.+)/);
      const valueMatch = profileData.match(/HOME_VALUE:\s*(\d+(?:\.\d+)?)/);
      const valueLowMatch = profileData.match(/HOME_VALUE_LOW:\s*(\d+(?:\.\d+)?)/);
      const valueHighMatch = profileData.match(/HOME_VALUE_HIGH:\s*(\d+(?:\.\d+)?)/);
      const lastUpdatedMatch = profileData.match(/HOME_VALUE_LAST_UPDATED:\s*(.+)/);

      if (!addressMatch || !valueMatch) {
        return null;
      }

      return {
        address: addressMatch[1].trim(),
        valueLow: valueLowMatch ? parseFloat(valueLowMatch[1]) : parseFloat(valueMatch[1]),
        valueMid: parseFloat(valueMatch[1]),
        valueHigh: valueHighMatch ? parseFloat(valueHighMatch[1]) : parseFloat(valueMatch[1]),
        lastUpdated: lastUpdatedMatch ? lastUpdatedMatch[1].trim() : new Date().toISOString()
      };
    } catch (error: any) {
      console.error('Error fetching home value:', error);
      return null;
    }
  }

  /**
   * Merge data from all sources
   */
  private mergeFinancialData(
    plaidData: any | null,
    snapTradeData: any | null,
    homeValue: HomeData | null
  ): Omit<UnifiedFinancialData, 'metadata'> {
    // Merge accounts with deduplication
    const rawAccounts = [
      ...(plaidData?.accounts || []),
      ...(snapTradeData?.accounts || [])
    ];

    // ✅ Deduplicate accounts by account_id AND by description (name + type + balance)
    // This handles both direct duplicates AND cross-source duplicates
    console.log('FinancialDataService: Deduplicating accounts', {
      rawCount: rawAccounts.length
    });

    const accountMap = new Map<string, any>();
    const seenDescriptions = new Set<string>();

    for (const account of rawAccounts) {
      const accountId = account.account_id || account.id;
      const balance = account.balance?.current || account.balance?.available || 0;
      const descKey = `${account.name}|${account.type}|${account.subtype}|${Math.round(balance * 100)}`;

      // Skip if we've already seen this description (handles duplicates)
      if (seenDescriptions.has(descKey)) {
        console.log('FinancialDataService: Skipping duplicate account', {
          name: account.name,
          balance,
          descKey
        });
        continue;
      }

      // Skip if we've already seen this account_id
      if (accountId && accountMap.has(accountId)) {
        console.log('FinancialDataService: Skipping duplicate account_id', {
          accountId,
          name: account.name
        });
        continue;
      }

      // Add this account
      if (accountId) {
        accountMap.set(accountId, account);
      }
      seenDescriptions.add(descKey);
    }

    const accounts = Array.from(accountMap.values());

    console.log('FinancialDataService: Deduplication complete', {
      rawCount: rawAccounts.length,
      uniqueCount: accounts.length,
      removed: rawAccounts.length - accounts.length
    });

    // Merge balances
    const balances = {
      ...(plaidData?.balances || {}),
      // SnapTrade balances are already in account objects
    };

    // Merge holdings with deduplication by holding ID
    const rawHoldings = [
      ...(plaidData?.holdings || []),
      ...(snapTradeData?.holdings || [])
    ];

    const holdingMap = new Map<string, any>();
    for (const holding of rawHoldings) {
      const holdingId = holding.id || `${holding.account_id}_${holding.security_id}_${holding.quantity}`;
      if (!holdingMap.has(holdingId)) {
        holdingMap.set(holdingId, holding);
      }
    }
    const holdings = Array.from(holdingMap.values());

    // Merge securities with deduplication by security_id
    const rawSecurities = [
      ...(plaidData?.securities || []),
      ...(snapTradeData?.securities || [])
    ];

    const securityMap = new Map<string, any>();
    for (const security of rawSecurities) {
      if (security.security_id && !securityMap.has(security.security_id)) {
        securityMap.set(security.security_id, security);
      }
    }
    const securities = Array.from(securityMap.values());

    console.log('FinancialDataService: Data merged', {
      accounts: accounts.length,
      holdings: holdings.length,
      securities: securities.length
    });

    // Calculate portfolio analysis
    const portfolio = this.analyzePortfolio(holdings, securities);

    // ✅ Merge transactions and separate investment from banking transactions
    const allPlaidTransactions = plaidData?.transactions || [];
    const snapTradeTransactions = snapTradeData?.transactions || [];
    
    // Separate Plaid transactions into investment and banking
    const plaidInvestmentTransactions = allPlaidTransactions.filter((txn: any) => txn.isInvestmentTransaction);
    const plaidBankingTransactions = allPlaidTransactions.filter((txn: any) => !txn.isInvestmentTransaction);
    
    // Combine all investment transactions (Plaid + SnapTrade)
    const investmentTransactions: Transaction[] = [
      ...plaidInvestmentTransactions,
      ...snapTradeTransactions
    ];
    
    // Banking transactions are only from Plaid
    const bankingTransactions: Transaction[] = plaidBankingTransactions;
    
    console.log('FinancialDataService: Transactions separated', {
      plaidInvestmentTransactions: plaidInvestmentTransactions.length,
      snapTradeTransactions: snapTradeTransactions.length,
      totalInvestmentTransactions: investmentTransactions.length,
      bankingTransactions: bankingTransactions.length
    });

    return {
      accounts,
      balances,
      investments: {
        holdings,
        securities,
        portfolio,
        transactions: investmentTransactions
      },
      bankingTransactions,
      homeValue
    };
  }

  /**
   * Analyze portfolio
   */
  private analyzePortfolio(holdings: Holding[], securities: Security[]): PortfolioAnalysis {
    const portfolioValue = holdings.reduce((total, holding) => {
      return total + (holding.institution_value || 0);
    }, 0);

    const securityMap = new Map(securities.map(sec => [sec.security_id, sec]));
    
    const assetAllocation = holdings.reduce((allocation, holding) => {
      const security = securityMap.get(holding.security_id);
      const assetType = security?.type || holding.security_type || 'Unknown';
      
      if (!allocation[assetType]) {
        allocation[assetType] = 0;
      }
      allocation[assetType] += holding.institution_value || 0;
      
      return allocation;
    }, {} as Record<string, number>);

    const allocationPercentages = Object.entries(assetAllocation).map(([type, value]) => ({
      type,
      value: value as number,
      percentage: portfolioValue > 0 ? ((value as number) / portfolioValue) * 100 : 0
    }));

    // Calculate unique securities count
    const uniqueSecurityIds = new Set(holdings.map(h => h.security_id));

    return {
      totalValue: portfolioValue,
      assetAllocation: allocationPercentages,
      holdingCount: holdings.length,
      securityCount: uniqueSecurityIds.size
    };
  }

  /**
   * Extract Plaid errors
   */
  private extractPlaidErrors(plaidData: any, result: PromiseSettledResult<any>): ErrorDetail[] {
    if (result.status === 'rejected') {
      return [{
        error: result.reason?.message || 'Failed to fetch Plaid data',
        timestamp: new Date()
      }];
    }

    return plaidData?.errors || [];
  }

  /**
   * Extract SnapTrade errors
   */
  private extractSnapTradeErrors(snapTradeData: any, result: PromiseSettledResult<any>): ErrorDetail[] {
    if (result.status === 'rejected') {
      return [{
        error: result.reason?.message || 'Failed to fetch SnapTrade data',
        timestamp: new Date()
      }];
    }

    return snapTradeData?.errors || [];
  }
}

