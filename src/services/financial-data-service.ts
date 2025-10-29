import { PrismaClient } from '@prisma/client';
import { Configuration, PlaidApi, PlaidEnvironments, CountryCode } from 'plaid';
import { SnapTradeService } from '../snaptrade';
import { BalanceService } from './balance-service';
import { TokenValidationService, TokenStatus, PlaidTokenHealth, SnapTradeTokenHealth } from './token-validation-service';
import { TransactionNormalizationService } from './transaction-normalization-service';

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

  constructor() {
    this.balanceService = new BalanceService();
    this.tokenValidationService = new TokenValidationService();
    this.transactionNormalizationService = new TransactionNormalizationService();
  }

  /**
   * Get all financial data for a user from all sources
   */
  async getUserFinancialData(userId: string, options?: {
    includeTransactions?: boolean;
    includeInvestments?: boolean;
    includeHomeValue?: boolean;
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

    // Normalize transactions
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

                // Process holdings
                for (const holding of holdingsResponse.data.holdings) {
                  holdings.push({
                    id: `${holding.account_id}_${holding.security_id}_${holding.quantity}_${holding.institution_value}`,
                    account_id: holding.account_id,
                    security_id: holding.security_id,
                    institution_value: holding.institution_value,
                    institution_price: holding.institution_price,
                    institution_price_as_of: holding.institution_price_as_of,
                    cost_basis: holding.cost_basis,
                    quantity: holding.quantity,
                    iso_currency_code: holding.iso_currency_code
                  });
                }

                // Process securities
                for (const security of holdingsResponse.data.securities) {
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
              const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

              const transactionsResponse = await plaidClient.transactionsGet({
                access_token: tokenRecord.token,
                start_date: startDate,
                end_date: endDate
              });

              transactions.push(...transactionsResponse.data.transactions);
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

      // Get accounts
      try {
        const accountsResult = await snapTradeService.getUserAccounts(userId, snapTradeUser.userSecret);
        
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
            for (const accountHolding of holdingsResult.data) {
              // Process positions
              if (accountHolding.positions && Array.isArray(accountHolding.positions)) {
                for (const position of accountHolding.positions) {
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
                    security_type: position.symbol?.type?.description || 'Unknown',
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

      const duration = Date.now() - startTime;
      console.log('FinancialDataService: SnapTrade fetch complete', {
        duration,
        accountCount: accounts.length,
        holdingCount: holdings.length,
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
    // Merge accounts
    const accounts = [
      ...(plaidData?.accounts || []),
      ...(snapTradeData?.accounts || [])
    ];

    // Merge balances
    const balances = {
      ...(plaidData?.balances || {}),
      // SnapTrade balances are already in account objects
    };

    // Merge holdings and securities
    const holdings = [
      ...(plaidData?.holdings || []),
      ...(snapTradeData?.holdings || [])
    ];

    const securities = [
      ...(plaidData?.securities || []),
      ...(snapTradeData?.securities || [])
    ];

    // Calculate portfolio analysis
    const portfolio = this.analyzePortfolio(holdings, securities);

    // Merge transactions (investment transactions separate from banking)
    const investmentTransactions: Transaction[] = [];
    const bankingTransactions: Transaction[] = plaidData?.transactions || [];

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

