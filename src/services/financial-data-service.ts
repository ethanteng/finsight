import { PrismaClient, Prisma } from '@prisma/client';
import { Configuration, PlaidApi, PlaidEnvironments, CountryCode } from 'plaid';
import { SnapTradeService } from '../snaptrade';
import { BalanceService } from './balance-service';
import { TokenValidationService, TokenStatus, PlaidTokenHealth, SnapTradeTokenHealth } from './token-validation-service';
import { TransactionNormalizationService } from './transaction-normalization-service';
import { TransactionCategorizationService, CategorizationDetail, TransactionType } from './transaction-categorization-service';
import { persistTransactionsToDb, persistSnapTradeActivitiesToDb } from '../data/persistence';
import { cacheService } from '../data/cache';

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
  transactions?: Array<any>;
  persistentAccountId?: string | null;
  snapshotTimestamp?: string;
  lastSyncedAt?: string;
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
  transactionAggregates?: {
    income: Array<[string, number]>;
    expense: Array<[string, number]>;
  };
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
    dataSources: {
      plaid: string;
      snaptrade: string;
    };
    transactionAggregates?: {
      income: Array<[string, number]>;
      expense: Array<[string, number]>;
    };
    persistedAsOf: Date | null;
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
    const opts = {
      includeTransactions: options?.includeTransactions ?? true,
      includeInvestments: options?.includeInvestments ?? true,
      includeHomeValue: options?.includeHomeValue ?? true
    };

    const cacheKeyParts = [
      'financial-data',
      userId,
      opts.includeTransactions ? 'tx' : 'no-tx',
      opts.includeInvestments ? 'inv' : 'no-inv',
      opts.includeHomeValue ? 'home' : 'no-home'
    ];
    const cacheKey = cacheKeyParts.join(':');
    const shouldUseCache = !options?.skipCategorization;
    if (shouldUseCache) {
      const cachedData = await cacheService.get<UnifiedFinancialData>(cacheKey);
      if (cachedData) {
        return cachedData;
      }
    }

    let usingPersistedPlaidData = false;
    const persistedPlaidSnapshot = await this.tryLoadPersistedPlaidData(userId, opts);

    let plaidPromise: Promise<any>;
    if (persistedPlaidSnapshot?.isFresh) {
      usingPersistedPlaidData = true;
      plaidPromise = Promise.resolve(persistedPlaidSnapshot.data);
    } else {
      plaidPromise = this.fetchPlaidData(userId, opts);
    }

    // Fetch data from all sources in parallel
    const [plaidResult, snapTradeResult, manualAccountsResult, homeValueResult, tokenHealth] = await Promise.allSettled([
      plaidPromise,
      this.fetchSnapTradeData(userId, opts),
      this.fetchManualAccounts(userId),
      opts.includeHomeValue ? this.fetchHomeValue(userId) : Promise.resolve(null),
      this.tokenValidationService.getTokenHealth(userId)
    ]);

    // Process results
    let plaidData = plaidResult.status === 'fulfilled' ? plaidResult.value : null;
    const snapTradeData = snapTradeResult.status === 'fulfilled' ? snapTradeResult.value : null;
    const manualAccountsData = manualAccountsResult.status === 'fulfilled' ? manualAccountsResult.value : null;
    const homeValue = homeValueResult.status === 'fulfilled' ? homeValueResult.value : null;
    const tokens = tokenHealth.status === 'fulfilled' ? tokenHealth.value : { plaid: [], snaptrade: { userId, status: TokenStatus.ERROR, error: 'Unknown', lastChecked: new Date() } };

    if ((!plaidData || !plaidData.accounts?.length) && persistedPlaidSnapshot?.data) {
      usingPersistedPlaidData = true;
      plaidData = persistedPlaidSnapshot.data;
      console.warn('FinancialDataService: Falling back to persisted Plaid data after live fetch failure or empty accounts (e.g. all tokens inactive)');
    }

    // Merge data
    const mergedData = this.mergeFinancialData(plaidData, snapTradeData, manualAccountsData, homeValue);

    // ✅ STEP 1: Categorize transactions BEFORE normalization (skip for UI-only requests)
    // This ensures we have transaction_type available for normalization and filtering
    if (!options?.skipCategorization && (mergedData.bankingTransactions.length > 0 || mergedData.investments.transactions.length > 0)) {
      console.log(`🔍 FinancialDataService: Starting categorization for ${mergedData.bankingTransactions.length} banking transactions and ${mergedData.investments.transactions.length} investment transactions`);
      console.log(`   Categorization enabled: ${!options?.skipCategorization}, shouldPersistTransactions: ${options?.shouldPersistTransactions}`);
      
      const accountsMap = new Map<string, Account>();
      mergedData.accounts.forEach((acc: Account) => {
        accountsMap.set(acc.account_id, acc);
      });
      
      const allCategorizationDetails: CategorizationDetail[] = [];
      let gptCategorizedCount = 0;
      let plaidFallbackCount = 0;
      let totalConfidence = 0;
      
      const ttlParsed = parseInt(process.env.CATEGORIZATION_CACHE_TTL_HOURS || '24', 10);
      const categorizationTtlMs = Number.isFinite(ttlParsed) && ttlParsed > 0 ? ttlParsed * 60 * 60 * 1000 : 0;
      const now = Date.now();
      
      const existingCategorizationsMap = new Map<string, {
        aiCategory: string | null;
        aiCategoryReason: string | null;
        categoryComparedAt: Date | null;
      }>();
      
      try {
        const transactionIds: string[] = [];
        
        mergedData.bankingTransactions.forEach(tx => {
          const txId = (tx as any).transaction_id || tx.id || tx.transaction_id;
          if (txId && !txId.startsWith('snaptrade-')) {
            transactionIds.push(txId);
          }
        });
        
        mergedData.investments.transactions.forEach(tx => {
          const txId = (tx as any).investment_transaction_id || (tx as any).id || tx.transaction_id || tx.id;
          if (txId) {
            transactionIds.push(txId);
          }
        });
        
        if (transactionIds.length > 0) {
          const dbTransactions = await prisma.transaction.findMany({
            where: {
              plaidTransactionId: { in: transactionIds },
              aiCategory: { not: null }
            },
            select: {
              plaidTransactionId: true,
              aiCategory: true,
              aiCategoryReason: true,
              categoryComparedAt: true
            }
          });
          
          for (const dbTx of dbTransactions) {
            existingCategorizationsMap.set(dbTx.plaidTransactionId, {
              aiCategory: dbTx.aiCategory,
              aiCategoryReason: dbTx.aiCategoryReason,
              categoryComparedAt: dbTx.categoryComparedAt ? new Date(dbTx.categoryComparedAt) : null
            });
          }
        }
      } catch (error) {
        console.error('FinancialDataService: Error loading manual corrections from database:', error);
        // Continue with categorization even if loading corrections fails
      }
      
      const manualCorrectionCount = Array.from(existingCategorizationsMap.values())
        .filter(ec => ec.aiCategoryReason?.toLowerCase().includes('manually corrected') || 
                     ec.aiCategoryReason?.toLowerCase().includes('corrected by user'))
        .length;
      
      const buildDetail = (originalTx: any, categorizedTx: any): CategorizationDetail => {
            const account = accountsMap.get(originalTx.account_id);
            const pfc = (originalTx as any).personal_finance_category;
                return {
              transaction: {
                id: originalTx.id || originalTx.transaction_id || 'unknown',
                name: originalTx.name,
                amount: originalTx.amount,
                date: originalTx.date,
                category: originalTx.category || [],
                category_id: originalTx.category_id,
                personal_finance_category: pfc ? {
                  primary: pfc.primary || '',
                  detailed: pfc.detailed || ''
                } : null,
                payment_channel: originalTx.payment_channel,
                merchant_name: originalTx.merchant_name,
                iso_currency_code: originalTx.iso_currency_code,
                pending: originalTx.pending
              },
              account: {
                account_id: account?.account_id || originalTx.account_id,
                type: account?.type || 'unknown',
                subtype: account?.subtype,
                name: account?.name || 'Unknown Account'
              },
              categorization: {
                transaction_type: categorizedTx.transaction_type,
                confidence: categorizedTx.categorization_confidence ?? 1,
                method: categorizedTx.categorization_method || 'cached',
                reason: categorizedTx.categorization_reason || categorizedTx.aiCategoryReason
              }
            };
          };
          
      const inferInvestmentTransactionType = (tx: Record<string, any>): TransactionType => {
        const amount = Number(tx.amount) || 0;
        const rawType = `${tx.type || ''} ${tx.subtype || ''}`.toLowerCase();

        if (rawType.includes('dividend') || rawType.includes('interest') || rawType.includes('distribution')) {
          return 'income';
        }
        if (rawType.includes('sell') || rawType.includes('redemption') || rawType.includes('liquidation')) {
          return 'sell';
        }
        if (rawType.includes('buy') || rawType.includes('purchase')) {
          return 'buy';
        }
        if (amount > 0) {
          return 'sell';
        }
        if (amount < 0) {
          return 'buy';
        }
        return 'adjustment';
      };

          const processTransactionGroup = async (
            transactions: Array<Record<string, any>>,
            getTransactionId: (tx: Record<string, any>) => string | undefined,
            label: 'banking' | 'investment'
          ): Promise<{
            results: any[];
            reusedCount: number;
            manualCount: number;
            recategorizedCount: number;
          }> => {
            if (transactions.length === 0) {
              return { results: transactions, reusedCount: 0, manualCount: 0, recategorizedCount: 0 };
            }
            
            const output: any[] = new Array(transactions.length);
            const toCategorize: Array<{ tx: any; index: number }> = [];
            let reusedCount = 0;
            let manualCountLocal = 0;
            
            transactions.forEach((tx, index) => {
              const txId = getTransactionId(tx);
              if (!txId) {
                console.log(`   ⚠️ Transaction at index ${index} ("${tx.name}") has no ID - will categorize`);
                toCategorize.push({ tx, index });
                return;
              }
              
              const existing = existingCategorizationsMap.get(txId);
              if (!existing || !existing.aiCategory) {
                if (!existing) {
                  console.log(`   📝 Transaction "${tx.name}" (${txId}): No existing categorization - will categorize`);
                } else {
                  console.log(`   📝 Transaction "${tx.name}" (${txId}): Existing categorization has no aiCategory - will recategorize`);
                }
                toCategorize.push({ tx, index });
                return;
              }
              
              const isManual = existing.aiCategoryReason?.toLowerCase().includes('manually corrected') ||
                               existing.aiCategoryReason?.toLowerCase().includes('corrected by user');
              
              const isFresh = isManual ||
                (existing.categoryComparedAt instanceof Date &&
                  categorizationTtlMs > 0 &&
                  now - existing.categoryComparedAt.getTime() <= categorizationTtlMs);
              
              if (!isFresh) {
                const ageMs = existing.categoryComparedAt ? now - existing.categoryComparedAt.getTime() : Infinity;
                const ageHours = ageMs / (1000 * 60 * 60);
                console.log(`   🔄 Transaction "${tx.name}" (${txId}): Categorization stale (${ageHours.toFixed(1)}h old, TTL: ${categorizationTtlMs / (1000 * 60 * 60)}h) - will recategorize`);
                toCategorize.push({ tx, index });
                return;
              }
              
              const preservedTx = {
                  ...tx,
                aiCategory: existing.aiCategory,
                transaction_type: existing.aiCategory,
                aiCategoryReason: existing.aiCategoryReason,
                categorization_method: isManual ? 'manual' : 'cached',
                categorization_confidence: isManual ? 1 : 0.95,
                categorization_reason: existing.aiCategoryReason ||
                  (isManual ? 'Manually corrected by user' : 'Cached AI categorization'),
                categoryComparedAt: existing.categoryComparedAt || undefined,
                iso_currency_code: (tx as any).iso_currency_code || 'USD'
              };
              
              output[index] = preservedTx;
              reusedCount += isManual ? 0 : 1;
              if (isManual) {
                manualCountLocal += 1;
              }
              
              if (options?.collectCategorizationDetails) {
                allCategorizationDetails.push(buildDetail(tx, preservedTx));
                totalConfidence += preservedTx.categorization_confidence ?? 1;
              }
            });
            
            let recategorizedCount = 0;
            
            if (toCategorize.length > 0) {
              const transactionsToCategorize = toCategorize.map(item => item.tx);
              recategorizedCount = transactionsToCategorize.length;
              console.log(`   🎯 Categorizing ${recategorizedCount} transactions (${reusedCount} reused from cache, ${manualCountLocal} manual corrections preserved)`);

          if (label === 'investment') {
                transactionsToCategorize.forEach((tx, idx) => {
                  const transactionType = inferInvestmentTransactionType(tx);
                  const fallbackCategorized = {
                    ...tx,
                    transaction_type: transactionType,
                    // Map transaction_type to aiCategory for persistence (aiCategory field stores transaction_type)
                    aiCategory: transactionType,
                    aiCategoryReason: 'Investment fallback categorization',
                    categoryComparedAt: new Date(), // Mark when categorization was performed
                    categorization_confidence: 0.6,
                    categorization_method: 'fallback',
                    categorization_reason: 'Investment fallback categorization',
                    iso_currency_code: tx.iso_currency_code || 'USD'
                  };

                  const originalIndex = toCategorize[idx].index;
                  output[originalIndex] = fallbackCategorized;

                  if (options?.collectCategorizationDetails) {
                    allCategorizationDetails.push(buildDetail(tx, fallbackCategorized));
                    totalConfidence += fallbackCategorized.categorization_confidence ?? 0.6;
                  }
                });

                recategorizedCount = 0;
              } else {
                if (options?.collectCategorizationDetails) {
                  const result = await this.transactionCategorizationService.categorizeTransactionBatchWithDetails(
                    transactionsToCategorize,
                    accountsMap
                  );

                  result.transactions.forEach((categorizedTx, idx) => {
                    const originalIndex = toCategorize[idx].index;
                    const txId = getTransactionId(categorizedTx);
                    const aiCategory = categorizedTx.transaction_type || undefined;
                    
                    if (!aiCategory) {
                      console.warn(`   ⚠️ Transaction "${categorizedTx.name}" (${txId}): Categorization returned no transaction_type`);
                    } else {
                      console.log(`   ✅ Transaction "${categorizedTx.name}" (${txId}): Categorized as ${aiCategory}`);
                    }
                    
                    output[originalIndex] = {
                      ...categorizedTx,
                      // Map transaction_type to aiCategory for persistence (aiCategory field stores transaction_type)
                      aiCategory: aiCategory,
                      aiCategoryReason: categorizedTx.categorization_reason || undefined,
                      categoryComparedAt: new Date(), // Mark when categorization was performed
                      iso_currency_code: categorizedTx.iso_currency_code || 'USD'
                    };
                  });

                  allCategorizationDetails.push(...result.details);
                  gptCategorizedCount += result.summary.gptCategorized;
                  plaidFallbackCount += result.summary.plaidFallback;
                  totalConfidence += result.summary.averageConfidence * result.summary.total;
                } else {
                  const categorized = await this.transactionCategorizationService.categorizeTransactionBatch(
                    transactionsToCategorize,
                    accountsMap
                  );

                  categorized.forEach((categorizedTx, idx) => {
                    const originalIndex = toCategorize[idx].index;
                    const txId = getTransactionId(categorizedTx);
                    const aiCategory = categorizedTx.transaction_type || undefined;
                    
                    if (!aiCategory) {
                      console.warn(`   ⚠️ Transaction "${categorizedTx.name}" (${txId}): Categorization returned no transaction_type`);
                    } else {
                      console.log(`   ✅ Transaction "${categorizedTx.name}" (${txId}): Categorized as ${aiCategory}`);
                    }
                    
                    output[originalIndex] = {
                      ...categorizedTx,
                      // Map transaction_type to aiCategory for persistence (aiCategory field stores transaction_type)
                      aiCategory: aiCategory,
                      aiCategoryReason: categorizedTx.categorization_reason || undefined,
                      categoryComparedAt: new Date(), // Mark when categorization was performed
                      iso_currency_code: categorizedTx.iso_currency_code || 'USD'
                    };
                  });
                }
              }
            }
            
            // Fill any unset slots with original transaction data
            // ✅ CRITICAL: Ensure aiCategory is set from transaction_type if available
            let filledCount = 0;
            let missingAiCategoryCount = 0;
            output.forEach((value, idx) => {
              if (!value) {
                filledCount++;
                const tx = transactions[idx];
                const txId = getTransactionId(tx);
                const aiCategory = (tx as any).aiCategory || (tx as any).transaction_type || undefined;
                
                if (!aiCategory) {
                  missingAiCategoryCount++;
                  console.warn(`   ⚠️ Transaction "${tx.name}" (${txId}): No aiCategory after categorization - filling with original data`);
                }
                
                output[idx] = {
                  ...tx,
                  // Map transaction_type to aiCategory if available
                  aiCategory: aiCategory,
                  aiCategoryReason: (tx as any).aiCategoryReason || (tx as any).categorization_reason || undefined,
                  categoryComparedAt: ((tx as any).transaction_type || (tx as any).aiCategory) ? new Date() : undefined,
                  iso_currency_code: (tx as any).iso_currency_code || 'USD'
                };
              } else {
                // Ensure aiCategory is set even if it wasn't set during categorization
                const tx = transactions[idx];
                const txId = getTransactionId(tx);
                if (!value.aiCategory && !value.transaction_type) {
                  missingAiCategoryCount++;
                  // Try to get it from the original transaction
                  const aiCategory = (tx as any).aiCategory || (tx as any).transaction_type || undefined;
                  console.warn(`   ⚠️ Transaction "${tx.name}" (${txId}): Output missing aiCategory - attempting to recover from original transaction: ${aiCategory || 'none'}`);
                  value.aiCategory = aiCategory;
                  value.aiCategoryReason = value.aiCategoryReason || (tx as any).aiCategoryReason || (tx as any).categorization_reason || undefined;
                  value.categoryComparedAt = value.categoryComparedAt || (((tx as any).transaction_type || (tx as any).aiCategory) ? new Date() : undefined);
                }
              }
            });
            
            if (filledCount > 0 || missingAiCategoryCount > 0) {
              console.log(`   📊 Categorization summary: ${filledCount} slots filled, ${missingAiCategoryCount} transactions still missing aiCategory`);
            }
            
            // Final verification: count how many transactions have aiCategory set
            const finalCategorizedCount = output.filter(tx => tx.aiCategory || (tx as any).transaction_type).length;
            const finalUncategorizedCount = output.length - finalCategorizedCount;
            
            if (finalUncategorizedCount > 0) {
              console.warn(`   ⚠️ After categorization: ${finalUncategorizedCount} transactions still missing aiCategory out of ${output.length} total`);
              // Log sample of uncategorized transactions
              const uncategorizedSample = output.filter(tx => !tx.aiCategory && !(tx as any).transaction_type).slice(0, 3);
              uncategorizedSample.forEach(tx => {
                const txId = getTransactionId(tx);
                console.warn(`      - "${tx.name}" (${txId})`);
              });
            } else {
              console.log(`   ✅ All ${output.length} transactions have aiCategory set`);
            }
            
            return {
              results: output,
              reusedCount,
              manualCount: manualCountLocal,
              recategorizedCount
            };
          };
          
          // Categorize banking transactions with caching
          let bankingRecategorized = 0;
          let bankingReused = 0;
          let bankingManual = 0;
          
          if (mergedData.bankingTransactions.length > 0) {
            const bankingResult = await processTransactionGroup(
              mergedData.bankingTransactions,
              (tx) => {
                const txId = (tx as any).transaction_id || tx.id || tx.transaction_id;
                return txId && !txId.startsWith('snaptrade-') ? txId : undefined;
              },
              'banking'
            );
            
            mergedData.bankingTransactions = bankingResult.results;
            bankingRecategorized = bankingResult.recategorizedCount;
            bankingReused = bankingResult.reusedCount;
            bankingManual = bankingResult.manualCount;
          }
          
          // Categorize investment transactions with caching
          let investmentRecategorized = 0;
          let investmentReused = 0;
          let investmentManual = 0;
          
      if (mergedData.investments.transactions.length > 0) {
            const investmentResult = await processTransactionGroup(
            mergedData.investments.transactions,
              (tx) => (tx as any).investment_transaction_id || (tx as any).id || tx.transaction_id || tx.id,
              'investment'
            );
            
            mergedData.investments.transactions = investmentResult.results;
            investmentRecategorized = investmentResult.recategorizedCount;
            investmentReused = investmentResult.reusedCount;
            investmentManual = investmentResult.manualCount;
          }
          
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
      }
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
        
      }
    }

    // ✅ STEP 3: Persist transactions to database when:
    // 1. shouldPersistTransactions is explicitly true (categorization was requested, or called from GPT prompts)
    //    OR
    // 2. PERSIST_TRANSACTIONS env var is set to 'true' (legacy behavior for explicit persistence)
    // This ensures categorized transactions are always persisted, while preventing unnecessary persistence for display-only views
    const shouldPersist = options?.shouldPersistTransactions === true || process.env.PERSIST_TRANSACTIONS === 'true';
    if (shouldPersist) {
      try {
        
        // Persist banking transactions (from Plaid)
        if (!usingPersistedPlaidData && mergedData.bankingTransactions.length > 0) {
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
              
              // Log if transaction has categorization for debugging (before return)
              if ((tx as any).aiCategory || (tx as any).transaction_type) {
                console.log(`📝 FinancialDataService: Transaction "${tx.name}" will be persisted with aiCategory: ${(tx as any).aiCategory || (tx as any).transaction_type}`);
              }
              
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
            const categorizedCount = plaidBankingTransactions.filter(tx => tx.aiCategory).length;
            const uncategorizedCount = plaidBankingTransactions.length - categorizedCount;
            console.log(`💾 FinancialDataService: Persisting ${plaidBankingTransactions.length} transactions (${categorizedCount} with aiCategory, ${uncategorizedCount} without)`);
            
            if (uncategorizedCount > 0 && options?.shouldPersistTransactions) {
              console.warn(`⚠️ FinancialDataService: ${uncategorizedCount} transactions are missing aiCategory despite categorization being enabled. This may indicate categorization failed or was skipped.`);
              // Log a sample of uncategorized transactions for debugging
              const uncategorizedSample = plaidBankingTransactions.filter(tx => !tx.aiCategory).slice(0, 5);
              uncategorizedSample.forEach(tx => {
                console.warn(`   - Transaction "${tx.name}" (${tx.id || tx.transaction_id}): no aiCategory, transaction_type=${(tx as any).transaction_type || 'none'}`);
              });
            }
            
            await persistTransactionsToDb(userId, plaidBankingTransactions, mergedData.accounts);
            console.log(`✅ FinancialDataService: Successfully persisted ${plaidBankingTransactions.length} transactions to database`);
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
        await cacheService.invalidate(`financial-data:${userId}`);
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

    const result: UnifiedFinancialData = {
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
        },
        dataSources: {
          plaid: usingPersistedPlaidData ? 'persisted' : 'live',
          snaptrade: (snapTradeData?.performance?.source as string) || 'live'
        },
        transactionAggregates: mergedData.transactionAggregates,
        persistedAsOf: usingPersistedPlaidData && persistedPlaidSnapshot?.lastSynced
          ? persistedPlaidSnapshot.lastSynced
          : null
      }
    };

    if (shouldUseCache) {
      const cacheTtl = parseInt(process.env.FINANCIAL_DATA_CACHE_TTL_MS || '300000', 10);
      await cacheService.set(cacheKey, result, cacheTtl);
    }

    return result;
  }

  /**
   * Fetch data from Plaid
   */
  private async tryLoadPersistedPlaidData(
    userId: string,
    options: { includeTransactions: boolean; includeInvestments: boolean }
  ): Promise<{ data: any; lastSynced: Date | null; isFresh: boolean } | null> {
    // Persisted snapshots currently store only account/core balance data. When
    // investment holdings are requested we must force a live Plaid fetch to keep
    // portfolio analytics accurate.
    if (options.includeInvestments) {
      return null;
    }

    try {
      const historyDays = parseInt(process.env.TRANSACTION_HISTORY_DAYS || '90', 10);
      const startDate = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000);
      const accountInclude = options.includeTransactions
        ? {
            transactions: {
              orderBy: { date: Prisma.SortOrder.desc },
              where: {
                date: {
                  gte: startDate
                }
              }
            }
          }
        : undefined;

      const accountRecordsRaw = await prisma.account.findMany({
        where: { userId },
        include: accountInclude
      }) as Array<Prisma.AccountGetPayload<{
        include: {
          transactions: true;
        };
      }>>;

      const accountRecords = accountRecordsRaw.filter(record => {
        if (!record.plaidAccountId) {
          return false;
        }
        if (record.plaidAccountId.startsWith('snaptrade-')) {
          return false;
        }
        // Exclude manual accounts - they come from ManualAccount table via fetchManualAccounts.
        // If Account table has legacy manual records, including them would duplicate with fetchManualAccounts.
        if (record.plaidAccountId.startsWith('manual-')) {
          return false;
        }
        return true;
      });

      if (accountRecords.length === 0) {
        return null;
      }

      // ✅ CRITICAL: Filter out corrupted records where plaidAccountId points to another account's database id
      // This is a safety measure to prevent corrupted data from being used
      // Note: Deduplication is handled by mergeFinancialData() - this is just data quality filtering
      const accountIdSet = new Set(accountRecords.map(r => r.id));
      
      // Helper to check if plaidAccountId looks like a database ID (cuid format: 25 chars, starts with 'c')
      const isDatabaseId = (id: string) => id.length === 25 && id.startsWith('c');
      
      // Filter out corrupted records only (deduplication happens in mergeFinancialData)
      const validRecords = accountRecords.filter(record => {
        // If plaidAccountId matches another account's database id, it's corrupted
        if (isDatabaseId(record.plaidAccountId) && accountIdSet.has(record.plaidAccountId) && record.plaidAccountId !== record.id) {
          console.warn(`⚠️ tryLoadPersistedPlaidData: Skipping corrupted account ${record.id} (${record.name}) - plaidAccountId points to another account's id: ${record.plaidAccountId}`);
          return false;
        }
        return true;
      });

      // ✅ Trust mergeFinancialData() for deduplication - don't deduplicate here
      // This ensures a single source of truth for deduplication logic
      const uniqueRecords = validRecords;
      
      if (accountRecords.length !== validRecords.length) {
        const corruptedCount = accountRecords.length - validRecords.length;
        console.warn(`⚠️ tryLoadPersistedPlaidData: Filtered out ${corruptedCount} corrupted accounts (${accountRecords.length} → ${validRecords.length}). Deduplication will be handled by mergeFinancialData().`);
      }

      // ✅ FIX: Sort validRecords (not accountRecords) and use them for timestamp calculation
      // This ensures corrupted records (which were filtered out) don't affect the lastSynced calculation
      const sortedValidRecords = validRecords
        .slice()
        .sort((a, b) => {
          const aTimestamp = (a.lastSynced || a.updatedAt)?.getTime?.() ?? 0;
          const bTimestamp = (b.lastSynced || b.updatedAt)?.getTime?.() ?? 0;
          return bTimestamp - aTimestamp;
        });

      const lastSyncedTimestamps = sortedValidRecords
        .map(record => record.lastSynced || record.updatedAt)
        .filter((value): value is Date => Boolean(value))
        .map(value => value.getTime());

      const lastSynced =
        lastSyncedTimestamps.length > 0
          ? new Date(Math.max(...lastSyncedTimestamps))
          : null;

      const maxAgeMinutes = parseInt(process.env.PERSISTED_DATA_MAX_AGE_MINUTES || '120', 10);
      const isFresh = lastSynced
        ? Date.now() - lastSynced.getTime() <= maxAgeMinutes * 60 * 1000
        : false;

      // Infer institution for records missing it - ensures consistent getLogicalKey() deduplication
      // so persisted accounts match fresh API accounts with the same identity.
      const institutionsInBatch = [...new Set(uniqueRecords.map(r => r.institution).filter(Boolean))] as string[];
      const singleInstitution = institutionsInBatch.length === 1 ? institutionsInBatch[0] : null;
      // When multiple institutions: infer per-account by matching name+type+subtype to records that have institution
      const keyToInstitutions = new Map<string, Set<string>>();
      for (const r of uniqueRecords) {
        if (r.institution) {
          const k = `${(r.name || '').trim()}|${(r.type || '').trim()}|${(r.subtype || '').trim()}`;
          if (!keyToInstitutions.has(k)) keyToInstitutions.set(k, new Set());
          keyToInstitutions.get(k)!.add(r.institution);
        }
      }
      const inferInstitution = (record: (typeof uniqueRecords)[0]): string | undefined => {
        if (record.institution) return record.institution;
        if (singleInstitution) return singleInstitution;
        const k = `${(record.name || '').trim()}|${(record.type || '').trim()}|${(record.subtype || '').trim()}`;
        const insts = keyToInstitutions.get(k);
        return insts?.size === 1 ? [...insts][0] : undefined;
      };

      const accounts = uniqueRecords.map(record => ({
        account_id: record.plaidAccountId,
        id: record.plaidAccountId,
        name: record.name,
        type: record.type,
        subtype: record.subtype || undefined,
        balance: {
          current: record.currentBalance || 0,
          available: record.availableBalance ?? undefined,
          limit: record.limit ?? undefined,
          iso_currency_code: record.currency || 'USD',
          unofficial_currency_code: undefined
        },
        institution: inferInstitution(record),
        institution_id: undefined,
        institution_logo: undefined,
        institution_url: undefined,
        source: 'plaid',
        persisted: true,
        // Pass through persistentAccountId only when it's the real Plaid value (TAN institutions).
        // When persistentAccountId === plaidAccountId it was likely our incorrect fallback - omit it
        // so we use institution+name dedup and match fresh API data that has no persistent_account_id.
        persistentAccountId:
          record.persistentAccountId &&
          record.persistentAccountId !== record.plaidAccountId
            ? record.persistentAccountId
            : undefined,
        snapshotTimestamp: (record.lastSynced || record.updatedAt)?.toISOString?.(),
        lastSyncedAt: record.lastSynced?.toISOString?.()
      }));

      const balances: Record<string, Balance> = {};
      accounts.forEach(account => {
        balances[account.account_id] = {
          current: account.balance.current,
          available: account.balance.available,
          limit: account.balance.limit,
          iso_currency_code: account.balance.iso_currency_code
        };
      });

      const transactions: any[] = [];
      const aggregateTotals = {
        income: new Map<string, number>(),
        expense: new Map<string, number>()
      };
      if (options.includeTransactions) {
        uniqueRecords.forEach(record => {
          const plaidAccountId = record.plaidAccountId;
          record.transactions?.forEach((dbTx: any) => {
            const categoryArray =
              typeof dbTx.category === 'string'
                ? dbTx.category.split(',').map((item: string) => item.trim()).filter(Boolean)
                : undefined;

            const normalizedType = dbTx.aiCategory ? dbTx.aiCategory.toLowerCase() : undefined;
            
            // ✅ CRITICAL: Only include settled (non-pending) transactions in income/expense calculations
            if (dbTx.pending === true) {
              // Skip pending transactions - they should not be included in income or expense calculations
              // They will still be included in the transactions array for display purposes
            } else {
              // ✅ CRITICAL: Explicitly exclude transfers from expense/income calculations
              // Prioritize aiCategory first (respects manual user corrections), then fall back to other indicators
              
              // Check enriched_data for personal_finance_category (stored as JSONB) as fallback
              let pfcPrimary = '';
              let pfcDetailed = '';
              if (dbTx.enriched_data && typeof dbTx.enriched_data === 'object') {
                const enriched = dbTx.enriched_data as any;
                if (enriched.personal_finance_category) {
                  pfcPrimary = (enriched.personal_finance_category.primary || '').toLowerCase();
                  pfcDetailed = (enriched.personal_finance_category.detailed || '').toLowerCase();
                }
              }
              
              // ✅ PRIMARY: Check aiCategory first (respects manual corrections and our categorization)
              // ✅ SECONDARY: Check personal_finance_category (Plaid's source of truth)
              // ✅ FALLBACK: Check categoryId, category array, and transaction name (including common transfer keywords)
              // Note: Prisma returns camelCase, but check both for safety
              const categoryId = ((dbTx.categoryId || dbTx.category_id || '') as string).toLowerCase();
              const transactionName = (dbTx.name || '').toLowerCase();
              const isTransfer = 
                normalizedType === 'transfer_in' || 
                normalizedType === 'transfer_out' ||
                pfcPrimary.includes('transfer') ||
                pfcDetailed.includes('transfer') ||
                categoryId.includes('transfer') ||
                categoryArray?.some((cat: string) => cat?.toLowerCase().includes('transfer')) ||
                transactionName.includes('transfer') ||
                transactionName.includes('zelle') ||
                transactionName.includes('ach') ||
                transactionName.includes('wire transfer') ||
                transactionName.includes('account transfer');
              
              // Only aggregate income/expense if it's NOT a transfer
              if (!isTransfer) {
                if (normalizedType === 'income') {
                  const label = (categoryArray?.[0] || normalizedType || 'uncategorized').toLowerCase();
                  aggregateTotals.income.set(
                    label,
                    (aggregateTotals.income.get(label) || 0) + (dbTx.amount || 0)
                  );
                } else if (normalizedType === 'expense' || normalizedType === 'fee') {
                  const label = (categoryArray?.[0] || normalizedType || 'uncategorized').toLowerCase();
                  aggregateTotals.expense.set(
                    label,
                    (aggregateTotals.expense.get(label) || 0) + Math.abs(dbTx.amount || 0)
                  );
                }
              }
            }

            transactions.push({
              id: dbTx.plaidTransactionId,
              transaction_id: dbTx.plaidTransactionId,
              account_id: plaidAccountId,
              amount: dbTx.amount,
              date: dbTx.date.toISOString().split('T')[0],
              name: dbTx.name,
              category: categoryArray,
              pending: dbTx.pending,
              iso_currency_code: dbTx.currency || 'USD',
              merchant_name: dbTx.merchantName || undefined,
              payment_channel: dbTx.paymentChannel || undefined,
              enriched_data: dbTx.enriched_data || undefined,
              aiCategory: dbTx.aiCategory || undefined,
              aiCategoryReason: dbTx.aiCategoryReason || undefined,
              transaction_type: dbTx.aiCategory || undefined,
              categoryComparedAt: dbTx.categoryComparedAt || undefined,
              persisted: true
            });
          });
        });
      }

      return {
        data: {
          accounts,
          balances,
          holdings: [],
          securities: [],
          transactions,
          transactionAggregates: {
            income: Array.from(aggregateTotals.income.entries()),
            expense: Array.from(aggregateTotals.expense.entries())
          },
          errors: [],
          performance: {
            duration: 0,
            source: 'persisted',
            lastSynced: lastSynced ? lastSynced.toISOString() : undefined
          }
        },
        lastSynced,
        isFresh
      };
    } catch (error) {
      console.error('FinancialDataService: Failed to load persisted Plaid data:', error);
      return null;
    }
  }

  private async fetchPlaidData(userId: string, options: any): Promise<any> {
    const startTime = Date.now();

    try {
      const accessTokens = await prisma.accessToken.findMany({
        where: { userId, isActive: true }
      });

      if (accessTokens.length === 0) {
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
      const aggregateTotals = {
        income: new Map<string, number>(),
        expense: new Map<string, number>()
      };
      const deriveCategoryLabel = (tx: any): string => {
        const detailed = tx.personal_finance_category?.detailed;
        if (detailed) {
          return detailed;
        }
        if (Array.isArray(tx.category) && tx.category.length > 0) {
          return tx.category[0];
        }
        if (typeof tx.category === 'string' && tx.category.trim() !== '') {
          return tx.category;
        }
        return 'uncategorized';
      };
      const addToAggregates = (tx: any) => {
        // ✅ CRITICAL: Only include settled (non-pending) transactions in income/expense calculations
        if (tx.pending === true) {
          return; // Skip pending transactions - they should not be included in income or expense calculations
        }
        
        const amount = Number(tx.amount) || 0;
        const absAmount = Math.abs(amount);
        if (absAmount === 0) {
          return;
        }
        const label = deriveCategoryLabel(tx).toLowerCase();
        const primaryCategory = (tx.personal_finance_category?.primary || '').toLowerCase();
        if (primaryCategory === 'income') {
          aggregateTotals.income.set(label, (aggregateTotals.income.get(label) || 0) + absAmount);
          return;
        }
        // ✅ CRITICAL: Explicitly exclude transfers from expense/income calculations
        // Check multiple sources to catch any miscategorized transfers
        const transactionName = (tx.name?.toLowerCase() || '');
        const categoryId = ((tx as any).category_id || '').toLowerCase();
        const categoryArray = tx.category || [];
        const isTransfer = 
          primaryCategory.includes('transfer') ||
          (tx as any).transaction_type === 'transfer_in' ||
          (tx as any).transaction_type === 'transfer_out' ||
          categoryId.includes('transfer') ||
          categoryArray.some((cat: any) => String(cat || '').toLowerCase().includes('transfer')) ||
          transactionName.includes('transfer') ||
          transactionName.includes('zelle') ||
          transactionName.includes('ach') ||
          transactionName.includes('wire transfer') ||
          transactionName.includes('account transfer');
        
        if (isTransfer) {
          return; // Skip transfers - they should not be included in income or expense calculations
        }
        
        if (primaryCategory) {
          aggregateTotals.expense.set(label, (aggregateTotals.expense.get(label) || 0) + absAmount);
          return;
        }
        if (amount < 0) {
          aggregateTotals.income.set(label, (aggregateTotals.income.get(label) || 0) + absAmount);
        } else {
          aggregateTotals.expense.set(label, (aggregateTotals.expense.get(label) || 0) + absAmount);
        }
      };
      const errors: ErrorDetail[] = [];

      // ✅ Merge with database accounts to get custom names for Plaid accounts
      // Fetch all accounts from database once (more efficient than querying per token)
      const dbAccounts = await prisma.account.findMany({
        where: {
          userId
        },
        select: {
          plaidAccountId: true,
          name: true
        }
      });
      
      // Filter to only Plaid accounts (exclude SnapTrade and manual accounts)
      const plaidDbAccounts = dbAccounts.filter(acc => 
        acc.plaidAccountId && 
        !acc.plaidAccountId.startsWith('snaptrade-') && 
        !acc.plaidAccountId.startsWith('manual-')
      );
      
      // Create a map of plaidAccountId -> custom name
      const customNamesMap = new Map<string, string>();
      plaidDbAccounts.forEach(acc => {
        customNamesMap.set(acc.plaidAccountId, acc.name);
      });

      // Fetch data for each token
      for (const tokenRecord of accessTokens) {
        try {
          const requestTimestamp = new Date().toISOString();

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
          const itemData = item.data.item as Record<string, any>;
          const itemLastUpdated = itemData?.last_updated_datetime || requestTimestamp;

          for (const account of accountsResponse.data.accounts) {
            // ✅ CRITICAL: Always set plaidAccountId from account.account_id for Plaid accounts
            // This ensures consistent account identity across the system
            const plaidAccountId = account.account_id;
            
            // Use custom name from database if available, otherwise use name from Plaid API
            const accountName = customNamesMap.get(plaidAccountId) || account.name;
            
            accounts.push({
              account_id: plaidAccountId,
              id: plaidAccountId, // Alias for compatibility
              name: accountName, // ✅ Use custom name from database if available
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
              source: 'plaid',
              plaidAccountId: plaidAccountId, // ✅ Always set for Plaid accounts
              // Pass through persistentAccountId only when it differs from plaidAccountId (matches persisted logic).
              // When Plaid returns persistent_account_id === account_id, both fresh and persisted must use
              // institution+name dedup so getLogicalKey produces the same key for both.
              persistentAccountId:
                (account as any).persistent_account_id &&
                (account as any).persistent_account_id !== plaidAccountId
                  ? (account as any).persistent_account_id
                  : undefined,
              snapshotTimestamp: itemLastUpdated,
              lastSyncedAt: itemLastUpdated
            });

            balances[account.account_id] = account.balances;
          }

            const hasInvestmentAccounts = accountsResponse.data.accounts.some(acc =>
              acc.type === 'investment' || (acc.subtype && INVESTMENT_SUBTYPES.includes(acc.subtype.toLowerCase()))
            );

          const asyncTasks: Promise<void>[] = [];

          if (options.includeInvestments && hasInvestmentAccounts) {
            asyncTasks.push((async () => {
              try {
                const holdingsResponse = await plaidClient.investmentsHoldingsGet({
                  access_token: tokenRecord.token
                });

                console.log(`📊 Plaid: Token ${tokenRecord.id.substring(0, 8)}... fetched ${holdingsResponse.data.holdings?.length || 0} holdings and ${holdingsResponse.data.securities?.length || 0} securities`);

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

                let holdingsAdded = 0;
                for (const holding of holdingsResponse.data.holdings) {
                  holdingsAdded++;
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
                    security_name: security?.name || 'Unknown Security',
                    security_type: security?.type || 'Unknown',
                    ticker_symbol: security?.ticker_symbol || undefined
                  });
                }
                
                console.log(`📊 Plaid: Token ${tokenRecord.id.substring(0, 8)}... processed ${holdingsAdded} holdings into holdings array (total holdings now: ${holdings.length})`);
                
                if (options.includeTransactions) {
                  try {
                    const endDate = new Date().toISOString().split('T')[0];
                    const investmentHistoryYears = parseInt(process.env.INVESTMENT_HISTORY_YEARS || '2', 10);
                    const investmentHistoryDays = investmentHistoryYears * 365;
                    const startDate = new Date(Date.now() - investmentHistoryDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    
                    const investmentTransactionsResponse = await plaidClient.investmentsTransactionsGet({
                      access_token: tokenRecord.token,
                      start_date: startDate,
                      end_date: endDate
                    });
                    
                    for (const invTxn of investmentTransactionsResponse.data.investment_transactions) {
                      transactions.push({
                        id: invTxn.investment_transaction_id,
                        transaction_id: invTxn.investment_transaction_id,
                        investment_transaction_id: invTxn.investment_transaction_id,
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
            })());
          }

          if (options.includeTransactions) {
            asyncTasks.push((async () => {
            try {
              const endDate = new Date().toISOString().split('T')[0];
              const transactionHistoryDays = parseInt(process.env.TRANSACTION_HISTORY_DAYS || '90', 10);
              const startDate = new Date(Date.now() - transactionHistoryDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
              
                const mapTransaction = (tx: any) => {
                  const normalized = {
                    ...tx,
                    id: tx.transaction_id,
                    transaction_id: tx.transaction_id
                  };
                  addToAggregates(normalized);
                  return normalized;
                };

              const transactionsResponse = await plaidClient.transactionsGet({
                access_token: tokenRecord.token,
                start_date: startDate,
                end_date: endDate,
                options: {
                    count: 500,
                    include_personal_finance_category: true
                }
              });

                transactions.push(...transactionsResponse.data.transactions.map(mapTransaction));

                let fetchedTransactions = transactionsResponse.data.transactions.length;
                const totalTransactions = transactionsResponse.data.total_transactions;

                while (fetchedTransactions < totalTransactions) {
                  const pagedResponse = await plaidClient.transactionsGet({
                    access_token: tokenRecord.token,
                    start_date: startDate,
                    end_date: endDate,
                    options: {
                      count: 500,
                      offset: fetchedTransactions,
                      include_personal_finance_category: true
                    }
                  });

                  transactions.push(...pagedResponse.data.transactions.map(mapTransaction));

                  fetchedTransactions += pagedResponse.data.transactions.length;
                }
            } catch (transactionError: any) {
              console.error('Error fetching transactions for token:', transactionError?.response?.data?.error_code);
              errors.push({
                tokenId: tokenRecord.id,
                error: transactionError?.response?.data?.error_message || transactionError.message,
                timestamp: new Date()
              });
            }
            })());
          }

          if (asyncTasks.length > 0) {
            await Promise.all(asyncTasks);
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
      return {
        accounts,
        balances,
        holdings,
        securities,
        transactions,
        transactionAggregates: {
          income: Array.from(aggregateTotals.income.entries()),
          expense: Array.from(aggregateTotals.expense.entries())
        },
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
   * Fetch manual accounts from database
   */
  private async fetchManualAccounts(userId: string): Promise<any> {
    const startTime = Date.now();

    try {
      const manualAccounts = await prisma.manualAccount.findMany({
        where: { userId },
      });

      const accounts: any[] = [];

      for (const manualAccount of manualAccounts) {
        // Map manual account types to account types
        let accountType: string;
        let accountSubtype: string;
        
        if (manualAccount.type === 'cash') {
          accountType = 'depository';
          accountSubtype = 'checking';
        } else if (manualAccount.type === 'investment') {
          accountType = 'investment';
          accountSubtype = 'brokerage';
        } else if (manualAccount.type === 'debt') {
          // For debt, use 'credit' type, but amount should be positive (debt owed)
          accountType = 'credit';
          accountSubtype = 'credit card';
        } else {
          // Default fallback
          accountType = 'depository';
          accountSubtype = 'checking';
        }

        const accountId = `manual-${manualAccount.id}`;
        const balance = manualAccount.type === 'debt' 
          ? Math.abs(manualAccount.amount) // Debt should be positive for calculations
          : manualAccount.amount;

        accounts.push({
          account_id: accountId,
          id: accountId,
          name: manualAccount.name,
          type: accountType,
          subtype: accountSubtype,
          balance: {
            current: balance,
            available: balance,
            iso_currency_code: 'USD'
          },
          institution: 'Manual',
          source: 'manual',
          persistentAccountId: accountId,
          snapshotTimestamp: manualAccount.updatedAt.toISOString(),
          lastSyncedAt: manualAccount.updatedAt.toISOString()
        });
      }

      return {
        accounts,
        holdings: [],
        securities: [],
        transactions: [],
        errors: [],
        performance: { duration: Date.now() - startTime }
      };
    } catch (error: any) {
      console.error('Error fetching manual accounts:', error);
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
   * Fetch data from SnapTrade
   */
  private async fetchSnapTradeData(userId: string, options: any): Promise<any> {
    const startTime = Date.now();

    try {
      const snapTradeUser = await prisma.snapTradeUser.findUnique({
        where: { userId }
      });

      if (!snapTradeUser || !snapTradeUser.userSecret) {
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
          // ✅ Merge with database accounts to get custom names
          const dbAccounts = await prisma.account.findMany({
            where: {
              userId
            },
            select: {
              plaidAccountId: true,
              name: true
            }
          });
          
          // Filter to only SnapTrade accounts
          const snapTradeDbAccounts = dbAccounts.filter(acc => 
            acc.plaidAccountId && acc.plaidAccountId.startsWith('snaptrade-')
          );
          
          // Create a map of plaidAccountId -> custom name
          const customNamesMap = new Map<string, string>();
          snapTradeDbAccounts.forEach(acc => {
            customNamesMap.set(acc.plaidAccountId, acc.name);
          });
          
          const fetchedAt = new Date().toISOString();

          for (const account of accountsResult.data.accounts) {
            const balance = account.balance?.value || account.currentBalance || 0;
            // ✅ CRITICAL: SnapTrade accounts use account_id format: snaptrade-{id}
            // Do NOT set plaidAccountId for SnapTrade accounts (they don't have one)
            const accountId = account.id.startsWith('snaptrade-') ? account.id : `snaptrade-${account.id}`;
            
            // Use custom name from database if available, otherwise use name from SnapTrade API
            const accountName = customNamesMap.get(accountId) || account.name;
            
            accounts.push({
              account_id: accountId, // ✅ Primary unique identifier for SnapTrade accounts
              id: accountId, // Alias for compatibility
              name: accountName, // ✅ Use custom name from database if available
              type: 'investment',
              subtype: 'brokerage',
              balance: {
                current: balance,
                available: balance,
                iso_currency_code: 'USD'
              },
              institution: account.institution || 'Unknown', // ✅ Use actual institution name (e.g., "Public") instead of hardcoded "SnapTrade"
              source: 'snaptrade',
              persistentAccountId: accountId, // ✅ Set for SnapTrade accounts
              // ✅ Do NOT set plaidAccountId - SnapTrade accounts don't have one
              snapshotTimestamp: fetchedAt,
              lastSyncedAt: fetchedAt
            });
          }
        } else {
          // Check if it's a 401 Unauthorized error (invalid credentials)
          const is401 = accountsResult.error?.toLowerCase().includes('credentials') || accountsResult.error?.toLowerCase().includes('invalid') || accountsResult.error?.toLowerCase().includes('expired');
          if (is401) {
            console.warn(`⚠️ FinancialDataService: SnapTrade accounts 401 Unauthorized for user ${userId} - credentials invalid/expired. Gracefully continuing without SnapTrade accounts.`);
            errors.push({
              error: 'SnapTrade credentials invalid or expired. Please reconnect your SnapTrade account.',
              timestamp: new Date()
            });
          } else {
            errors.push({
              error: accountsResult.error || 'Failed to fetch SnapTrade accounts',
              timestamp: new Date()
            });
          }
        }
      } catch (accountError: any) {
        // Check if it's a 401 Unauthorized error (invalid credentials)
        const is401 = accountError?.status === 401 || accountError?.code === 'ERR_BAD_REQUEST' && accountError?.status === 401;
        if (is401) {
          console.warn(`⚠️ FinancialDataService: SnapTrade accounts 401 Unauthorized for user ${userId} - credentials invalid/expired. Gracefully continuing without SnapTrade accounts.`);
          errors.push({
            error: 'SnapTrade credentials invalid or expired. Please reconnect your SnapTrade account.',
            timestamp: new Date()
          });
        } else {
          console.error('Error fetching SnapTrade accounts:', accountError);
          errors.push({
            error: accountError.message || 'Failed to fetch SnapTrade accounts',
            timestamp: new Date()
          });
        }
      }

      // Get holdings if option is enabled
      if (options.includeInvestments) {
        try {
          const holdingsResult = await snapTradeService.getUserHoldings(userId, snapTradeUser.userSecret);
          
          if (holdingsResult.success && holdingsResult.data) {
            console.log(`📊 SnapTrade: Received ${holdingsResult.data.length} account holdings from API`);
            // ✅ Build a map to update account balances with total_value from holdings
            const accountBalanceMap = new Map<string, number>();
            
            let totalPositionsProcessed = 0;
            for (const accountHolding of holdingsResult.data) {
              // ✅ Store total_value for this account if available
              const accountId = `snaptrade-${accountHolding.account?.id}`;
              const totalValue = accountHolding.total_value?.value || 0;
              if (totalValue > 0) {
                accountBalanceMap.set(accountId, totalValue);
              }
              
              // Process positions
              if (accountHolding.positions && Array.isArray(accountHolding.positions)) {
                console.log(`📊 SnapTrade: Account ${accountHolding.account?.name || accountId} has ${accountHolding.positions.length} positions`);
                for (const position of accountHolding.positions) {
                  totalPositionsProcessed++;
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
            
            console.log(`📊 SnapTrade: Processed ${totalPositionsProcessed} positions into ${holdings.length} holdings and ${securities.length} securities`);
            
            // ✅ Update account balances with total_value from holdings
            for (const account of accounts) {
              if (account.source === 'snaptrade' && accountBalanceMap.has(account.account_id)) {
                const totalValue = accountBalanceMap.get(account.account_id)!;
                account.balance.current = totalValue;
                account.balance.available = totalValue;
              }
            }
          } else {
            // Check if it's a 401 Unauthorized error (invalid credentials)
            const is401 = holdingsResult.error?.toLowerCase().includes('credentials') || holdingsResult.error?.toLowerCase().includes('invalid') || holdingsResult.error?.toLowerCase().includes('expired');
            if (is401) {
              console.warn(`⚠️ FinancialDataService: SnapTrade holdings 401 Unauthorized for user ${userId} - credentials invalid/expired. Gracefully continuing without SnapTrade holdings.`);
              errors.push({
                error: 'SnapTrade credentials invalid or expired. Please reconnect your SnapTrade account.',
                timestamp: new Date()
              });
            } else {
              errors.push({
                error: holdingsResult.error || 'Failed to fetch SnapTrade holdings',
                timestamp: new Date()
              });
            }
          }
        } catch (holdingError: any) {
          // Check if it's a 401 Unauthorized error (invalid credentials)
          const is401 = holdingError?.status === 401 || holdingError?.code === 'ERR_BAD_REQUEST' && holdingError?.status === 401;
          if (is401) {
            console.warn(`⚠️ FinancialDataService: SnapTrade holdings 401 Unauthorized for user ${userId} - credentials invalid/expired. Gracefully continuing without SnapTrade holdings.`);
            errors.push({
              error: 'SnapTrade credentials invalid or expired. Please reconnect your SnapTrade account.',
              timestamp: new Date()
            });
          } else {
            console.error('Error fetching SnapTrade holdings:', holdingError);
            errors.push({
              error: holdingError.message || 'Failed to fetch SnapTrade holdings',
              timestamp: new Date()
            });
          }
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
            
          } else {
            // Check if it's a 401 Unauthorized error (invalid credentials)
            const is401 = activitiesResult.error?.toLowerCase().includes('credentials') || activitiesResult.error?.toLowerCase().includes('invalid') || activitiesResult.error?.toLowerCase().includes('expired');
            if (is401) {
              console.warn(`⚠️ FinancialDataService: SnapTrade activities 401 Unauthorized for user ${userId} - credentials invalid/expired. Gracefully continuing without SnapTrade activities.`);
              errors.push({
                error: 'SnapTrade credentials invalid or expired. Please reconnect your SnapTrade account.',
                timestamp: new Date()
              });
            } else {
              errors.push({
                error: activitiesResult.error || 'Failed to fetch SnapTrade activities',
                timestamp: new Date()
              });
            }
          }
        } catch (activityError: any) {
          // Check if it's a 401 Unauthorized error (invalid credentials)
          const is401 = activityError?.status === 401 || activityError?.code === 'ERR_BAD_REQUEST' && activityError?.status === 401;
          if (is401) {
            console.warn(`⚠️ FinancialDataService: SnapTrade activities 401 Unauthorized for user ${userId} - credentials invalid/expired. Gracefully continuing without SnapTrade activities.`);
            errors.push({
              error: 'SnapTrade credentials invalid or expired. Please reconnect your SnapTrade account.',
              timestamp: new Date()
            });
          } else {
            console.error('Error fetching SnapTrade activities:', activityError);
            errors.push({
              error: activityError.message || 'Failed to fetch SnapTrade activities',
              timestamp: new Date()
            });
          }
        }
      }

      const duration = Date.now() - startTime;

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
      
      // Return home data even if value is 0 or missing (address is still useful)
      if (!addressMatch) {
        return null;
      }

      const address = addressMatch[1].trim();
      
      // Check for manual override first (takes precedence over RentCast estimate)
      // Regex handles numbers with optional decimals, and also handles commas (though they shouldn't be in stored values)
      const manualValueMatch = profileData.match(/HOME_VALUE_MANUAL:\s*([\d,]+(?:\.\d+)?)/);
      let value: number | null = null;
      let isManualOverride = false;
      
      if (manualValueMatch) {
        // Remove commas if present (shouldn't happen, but handle it)
        const cleanedValue = manualValueMatch[1].replace(/,/g, '');
        const manualValue = parseFloat(cleanedValue);
        if (manualValue > 0) {
          value = manualValue;
          isManualOverride = true;
          console.log(`🏠 Found manual home value override: $${value.toLocaleString()}`);
        }
      }
      
      // If no manual override, check for RentCast estimate
      if (value == null) {
        const valueMatch = profileData.match(/HOME_VALUE:\s*([\d,]+(?:\.\d+)?)/);
        if (valueMatch) {
          const cleanedValue = valueMatch[1].replace(/,/g, '');
          const parsedValue = parseFloat(cleanedValue);
          if (parsedValue > 0) {
            value = parsedValue;
            console.log(`🏠 Found RentCast home value estimate: $${value.toLocaleString()}`);
          }
        }
      }
      
      const valueLowMatch = profileData.match(/HOME_VALUE_LOW:\s*([\d,]+(?:\.\d+)?)/);
      const valueHighMatch = profileData.match(/HOME_VALUE_HIGH:\s*([\d,]+(?:\.\d+)?)/);
      const lastUpdatedMatch = profileData.match(/HOME_VALUE_LAST_UPDATED:\s*(.+)/);
      
      const valueLow = valueLowMatch ? parseFloat(valueLowMatch[1].replace(/,/g, '')) : (value != null && value > 0 ? value * 0.9 : 0);
      const valueHigh = valueHighMatch ? parseFloat(valueHighMatch[1].replace(/,/g, '')) : (value != null && value > 0 ? value * 1.1 : 0);

      // Ensure valueMid is set correctly - prioritize manual override, then RentCast estimate
      // This is critical for net worth calculations
      const finalValueMid = value != null && value > 0 ? value : 0;
      
      if (finalValueMid > 0) {
        console.log(`🏠 Home value extracted - valueMid: $${finalValueMid.toLocaleString()}, isManual: ${isManualOverride}`);
      } else {
        console.warn(`⚠️ Home value is 0 or null despite having address: ${address}`);
      }

      return {
        address,
        valueLow: valueLow > 0 ? valueLow : 0,
        valueMid: finalValueMid,
        valueHigh: valueHigh > 0 ? valueHigh : 0,
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
    manualAccountsData: any | null,
    homeValue: HomeData | null
  ): Omit<UnifiedFinancialData, 'metadata'> {
    // Merge accounts with deduplication
    const rawAccounts = [
      ...(plaidData?.accounts || []),
      ...(snapTradeData?.accounts || []),
      ...(manualAccountsData?.accounts || [])
    ];

    // ✅ DEDUPLICATION: Use logical identity to detect same account across re-links
    // - Primary: persistent_account_id (Plaid TAN institutions - Chase, PNC, US Bank)
    // - Fallback for Plaid: institution_id + name + type + subtype (per Plaid duplicate detection guidance)
    // - SnapTrade/Manual: account_id (already unique per source)

    const accountMap = new Map<string, any>();

    // ✅ SINGLE SOURCE OF TRUTH: This is the ONLY place where account deduplication happens
    // All other code should trust this function to return deduplicated accounts
    // - tryLoadPersistedPlaidData: Only filters corrupted records (safety), no deduplication
    // - /plaid/all-accounts: Only verification/logging, no deduplication
    // - Frontend: No deduplication (trusts backend)

    const parseSnapshotTimestamp = (source: any): number | null => {
      const raw =
        source?.snapshotTimestamp ||
        source?.lastSyncedAt ||
        source?.persistedAsOf ||
        source?.lastSynced ||
        null;

      if (!raw) {
        return null;
      }

      if (raw instanceof Date) {
        return raw.getTime();
      }

      const parsed = Date.parse(raw);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const getLogicalKey = (account: any): string => {
      // Only use persistentAccountId when it's the actual Plaid persistent_account_id (TAN institutions).
      // Do NOT use plaidAccountId as fallback - it changes on re-link and breaks deduplication.
      const persistentId = (account as any).persistentAccountId;
      if (persistentId && account.source === 'plaid') {
        return `persistent:${persistentId}`;
      }
      const name = (account.name || '').trim();
      const type = (account.type || '').trim();
      const subtype = (account.subtype || '').trim();
      // Use institution (name) when institution_id is missing - persisted accounts have institution but not institution_id
      const institutionKey = (account as any).institution || (account as any).institution_id || '';
      if (account.source === 'plaid') {
        // Always use plaid: prefix for Plaid accounts - never use account_id (changes on re-link).
        // When institution is missing, use empty prefix so name+type+subtype can still dedupe within batch.
        return `plaid:${institutionKey}|${name}|${type}|${subtype}`;
      }
      const accountId = account.account_id ||
                       (account as any).plaidAccountId ||
                       (account as any).persistentAccountId;
      return accountId ? `id:${accountId}` : '';
    };

    for (const account of rawAccounts) {
      const accountId = account.account_id ||
                       (account as any).plaidAccountId ||
                       (account as any).persistentAccountId;

      if (!accountId) {
        console.warn(`⚠️ Account without ID found: ${account.name} (${account.type}/${account.subtype}), skipping`);
        continue;
      }

      const logicalKey = getLogicalKey(account);
      if (!logicalKey) {
        console.warn(`⚠️ Account without logical key: ${account.name} (${account.type}/${account.subtype}), skipping`);
        continue;
      }

      const existing = accountMap.get(logicalKey);
      if (!existing) {
        accountMap.set(logicalKey, account);
        continue;
      }

      // Duplicate found - prioritize accounts from database (persisted) to preserve custom names
      // If both are persisted or both are not persisted, keep the most recent based on timestamp
      const existingIsPersisted = existing.persisted === true;
      const candidateIsPersisted = account.persisted === true;

      let shouldReplace = false;

      if (existingIsPersisted && !candidateIsPersisted) {
        shouldReplace = false;
      } else if (!existingIsPersisted && candidateIsPersisted) {
        shouldReplace = true;
      } else {
        const existingTimestamp = parseSnapshotTimestamp(existing);
        const candidateTimestamp = parseSnapshotTimestamp(account);

        if (candidateTimestamp !== null && (existingTimestamp === null || candidateTimestamp > existingTimestamp)) {
          shouldReplace = true;
        } else if (existingTimestamp !== null && candidateTimestamp === null) {
          shouldReplace = false;
        } else if (candidateTimestamp === null && existingTimestamp === null) {
          const existingBalance = existing.balance?.current ?? existing.balance?.available ?? 0;
          const candidateBalance = account.balance?.current ?? account.balance?.available ?? 0;
          shouldReplace = candidateBalance >= existingBalance;
        }
      }

      if (shouldReplace) {
        accountMap.set(logicalKey, account);
      }
    }

    const finalAccounts = Array.from(accountMap.values());
    const duplicatesRemoved = rawAccounts.length - finalAccounts.length;
    
    // ✅ Always log account deduplication for debugging
    console.log(`📊 mergeFinancialData: ${rawAccounts.length} raw accounts → ${finalAccounts.length} unique accounts (removed ${duplicatesRemoved} duplicates)`);
    
    // ✅ Log duplicate account IDs if any were found
    if (duplicatesRemoved > 0) {
      const accountIdCounts = new Map<string, number>();
      rawAccounts.forEach(acc => {
        const accountId = acc.account_id || (acc as any).plaidAccountId || (acc as any).persistentAccountId;
        if (accountId) {
          accountIdCounts.set(accountId, (accountIdCounts.get(accountId) || 0) + 1);
        }
      });
      
      const duplicateIds = Array.from(accountIdCounts.entries())
        .filter(([_, count]) => count > 1)
        .map(([id, count]) => ({ id, count }));
      
      if (duplicateIds.length > 0) {
        console.warn(`⚠️ Found duplicate account IDs:`, duplicateIds);
      }
    }

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

    console.log(`📊 mergeFinancialData: Merging ${plaidData?.holdings?.length || 0} Plaid holdings + ${snapTradeData?.holdings?.length || 0} SnapTrade holdings = ${rawHoldings.length} total raw holdings`);

    const holdingMap = new Map<string, any>();
    let duplicatesSkipped = 0;
    for (const holding of rawHoldings) {
      const holdingId = holding.id || `${holding.account_id}_${holding.security_id}_${holding.quantity}`;
      if (!holdingMap.has(holdingId)) {
        holdingMap.set(holdingId, holding);
      } else {
        duplicatesSkipped++;
        console.log(`⚠️ Skipping duplicate holding: ${holdingId} (${holding.security_name || holding.security_id})`);
      }
    }
    const holdings = Array.from(holdingMap.values());
    
    console.log(`📊 mergeFinancialData: After deduplication: ${holdings.length} unique holdings (removed ${duplicatesSkipped} duplicates)`);

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


    // Calculate portfolio analysis - include manual investment accounts
    const portfolio = this.analyzePortfolio(holdings, securities, finalAccounts);

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

    const transactionAggregates = plaidData?.transactionAggregates;
    

    return {
      accounts: finalAccounts,
      balances,
      investments: {
        holdings,
        securities,
        portfolio,
        transactions: investmentTransactions
      },
      bankingTransactions,
      homeValue,
      transactionAggregates
    };
  }

  /**
   * Analyze portfolio
   */
  private analyzePortfolio(holdings: Holding[], securities: Security[], accounts?: Account[]): PortfolioAnalysis {
    // Calculate portfolio value from holdings
    let portfolioValue = holdings.reduce((total, holding) => {
      return total + (holding.institution_value || 0);
    }, 0);

    // Add manual investment accounts (they don't have holdings, so add their balance directly)
    if (accounts) {
      const manualInvestmentAccounts = accounts.filter(acc => {
        const accountAny = acc as any;
        return accountAny.source === 'manual' && 
               (acc.type === 'investment' || 
                ['401k', 'ira', 'roth', 'brokerage', 'hsa', '529', 'pension', 'annuity'].includes(acc.subtype?.toLowerCase() || ''));
      });
      
      const manualInvestmentValue = manualInvestmentAccounts.reduce((sum, acc) => {
        const balance = acc.balance?.current ?? acc.balance?.available ?? 0;
        return sum + Math.max(0, balance);
      }, 0);
      
      if (manualInvestmentValue > 0) {
        console.log(`📊 analyzePortfolio: Adding ${manualInvestmentAccounts.length} manual investment accounts with total value: $${manualInvestmentValue.toFixed(2)}`);
        portfolioValue += manualInvestmentValue;
      }
    }

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

    console.log(`📊 analyzePortfolio: Analyzing ${holdings.length} holdings, ${uniqueSecurityIds.size} unique securities, total value: $${portfolioValue.toFixed(2)}`);

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

