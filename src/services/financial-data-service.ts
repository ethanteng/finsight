import { PrismaClient } from '@prisma/client';
import { Configuration, PlaidApi, PlaidEnvironments, CountryCode } from 'plaid';
import { SnapTradeService } from '../snaptrade';
import { BalanceService } from './balance-service';
import {
  TokenValidationService,
  TokenStatus,
  type PlaidTokenHealth,
  type SnapTradeTokenHealth,
  plaidTokenHealthFromError,
} from './token-validation-service';
import { TransactionNormalizationService } from './transaction-normalization-service';
import { TransactionCategorizationService, CategorizationDetail, TransactionType } from './transaction-categorization-service';
import { persistTransactionsToDb, persistSnapTradeActivitiesToDb } from '../data/persistence';
import { cacheService } from '../data/cache';
import { resolveCanonicalTransactionType } from './canonical-transaction-adapter';
import { mergeFinancialSources } from './financial-calculations';
import { loadPersistedPlaidData } from './financial-source-persistence';
import { normalizeAssetType, resolveAssetTypeWithHeuristics } from './asset-class';
import {
  fetchAllPlaidTransactions,
  fetchAllPlaidInvestmentTransactions,
  isOptionalLiabilityCoverageError,
  normalizePlaidLiabilities,
  type PlaidLiabilityDetails,
} from './plaid-liabilities';
import { getProviderRequestTimeoutMs, withTransientProviderRetry } from './provider-request-policy';

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
    timeout: getProviderRequestTimeoutMs('PLAID_REQUEST_TIMEOUT_MS'),
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
    current: number | null;
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
  plaidAccountId?: string;
  plaidOriginalName?: string;
  persistentAccountId?: string | null;
  sourceConnectionId?: string;
  snapshotTimestamp?: string;
  lastSyncedAt?: string;
  liabilityDetails?: PlaidLiabilityDetails[];
  syncStatus?: unknown;
  /** Undefined when the provider's connection status could not be read. */
  connectionDisabled?: boolean;
  connectionStatusUnavailable?: boolean;
  connectionDisabledAt?: string;
  dataFreshnessMode?: string;
}

export interface Balance {
  current: number | null;
  available?: number;
  limit?: number;
  iso_currency_code: string;
}

export interface Holding {
  id: string;
  account_id: string;
  security_id: string;
  institution_value: number | null;
  institution_price: number | null;
  institution_price_as_of: string;
  cost_basis: number | null;
  quantity: number | null;
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
  reportingCurrency: string;
  totalValue: number;
  assetAllocation: Array<{
    type: string;
    value: number;
    percentage: number;
  }>;
  holdingCount: number;
  securityCount: number;
  currencyMismatchIds: string[];
  unavailableValueIds: string[];
}

export interface HomeData {
  address: string;
  propertyId: string | null;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
  lastUpdated: string | null;
  isManualOverride: boolean;
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
    dataSources: {
      plaid: string;
      snaptrade: string;
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
    /** Off by default; snapshot/analysis ingestion opts in while display-only investment views avoid an extra Plaid call. */
    includeLiabilities?: boolean;
    includeHomeValue?: boolean;
    skipCategorization?: boolean; // ✅ NEW: Skip categorization for UI-only requests (performance optimization)
    collectCategorizationDetails?: boolean; // ✅ NEW: Collect detailed categorization results for logging/debugging
    shouldPersistTransactions?: boolean; // ✅ NEW: Only persist transactions when called from GPT prompts, not display-only views
  }): Promise<UnifiedFinancialData> {
    const startTime = Date.now();
    const opts = {
      includeTransactions: options?.includeTransactions ?? true,
      includeInvestments: options?.includeInvestments ?? true,
      includeLiabilities: options?.includeLiabilities ?? false,
      includeHomeValue: options?.includeHomeValue ?? true
    };

    const cacheKeyParts = [
      'financial-data',
      userId,
      opts.includeTransactions ? 'tx' : 'no-tx',
      opts.includeInvestments ? 'inv' : 'no-inv',
      opts.includeLiabilities ? 'liabilities' : 'no-liabilities',
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
    const persistedPlaidSnapshot = await loadPersistedPlaidData(userId, opts);

    let plaidPromise: Promise<any>;
    if (persistedPlaidSnapshot?.isFresh) {
      usingPersistedPlaidData = true;
      plaidPromise = Promise.resolve(persistedPlaidSnapshot.data);
    } else {
      plaidPromise = this.fetchPlaidData(userId, opts);
    }

    // Fetch data from all sources in parallel
    const [plaidResult, snapTradeResult, manualAccountsResult, homeValueResult] = await Promise.allSettled([
      plaidPromise,
      this.fetchSnapTradeData(userId, opts),
      this.fetchManualAccounts(userId),
      opts.includeHomeValue ? this.fetchHomeValue(userId) : Promise.resolve(null),
    ]);

    // Process results
    let plaidData = plaidResult.status === 'fulfilled' ? plaidResult.value : null;
    const snapTradeData = snapTradeResult.status === 'fulfilled' ? snapTradeResult.value : null;
    const manualAccountsData = manualAccountsResult.status === 'fulfilled' ? manualAccountsResult.value : null;
    const homeValue = homeValueResult.status === 'fulfilled' ? homeValueResult.value : null;
    if ((!plaidData || !plaidData.accounts?.length) && persistedPlaidSnapshot?.data) {
      usingPersistedPlaidData = true;
      plaidData = persistedPlaidSnapshot.data;
      console.warn('FinancialDataService: Falling back to persisted Plaid data after live fetch failure or empty accounts (e.g. all tokens inactive)');
    }

    const tokens = this.tokenValidationService.getTokenHealthFromObservations(
      userId,
      plaidData,
      snapTradeData,
    );

    // Merge data
    const mergedData = mergeFinancialSources(plaidData, snapTradeData, manualAccountsData, homeValue);

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
        return resolveCanonicalTransactionType(tx) ?? 'adjustment';
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
                source_amount: (tx as any).source_amount ?? (tx as any).sourceAmount ?? tx.amount,
                cash_flow_amount: (tx as any).cash_flow_amount ?? (tx as any).cashFlowAmount,
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
              return (tx as any).source === 'snaptrade' || (txId && txId.startsWith('snaptrade-'));
            })
            .map(tx => ({
              ...tx,
              id: (tx as any).id || (tx as any).transaction_id,
              activityId: (tx as any).activityId
                || (tx as any).snapTradeData?.activity_id
                || ((tx as any).id || '').replace(/^snaptrade-/, '')
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

  private async fetchPlaidData(userId: string, options: any): Promise<any> {
    const startTime = Date.now();

    try {
      const accessTokens = await prisma.accessToken.findMany({
        where: { userId, isActive: true, supersededAt: null }
      });

      if (accessTokens.length === 0) {
        return {
          accounts: [],
          balances: {},
          holdings: [],
          securities: [],
          transactions: [],
          tokenHealth: [],
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
      const tokenHealth: PlaidTokenHealth[] = [];

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
          const accountsResponse = await withTransientProviderRetry(() => plaidClient.accountsGet({
            access_token: tokenRecord.token
          }));

          // Get institution data for these accounts
          const item = await withTransientProviderRetry(() => plaidClient.itemGet({ access_token: tokenRecord.token }));
          const itemData = item.data.item as Record<string, any>;
          const itemLastUpdated = itemData?.last_updated_datetime || requestTimestamp;

          // institution_id can be null for some Plaid items (e.g. OAuth institutions, certain
          // brokerage connections). Guard the lookup so a missing institution_id does not cause
          // institutionsGetById to throw and silently skip ALL accounts for this token.
          let institutionName: string | undefined;
          let institutionId: string | undefined;
          let institutionLogo: string | undefined;
          let institutionUrl: string | undefined;
          const rawInstitutionId = item.data.item.institution_id;
          if (rawInstitutionId) {
            try {
              const institutionResponse = await withTransientProviderRetry(() => plaidClient.institutionsGetById({
                institution_id: rawInstitutionId,
                country_codes: ['US' as CountryCode]
              }));
              const inst = institutionResponse.data.institution;
              institutionName = inst?.name ?? undefined;
              institutionId = inst?.institution_id ?? undefined;
              institutionLogo = inst?.logo ?? undefined;
              institutionUrl = inst?.url ?? undefined;
            } catch (instError: any) {
              console.warn(`⚠️ Plaid: Could not fetch institution data for institution_id=${rawInstitutionId}:`, instError?.response?.data?.error_code || instError?.message);
              // Continue without institution metadata — accounts are still valid
            }
          } else {
            console.warn(`⚠️ Plaid: institution_id is null for token ${tokenRecord.id.substring(0, 8)}... — accounts will be added without institution name`);
          }

          const tokenAccountsById = new Map<string, Account>();
          for (const account of accountsResponse.data.accounts) {
            // ✅ CRITICAL: Always set plaidAccountId from account.account_id for Plaid accounts
            // This ensures consistent account identity across the system
            const plaidAccountId = account.account_id;

            // Use custom name from database if available, otherwise use name from Plaid API
            const accountName = customNamesMap.get(plaidAccountId) || account.name;

            const normalizedAccount: Account = {
              account_id: plaidAccountId,
              id: plaidAccountId, // Alias for compatibility
              name: accountName, // ✅ Use custom name from database if available
              plaidOriginalName: account.name, // ✅ For deduplication: use original Plaid name (custom renames break name-based dedup)
              type: account.type,
              subtype: account.subtype || '',
              balance: {
                current: account.balances.current ?? null,
                available: account.balances.available ?? undefined,
                limit: account.balances.limit ?? undefined,
                iso_currency_code: account.balances.iso_currency_code || 'USD',
                unofficial_currency_code: account.balances.unofficial_currency_code ?? undefined
              },
              institution: institutionName,
              institution_id: institutionId,
              institution_logo: institutionLogo,
              institution_url: institutionUrl,
              source: 'plaid',
              sourceConnectionId: tokenRecord.id,
              plaidAccountId: plaidAccountId, // ✅ Always set for Plaid accounts
              // Pass through persistentAccountId only when it differs from plaidAccountId (matches persisted logic).
              // When Plaid returns persistent_account_id === account_id, omit the redundant value so both
              // fresh and persisted data use the same source-connection + provider-account identity.
              persistentAccountId:
                (account as any).persistent_account_id &&
                (account as any).persistent_account_id !== plaidAccountId
                  ? (account as any).persistent_account_id
                  : undefined,
              snapshotTimestamp: itemLastUpdated,
              lastSyncedAt: itemLastUpdated
            };
            accounts.push(normalizedAccount);
            tokenAccountsById.set(plaidAccountId, normalizedAccount);

            balances[account.account_id] = account.balances;
          }

          const hasInvestmentAccounts = accountsResponse.data.accounts.some(acc =>
            acc.type === 'investment' || (acc.subtype && INVESTMENT_SUBTYPES.includes(acc.subtype.toLowerCase()))
          );

          const asyncTasks: Promise<void>[] = [];

          const hasLiabilityAccounts = accountsResponse.data.accounts.some(account =>
            account.type === 'credit' || account.type === 'loan'
          );

          if (options.includeLiabilities && hasLiabilityAccounts) {
            asyncTasks.push((async () => {
              try {
                const liabilitiesResponse = await withTransientProviderRetry(() => plaidClient.liabilitiesGet({
                  access_token: tokenRecord.token,
                }));
                const liabilityDetails = normalizePlaidLiabilities(
                  liabilitiesResponse.data.liabilities,
                  requestTimestamp,
                );
                for (const [accountId, details] of liabilityDetails) {
                  const account = tokenAccountsById.get(accountId);
                  if (account) account.liabilityDetails = details;
                }
              } catch (liabilityError: any) {
                const errorCode = liabilityError?.response?.data?.error_code;
                const errorMessage = liabilityError?.response?.data?.error_message || liabilityError?.message;
                if (isOptionalLiabilityCoverageError(errorCode)) {
                  console.warn(`Plaid liability details unavailable for token ${tokenRecord.id}: ${errorCode}`);
                  return;
                }
                console.error(
                  `Error fetching Plaid liability details for token ${tokenRecord.id}: ${errorCode || 'UNKNOWN'} - ${errorMessage}`
                );
                errors.push({
                  tokenId: tokenRecord.id,
                  error: errorMessage,
                  timestamp: new Date(),
                });
              }
            })());
          }

          if (options.includeInvestments && hasInvestmentAccounts) {
            asyncTasks.push((async () => {
              try {
                const holdingsResponse = await withTransientProviderRetry(() => plaidClient.investmentsHoldingsGet({
                  access_token: tokenRecord.token
                }));

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
                    security_type: normalizeAssetType(security?.type || (holding as any).security_type),
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
                    
                    const investmentTransactions = await fetchAllPlaidInvestmentTransactions(plaidClient, {
                      access_token: tokenRecord.token,
                      start_date: startDate,
                      end_date: endDate
                    });
                    
                    for (const invTxn of investmentTransactions) {
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
              
                const mapTransaction = (tx: any) => ({
                    ...tx,
                    id: tx.transaction_id,
                    transaction_id: tx.transaction_id
                });

              const plaidTransactions = await fetchAllPlaidTransactions(plaidClient, {
                access_token: tokenRecord.token,
                start_date: startDate,
                end_date: endDate,
                options: {
                    include_personal_finance_category: true
                }
              });
              transactions.push(...plaidTransactions.map(mapTransaction));
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
          tokenHealth.push({
            tokenId: tokenRecord.id,
            status: TokenStatus.VALID,
            lastChecked: new Date(requestTimestamp),
          });
        } catch (error: any) {
          const errorCode = error?.response?.data?.error_code;
          console.error('Error fetching Plaid data for token:', errorCode);
          errors.push({
            tokenId: tokenRecord.id,
            error: error?.response?.data?.error_message || error.message,
            timestamp: new Date()
          });
          tokenHealth.push(plaidTokenHealthFromError(tokenRecord.id, error));
        }
      }

      const duration = Date.now() - startTime;
      return {
        accounts,
        balances,
        holdings,
        securities,
        transactions,
        tokenHealth,
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
        tokenHealth: [],
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
        } else if (manualAccount.type === 'mortgage') {
          // Mortgage: loan type with mortgage subtype for liabilities.mortgage in snapshot
          accountType = 'loan';
          accountSubtype = 'mortgage';
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
        const balance = (manualAccount.type === 'debt' || manualAccount.type === 'mortgage')
          ? Math.abs(manualAccount.amount) // Debt/mortgage should be positive for calculations
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
          tokenHealth: {
            userId,
            status: TokenStatus.ERROR,
            error: 'SnapTrade user not found',
            lastChecked: new Date(),
          } satisfies SnapTradeTokenHealth,
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
      let tokenHealth: SnapTradeTokenHealth = {
        userId,
        status: TokenStatus.ERROR,
        error: 'SnapTrade accounts were not observed',
        lastChecked: new Date(),
      };

      // ✅ Get accounts once and reuse them for holdings and activities
      let accountsData: any = null;
      
      try {
        const accountsResult = await snapTradeService.getUserAccounts(userId, snapTradeUser.userSecret);
        accountsData = accountsResult; // Store for later reuse
        
        if (accountsResult.success && accountsResult.data?.accounts) {
          tokenHealth = {
            userId,
            status: TokenStatus.VALID,
            lastChecked: new Date(),
          };
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

          if (accountsResult.data.connectionStatusError) {
            errors.push({
              error: `SnapTrade connection status unavailable: ${accountsResult.data.connectionStatusError}`,
              timestamp: new Date(),
            });
          }

          for (const account of accountsResult.data.accounts) {
            const balance = typeof account.balance === 'number' && Number.isFinite(account.balance)
              ? account.balance
              : typeof account.currentBalance === 'number' && Number.isFinite(account.currentBalance)
                ? account.currentBalance
                : null;
            // ✅ CRITICAL: SnapTrade accounts use account_id format: snaptrade-{id}
            // Do NOT set plaidAccountId for SnapTrade accounts (they don't have one)
            const accountId = account.id.startsWith('snaptrade-') ? account.id : `snaptrade-${account.id}`;
            
            // Use custom name from database if available, otherwise use name from SnapTrade API
            const accountName = customNamesMap.get(accountId) || account.name;
            
            accounts.push({
              account_id: accountId, // ✅ Primary unique identifier for SnapTrade accounts
              id: accountId, // Alias for compatibility
              name: accountName, // ✅ Use custom name from database if available
              type: account.type || 'investment',
              subtype: account.subtype || 'brokerage',
              balance: {
                current: balance,
                available: balance,
                iso_currency_code: account.balanceCurrency || 'USD'
              },
              institution: account.institution || 'Unknown', // ✅ Use actual institution name (e.g., "Public") instead of hardcoded "SnapTrade"
              source: 'snaptrade',
              persistentAccountId: accountId, // ✅ Set for SnapTrade accounts
              // ✅ Do NOT set plaidAccountId - SnapTrade accounts don't have one
              snapshotTimestamp: account.lastSuccessfulHoldingsSync || fetchedAt,
              lastSyncedAt: account.lastSuccessfulHoldingsSync
                || account.lastSuccessfulTransactionsSync
                || undefined,
              syncStatus: account.syncStatus,
              connectionDisabled: account.connectionDisabled,
              connectionStatusUnavailable: account.connectionStatusUnavailable,
              connectionDisabledAt: account.connectionDisabledAt || undefined,
              dataFreshnessMode: account.dataFreshnessMode,
            });

            if (account.connectionDisabled) {
              errors.push({
                accountId,
                error: 'SnapTrade connection is disabled; showing the last cached brokerage state.',
                timestamp: new Date(),
              });
            } else if (account.connectionStatusUnavailable) {
              errors.push({
                accountId,
                error: 'SnapTrade connection health could not be verified; this balance may come from a disabled connection.',
                timestamp: new Date(),
              });
            }
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
            tokenHealth = {
              userId,
              status: TokenStatus.LOGIN_REQUIRED,
              error: 'SnapTrade credentials invalid or expired. Please reconnect your SnapTrade account.',
              lastChecked: new Date(),
            };
          } else {
            errors.push({
              error: accountsResult.error || 'Failed to fetch SnapTrade accounts',
              timestamp: new Date()
            });
            tokenHealth = {
              userId,
              status: TokenStatus.ERROR,
              error: accountsResult.error || 'Failed to fetch SnapTrade accounts',
              lastChecked: new Date(),
            };
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
          tokenHealth = {
            userId,
            status: TokenStatus.LOGIN_REQUIRED,
            error: 'SnapTrade credentials invalid or expired. Please reconnect your SnapTrade account.',
            lastChecked: new Date(),
          };
        } else {
          console.error('Error fetching SnapTrade accounts:', accountError);
          errors.push({
            error: accountError.message || 'Failed to fetch SnapTrade accounts',
            timestamp: new Date()
          });
          tokenHealth = {
            userId,
            status: TokenStatus.ERROR,
            error: accountError.message || 'Failed to fetch SnapTrade accounts',
            lastChecked: new Date(),
          };
        }
      }

      // Get holdings if option is enabled
      if (options.includeInvestments) {
        try {
          const holdingsResult = await snapTradeService.getUserHoldings(
            userId,
            snapTradeUser.userSecret,
            accountsData,
          );
          
          if (holdingsResult.success && holdingsResult.data) {
            console.log(`📊 SnapTrade: Received ${holdingsResult.data.length} account holdings from API`);
            for (const holdingError of holdingsResult.errors || []) {
              errors.push({
                accountId: `snaptrade-${holdingError.accountId}`,
                error: `SnapTrade holdings incomplete: ${holdingError.error}`,
                timestamp: new Date(),
              });
            }
            // Build a map of account balances: non-cash-equivalent positions + cash balance.
            // Using the same logic as snaptrade.ts to avoid double-counting cash_equivalent
            // positions (money-market funds reported as both a position and in balance.cash).
            const accountBalanceMap = new Map<string, number>();

            let totalPositionsProcessed = 0;
            for (const accountHolding of holdingsResult.data) {
              const accountId = `snaptrade-${accountHolding.account?.id}`;
              const holdingsAsOf = accountHolding.account?.lastSuccessfulHoldingsSync
                || accountHolding.account?.sync_status?.holdings?.last_successful_sync
                || new Date().toISOString();
              const holdingPositions: any[] = Array.isArray(accountHolding.positions) ? accountHolding.positions : [];
              const holdingBalances: any[] = Array.isArray(accountHolding.balances) ? accountHolding.balances : [];
              const nonCashEquivSum = holdingPositions
                .filter((p: any) => !p.cash_equivalent)
                .reduce((sum: number, p: any) => sum + (p.price || 0) * (p.units || 0), 0);
              const cashBalanceSum = holdingBalances.reduce((sum: number, b: any) => sum + (b.cash || 0), 0);
              const trueAccountValue = nonCashEquivSum + cashBalanceSum
                || accountHolding.total_value?.value  // fallback if no positions/balances
                || 0;
              // Record the computed value whenever the provider actually returned
              // holdings data, zero included. Skipping zero leaves an empty account
              // with a null balance, which marks the whole canonical snapshot
              // partial rather than reporting the account as empty.
              const hasHoldingValueInputs = holdingPositions.length > 0
                || holdingBalances.length > 0
                || typeof accountHolding.total_value?.value === 'number';
              if (hasHoldingValueInputs) {
                accountBalanceMap.set(accountId, trueAccountValue);
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
                  
                  // SnapTrade descriptions like "Common Stock" or "Growth ETF" need
                  // substring heuristics when there is no alias; alias hits (e.g.
                  // "Money Market Fund" -> Cash) must run first.
                  securityType = resolveAssetTypeWithHeuristics(securityType);

                  const positionPrice = typeof position.price === 'number' && Number.isFinite(position.price)
                    ? position.price
                    : null;
                  const positionUnits = typeof position.units === 'number' && Number.isFinite(position.units)
                    ? position.units
                    : null;
                  const averagePurchasePrice = typeof position.average_purchase_price === 'number' && Number.isFinite(position.average_purchase_price)
                    ? position.average_purchase_price
                    : null;
                  const holding = {
                    id: `snaptrade-${accountHolding.account?.id}-${position.symbol?.id || position.symbol?.symbol?.symbol}`,
                    account_id: `snaptrade-${accountHolding.account?.id}`,
                    security_id: position.symbol?.id || position.symbol?.symbol?.symbol || 'unknown',
                    institution_value: positionPrice !== null && positionUnits !== null
                      ? positionPrice * positionUnits
                      : null,
                    institution_price: positionPrice,
                    institution_price_as_of: holdingsAsOf,
                    cost_basis: averagePurchasePrice !== null && positionUnits !== null
                      ? averagePurchasePrice * positionUnits
                      : null,
                    quantity: positionUnits,
                    iso_currency_code: position.currency?.code || 'USD',
                    security_name: position.symbol?.symbol?.description || position.symbol?.description || 'Unknown',
                    security_type: securityType,
                    ticker_symbol: position.symbol?.symbol?.symbol || position.symbol?.symbol,
                    snapTradeData: {
                      open_pnl: position.open_pnl,
                      average_purchase_price: position.average_purchase_price,
                      account_name: accountHolding.account?.name,
                      account_number: accountHolding.account?.number,
                      holdings_last_successful_sync: holdingsAsOf,
                      connection_disabled: accountHolding.account?.connectionDisabled,
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

              // Process cash balances — only add genuinely uninvested cash as a holding.
              // SnapTrade's Position type has a `cash_equivalent` field that is true for
              // positions such as money-market funds that are ALSO counted in balance.cash
              // (see SnapTrade SDK: "If the position is a cash equivalent (usually a money
              // market fund) that is also counted in account cash balance and buying power").
              // Subtracting those position values from balance.cash gives the true uninvested
              // cash so we avoid double-counting them.
              if (accountHolding.balances && Array.isArray(accountHolding.balances)) {
                const cashBalance = accountHolding.balances.find((b: any) => b.currency?.code === 'USD' && b.cash > 0);
                if (cashBalance) {
                  // Sum the market value of positions already counted in balance.cash
                  const cashEquivalentInPositions = (accountHolding.positions || [])
                    .filter((p: any) => p.cash_equivalent === true)
                    .reduce((sum: number, p: any) => sum + (p.price || 0) * (p.units || 0), 0);

                  // True uninvested cash = reported cash minus what's already in positions
                  const uninvestedCash = Math.max(0, cashBalance.cash - cashEquivalentInPositions);

                  if (uninvestedCash > 1) {  // > $1 threshold to avoid floating-point noise
                    const cashHolding = {
                      id: `snaptrade-${accountHolding.account?.id}-cash`,
                      account_id: `snaptrade-${accountHolding.account?.id}`,
                      security_id: 'cash',
                      institution_value: uninvestedCash,
                      institution_price: 1,
                      institution_price_as_of: holdingsAsOf,
                      cost_basis: uninvestedCash,
                      quantity: uninvestedCash,
                      iso_currency_code: 'USD',
                      security_name: 'Cash',
                      security_type: 'Cash',
                      ticker_symbol: 'CASH',
                      snapTradeData: {
                        account_name: accountHolding.account?.name,
                        account_number: accountHolding.account?.number,
                        holdings_last_successful_sync: holdingsAsOf,
                        connection_disabled: accountHolding.account?.connectionDisabled,
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
                        close_price_as_of: holdingsAsOf
                      });
                    }
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
            for (const activityError of activitiesResult.data.errors || []) {
              const rawErrorAccountId = String(activityError.accountId || 'unknown');
              errors.push({
                accountId: rawErrorAccountId.startsWith('snaptrade-')
                  ? rawErrorAccountId
                  : `snaptrade-${rawErrorAccountId}`,
                error: `SnapTrade activities incomplete: ${activityError.error}`,
                timestamp: new Date(),
              });
            }
            for (const activity of activitiesResult.data.activities) {
              // ✅ SnapTrade getAccountActivities API response structure
              // Documentation: https://docs.snaptrade.com/reference/account-information_getaccountactivities
              
              // Get security information from symbol object
              const symbol = activity.symbol;
              const nestedSymbol = symbol?.symbol && typeof symbol.symbol === 'object'
                ? symbol.symbol
                : symbol;
              const tickerSymbol = typeof symbol?.symbol === 'string'
                ? symbol.symbol
                : nestedSymbol?.symbol || nestedSymbol?.raw_symbol;
              const securityId = typeof symbol?.id === 'string'
                ? symbol.id
                : tickerSymbol || 'unknown';
              const securityName = nestedSymbol?.description
                || nestedSymbol?.raw_symbol
                || tickerSymbol
                || 'Unknown';
              
              // Get transaction type (BUY, SELL, DIVIDEND, CONTRIBUTION, WITHDRAWAL, REI, INTEREST, FEE, etc.)
              const transactionType = activity.type || 'unknown';
              
              // Get quantity (units field)
              const quantity = activity.units || 0;
              
              // Get price per unit
              const price = activity.price || 0;
              
              const providerAmount = typeof activity.amount === 'number' && Number.isFinite(activity.amount)
                ? activity.amount
                : undefined;
              
              // Get date (prefer trade_date, fallback to settlement_date)
              const date = activity.trade_date || activity.settlement_date || new Date().toISOString();
              
              // SnapTrade signs amount by its effect on account cash (for example,
              // buys are negative and sells are positive). Preserve that provider
              // value. Only infer cash direction when the provider omitted amount.
              let normalizedAmount = providerAmount ?? (price * quantity);
              if (providerAmount === undefined) {
                const normalizedType = String(transactionType).toUpperCase();
                if (['SPLIT', 'STOCK_DIVIDEND', 'TRANSFER'].includes(normalizedType)) {
                  // These can move units without moving account cash. A market
                  // value is not a defensible substitute for a missing amount.
                  normalizedAmount = 0;
                } else if (['BUY', 'REI', 'WITHDRAWAL', 'FEE', 'TAX'].includes(normalizedType)) {
                  // REI reinvests a distribution into units, so cash leaves the
                  // account exactly as it does for a buy. It is never an inflow.
                  normalizedAmount = -Math.abs(normalizedAmount);
                // STOCK_DIVIDEND is deliberately absent here: it pays in shares,
                // so forcing a positive amount would assert cash the user never
                // received. It is handled as a non-cash adjustment above.
                } else if (['SELL', 'CONTRIBUTION', 'DIVIDEND', 'INTEREST'].includes(normalizedType)) {
                  normalizedAmount = Math.abs(normalizedAmount);
                }
              }
              
              // Build transaction name
              let transactionName = activity.description || `${transactionType} ${securityName}`;
              if (activity.option_type) {
                transactionName = `${activity.option_type} ${securityName}`;
              }
              
              // Convert SnapTrade activity to standard transaction format
              const rawAccountId = String(activity.account_id || 'unknown');
              const providerActivityId = activity.id === undefined || activity.id === null || activity.id === ''
                ? null
                : String(activity.id);
              // SnapTradeActivity.activityId is globally unique, so a synthesized id
              // must be scoped to the account. An unscoped date/security/type/quantity
              // key lets two users' identical trades collide on a single row.
              const rawActivityId = providerActivityId
                ?? `${rawAccountId}-${date}-${securityId}-${transactionType}-${quantity}`;
              const transactionId = rawActivityId.startsWith('snaptrade-')
                ? rawActivityId
                : `snaptrade-${rawActivityId}`;
              // Key used before the id was scoped, reproduced exactly as it was
              // persisted: no `snaptrade-` prefix (that only ever went on `id`),
              // and including the type and quantity. Carried so persistence can
              // migrate an existing row instead of writing a duplicate alongside
              // it — a key that does not match byte for byte migrates nothing.
              const legacyActivityId = providerActivityId
                ? undefined
                : `${date}-${securityId}-${transactionType}-${quantity}`;
              transactions.push({
                id: transactionId,
                transaction_id: transactionId,
                activityId: rawActivityId,
                ...(legacyActivityId && { legacyActivityId }),
                account_id: rawAccountId.startsWith('snaptrade-')
                  ? rawAccountId
                  : `snaptrade-${rawAccountId}`,
                security_id: securityId,
                ticker_symbol: tickerSymbol,
                security_name: securityName,
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
                source: 'snaptrade',
                snapTradeData: {
                  activity_id: rawActivityId,
                  type: transactionType,
                  option_type: activity.option_type,
                  description: activity.description,
                  trade_date: activity.trade_date,
                  settlement_date: activity.settlement_date,
                  fx_rate: activity.fx_rate,
                  institution: activity.institution,
                  external_reference_id: activity.external_reference_id,
                  account_name: activity.account_name,
                  transactions_last_successful_sync: activity.transactions_last_successful_sync,
                  connection_disabled: activity.connection_disabled,
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
        tokenHealth,
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
        tokenHealth: {
          userId,
          status: TokenStatus.ERROR,
          error: error.message || 'Failed to fetch SnapTrade data',
          lastChecked: new Date(),
        } satisfies SnapTradeTokenHealth,
        errors: [{ error: error.message, timestamp: new Date() }],
        performance: { duration: Date.now() - startTime }
      };
    }
  }

  /**
   * Fetch home value
   * Uses ProfileManager.getOriginalProfile() to support encrypted profiles - critical for
   * users with manual override (HOME_VALUE_MANUAL) stored in encrypted profile data.
   */
  private async fetchHomeValue(userId: string): Promise<HomeData | null> {
    try {
      let profileData: string;
      let profileManager: import('../profile/manager').ProfileManager | null = null;

      // Use ProfileManager to get decrypted profile (handles encrypted_profile_data)
      // Direct prisma.userProfile.profileText fails when profile is encrypted - profileText is empty
      try {
        const { ProfileManager } = await import('../profile/manager');
        profileManager = new ProfileManager();
        profileData = await profileManager.getOriginalProfile(userId);
      } catch (profileError) {
        console.warn('fetchHomeValue: ProfileManager unavailable, falling back to profileText:', profileError);
        const userProfile = await prisma.userProfile.findUnique({
          where: { userId },
          select: { profileText: true }
        });
        profileData = userProfile?.profileText || '';
      }

      if (!profileData?.trim()) {
        return null;
      }

      const managerHome = profileManager && typeof profileManager.extractHomeData === 'function'
        ? profileManager.extractHomeData(profileData)
        : null;
      const parsed = managerHome
        ? {
            address: managerHome.address,
            propertyId: managerHome.propertyId,
            value: managerHome.value,
            valueLow: managerHome.valueLow,
            valueHigh: managerHome.valueHigh,
            lastUpdated: managerHome.lastUpdated,
            isManualOverride: managerHome.isManualOverride,
          }
        : this.parseHomeDataFromProfileText(profileData);
      if (!parsed?.address) {
        return null;
      }

      if (parsed.value !== null) {
        console.log(`🏠 Home value extracted - valueMid: $${parsed.value.toLocaleString()}, isManual: ${parsed.isManualOverride}`);
      } else {
        console.warn(`⚠️ Home value is unavailable despite having address: ${parsed.address}`);
      }

      return {
        address: parsed.address,
        propertyId: parsed.propertyId,
        valueLow: parsed.valueLow,
        valueMid: parsed.value,
        valueHigh: parsed.valueHigh,
        lastUpdated: parsed.lastUpdated?.toISOString() ?? null,
        isManualOverride: parsed.isManualOverride,
      };
    } catch (error: any) {
      console.error('Error fetching home value:', error);
      return null;
    }
  }

  /** Parse HOME_ADDRESS, HOME_VALUE_MANUAL, HOME_VALUE, etc. from profile text.
   * Uses LAST occurrence for each field when duplicates exist (latest RentCast, latest manual override). */
  private parseHomeDataFromProfileText(profileData: string): { address: string | null; propertyId: string | null; value: number | null; valueLow: number | null; valueHigh: number | null; lastUpdated: Date | null; isManualOverride: boolean } | null {
    const addressMatches = [...profileData.matchAll(/HOME_ADDRESS:\s*(.+?)(?:\n|$)/g)];
    if (addressMatches.length === 0) return null;
    const address = addressMatches[addressMatches.length - 1][1].trim();
    const propertyIdMatches = [...profileData.matchAll(/HOME_RENTCAST_PROPERTY_ID:\s*(.+?)(?:\n|$)/g)];
    const propertyId = propertyIdMatches.length > 0
      ? propertyIdMatches[propertyIdMatches.length - 1][1].trim()
      : null;

    const manualMatches = [...profileData.matchAll(/HOME_VALUE_MANUAL:\s*([\d,]+(?:\.\d+)?)/g)];
    const manualMatch = manualMatches.length > 0 ? manualMatches[manualMatches.length - 1] : null;
    let value: number | null = manualMatch ? parseFloat(manualMatch[1].replace(/,/g, '')) : null;
    if (value == null) {
      const rentCastMatches = [...profileData.matchAll(/HOME_VALUE:\s*([\d,]+(?:\.\d+)?)/g)];
      const rentCastMatch = rentCastMatches.length > 0 ? rentCastMatches[rentCastMatches.length - 1] : null;
      value = rentCastMatch ? parseFloat(rentCastMatch[1].replace(/,/g, '')) : null;
    }
    const valueLowMatches = [...profileData.matchAll(/HOME_VALUE_LOW:\s*([\d,]+(?:\.\d+)?)/g)];
    const valueHighMatches = [...profileData.matchAll(/HOME_VALUE_HIGH:\s*([\d,]+(?:\.\d+)?)/g)];
    const lastMatches = [...profileData.matchAll(/HOME_VALUE_LAST_UPDATED:\s*(.+?)(?:\n|$)/g)];
    let lastUpdated: Date | null = null;
    if (lastMatches.length > 0) {
      const d = new Date(lastMatches[lastMatches.length - 1][1].trim());
      if (!isNaN(d.getTime())) lastUpdated = d;
    }
    return {
      address,
      propertyId,
      value: value && value > 0 ? value : null,
      valueLow: valueLowMatches.length > 0 ? parseFloat(valueLowMatches[valueLowMatches.length - 1][1].replace(/,/g, '')) : null,
      valueHigh: valueHighMatches.length > 0 ? parseFloat(valueHighMatches[valueHighMatches.length - 1][1].replace(/,/g, '')) : null,
      lastUpdated,
      isManualOverride: !!manualMatch
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
