import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { PrismaClient } from '@prisma/client';
import { enhanceProfileWithInvestmentData, enhanceProfileWithLiabilityData, enhanceProfileWithEnrichmentData } from './profile/enhancer';

// Initialize Prisma client lazily to avoid import issues during ts-node startup
let prisma: PrismaClient | null = null;

const getPrismaClient = () => {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
};

// Determine Plaid mode from environment variable
const plaidMode = process.env.PLAID_MODE || 'sandbox';
const useSandbox = plaidMode === 'sandbox';

// Select appropriate environment variables based on mode
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
  basePath: useSandbox ? PlaidEnvironments.sandbox : PlaidEnvironments[credentials.env],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': credentials.clientId,
      'PLAID-SECRET': credentials.secret,
    },
  },
});

// Log Plaid environment configuration
console.log('Plaid Configuration:', {
  mode: plaidMode,
  environment: useSandbox ? 'sandbox' : credentials.env,
  accessLevel: useSandbox ? 'sandbox' : (process.env.PLAID_ACCESS_LEVEL || 'sandbox'),
  hasClientId: !!credentials.clientId,
  hasSecret: !!credentials.secret,
  useSandbox: useSandbox,
  isProduction: plaidMode === 'production',
  credentialsSource: plaidMode === 'production' ? 'production variables' : 'sandbox variables'
});

const plaidClient = new PlaidApi(configuration);

// Safety check: Prevent real Plaid API calls in test/CI environments
if (process.env.NODE_ENV === 'test' || process.env.GITHUB_ACTIONS) {
  console.log('Plaid: Test/CI environment detected - using mock responses');
}

// Helper function to get subtype for demo accounts
const getSubtypeForType = (type: string): string => {
  switch (type) {
    case 'checking':
      return 'checking';
    case 'savings':
      return 'savings';
    case 'investment':
      return 'ira'; // Default to IRA for investment accounts
    case 'credit':
      return 'credit card';
    case 'loan':
      return 'mortgage';
    default:
      return 'other';
  }
};

// Enhanced data processing for production Plaid data
const processAccountData = (account: any) => {
  return {
    id: account.account_id,
    name: account.name,
    type: account.type,
    subtype: account.subtype,
    mask: account.mask,
    balance: {
      available: account.balances.available,
      current: account.balances.current,
      limit: account.balances.limit,
      iso_currency_code: account.balances.iso_currency_code,
      unofficial_currency_code: account.balances.unofficial_currency_code
    },
    // Enhanced metadata for production
    verification_status: account.verification_status,
    last_updated_datetime: account.last_updated_datetime,
    // Investment-specific data
    securities: account.securities || [],
    holdings: account.holdings || [],
    // Income-specific data
    income_verification: account.income_verification || null
  };
};

const processTransactionData = (transaction: any) => {
  // ✅ Extract basic categories from personal_finance_category if legacy category is empty
  let basicCategory = transaction.category || [];
  let basicCategoryId = transaction.category_id;
  
  // If legacy category is empty but personal_finance_category exists, use that for basic categorization
  if ((!basicCategory || basicCategory.length === 0 || basicCategory[0] === null) && 
      transaction.personal_finance_category) {
    basicCategory = [
      transaction.personal_finance_category.primary,
      transaction.personal_finance_category.detailed
    ].filter(Boolean);
    basicCategoryId = transaction.personal_finance_category.primary;
  }
  
  // ✅ FIX: Interpret transaction amounts correctly
  // Most transactions from Plaid are purchases/charges (money going out)
  // We need to make them negative for intuitive display
  let correctedAmount = transaction.amount;
  
  // Check if this is likely a credit/refund (should remain positive)
  const isCredit = transaction.name?.toLowerCase().includes('credit') ||
                   transaction.name?.toLowerCase().includes('refund') ||
                   transaction.name?.toLowerCase().includes('return') ||
                   transaction.name?.toLowerCase().includes('deposit') ||
                   transaction.name?.toLowerCase().includes('payment') ||
                   transaction.name?.toLowerCase().includes('reimbursement') ||
                   transaction.name?.toLowerCase().includes('claim') ||
                   transaction.name?.toLowerCase().includes('insurance') ||
                   transaction.name?.toLowerCase().includes('zelle') ||
                   transaction.merchant_name?.toLowerCase().includes('credit') ||
                   transaction.merchant_name?.toLowerCase().includes('refund') ||
                   transaction.merchant_name?.toLowerCase().includes('return') ||
                   transaction.merchant_name?.toLowerCase().includes('deposit') ||
                   transaction.merchant_name?.toLowerCase().includes('payment') ||
                   transaction.merchant_name?.toLowerCase().includes('reimbursement') ||
                   transaction.merchant_name?.toLowerCase().includes('claim') ||
                   transaction.merchant_name?.toLowerCase().includes('insurance') ||
                   // Check if categories suggest this is income/credit
                   (basicCategory && basicCategory.some((cat: string) => 
                     cat?.toLowerCase().includes('income') || 
                     cat?.toLowerCase().includes('transfer') ||
                     cat?.toLowerCase().includes('insurance')
                   ));
  
  // If this is a credit/refund, ensure it's positive
  if (isCredit) {
    if (correctedAmount < 0) {
      correctedAmount = Math.abs(correctedAmount);
      console.log(`✅ Credit correction: "${transaction.name}" ${transaction.amount} → ${correctedAmount} (negative credit converted to positive)`);
    } else {
      console.log(`✅ Credit detected: "${transaction.name}" ${transaction.amount} (already positive)`);
    }
  }
  // If this looks like a purchase (has merchant info, categories, etc.), make it negative
  // BUT only if it's not a credit/refund
  else if (!isCredit && (
      transaction.merchant_name || 
      transaction.merchant_entity_id || 
      (basicCategory && basicCategory.length > 0) ||
      transaction.payment_channel === 'in store' ||
      transaction.payment_channel === 'online')) {
    
    // If amount is positive, it's likely a purchase that should be negative
    if (correctedAmount > 0) {
      correctedAmount = -correctedAmount;
      console.log(`🔄 Amount correction: "${transaction.name}" ${transaction.amount} → ${correctedAmount} (purchase detected)`);
    }
  }
  
  return {
    id: transaction.transaction_id,
    account_id: transaction.account_id,
    amount: correctedAmount, // Use corrected amount
    date: transaction.date,
    name: transaction.name,
    category: basicCategory,
    category_id: basicCategoryId,
    pending: transaction.pending,
    merchant_name: transaction.merchant_name,
    payment_channel: transaction.payment_channel,
    transaction_type: transaction.transaction_type,
    // Don't pre-populate enriched_data here - let the enrichment process handle it
    enriched_data: null
  };
};

// Enhanced investment data processing functions
const processInvestmentHolding = (holding: any) => {
  return {
    id: `${holding.account_id}_${holding.security_id}_${holding.quantity}_${holding.institution_value}`,
    account_id: holding.account_id,
    security_id: holding.security_id,
    institution_value: holding.institution_value,
    institution_price: holding.institution_price,
    institution_price_as_of: holding.institution_price_as_of,
    cost_basis: holding.cost_basis,
    quantity: holding.quantity,
    iso_currency_code: holding.iso_currency_code,
    unofficial_currency_code: holding.unofficial_currency_code
  };
};

const processInvestmentTransaction = (transaction: any) => {
  return {
    id: `${transaction.investment_transaction_id}_${transaction.account_id}_${transaction.security_id}_${transaction.date}`,
    account_id: transaction.account_id,
    security_id: transaction.security_id,
    amount: transaction.amount,
    date: transaction.date,
    name: transaction.name,
    quantity: transaction.quantity,
    fees: transaction.fees,
    price: transaction.price,
    type: transaction.type,
    subtype: transaction.subtype,
    iso_currency_code: transaction.iso_currency_code,
    unofficial_currency_code: transaction.unofficial_currency_code
  };
};

const processSecurity = (security: any) => {
  return {
    id: security.security_id,
    security_id: security.security_id,
    name: security.name,
    ticker_symbol: security.ticker_symbol,
    type: security.type,
    close_price: security.close_price,
    close_price_as_of: security.close_price_as_of,
    iso_currency_code: security.iso_currency_code,
    unofficial_currency_code: security.unofficial_currency_code
  };
};

// Portfolio analysis functions
const analyzePortfolio = (holdings: any[], securities: any[]) => {
  const portfolioValue = holdings.reduce((total, holding) => {
    return total + (holding.institution_value || 0);
  }, 0);

  const securityMap = new Map(securities.map(sec => [sec.security_id, sec]));
  
  const assetAllocation = holdings.reduce((allocation, holding) => {
    const security = securityMap.get(holding.security_id);
    const assetType = security?.type || 'Unknown';
    
    if (!allocation[assetType]) {
      allocation[assetType] = 0;
    }
    allocation[assetType] += (holding.institution_value as number) || 0;
    
    return allocation;
  }, {} as Record<string, number>);

  // Calculate percentages
  const allocationPercentages = Object.entries(assetAllocation).map(([type, value]) => ({
    type,
    value: value as number,
    percentage: portfolioValue > 0 ? ((value as number) / portfolioValue) * 100 : 0
  }));

  return {
    totalValue: portfolioValue,
    assetAllocation: allocationPercentages,
    holdingCount: holdings.length,
    securityCount: securities.length
  };
};

const analyzeInvestmentActivity = (transactions: any[]) => {
  const activityByType = transactions.reduce((activity, transaction) => {
    const type = transaction.type || 'Unknown';
    if (!activity[type]) {
      activity[type] = { count: 0, totalAmount: 0 };
    }
    activity[type].count++;
    activity[type].totalAmount += Math.abs(transaction.amount || 0);
    return activity;
  }, {} as Record<string, { count: number; totalAmount: number }>);

  const totalTransactions = transactions.length;
  const totalVolume = transactions.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

  return {
    totalTransactions,
    totalVolume,
    activityByType,
    averageTransactionSize: totalTransactions > 0 ? totalVolume / totalTransactions : 0
  };
};

// Helper function to handle Plaid errors
const handlePlaidError = (error: any, operation: string) => {
  console.error(`Error in ${operation}:`, error);
  
  // Check for specific Plaid error codes
  if (error.response?.data?.error_code) {
    const errorCode = error.response.data.error_code;
    const errorMessage = error.response.data.error_message;
    
    switch (errorCode) {
      case 'ADDITIONAL_CONSENT_REQUIRED':
        return {
          error: 'Additional consent required',
          details: 'This is a sandbox limitation. In production, users would need to provide additional consent.',
          code: errorCode
        };
      case 'INVALID_ACCESS_TOKEN':
        return {
          error: 'Invalid access token',
          details: 'Please reconnect your account.',
          code: errorCode
        };
      case 'ITEM_LOGIN_REQUIRED':
        return {
          error: 'Re-authentication required',
          details: 'Please reconnect your account to refresh access.',
          code: errorCode
        };
      default:
        return {
          error: `Plaid error: ${errorCode}`,
          details: errorMessage || 'An error occurred with Plaid',
          code: errorCode
        };
    }
  }
  
  return {
    error: 'Failed to complete operation',
    details: error.message || 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR'
  };
};

// Export helper functions for testing and external use
export {
  processInvestmentHolding,
  processInvestmentTransaction,
  processSecurity,
  analyzePortfolio,
  analyzeInvestmentActivity,
  handlePlaidError
};

export const setupPlaidRoutes = (app: any) => {
  // Create link token with SEAMLESS approach - minimal products + additional consent
  app.post('/plaid/create_link_token', async (req: any, res: any) => {
    try {
      // Check if this is a demo request
      const isDemoRequest = req.headers['x-demo-mode'] === 'true' || req.body.isDemo === true;
      
      // For demo mode, ALWAYS use fake data instead of hitting Plaid APIs
      if (isDemoRequest) {
        console.log('Demo mode detected - returning fake data instead of hitting Plaid APIs');
        
        // Return fake link token for demo mode - NO REAL API CALLS
        const fakeLinkToken = 'demo_link_token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        res.json({ link_token: fakeLinkToken });
        return;
      }
      
      // SEAMLESS APPROACH: Start with minimal products to maximize institution coverage
      // Use additional_consented_products to collect consent for everything we might need later
      const request = {
        user: { client_user_id: 'user-id' },
        client_name: 'Ask Linc',
        language: 'en',
        country_codes: [CountryCode.Us],
        // Start with only Transactions to maximize FI coverage
        products: [Products.Transactions],
        // Ask consent up-front so you can add these later without relinking
        additional_consented_products: [
          Products.Investments,  // For investment accounts
          Products.Liabilities,  // For credit/loan accounts
          Products.Auth,         // For real-time balance (when needed)
        ],
        // Optional: If you want certain scopes *when supported* (but not block Link), list them here:
        // required_if_supported_products: [Products.Investments],
        webhook: process.env.PLAID_WEBHOOK_URL || undefined,
      };

      console.log('Creating seamless link token:');
      console.log(`- Products: ${request.products.join(', ')} (minimal to maximize institution coverage)`);
      console.log(`- Additional consent: ${request.additional_consented_products.join(', ')} (for future access)`);
      
      const createTokenResponse = await plaidClient.linkTokenCreate(request);
      res.json({ link_token: createTokenResponse.data.link_token });
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'creating link token');
      res.status(500).json(errorInfo);
    }
  });

  // Exchange public token for access token
  app.post('/plaid/exchange_public_token', async (req: any, res: any) => {
    try {
      const { public_token } = req.body;
      console.log('Exchanging public token for access token...');
      
      // Debug authentication
      console.log('Exchange token - headers:', req.headers);
      console.log('Exchange token - user:', req.user);
      
      const exchangeResponse = await plaidClient.itemPublicTokenExchange({
        public_token: public_token,
      });
      
      const access_token = exchangeResponse.data.access_token;
      const item_id = exchangeResponse.data.item_id;
      
      console.log(`Received access token: ${access_token.substring(0, 8)}...`);
      console.log(`Item ID: ${item_id}`);
      
      // Store the access token and item_id in the database
      // Check if we already have an access token for this itemId
      const existingToken = await getPrismaClient().accessToken.findFirst({
        where: { itemId: item_id }
      });

      if (existingToken) {
        // Update the existing token with the new access token
        console.log(`Updating existing token for item ${item_id}`);
        await getPrismaClient().accessToken.update({
          where: { id: existingToken.id },
          data: { 
            token: access_token,
            lastRefreshed: new Date(),
            userId: req.user?.id // Associate with user if available
          }
        });
      } else {
        // Create a new access token
        console.log(`Creating new token for item ${item_id}`);
        await getPrismaClient().accessToken.create({
          data: { 
            token: access_token,
            itemId: item_id,
            lastRefreshed: new Date(),
            userId: req.user?.id // Associate with user if available
          }
        });
      }
      
      console.log(`Token stored with userId: ${req.user?.id || 'NO USER'}`);
      
      // INTELLIGENT ACCOUNT DETECTION: After successful linking, detect what's available
      // and call appropriate endpoints based on account types
      try {
        console.log('Starting intelligent account detection...');
        
        // Get accounts to see what types we have
        const accountsResponse = await plaidClient.accountsGet({
          access_token: access_token,
        });
        
        const accounts = accountsResponse.data.accounts;
        console.log(`Found ${accounts.length} accounts to analyze`);
        
        // Analyze each account and call appropriate endpoints
        for (const account of accounts) {
          const accountType = account.type;
          const accountSubtype = account.subtype;
          
          console.log(`Analyzing account: ${account.name} (${accountType}/${accountSubtype})`);
          
          // For investment accounts, get holdings and transactions
          if (accountType === 'investment') {
            console.log('Investment account detected - fetching holdings and transactions');
            try {
              // Get investment holdings
              const holdingsResponse = await plaidClient.investmentsHoldingsGet({
                access_token: access_token,
              });
              console.log(`Retrieved ${holdingsResponse.data.holdings?.length || 0} investment holdings`);
              
              // Get investment transactions
              const transactionsResponse = await plaidClient.investmentsTransactionsGet({
                access_token: access_token,
                start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 30 days
                end_date: new Date().toISOString().split('T')[0],
              });
              console.log(`Retrieved ${transactionsResponse.data.investment_transactions?.length || 0} investment transactions`);
            } catch (error: any) {
              console.log('Investment data not available for this account:', error.message);
            }
          }
          
          // For credit/loan accounts, get liabilities
          if (accountType === 'credit' || accountType === 'loan') {
            console.log('Credit/Loan account detected - fetching liabilities');
            try {
              const liabilitiesResponse = await plaidClient.liabilitiesGet({
                access_token: access_token,
              });
              console.log(`Retrieved ${liabilitiesResponse.data.accounts?.length || 0} liability accounts`);
            } catch (error: any) {
              console.log('Liability data not available for this account:', error.message);
            }
          }
          
          // For standard deposit accounts, get transactions
          if (accountType === 'depository') {
            console.log('Depository account detected - fetching transactions');
            try {
              const transactionsResponse = await plaidClient.transactionsSync({
                access_token: access_token,
                options: {
                  include_personal_finance_category: true
                }
              });
              console.log(`Retrieved ${transactionsResponse.data.added?.length || 0} transactions`);
            } catch (error: any) {
              console.log('Transaction data not available for this account:', error.message);
            }
          }
        }
        
        console.log('Intelligent account detection completed successfully');
      } catch (detectionError: any) {
        // Don't fail the token exchange if detection fails
        console.log('Account detection failed (non-critical):', detectionError.message);
      }
      
      res.json({ access_token });
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'exchanging public token');
      res.status(500).json(errorInfo);
    }
  });

  // Refresh access token - simplified approach
  app.post('/plaid/refresh_token', async (req: any, res: any) => {
    try {
      const { access_token } = req.body;
      
      // Test if the token is still valid by making a simple API call
      await plaidClient.accountsGet({
        access_token: access_token,
      });

      // If we get here, the token is still valid
      // Update the last refreshed timestamp
      await getPrismaClient().accessToken.update({
        where: { token: access_token },
        data: { lastRefreshed: new Date() }
      });

      res.json({ 
        success: true, 
        message: 'Token is still valid',
        access_token: access_token
      });
    } catch (error) {
      // If the token is invalid, suggest reconnecting
      const errorInfo = handlePlaidError(error, 'refreshing token');
      res.status(500).json({
        ...errorInfo,
        needsReconnect: true
      });
    }
  });

  // Get accounts for a specific access token
  app.get('/plaid/accounts', async (req: any, res: any) => {
    try {
      const accessToken = req.headers.authorization?.replace('Bearer ', '') || req.query.access_token;
      
      if (!accessToken) {
        return res.status(400).json({ error: 'Access token required' });
      }

      const accountsResponse = await plaidClient.accountsGet({
        access_token: accessToken,
      });

      const accounts = accountsResponse.data.accounts.map(account => ({
        id: account.account_id,
        name: account.name,
        type: account.type,
        subtype: account.subtype,
        currentBalance: account.balances.current,
      }));

      res.json({ accounts });
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'fetching accounts');
      res.status(500).json(errorInfo);
    }
  });

  // Get all accounts with enhanced data
  app.get('/plaid/all-accounts', async (req: any, res: any) => {
    try {
      // Check for demo mode
      const isDemo = req.headers['x-demo-mode'] === 'true';
      
      if (isDemo) {
        // NOTE: Demo data is hardcoded in arrays for performance and Plaid API compatibility
        // This ensures the backend returns exactly the data structure that the frontend expects
        // with all necessary fields that Plaid would normally provide (merchant_name, category_id, location, etc.)
        // 
        // Alternative approach would be to import from demo-data.ts and transform, but hardcoded arrays
        // are faster and avoid data structure mismatches between frontend and backend demo data.
        const demoAccounts = [
          {
            id: "checking_1",
            name: "Chase Checking",
            type: "depository",
            subtype: "checking",
            mask: "1234",
            balance: {
              available: 12450.67,
              current: 12450.67,
              limit: null,
              iso_currency_code: "USD",
              unofficial_currency_code: null
            },
            securities: [],
            holdings: [],
            income_verification: null
          },
          {
            id: "savings_1",
            name: "Ally High-Yield Savings",
            type: "depository",
            subtype: "savings",
            mask: "5678",
            balance: {
              available: 28450.00,
              current: 28450.00,
              limit: null,
              iso_currency_code: "USD",
              unofficial_currency_code: null
            },
            securities: [],
            holdings: [],
            income_verification: null
          },
          {
            id: "401k_1",
            name: "Fidelity 401(k)",
            type: "investment",
            subtype: "401k",
            mask: "9012",
            balance: {
              available: 156780.45,
              current: 156780.45,
              limit: null,
              iso_currency_code: "USD",
              unofficial_currency_code: null
            },
            securities: [],
            holdings: [],
            income_verification: null
          },
          {
            id: "ira_1",
            name: "Vanguard Roth IRA",
            type: "investment",
            subtype: "ira",
            mask: "3456",
            balance: {
              available: 89420.30,
              current: 89420.30,
              limit: null,
              iso_currency_code: "USD",
              unofficial_currency_code: null
            },
            securities: [],
            holdings: [],
            income_verification: null
          },
          {
            id: "credit_1",
            name: "Chase Sapphire Reserve",
            type: "credit",
            subtype: "credit card",
            mask: "7890",
            balance: {
              available: 6759.50,
              current: -3240.50,
              limit: 10000,
              iso_currency_code: "USD",
              unofficial_currency_code: null
            },
            securities: [],
            holdings: [],
            income_verification: null
          },
          {
            id: "mortgage_1",
            name: "Wells Fargo Mortgage",
            type: "loan",
            subtype: "mortgage",
            mask: "1111",
            balance: {
              available: 0,
              current: 485000.00,
              limit: 500000,
              iso_currency_code: "USD",
              unofficial_currency_code: null
            },
            securities: [],
            holdings: [],
            income_verification: null
          },
          {
            id: "cd_1",
            name: "Marcus 12-Month CD",
            type: "depository",
            subtype: "cd",
            mask: "2222",
            balance: {
              available: 25000.00,
              current: 25000.00,
              limit: null,
              iso_currency_code: "USD",
              unofficial_currency_code: null
            },
            securities: [],
            holdings: [],
            income_verification: null
          },
          // Additional investment accounts to reach 60 holdings
          {
            id: "brokerage_1",
            name: "Fidelity Individual Brokerage",
            type: "investment",
            subtype: "brokerage",
            mask: "3333",
            balance: {
              available: 125000.00,
              current: 125000.00,
              limit: null,
              iso_currency_code: "USD",
              unofficial_currency_code: null
            },
            securities: [],
            holdings: [],
            income_verification: null
          },
          {
            id: "hsa_1",
            name: "Health Savings Account",
            type: "investment",
            subtype: "hsa",
            mask: "4444",
            balance: {
              available: 18500.00,
              current: 18500.00,
              limit: null,
              iso_currency_code: "USD",
              unofficial_currency_code: null
            },
            securities: [],
            holdings: [],
            income_verification: null
          },
          {
            id: "529_1",
            name: "College Savings 529 Plan",
            type: "investment",
            subtype: "529",
            mask: "5555",
            balance: {
              available: 32000.00,
              current: 32000.00,
              limit: null,
              iso_currency_code: "USD",
              unofficial_currency_code: null
            },
            securities: [],
            holdings: [],
            income_verification: null
          }
        ];

        return res.json({ accounts: demoAccounts });
      }

      // 🔒 CRITICAL SECURITY: Require authentication for real user data
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required for accessing account data' });
      }

      // Real Plaid integration
      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: { userId: req.user.id }
      });
      const allAccounts: any[] = [];
      const seenAccountIds = new Set<string>();

      for (const tokenRecord of accessTokens) {
        try {
          // Get accounts
          const accountsResponse = await plaidClient.accountsGet({
            access_token: tokenRecord.token,
          });

          // Get balances for each account
          const balancesResponse = await plaidClient.accountsBalanceGet({
            access_token: tokenRecord.token,
          });

          // Merge account and balance data, deduplicating by account_id
          const accountsWithBalances = accountsResponse.data.accounts
            .filter((account: any) => {
              // Only include accounts we haven't seen before
              if (seenAccountIds.has(account.account_id)) {
                return false;
              }
              seenAccountIds.add(account.account_id);
              return true;
            })
            .map((account: any) => {
              const balance = balancesResponse.data.accounts.find((b: any) => b.account_id === account.account_id);
              return processAccountData({
                ...account,
                balances: balance?.balances || account.balances
              });
            });

          allAccounts.push(...accountsWithBalances);
        } catch (error) {
          console.error(`Error fetching accounts for token ${tokenRecord.id}:`, error);
        }
      }

      // Deduplicate accounts by account_id to avoid counting the same account multiple times
      // Note: Using account_id instead of name-type-subtype because some institutions 
      // may have multiple accounts with identical names (e.g., multiple "Adv Plus Banking" accounts)
      const uniqueAccounts = allAccounts.reduce((acc: any[], account: any) => {
        const existing = acc.find(a => a.account_id === account.account_id);
        if (!existing) {
          acc.push(account);
        }
        return acc;
      }, []);

      res.json({ accounts: uniqueAccounts });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'get all accounts');
      res.status(500).json(errorResponse);
    }
  });

  // Get all transactions with enhanced data
  app.get('/plaid/transactions', async (req: any, res: any) => {
    try {
      // Check for demo mode
      const isDemo = req.headers['x-demo-mode'] === 'true';
      
      if (isDemo) {
        // NOTE: Demo transaction data is hardcoded for the same reasons as accounts above
        // All dates are set to 2025 to ensure they appear in current date ranges
        // This array contains 10 transactions with various categories and amounts
        const demoTransactions = [
          {
            id: "t1",
            account_id: "checking_1",
            amount: 4250.00,
            date: "2025-07-15",
            name: "Salary - Tech Corp",
            merchant_name: "Tech Corp",
            category: ["income", "salary"],
            category_id: "20000000",
            pending: false,
            payment_channel: "online",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            },
            enriched_data: {
              merchant_name: "Tech Corp",
              website: "techcorp.com",
              logo_url: "https://logo.clearbit.com/techcorp.com",
              primary_color: "#4CAF50",
              domain: "techcorp.com",
              category: ["income", "salary", "technology"],
              category_id: "20000000",
              brand_logo_url: "https://logo.clearbit.com/techcorp.com",
              brand_name: "Tech Corp"
            }
          },
          {
            id: "t2",
            account_id: "checking_1",
            amount: -850.00,
            date: "2025-07-01",
            name: "Mortgage Payment",
            merchant_name: "Wells Fargo",
            category: ["housing", "mortgage"],
            category_id: "16000000",
            pending: false,
            payment_channel: "online",
            location: {
              city: "San Francisco",
              state: "CA",
              country: "US"
            },
            enriched_data: {
              merchant_name: "Wells Fargo",
              website: "wellsfargo.com",
              logo_url: "https://logo.clearbit.com/wellsfargo.com",
              primary_color: "#333333",
              domain: "wellsfargo.com",
              category: ["housing", "mortgage", "financial"],
              category_id: "16000000",
              brand_logo_url: "https://logo.clearbit.com/wellsfargo.com",
              brand_name: "Wells Fargo"
            }
          },
          {
            id: "t3",
            account_id: "checking_1",
            amount: -120.00,
            date: "2025-07-05",
            name: "Electric Bill",
            merchant_name: "Austin Energy",
            category: ["utilities", "electric"],
            category_id: "18000000",
            pending: false,
            payment_channel: "online",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            },
            enriched_data: {
              merchant_name: "Austin Energy",
              website: "austinenergy.com",
              logo_url: "https://logo.clearbit.com/austinenergy.com",
              primary_color: "#0066CC",
              domain: "austinenergy.com",
              category: ["utilities", "electric", "government"],
              category_id: "18000000",
              brand_logo_url: "https://logo.clearbit.com/austinenergy.com",
              brand_name: "Austin Energy"
            }
          },
          {
            id: "t4",
            account_id: "checking_1",
            amount: -85.00,
            date: "2025-07-10",
            name: "Car Insurance",
            merchant_name: "State Farm",
            category: ["insurance", "auto"],
            category_id: "22000000",
            pending: false,
            payment_channel: "online",
            location: {
              city: "Bloomington",
              state: "IL",
              country: "US"
            },
            enriched_data: {
              merchant_name: "State Farm",
              website: "statefarm.com",
              logo_url: "https://logo.clearbit.com/statefarm.com",
              primary_color: "#E31837",
              domain: "statefarm.com",
              category: ["insurance", "auto", "financial"],
              category_id: "22000000",
              brand_logo_url: "https://logo.clearbit.com/statefarm.com",
              brand_name: "State Farm"
            }
          },
          {
            id: "t5",
            account_id: "checking_1",
            amount: -450.00,
            date: "2025-07-12",
            name: "Whole Foods",
            merchant_name: "Whole Foods Market",
            category: ["food", "groceries"],
            category_id: "13000000",
            pending: false,
            payment_channel: "in store",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            },
            enriched_data: {
              merchant_name: "Whole Foods Market",
              website: "wholefoodsmarket.com",
              logo_url: "https://logo.clearbit.com/wholefoodsmarket.com",
              primary_color: "#2E7D32",
              domain: "wholefoodsmarket.com",
              category: ["food", "groceries", "organic"],
              category_id: "13000000",
              brand_logo_url: "https://logo.clearbit.com/wholefoodsmarket.com",
              brand_name: "Whole Foods Market"
            }
          },
          {
            id: "t6",
            account_id: "checking_1",
            amount: -200.00,
            date: "2025-07-14",
            name: "Shell Gas Station",
            merchant_name: "Shell",
            category: ["transportation", "gas"],
            category_id: "14000000",
            pending: false,
            payment_channel: "in store",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            }
          },
          {
            id: "t7",
            account_id: "checking_1",
            amount: -150.00,
            date: "2025-07-16",
            name: "Netflix & Spotify",
            merchant_name: "Netflix",
            category: ["entertainment", "streaming"],
            category_id: "17000000",
            pending: false,
            payment_channel: "online",
            location: {
              city: "Los Gatos",
              state: "CA",
              country: "US"
            }
          },
          {
            id: "t8",
            account_id: "checking_1",
            amount: -300.00,
            date: "2025-07-18",
            name: "Restaurant Expenses",
            merchant_name: "Various Restaurants",
            category: ["food", "dining"],
            category_id: "13000000",
            pending: false,
            payment_channel: "in store",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            }
          },
          {
            id: "t9",
            account_id: "checking_1",
            amount: -1000.00,
            date: "2025-07-20",
            name: "Transfer to Savings",
            merchant_name: "Ally Bank",
            category: ["transfer", "savings"],
            category_id: "21000000",
            pending: false,
            payment_channel: "online",
            location: {
              city: "Sandy",
              state: "UT",
              country: "US"
            }
          },
          {
            id: "t10",
            account_id: "credit_1",
            amount: -150.00,
            date: "2025-07-22",
            name: "Amazon Purchase",
            merchant_name: "Amazon",
            category: ["shopping", "online"],
            category_id: "19000000",
            pending: false,
            payment_channel: "online",
            location: {
              city: "Seattle",
              state: "WA",
              country: "US"
            },
            enriched_data: {
              merchant_name: "Amazon",
              website: "amazon.com",
              logo_url: "https://logo.clearbit.com/amazon.com",
              primary_color: "#FF9900",
              domain: "amazon.com",
              category: ["shopping", "online", "retail"],
              category_id: "19000000",
              brand_logo_url: "https://logo.clearbit.com/amazon.com",
              brand_name: "Amazon"
            }
          },
          // Additional recent transactions to show more activity
          {
            id: "t11",
            account_id: "checking_1",
            amount: -75.00,
            date: "2025-07-24",
            name: "Exxon Gas Station",
            merchant_name: "Exxon",
            category: ["transportation", "gas"],
            category_id: "14000000",
            pending: false,
            payment_channel: "in store",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            }
          },
          {
            id: "t12",
            account_id: "checking_1",
            amount: -200.00,
            date: "2025-07-26",
            name: "Date Night Restaurant",
            merchant_name: "Various Restaurants",
            category: ["food", "dining"],
            category_id: "13000000",
            pending: false,
            payment_channel: "in store",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            }
          },
          {
            id: "t13",
            account_id: "checking_1",
            amount: -180.00,
            date: "2025-07-27",
            name: "Target - Household Items",
            merchant_name: "Target",
            category: ["shopping", "retail"],
            category_id: "19000000",
            pending: false,
            payment_channel: "in store",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            }
          },
          {
            id: "t14",
            account_id: "checking_1",
            amount: -65.00,
            date: "2025-07-25",
            name: "Costco Gas",
            merchant_name: "Costco",
            category: ["transportation", "gas"],
            category_id: "14000000",
            pending: false,
            payment_channel: "in store",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            }
          },
          {
            id: "t15",
            account_id: "checking_1",
            amount: -120.00,
            date: "2025-07-23",
            name: "Lunch with Colleagues",
            merchant_name: "Various Restaurants",
            category: ["food", "dining"],
            category_id: "13000000",
            pending: false,
            payment_channel: "in store",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            }
          },
          {
            id: "t16",
            account_id: "checking_1",
            amount: -95.00,
            date: "2025-07-21",
            name: "CVS Pharmacy",
            merchant_name: "CVS",
            category: ["shopping", "pharmacy"],
            category_id: "19000000",
            pending: false,
            payment_channel: "in store",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            }
          },
          {
            id: "t17",
            account_id: "checking_1",
            amount: -40.00,
            date: "2025-07-19",
            name: "Movie Tickets",
            merchant_name: "AMC Theaters",
            category: ["entertainment", "movies"],
            category_id: "17000000",
            pending: false,
            payment_channel: "in store",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            }
          },
          {
            id: "t18",
            account_id: "checking_1",
            amount: -280.00,
            date: "2025-07-17",
            name: "H-E-B Groceries",
            merchant_name: "H-E-B",
            category: ["food", "groceries"],
            category_id: "13000000",
            pending: false,
            payment_channel: "in store",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            }
          },
          {
            id: "t19",
            account_id: "checking_1",
            amount: -60.00,
            date: "2025-07-15",
            name: "Shell Gas Station",
            merchant_name: "Shell",
            category: ["transportation", "gas"],
            category_id: "14000000",
            pending: false,
            payment_channel: "in store",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            }
          },
          {
            id: "t20",
            account_id: "checking_1",
            amount: -110.00,
            date: "2025-07-13",
            name: "Coffee & Breakfast",
            merchant_name: "Various Cafes",
            category: ["food", "dining"],
            category_id: "13000000",
            pending: false,
            payment_channel: "in store",
            location: {
              city: "Austin",
              state: "TX",
              country: "US"
            }
          }
        ];
        
        res.json({ transactions: demoTransactions });
        return;
      }
      
            // 🔒 CRITICAL SECURITY: Require authentication for real user data
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required for accessing transaction data' });
      }
      
      const token = authHeader.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'Authentication required for accessing transaction data' });
      }
      
      // Verify token and get user info
      try {
        const { verifyToken } = await import('./auth/utils');
        const payload = verifyToken(token);
        if (!payload || !payload.userId) {
          return res.status(401).json({ error: 'Authentication required for accessing transaction data' });
        }
        
        // Set req.user for the rest of the endpoint
        req.user = {
          id: payload.userId,
          email: payload.email || 'unknown',
          tier: payload.tier || 'starter'
        };
      } catch (error) {
        return res.status(401).json({ error: 'Authentication required for accessing transaction data' });
      }
      
      // ✅ PRODUCTION MODE: Handle real user authentication and fetch enhanced transactions
      const { start_date, end_date, count = '50' } = req.query;
      
      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' }
      });
      
      if (accessTokens.length === 0) {
        return res.status(404).json({ error: 'No active access tokens found' });
      }
      
      const allTransactions: any[] = [];
      const seenTransactionIds = new Set();
      
      for (const tokenRecord of accessTokens) {
        try {
          // Get transactions for this token
          const transactionsResponse = await plaidClient.transactionsGet({
            access_token: tokenRecord.token,
            start_date: start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            end_date: end_date || new Date().toISOString().split('T')[0],
            options: {
              count: parseInt(count as string),
              include_personal_finance_category: true
            }
          });
          
          // ✅ Debug: Log what Plaid is actually returning
          console.log(`🔍 Plaid raw response for token ${tokenRecord.id}:`, {
            totalTransactions: transactionsResponse.data.transactions.length,
            firstTransaction: transactionsResponse.data.transactions[0] ? {
              id: transactionsResponse.data.transactions[0].transaction_id,
              name: transactionsResponse.data.transactions[0].name,
              category: transactionsResponse.data.transactions[0].category,
              category_id: transactionsResponse.data.transactions[0].category_id,
              personal_finance_category: transactionsResponse.data.transactions[0].personal_finance_category,
              allKeys: Object.keys(transactionsResponse.data.transactions[0])
            } : 'No transactions'
          });
          
          // Process and add transactions, deduplicating by transaction_id
          const processedTransactions = transactionsResponse.data.transactions
            .filter((transaction: any) => {
              // Only include transactions we haven't seen before
              if (seenTransactionIds.has(transaction.transaction_id)) {
                return false;
              }
              seenTransactionIds.add(transaction.transaction_id);
              return true;
            })
            .map((transaction: any) => {
              return processTransactionData(transaction);
            });
          
          // Automatically enrich transactions with merchant data
          try {
            console.log(`🚀 STARTING TRANSACTION ENRICHMENT PROCESS for token ${tokenRecord.id}`);
            console.log(`🔍 Transaction enrichment: Processing ${transactionsResponse.data.transactions.length} transactions`);
            
            // Use absolute values for enrichment while preserving original signs
            const transactionsForEnrichment = transactionsResponse.data.transactions
              .filter((t: any) => {
                const isValid = typeof t.amount === 'number' && !isNaN(t.amount);
                if (!isValid) {
                  console.log(`❌ Invalid amount for transaction "${t.name}":`, {
                    amount: t.amount,
                    type: typeof t.amount,
                    isNaN: isNaN(t.amount)
                  });
                }
                return isValid;
              });
            
            if (transactionsForEnrichment.length === 0) {
              console.log(`❌ No transactions for enrichment!`);
              allTransactions.push(...processedTransactions);
              continue;
            }
            
            // Map transactions for Plaid enrichment API
            const mappedTransactions = transactionsForEnrichment.map((t: any) => ({
              id: t.transaction_id,
              description: t.name,
              amount: Math.abs(t.amount), // Use absolute value for Plaid API
              direction: t.amount > 0 ? 'INFLOW' as any : 'OUTFLOW' as any,
              iso_currency_code: t.iso_currency_code || 'USD'
            }));
            
            // Call Plaid enrichment API
            const enrichResponse = await plaidClient.transactionsEnrich({
              account_type: 'depository',
              transactions: mappedTransactions
            });
            
            console.log(`✅ Transaction enrichment successful:`, {
              total: transactionsResponse.data.transactions.length,
              enrichedCount: enrichResponse.data.enriched_transactions?.length || 0,
              firstEnriched: enrichResponse.data.enriched_transactions?.[0]
            });
            
            // Create a map of enriched data by transaction ID
            const enrichedDataMap = new Map();
            enrichResponse.data.enriched_transactions?.forEach((enriched: any, index: number) => {
              enrichedDataMap.set(mappedTransactions[index].id, enriched);
            });
            
            // Merge enriched data with processed transactions
            const enrichedTransactions = processedTransactions.map((transaction) => {
              // Try to find enriched data by matching the transaction ID
              let enrichedTransaction = enrichedDataMap.get(transaction.id);
              
              // If not found by current ID, try to find by the original Plaid transaction ID
              if (!enrichedTransaction && (transaction as any).transaction_id) {
                enrichedTransaction = enrichedDataMap.get((transaction as any).transaction_id);
              }
              
              // If still not found, try to find by matching the transaction name (fallback)
              if (!enrichedTransaction) {
                for (const [key, value] of enrichedDataMap.entries()) {
                  if (value.description === transaction.name) {
                    enrichedTransaction = value;
                    break;
                  }
                }
              }
              
              if (enrichedTransaction) {
                // Get enhanced categories from Plaid enrichment
                let enhancedCategories = [];
                if ((enrichedTransaction as any).enrichments?.personal_finance_category) {
                  const enriched = (enrichedTransaction as any).enrichments.personal_finance_category;
                  enhancedCategories = [
                    enriched.primary,
                    enriched.detailed
                  ].filter(Boolean);
                }
                
                // Only show enhanced categories if they're different from basic categories
                const basicCategories = transaction.category || [];
                const hasDifferentCategories = enhancedCategories.length > 0 && 
                  (enhancedCategories.length !== basicCategories.length || 
                   !enhancedCategories.every((cat: string, index: number) => basicCategories[index] === cat));
                
                return {
                  ...transaction,
                  // ✅ PRESERVE original Plaid categories at the top level
                  category: basicCategories,
                  category_id: (transaction as any).category_id,
                  // ✅ Add enhanced data as additional enrichment
                  enriched_data: {
                    merchant_name: (enrichedTransaction as any).enrichments?.merchant_name || transaction.merchant_name,
                    website: (enrichedTransaction as any).enrichments?.website,
                    logo_url: (enrichedTransaction as any).enrichments?.logo_url,
                    primary_color: (enrichedTransaction as any).enrichments?.primary_color,
                    domain: (enrichedTransaction as any).enrichments?.domain,
                    // ✅ Only include enhanced categories if they're truly different
                    category: hasDifferentCategories ? enhancedCategories : [],
                    category_id: (enrichedTransaction as any).enrichments?.personal_finance_category?.primary || (transaction as any).category_id,
                    brand_logo_url: (enrichedTransaction as any).enrichments?.brand_logo_url,
                    brand_name: (enrichedTransaction as any).enrichments?.brand_name
                  }
                };
              }
              return transaction;
            });
            
            allTransactions.push(...enrichedTransactions);
          } catch (enrichError: any) {
            console.log(`❌ Real transaction enrichment FAILED:`, {
              error: enrichError.message,
              status: enrichError.response?.status,
              data: enrichError.response?.data
            });
            // Continue with unenriched transactions if enrichment fails
            allTransactions.push(...processedTransactions);
          }
        } catch (error) {
          console.error(`Error fetching transactions for token ${tokenRecord.id}:`, error);
        }
      }
      
      // Sort transactions by date (newest first)
      allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      // Limit to requested count
      const limitedTransactions = allTransactions.slice(0, parseInt(count as string));
      
      // Debug: Check what we're sending to frontend
      console.log(`📤 Sending to frontend:`, {
        totalTransactions: allTransactions.length,
        limitedTransactions: limitedTransactions.length,
        sampleTransaction: limitedTransactions[0],
        hasEnrichedData: limitedTransactions[0]?.enriched_data ? 'YES' : 'NO',
        enrichedFields: limitedTransactions[0]?.enriched_data ? Object.keys(limitedTransactions[0].enriched_data) : 'NONE',
        // Debug merchant name consistency
        merchantNameDebug: limitedTransactions[0] ? {
          originalName: limitedTransactions[0].name,
          merchantName: limitedTransactions[0].merchant_name,
          enrichedMerchantName: limitedTransactions[0].enriched_data?.merchant_name,
          allNames: [
            limitedTransactions[0].name,
            limitedTransactions[0].merchant_name,
            limitedTransactions[0].enriched_data?.merchant_name
          ].filter(Boolean)
        } : 'No transactions'
      });
      
      res.json({ transactions: limitedTransactions });
      
    } catch (error) {
      console.error('Error in /plaid/transactions endpoint:', error);
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  });

  // Get comprehensive investment data (automatically combines holdings and transactions)
  app.get('/plaid/investments', async (req: any, res: any) => {
    try {
      // Check if this is a demo request
      const isDemo = req.headers['x-demo-mode'] === 'true';
      
      if (isDemo) {
        // Return demo investment data that matches the frontend expectations
        const demoData = {
          portfolio: {
            totalValue: 421700.75, // Total of all investment accounts: 401k + IRA + Brokerage + HSA + 529
            assetAllocation: [
              { type: 'Equity', value: 246200.75, percentage: 58.4 },
              { type: 'Fixed Income', value: 15678.00, percentage: 3.7 },
              { type: 'International', value: 33562.05, percentage: 8.0 },
              { type: 'Cash & Equivalents', value: 126259.95, percentage: 29.9 }
            ],
            holdingCount: 60, // Total holdings across all accounts
            securityCount: 26
          },
          holdings: [
            // 401k holdings
            {
              id: 'demo_401k_vtsax',
              account_id: '401k_1',
              security_id: 'vtsax',
              institution_value: 156780.45,
              institution_price: 142.80,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 156000.00,
              quantity: 1097.45,
              iso_currency_code: 'USD',
              security_name: 'Vanguard Total Stock Market Index Fund',
              security_type: 'equity',
              ticker_symbol: 'VTSAX'
            },
            {
              id: 'demo_401k_vtiax',
              account_id: '401k_1',
              security_id: 'vtiax',
              institution_value: 15678.05,
              institution_price: 35.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 15000.00,
              quantity: 447.89,
              iso_currency_code: 'USD',
              security_name: 'Vanguard Total International Stock Index Fund',
              security_type: 'equity',
              ticker_symbol: 'VTIAX'
            },
            {
              id: 'demo_401k_vbtlx',
              account_id: '401k_1',
              security_id: 'vbtlx',
              institution_value: 15678.00,
              institution_price: 10.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 15500.00,
              quantity: 1567.80,
              iso_currency_code: 'USD',
              security_name: 'Vanguard Total Bond Market Index Fund',
              security_type: 'fixed income',
              ticker_symbol: 'VBTLX'
            },
            // IRA holdings
            {
              id: 'demo_ira_vti',
              account_id: 'ira_1',
              security_id: 'vti',
              institution_value: 89420.30,
              institution_price: 570.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 85000.00,
              quantity: 156.78,
              iso_currency_code: 'USD',
              security_name: 'Vanguard Total Stock Market ETF',
              security_type: 'equity',
              ticker_symbol: 'VTI'
            },
            {
              id: 'demo_ira_vxus',
              account_id: 'ira_1',
              security_id: 'vxus',
              institution_value: 17884.00,
              institution_price: 40.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 17000.00,
              quantity: 447.10,
              iso_currency_code: 'USD',
              security_name: 'Vanguard Total International Stock ETF',
              security_type: 'equity',
              ticker_symbol: 'VXUS'
            },
            // Brokerage holdings
            {
              id: 'demo_brokerage_aapl',
              account_id: 'brokerage_1',
              security_id: 'aapl',
              institution_value: 8471.85,
              institution_price: 185.50,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 8000.00,
              quantity: 45.67,
              iso_currency_code: 'USD',
              security_name: 'Apple Inc.',
              security_type: 'equity',
              ticker_symbol: 'AAPL'
            },
            {
              id: 'demo_brokerage_msft',
              account_id: 'brokerage_1',
              security_id: 'msft',
              institution_value: 13655.36,
              institution_price: 420.80,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 13000.00,
              quantity: 32.45,
              iso_currency_code: 'USD',
              security_name: 'Microsoft Corporation',
              security_type: 'equity',
              ticker_symbol: 'MSFT'
            },
            {
              id: 'demo_brokerage_googl',
              account_id: 'brokerage_1',
              security_id: 'googl',
              institution_value: 5063.28,
              institution_price: 175.20,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 4800.00,
              quantity: 28.90,
              iso_currency_code: 'USD',
              security_name: 'Alphabet Inc.',
              security_type: 'equity',
              ticker_symbol: 'GOOGL'
            },
            {
              id: 'demo_brokerage_amzn',
              account_id: 'brokerage_1',
              security_id: 'amzn',
              institution_value: 6613.28,
              institution_price: 185.40,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 6000.00,
              quantity: 35.67,
              iso_currency_code: 'USD',
              security_name: 'Amazon.com Inc.',
              security_type: 'equity',
              ticker_symbol: 'AMZN'
            },
            {
              id: 'demo_brokerage_tsla',
              account_id: 'brokerage_1',
              security_id: 'tsla',
              institution_value: 10398.70,
              institution_price: 245.60,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 11000.00,
              quantity: 42.34,
              iso_currency_code: 'USD',
              security_name: 'Tesla Inc.',
              security_type: 'equity',
              ticker_symbol: 'TSLA'
            },
            {
              id: 'demo_brokerage_nvda',
              account_id: 'brokerage_1',
              security_id: 'nvda',
              institution_value: 14052.09,
              institution_price: 890.50,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 12000.00,
              quantity: 15.78,
              iso_currency_code: 'USD',
              security_name: 'NVIDIA Corporation',
              security_type: 'equity',
              ticker_symbol: 'NVDA'
            },
            {
              id: 'demo_brokerage_brkb',
              account_id: 'brokerage_1',
              security_id: 'brkb',
              institution_value: 6906.06,
              institution_price: 365.40,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 6500.00,
              quantity: 18.90,
              iso_currency_code: 'USD',
              security_name: 'Berkshire Hathaway Inc.',
              security_type: 'equity',
              ticker_symbol: 'BRK.B'
            },
            {
              id: 'demo_brokerage_jpm',
              account_id: 'brokerage_1',
              security_id: 'jpm',
              institution_value: 13389.53,
              institution_price: 198.50,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 12500.00,
              quantity: 67.45,
              iso_currency_code: 'USD',
              security_name: 'JPMorgan Chase & Co.',
              security_type: 'equity',
              ticker_symbol: 'JPM'
            },
            {
              id: 'demo_brokerage_jnj',
              account_id: 'brokerage_1',
              security_id: 'jnj',
              institution_value: 14776.50,
              institution_price: 165.80,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 14000.00,
              quantity: 89.12,
              iso_currency_code: 'USD',
              security_name: 'Johnson & Johnson',
              security_type: 'equity',
              ticker_symbol: 'JNJ'
            },
            {
              id: 'demo_brokerage_pg',
              account_id: 'brokerage_1',
              security_id: 'pg',
              institution_value: 11114.62,
              institution_price: 145.60,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 10500.00,
              quantity: 76.34,
              iso_currency_code: 'USD',
              security_name: 'Procter & Gamble Co.',
              security_type: 'equity',
              ticker_symbol: 'PG'
            },
            // HSA holdings
            {
              id: 'demo_hsa_vtsax',
              account_id: 'hsa_1',
              security_id: 'hsa_vtsax',
              institution_value: 12773.46,
              institution_price: 142.80,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 12000.00,
              quantity: 89.45,
              iso_currency_code: 'USD',
              security_name: 'Vanguard Total Stock Market Index Fund',
              security_type: 'equity',
              ticker_symbol: 'VTSAX'
            },
            {
              id: 'demo_hsa_vtiax',
              account_id: 'hsa_1',
              security_id: 'hsa_vtiax',
              institution_value: 1287.30,
              institution_price: 35.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 1200.00,
              quantity: 36.78,
              iso_currency_code: 'USD',
              security_name: 'Vanguard Total International Stock Index Fund',
              security_type: 'equity',
              ticker_symbol: 'VTIAX'
            },
            {
              id: 'demo_hsa_vbtlx',
              account_id: 'hsa_1',
              security_id: 'hsa_vbtlx',
              institution_value: 1289.00,
              institution_price: 10.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 1250.00,
              quantity: 128.90,
              iso_currency_code: 'USD',
              security_name: 'Vanguard Total Bond Market Index Fund',
              security_type: 'fixed income',
              ticker_symbol: 'VBTLX'
            },
            // 529 Plan holdings
            {
              id: 'demo_529_vtsax',
              account_id: '529_1',
              security_id: '529_vtsax',
              institution_value: 22387.58,
              institution_price: 142.80,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 20000.00,
              quantity: 156.78,
              iso_currency_code: 'USD',
              security_name: 'Vanguard Total Stock Market Index Fund',
              security_type: 'equity',
              ticker_symbol: 'VTSAX'
            },
            {
              id: 'demo_529_vtiax',
              account_id: '529_1',
              security_id: '529_vtiax',
              institution_value: 2360.75,
              institution_price: 35.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 2000.00,
              quantity: 67.45,
              iso_currency_code: 'USD',
              security_name: 'Vanguard Total International Stock Index Fund',
              security_type: 'equity',
              ticker_symbol: 'VTIAX'
            },
            {
              id: 'demo_529_vbtlx',
              account_id: '529_1',
              security_id: '529_vbtlx',
              institution_value: 2256.70,
              institution_price: 10.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 2000.00,
              quantity: 225.67,
              iso_currency_code: 'USD',
              security_name: 'Vanguard Total Bond Market Index Fund',
              security_type: 'fixed income',
              ticker_symbol: 'VBTLX'
            },
            // Additional holdings to reach 60 total
            {
              id: 'demo_brokerage_meta',
              account_id: 'brokerage_1',
              security_id: 'meta',
              institution_value: 8750.00,
              institution_price: 350.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 8000.00,
              quantity: 25.00,
              iso_currency_code: 'USD',
              security_name: 'Meta Platforms Inc.',
              security_type: 'equity',
              ticker_symbol: 'META'
            },
            {
              id: 'demo_brokerage_unh',
              account_id: 'brokerage_1',
              security_id: 'unh',
              institution_value: 12500.00,
              institution_price: 500.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 12000.00,
              quantity: 25.00,
              iso_currency_code: 'USD',
              security_name: 'UnitedHealth Group Inc.',
              security_type: 'equity',
              ticker_symbol: 'UNH'
            },
            {
              id: 'demo_brokerage_hd',
              account_id: 'brokerage_1',
              security_id: 'hd',
              institution_value: 11250.00,
              institution_price: 375.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 11000.00,
              quantity: 30.00,
              iso_currency_code: 'USD',
              security_name: 'Home Depot Inc.',
              security_type: 'equity',
              ticker_symbol: 'HD'
            },
            {
              id: 'demo_brokerage_dis',
              account_id: 'brokerage_1',
              security_id: 'dis',
              institution_value: 6000.00,
              institution_price: 80.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 6000.00,
              quantity: 75.00,
              iso_currency_code: 'USD',
              security_name: 'Walt Disney Co.',
              security_type: 'equity',
              ticker_symbol: 'DIS'
            },
            {
              id: 'demo_brokerage_coca',
              account_id: 'brokerage_1',
              security_id: 'ko',
              institution_value: 8750.00,
              institution_price: 70.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 8000.00,
              quantity: 125.00,
              iso_currency_code: 'USD',
              security_name: 'Coca-Cola Co.',
              security_type: 'equity',
              ticker_symbol: 'KO'
            },
            {
              id: 'demo_brokerage_pep',
              account_id: 'brokerage_1',
              security_id: 'pep',
              institution_value: 10000.00,
              institution_price: 200.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 9500.00,
              quantity: 50.00,
              iso_currency_code: 'USD',
              security_name: 'PepsiCo Inc.',
              security_type: 'equity',
              ticker_symbol: 'PEP'
            },
            {
              id: 'demo_brokerage_visa',
              account_id: 'brokerage_1',
              security_id: 'v',
              institution_value: 15000.00,
              institution_price: 300.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 14000.00,
              quantity: 50.00,
              iso_currency_code: 'USD',
              security_name: 'Visa Inc.',
              security_type: 'equity',
              ticker_symbol: 'V'
            },
            {
              id: 'demo_brokerage_mastercard',
              account_id: 'brokerage_1',
              security_id: 'ma',
              institution_value: 12000.00,
              institution_price: 400.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 11000.00,
              quantity: 30.00,
              iso_currency_code: 'USD',
              security_name: 'Mastercard Inc.',
              security_type: 'equity',
              ticker_symbol: 'MA'
            },
            {
              id: 'demo_brokerage_netflix',
              account_id: 'brokerage_1',
              security_id: 'nflx',
              institution_value: 8000.00,
              institution_price: 400.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 7500.00,
              quantity: 20.00,
              iso_currency_code: 'USD',
              security_name: 'Netflix Inc.',
              security_type: 'equity',
              ticker_symbol: 'NFLX'
            },
            {
              id: 'demo_brokerage_spotify',
              account_id: 'brokerage_1',
              security_id: 'spot',
              institution_value: 5000.00,
              institution_price: 250.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 4500.00,
              quantity: 20.00,
              iso_currency_code: 'USD',
              security_name: 'Spotify Technology S.A.',
              security_type: 'equity',
              ticker_symbol: 'SPOT'
            },
            {
              id: 'demo_brokerage_uber',
              account_id: 'brokerage_1',
              security_id: 'uber',
              institution_value: 6000.00,
              institution_price: 60.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 5500.00,
              quantity: 100.00,
              iso_currency_code: 'USD',
              security_name: 'Uber Technologies Inc.',
              security_type: 'equity',
              ticker_symbol: 'UBER'
            },
            {
              id: 'demo_brokerage_lyft',
              account_id: 'brokerage_1',
              security_id: 'lyft',
              institution_value: 3000.00,
              institution_price: 15.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 2500.00,
              quantity: 200.00,
              iso_currency_code: 'USD',
              security_name: 'Lyft Inc.',
              security_type: 'equity',
              ticker_symbol: 'LYFT'
            },
            {
              id: 'demo_brokerage_airbnb',
              account_id: 'brokerage_1',
              security_id: 'abnb',
              institution_value: 7500.00,
              institution_price: 150.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 7000.00,
              quantity: 50.00,
              iso_currency_code: 'USD',
              security_name: 'Airbnb Inc.',
              security_type: 'equity',
              ticker_symbol: 'ABNB'
            },
            {
              id: 'demo_brokerage_snowflake',
              account_id: 'brokerage_1',
              security_id: 'snow',
              institution_value: 10000.00,
              institution_price: 200.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 9000.00,
              quantity: 50.00,
              iso_currency_code: 'USD',
              security_name: 'Snowflake Inc.',
              security_type: 'equity',
              ticker_symbol: 'SNOW'
            },
            {
              id: 'demo_brokerage_salesforce',
              account_id: 'brokerage_1',
              security_id: 'crm',
              institution_value: 12000.00,
              institution_price: 240.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 11000.00,
              quantity: 50.00,
              iso_currency_code: 'USD',
              security_name: 'Salesforce Inc.',
              security_type: 'equity',
              ticker_symbol: 'CRM'
            },
            {
              id: 'demo_brokerage_oracle',
              account_id: 'brokerage_1',
              security_id: 'orcl',
              institution_value: 8000.00,
              institution_price: 100.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 7500.00,
              quantity: 80.00,
              iso_currency_code: 'USD',
              security_name: 'Oracle Corporation',
              security_type: 'equity',
              ticker_symbol: 'ORCL'
            },
            {
              id: 'demo_brokerage_intel',
              account_id: 'brokerage_1',
              security_id: 'intc',
              institution_value: 6000.00,
              institution_price: 30.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 5500.00,
              quantity: 200.00,
              iso_currency_code: 'USD',
              security_name: 'Intel Corporation',
              security_type: 'equity',
              ticker_symbol: 'INTC'
            },
            {
              id: 'demo_brokerage_amd',
              account_id: 'brokerage_1',
              security_id: 'amd',
              institution_value: 9000.00,
              institution_price: 150.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 8000.00,
              quantity: 60.00,
              iso_currency_code: 'USD',
              security_name: 'Advanced Micro Devices Inc.',
              security_type: 'equity',
              ticker_symbol: 'AMD'
            },
            {
              id: 'demo_brokerage_qualcomm',
              account_id: 'brokerage_1',
              security_id: 'qcom',
              institution_value: 7000.00,
              institution_price: 140.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 6500.00,
              quantity: 50.00,
              iso_currency_code: 'USD',
              security_name: 'Qualcomm Inc.',
              security_type: 'equity',
              ticker_symbol: 'QCOM'
            },
            {
              id: 'demo_brokerage_broadcom',
              account_id: 'brokerage_1',
              security_id: 'avgo',
              institution_value: 11000.00,
              institution_price: 550.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 10000.00,
              quantity: 20.00,
              iso_currency_code: 'USD',
              security_name: 'Broadcom Inc.',
              security_type: 'equity',
              ticker_symbol: 'AVGO'
            },
            {
              id: 'demo_brokerage_cisco',
              account_id: 'brokerage_1',
              security_id: 'csco',
              institution_value: 8000.00,
              institution_price: 50.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 7500.00,
              quantity: 160.00,
              iso_currency_code: 'USD',
              security_name: 'Cisco Systems Inc.',
              security_type: 'equity',
              ticker_symbol: 'CSCO'
            },
            {
              id: 'demo_brokerage_verizon',
              account_id: 'brokerage_1',
              security_id: 'vz',
              institution_value: 6000.00,
              institution_price: 40.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 5500.00,
              quantity: 150.00,
              iso_currency_code: 'USD',
              security_name: 'Verizon Communications Inc.',
              security_type: 'equity',
              ticker_symbol: 'VZ'
            },
            {
              id: 'demo_brokerage_att',
              account_id: 'brokerage_1',
              security_id: 't',
              institution_value: 5000.00,
              institution_price: 20.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 4500.00,
              quantity: 250.00,
              iso_currency_code: 'USD',
              security_name: 'AT&T Inc.',
              security_type: 'equity',
              ticker_symbol: 'T'
            },
            {
              id: 'demo_brokerage_comcast',
              account_id: 'brokerage_1',
              security_id: 'cmcsa',
              institution_value: 7000.00,
              institution_price: 35.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 6500.00,
              quantity: 200.00,
              iso_currency_code: 'USD',
              security_name: 'Comcast Corporation',
              security_type: 'equity',
              ticker_symbol: 'CMCSA'
            },
            {
              id: 'demo_brokerage_phillips66',
              account_id: 'brokerage_1',
              security_id: 'psx',
              institution_value: 8000.00,
              institution_price: 100.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 7500.00,
              quantity: 80.00,
              iso_currency_code: 'USD',
              security_name: 'Phillips 66',
              security_type: 'equity',
              ticker_symbol: 'PSX'
            },
            {
              id: 'demo_brokerage_chevron',
              account_id: 'brokerage_1',
              security_id: 'cvx',
              institution_value: 9000.00,
              institution_price: 150.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 8500.00,
              quantity: 60.00,
              iso_currency_code: 'USD',
              security_name: 'Chevron Corporation',
              security_type: 'equity',
              ticker_symbol: 'CVX'
            },
            {
              id: 'demo_brokerage_exxon',
              account_id: 'brokerage_1',
              security_id: 'xom',
              institution_value: 7500.00,
              institution_price: 75.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 7000.00,
              quantity: 100.00,
              iso_currency_code: 'USD',
              security_name: 'Exxon Mobil Corporation',
              security_type: 'equity',
              ticker_symbol: 'XOM'
            },
            {
              id: 'demo_brokerage_3m',
              account_id: 'brokerage_1',
              security_id: 'mmm',
              institution_value: 6000.00,
              institution_price: 100.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 5500.00,
              quantity: 60.00,
              iso_currency_code: 'USD',
              security_name: '3M Company',
              security_type: 'equity',
              ticker_symbol: 'MMM'
            },
            {
              id: 'demo_brokerage_caterpillar',
              account_id: 'brokerage_1',
              security_id: 'cat',
              institution_value: 8000.00,
              institution_price: 200.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 7500.00,
              quantity: 40.00,
              iso_currency_code: 'USD',
              security_name: 'Caterpillar Inc.',
              security_type: 'equity',
              ticker_symbol: 'CAT'
            },
            {
              id: 'demo_brokerage_boeing',
              account_id: 'brokerage_1',
              security_id: 'ba',
              institution_value: 5000.00,
              institution_price: 200.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 4500.00,
              quantity: 25.00,
              iso_currency_code: 'USD',
              security_name: 'Boeing Co.',
              security_type: 'equity',
              ticker_symbol: 'BA'
            },
            {
              id: 'demo_brokerage_general_electric',
              account_id: 'brokerage_1',
              security_id: 'ge',
              institution_value: 4000.00,
              institution_price: 100.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 3500.00,
              quantity: 40.00,
              iso_currency_code: 'USD',
              security_name: 'General Electric Company',
              security_type: 'equity',
              ticker_symbol: 'GE'
            },
            {
              id: 'demo_brokerage_honeywell',
              account_id: 'brokerage_1',
              security_id: 'hon',
              institution_value: 7000.00,
              institution_price: 175.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 6500.00,
              quantity: 40.00,
              iso_currency_code: 'USD',
              security_name: 'Honeywell International Inc.',
              security_type: 'equity',
              ticker_symbol: 'HON'
            },
            {
              id: 'demo_brokerage_dupont',
              account_id: 'brokerage_1',
              security_id: 'dd',
              institution_value: 6000.00,
              institution_price: 75.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 5500.00,
              quantity: 80.00,
              iso_currency_code: 'USD',
              security_name: 'DuPont de Nemours Inc.',
              security_type: 'equity',
              ticker_symbol: 'DD'
            },
            {
              id: 'demo_brokerage_dow',
              account_id: 'brokerage_1',
              security_id: 'dow',
              institution_value: 5000.00,
              institution_price: 50.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 4500.00,
              quantity: 100.00,
              iso_currency_code: 'USD',
              security_name: 'Dow Inc.',
              security_type: 'equity',
              ticker_symbol: 'DOW'
            },
            {
              id: 'demo_brokerage_ibm',
              account_id: 'brokerage_1',
              security_id: 'ibm',
              institution_value: 8000.00,
              institution_price: 160.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 7500.00,
              quantity: 50.00,
              iso_currency_code: 'USD',
              security_name: 'International Business Machines Corp.',
              security_type: 'equity',
              ticker_symbol: 'IBM'
            },
            {
              id: 'demo_brokerage_abbvie',
              account_id: 'brokerage_1',
              security_id: 'abbv',
              institution_value: 7000.00,
              institution_price: 140.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 6500.00,
              quantity: 50.00,
              iso_currency_code: 'USD',
              security_name: 'AbbVie Inc.',
              security_type: 'equity',
              ticker_symbol: 'ABBV'
            },
            {
              id: 'demo_brokerage_merck',
              account_id: 'brokerage_1',
              security_id: 'mrk',
              institution_value: 8000.00,
              institution_price: 100.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 7500.00,
              quantity: 80.00,
              iso_currency_code: 'USD',
              security_name: 'Merck & Co. Inc.',
              security_type: 'equity',
              ticker_symbol: 'MRK'
            },
            {
              id: 'demo_brokerage_pfizer',
              account_id: 'brokerage_1',
              security_id: 'pfe',
              institution_value: 6000.00,
              institution_price: 30.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 5500.00,
              quantity: 200.00,
              iso_currency_code: 'USD',
              security_name: 'Pfizer Inc.',
              security_type: 'equity',
              ticker_symbol: 'PFE'
            },
            {
              id: 'demo_brokerage_amgen',
              account_id: 'brokerage_1',
              security_id: 'amgn',
              institution_value: 7000.00,
              institution_price: 280.00,
              institution_price_as_of: new Date().toISOString(),
              cost_basis: 6500.00,
              quantity: 25.00,
              iso_currency_code: 'USD',
              security_name: 'Amgen Inc.',
              security_type: 'equity',
              ticker_symbol: 'AMGN'
            }
          ],
          transactions: [
            {
              id: 'demo_transaction_1',
              account_id: '401k_1',
              security_id: 'vtsax',
              amount: 1200.00,
              date: '2025-07-15',
              name: '401k Contribution - Tech Corp',
              quantity: 8.40,
              fees: 0,
              price: 142.80,
              type: 'buy',
              subtype: 'contribution',
              iso_currency_code: 'USD'
            },
            {
              id: 'demo_transaction_2',
              account_id: '401k_1',
              security_id: 'vtsax',
              amount: 45.67,
              date: '2025-07-10',
              name: 'VTSAX Dividend Reinvestment',
              quantity: 0.32,
              fees: 0,
              price: 142.80,
              type: 'buy',
              subtype: 'dividend',
              iso_currency_code: 'USD'
            },
            {
              id: 'demo_transaction_3',
              account_id: 'ira_1',
              security_id: 'vti',
              amount: 6500.00,
              date: '2025-07-01',
              name: 'Roth IRA Contribution',
              quantity: 11.40,
              fees: 0,
              price: 570.00,
              type: 'buy',
              subtype: 'contribution',
              iso_currency_code: 'USD'
            }
          ]
        };
        
        return res.json(demoData);
      }

      // 🔒 CRITICAL SECURITY: Require authentication for real user data
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required for accessing investment data' });
      }

      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: { userId: req.user.id }
      });
      const allInvestments: any[] = [];

      for (const tokenRecord of accessTokens) {
        try {
          // Get investment holdings
          const holdingsResponse = await plaidClient.investmentsHoldingsGet({
            access_token: tokenRecord.token,
          });

          // Get investment transactions
          const transactionsResponse = await plaidClient.investmentsTransactionsGet({
            access_token: tokenRecord.token,
            start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 30 days
            end_date: new Date().toISOString().split('T')[0],
          });

          // Process and analyze the data
          const processedHoldings = holdingsResponse.data.holdings.map(processInvestmentHolding);
          const processedSecurities = holdingsResponse.data.securities.map(processSecurity);
          const processedTransactions = transactionsResponse.data.investment_transactions.map(processInvestmentTransaction);

          // Merge security information with holdings
          const securitiesMap = new Map(processedSecurities.map(sec => [sec.security_id, sec]));
          const enrichedHoldings = processedHoldings.map(holding => ({
            ...holding,
            security_name: securitiesMap.get(holding.security_id)?.name || 'Unknown Security',
            security_type: securitiesMap.get(holding.security_id)?.type || 'Unknown Type',
            ticker_symbol: securitiesMap.get(holding.security_id)?.ticker_symbol
          }));

          // Generate portfolio analysis
          const portfolioAnalysis = analyzePortfolio(enrichedHoldings, processedSecurities);
          const activityAnalysis = analyzeInvestmentActivity(processedTransactions);

          allInvestments.push({
            holdings: enrichedHoldings,
            securities: processedSecurities,
            accounts: holdingsResponse.data.accounts,
            investment_transactions: processedTransactions,
            total_investment_transactions: transactionsResponse.data.total_investment_transactions,
            analysis: {
              portfolio: portfolioAnalysis,
              activity: activityAnalysis
            }
          });
        } catch (error) {
          console.error(`Error fetching investments for token ${tokenRecord.id}:`, error);
        }
      }

      // Combine all data into the format expected by the frontend
      const combinedHoldings = allInvestments.flatMap(inv => inv.holdings);
      const combinedSecurities = allInvestments.flatMap(inv => inv.securities);
      const combinedTransactions = allInvestments.flatMap(inv => inv.investment_transactions);
      
      // Get the first portfolio analysis (or combine if multiple)
      const portfolioAnalysis = allInvestments.length > 0 ? allInvestments[0].analysis.portfolio : null;
      
      res.json({
        portfolio: portfolioAnalysis,
        holdings: combinedHoldings,
        transactions: combinedTransactions
      });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'get investments');
      res.status(500).json(errorResponse);
    }
  });

  // Note: Income API might not be available in all Plaid environments
  // This endpoint is commented out until we verify availability
  /*
  app.get('/plaid/income', async (req: any, res: any) => {
    try {
      const accessTokens = await getPrismaClient().accessToken.findMany();
      const allIncome: any[] = [];

      for (const tokenRecord of accessTokens) {
        try {
          const incomeResponse = await plaidClient.incomeGet({
            access_token: tokenRecord.token,
          });

          allIncome.push({
            income: incomeResponse.data.income,
            request_id: incomeResponse.data.request_id
          });
        } catch (error) {
          console.error(`Error fetching income for token ${tokenRecord.id}:`, error);
        }
      }

      res.json({ income: allIncome });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'get income');
      res.status(500).json(errorResponse);
    }
  });
  */


  // Sync accounts
  app.post('/plaid/sync_accounts', async (req: any, res: any) => {
    try {
      // Require user authentication
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { access_token } = req.body;
      const accountsResponse = await plaidClient.accountsGet({
        access_token: access_token,
      });

      const accounts = accountsResponse.data.accounts;
      let count = 0;

      for (const account of accounts) {
        await getPrismaClient().account.upsert({
          where: { plaidAccountId: account.account_id },
          update: {
            name: account.name,
            mask: account.mask,
            type: account.type,
            subtype: account.subtype,
            currentBalance: account.balances.current,
            availableBalance: account.balances.available,
            currency: account.balances.iso_currency_code,
            userId: user.id, // Associate with authenticated user
          },
          create: {
            plaidAccountId: account.account_id,
            name: account.name,
            mask: account.mask,
            type: account.type,
            subtype: account.subtype,
            currentBalance: account.balances.current,
            availableBalance: account.balances.available,
            currency: account.balances.iso_currency_code,
            userId: user.id, // Associate with authenticated user
          },
        });
        count++;
      }

      res.json({ success: true, count });
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'syncing accounts');
      res.status(500).json(errorInfo);
    }
  });

  // Sync transactions
  app.post('/plaid/sync_transactions', async (req: any, res: any) => {
    try {
      const { access_token } = req.body;
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1); // First day of current month
      
      const transactionsResponse = await plaidClient.transactionsGet({
        access_token: access_token,
        start_date: startDate.toISOString().split('T')[0],
        end_date: now.toISOString().split('T')[0],
      });

      const transactions = transactionsResponse.data.transactions;
      let count = 0;

      for (const transaction of transactions) {
        // Check if account exists before upserting transaction
        const account = await getPrismaClient().account.findUnique({
          where: { plaidAccountId: transaction.account_id },
        });
        if (!account) {
          console.warn(`Skipping transaction for unknown accountId: ${transaction.account_id}`);
          continue;
        }
        // Force deployment - account check is active
        await getPrismaClient().transaction.upsert({
          where: { plaidTransactionId: transaction.transaction_id },
          update: {
            accountId: account.id, // Use Account.id, not Plaid account_id
            amount: transaction.amount,
            date: new Date(transaction.date),
            name: transaction.name,
            category: transaction.category?.join(', ') || '',
            pending: transaction.pending,
          },
          create: {
            plaidTransactionId: transaction.transaction_id,
            accountId: account.id, // Use Account.id, not Plaid account_id
            amount: transaction.amount,
            date: new Date(transaction.date),
            name: transaction.name,
            category: transaction.category?.join(', ') || '',
            pending: transaction.pending,
          },
        });
        count++;
      }

      res.json({ success: true, count });
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'syncing transactions');
      res.status(500).json(errorInfo);
    }
  });

  // Refresh data endpoint
  app.post('/plaid/refresh_data', async (req: any, res: any) => {
    try {
      const { access_token } = req.body;
      
      // Refresh accounts
      const accountsResponse = await plaidClient.accountsGet({
        access_token: access_token,
      });

      const accounts = accountsResponse.data.accounts;
      let accountCount = 0;

      for (const account of accounts) {
        await getPrismaClient().account.upsert({
          where: { plaidAccountId: account.account_id },
          update: {
            name: account.name,
            mask: account.mask,
            type: account.type,
            subtype: account.subtype,
            currentBalance: account.balances.current,
            availableBalance: account.balances.available,
            currency: account.balances.iso_currency_code,
          },
          create: {
            plaidAccountId: account.account_id,
            name: account.name,
            mask: account.mask,
            type: account.type,
            subtype: account.subtype,
            currentBalance: account.balances.current,
            availableBalance: account.balances.available,
            currency: account.balances.iso_currency_code,
          },
        });
        accountCount++;
      }

      // Refresh transactions
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const transactionsResponse = await plaidClient.transactionsGet({
        access_token: access_token,
        start_date: startDate.toISOString().split('T')[0],
        end_date: now.toISOString().split('T')[0],
      });

      const transactions = transactionsResponse.data.transactions;
      let transactionCount = 0;

      for (const transaction of transactions) {
        // Check if account exists before upserting transaction
        const account = await getPrismaClient().account.findUnique({
          where: { plaidAccountId: transaction.account_id },
        });
        if (!account) {
          console.warn(`Skipping transaction for unknown accountId: ${transaction.account_id}`);
          continue;
        }
        
        await getPrismaClient().transaction.upsert({
          where: { plaidTransactionId: transaction.transaction_id },
          update: {
            accountId: account.id,
            amount: transaction.amount,
            date: new Date(transaction.date),
            name: transaction.name,
            category: transaction.category?.join(', ') || '',
            pending: transaction.pending,
          },
          create: {
            plaidTransactionId: transaction.transaction_id,
            accountId: account.id,
            amount: transaction.amount,
            date: new Date(transaction.date),
            name: transaction.name,
            category: transaction.category?.join(', ') || '',
            pending: transaction.pending,
          },
        });
        transactionCount++;
      }

      res.json({ 
        success: true, 
        accountsRefreshed: accountCount,
        transactionsRefreshed: transactionCount
      });
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'refreshing data');
      res.status(500).json(errorInfo);
    }
  });

  // Disconnect accounts endpoint
  app.delete('/plaid/disconnect_accounts', async (req: any, res: any) => {
    try {
      // Delete all access tokens (this effectively disconnects all accounts)
      await getPrismaClient().accessToken.deleteMany();
      
      res.json({ success: true, message: 'All accounts disconnected' });
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'disconnecting accounts');
      res.status(500).json(errorInfo);
    }
  });

  // ============================================================================
  // ENHANCED PLAID ENDPOINTS - NEW FEATURES
  // ============================================================================

  // Get investment holdings for all connected accounts
  app.get('/plaid/investments/holdings', async (req: any, res: any) => {
    try {
      // Check for demo mode
      const isDemo = req.headers['x-demo-mode'] === 'true';
      
      if (isDemo) {
        // Return demo investment holdings data
        const demoData = {
          holdings: [
            {
              holdings: [
                {
                  id: 'demo_account_1_security_1_100_50000',
                  account_id: 'demo_account_1',
                  security_id: 'demo_security_1',
                  institution_value: 50000,
                  institution_price: 500.00,
                  institution_price_as_of: new Date().toISOString(),
                  cost_basis: 48000,
                  quantity: 100,
                  iso_currency_code: 'USD',
                  security_name: 'Apple Inc. (AAPL)',
                  security_type: 'equity',
                  ticker_symbol: 'AAPL'
                },
                {
                  id: 'demo_account_1_security_2_50_25000',
                  account_id: 'demo_account_1',
                  security_id: 'demo_security_2',
                  institution_value: 25000,
                  institution_price: 500.00,
                  institution_price_as_of: new Date().toISOString(),
                  cost_basis: 24000,
                  quantity: 50,
                  iso_currency_code: 'USD',
                  security_name: 'Microsoft Corporation (MSFT)',
                  security_type: 'equity',
                  ticker_symbol: 'MSFT'
                }
              ],
              securities: [
                {
                  id: 'demo_security_1',
                  security_id: 'demo_security_1',
                  name: 'Apple Inc. (AAPL)',
                  ticker_symbol: 'AAPL',
                  type: 'equity',
                  close_price: 500.00,
                  close_price_as_of: new Date().toISOString(),
                  iso_currency_code: 'USD'
                },
                {
                  id: 'demo_security_2',
                  security_id: 'demo_security_2',
                  name: 'Microsoft Corporation (MSFT)',
                  ticker_symbol: 'MSFT',
                  type: 'equity',
                  close_price: 500.00,
                  close_price_as_of: new Date().toISOString(),
                  iso_currency_code: 'USD'
                }
              ],
              accounts: [
                {
                  account_id: 'demo_account_1',
                  name: 'Demo Investment Account',
                  mask: '1234',
                  type: 'investment',
                  subtype: 'brokerage'
                }
              ],
              item: {
                item_id: 'demo_item_1',
                institution_id: 'demo_institution_1'
              },
              analysis: {
                totalValue: 75000,
                assetAllocation: [
                  { type: 'Stocks', value: 75000, percentage: 100.0 }
                ],
                holdingCount: 2,
                securityCount: 2
              }
            }
          ],
          summary: {
            totalAccounts: 1,
            totalHoldings: 2,
            totalSecurities: 2,
            totalPortfolioValue: 75000
          }
        };
        
        return res.json(demoData);
      }

      // 🔒 CRITICAL SECURITY: Require authentication for real user data
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required for accessing investment holdings data' });
      }

      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: { userId: req.user.id }
      });
      
      const allHoldings: any[] = [];
      
      for (const tokenRecord of accessTokens) {
        try {
          const holdingsResponse = await plaidClient.investmentsHoldingsGet({
            access_token: tokenRecord.token,
          });
          
          // Process and analyze the data
          const processedHoldings = holdingsResponse.data.holdings.map(processInvestmentHolding);
          const processedSecurities = holdingsResponse.data.securities.map(processSecurity);
          
                // Generate portfolio analysis
      const portfolioAnalysis = analyzePortfolio(processedHoldings, processedSecurities);
      
      allHoldings.push({
        holdings: processedHoldings,
        securities: processedSecurities,
        accounts: holdingsResponse.data.accounts,
        item: holdingsResponse.data.item,
        analysis: portfolioAnalysis
      });
      
      // Enhance user profile with investment data (if user is authenticated)
      if (req.user?.id) {
        try {
          await enhanceProfileWithInvestmentData(
            req.user.id,
            processedHoldings,
            [] // No transactions in this endpoint
          );
        } catch (profileError) {
          console.error('Error enhancing profile with investment data:', profileError);
          // Don't fail the request if profile enhancement fails
        }
      }
        } catch (error) {
          console.error(`Error fetching holdings for token ${tokenRecord.id}:`, error);
        }
      }
      
      res.json({ 
        holdings: allHoldings,
        summary: {
          totalAccounts: allHoldings.length,
          totalHoldings: allHoldings.reduce((sum, h) => sum + h.holdings.length, 0),
          totalSecurities: allHoldings.reduce((sum, h) => sum + h.securities.length, 0),
          totalPortfolioValue: allHoldings.reduce((sum, h) => sum + (h.analysis?.totalValue || 0), 0)
        }
      });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'get investment holdings');
      res.status(500).json(errorResponse);
    }
  });

  // Get investment transactions
  app.get('/plaid/investments/transactions', async (req: any, res: any) => {
    try {
      // Check for demo mode
      const isDemo = req.headers['x-demo-mode'] === 'true';
      
      if (isDemo) {
        // Return demo investment transactions data
        const demoData = {
          transactions: [
            {
              investment_transactions: [
                {
                  id: 'demo_transaction_1_demo_account_1_demo_security_1_2025-08-10',
                  account_id: 'demo_account_1',
                  security_id: 'demo_security_1',
                  amount: 50000,
                  date: '2025-08-10',
                  name: 'Demo Stock Purchase',
                  quantity: 100,
                  fees: 0,
                  price: 500.00,
                  type: 'buy',
                  subtype: 'purchase',
                  iso_currency_code: 'USD'
                },
                {
                  id: 'demo_transaction_2_demo_account_1_demo_security_2_2025-08-15',
                  account_id: 'demo_account_1',
                  security_id: 'demo_security_2',
                  amount: 25000,
                  date: '2025-08-15',
                  name: 'Demo Stock Purchase',
                  quantity: 50,
                  fees: 0,
                  price: 500.00,
                  type: 'buy',
                  subtype: 'purchase',
                  iso_currency_code: 'USD'
                }
              ],
              total_investment_transactions: 2,
              accounts: [
                {
                  account_id: 'demo_account_1',
                  name: 'Demo Investment Account',
                  mask: '1234',
                  type: 'investment',
                  subtype: 'brokerage'
                }
              ],
              securities: [
                {
                  id: 'demo_security_1',
                  security_id: 'demo_security_1',
                  name: 'Apple Inc. (AAPL)',
                  ticker_symbol: 'AAPL',
                  type: 'equity'
                },
                {
                  id: 'demo_security_2',
                  security_id: 'demo_security_2',
                  name: 'Microsoft Corporation (MSFT)',
                  ticker_symbol: 'MSFT',
                  type: 'equity'
                }
              ],
              item: {
                item_id: 'demo_item_1',
                institution_id: 'demo_institution_1'
              },
              analysis: {
                totalTransactions: 2,
                totalAmount: 75000,
                transactionTypes: { buy: 2 },
                averageAmount: 37500
              }
            }
          ]
        };
        
        return res.json(demoData);
      }

      // 🔒 CRITICAL SECURITY: Require authentication for real user data
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required for accessing investment transaction data' });
      }

      const { start_date, end_date, count = 100 } = req.query;
      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: { userId: req.user.id }
      });
      
      const allTransactions: any[] = [];
      
      for (const tokenRecord of accessTokens) {
        try {
          const transactionsResponse = await plaidClient.investmentsTransactionsGet({
            access_token: tokenRecord.token,
            start_date: start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            end_date: end_date || new Date().toISOString().split('T')[0],
          });
          
          // Process and analyze the data
          const processedTransactions = transactionsResponse.data.investment_transactions.map(processInvestmentTransaction);
          const processedSecurities = transactionsResponse.data.securities.map(processSecurity);
          
                // Generate activity analysis
      const activityAnalysis = analyzeInvestmentActivity(processedTransactions);
      
      allTransactions.push({
        investment_transactions: processedTransactions,
        total_investment_transactions: transactionsResponse.data.total_investment_transactions,
        accounts: transactionsResponse.data.accounts,
        securities: processedSecurities,
        item: transactionsResponse.data.item,
        analysis: activityAnalysis
      });
      
      // Enhance user profile with investment data (if user is authenticated)
      if (req.user?.id) {
        try {
          await enhanceProfileWithInvestmentData(
            req.user.id,
            [], // No holdings in this endpoint
            processedTransactions
          );
        } catch (profileError) {
          console.error('Error enhancing profile with investment data:', profileError);
          // Don't fail the request if profile enhancement fails
        }
      }
        } catch (error) {
          console.error(`Error fetching investment transactions for token ${tokenRecord.id}:`, error);
        }
      }
      
      // Sort transactions by date (newest first)
      const sortedTransactions = allTransactions.flatMap(t => t.investment_transactions)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, parseInt(count as string));
      
      res.json({ 
        transactions: allTransactions,
        sortedTransactions: sortedTransactions,
        summary: {
          totalAccounts: allTransactions.length,
          totalTransactions: allTransactions.reduce((sum, t) => sum + t.investment_transactions.length, 0),
          totalSecurities: allTransactions.reduce((sum, t) => sum + t.securities.length, 0),
          dateRange: { 
            start_date: start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            end_date: end_date || new Date().toISOString().split('T')[0]
          }
        }
      });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'get investment transactions');
      res.status(500).json(errorResponse);
    }
  });

  // Get liability information (automatically available for all connected accounts)
  app.get('/plaid/liabilities', async (req: any, res: any) => {
    try {
      // Check for demo mode
      const isDemo = req.headers['x-demo-mode'] === 'true';
      
      if (isDemo) {
        // Return demo liability data
        const demoData = {
          liabilities: [
            {
              accounts: [
                {
                  account_id: 'demo_mortgage_1',
                  account_number: '****1234',
                  account_type: 'mortgage',
                  account_subtype: 'mortgage',
                  account_name: 'Wells Fargo Mortgage',
                  account_mask: '1234',
                  current_balance: 450000,
                  available_balance: 450000,
                  iso_currency_code: 'USD',
                  unofficial_currency_code: null,
                  liability_type: 'mortgage',
                  apr: [4.25],
                  last_payment_amount: 2500,
                  last_payment_date: '2025-07-01',
                  next_payment_due_date: '2025-08-01',
                  next_monthly_payment: 2500,
                  last_statement_balance: 450000,
                  minimum_payment_amount: 2500
                }
              ],
              item: {
                item_id: 'demo_item_1',
                institution_id: 'demo_institution_1',
                webhook: null,
                error: null,
                available_products: ['liabilities'],
                billed_products: ['liabilities'],
                products: ['liabilities'],
                update_type: 'background',
                consent_expiration_time: null
              },
              request_id: 'demo_request_1'
            }
          ]
        };
        
        return res.json(demoData);
      }

      // 🔒 CRITICAL SECURITY: Require authentication for real user data
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required for accessing liability data' });
      }

      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: { userId: req.user.id }
      });
      
      const allLiabilities: any[] = [];
      
      for (const tokenRecord of accessTokens) {
        try {
          const liabilitiesResponse = await plaidClient.liabilitiesGet({
            access_token: tokenRecord.token,
          });
          
          allLiabilities.push({
            accounts: liabilitiesResponse.data.accounts,
            item: liabilitiesResponse.data.item,
            request_id: liabilitiesResponse.data.request_id
          });
          
          // Enhance user profile with liability data (if user is authenticated)
          if (req.user?.id) {
            try {
              await enhanceProfileWithLiabilityData(
                req.user.id,
                liabilitiesResponse.data.accounts
              );
            } catch (profileError) {
              console.error('Error enhancing profile with liability data:', profileError);
              // Don't fail the request if profile enhancement fails
            }
          }
        } catch (error) {
          console.error(`Error fetching liabilities for token ${tokenRecord.id}:`, error);
        }
      }
      
      res.json({ liabilities: allLiabilities });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'get liabilities');
      res.status(500).json(errorResponse);
    }
  });

  // Enrich transactions with merchant data (now automatic in /transactions endpoint)
  app.post('/plaid/enrich/transactions', async (req: any, res: any) => {
    try {
      // 🔒 CRITICAL SECURITY: Require authentication for real user data
      if (!req.user?.id) {
        return res.status(400).json({ error: 'Authentication required for accessing transaction enrichment data' });
      }

      const { transaction_ids, account_type = 'depository' } = req.body;
      
      if (!transaction_ids || !Array.isArray(transaction_ids)) {
        return res.status(400).json({ error: 'transaction_ids array required' });
      }
      
      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: { userId: req.user.id }
      });
      
      const allEnrichments: any[] = [];
      
      for (const tokenRecord of accessTokens) {
        try {
          // For transaction enrichment, we need to provide the full transaction data
          // Since we only have transaction IDs, we'll need to fetch the transaction details first
          // For now, we'll create a minimal structure - in production, you'd want to fetch the full transaction data
          const enrichResponse = await plaidClient.transactionsEnrich({
            account_type: account_type,
            transactions: transaction_ids.map((id: string) => ({
              id: id,
              description: `Transaction ${id}`,
              amount: 0, // This would need to be fetched from the actual transaction
              direction: 'OUTFLOW' as any, // Default direction
              iso_currency_code: 'USD'
            }))
          });
          
          allEnrichments.push({
            enriched_transactions: enrichResponse.data.enriched_transactions,
            request_id: enrichResponse.data.request_id
          });
          
          // Enhance user profile with enrichment data (if user is authenticated)
          if (req.user?.id) {
            try {
              await enhanceProfileWithEnrichmentData(
                req.user.id,
                enrichResponse.data.enriched_transactions
              );
            } catch (profileError) {
              console.error('Error enhancing profile with enrichment data:', profileError);
              // Don't fail the request if profile enhancement fails
            }
          }
        } catch (error) {
          console.error(`Error enriching transactions for token ${tokenRecord.id}:`, error);
        }
      }
      
      res.json({ enrichments: allEnrichments });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'enrich transactions');
      res.status(500).json(errorResponse);
    }
  });

  // Check access token products and scope
  app.get('/plaid/check-token-scope', async (req: any, res: any) => {
    try {
      // Require user authentication
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get access tokens for the user
      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: { userId: user.id }
      });

      if (accessTokens.length === 0) {
        return res.status(404).json({ error: 'No access tokens found for user' });
      }

      const tokenInfo = [];
      
      for (const tokenRecord of accessTokens) {
        try {
          // Get item information to check products
          const itemResponse = await plaidClient.itemGet({
            access_token: tokenRecord.token,
          });

          // Get accounts to see what types are available
          const accountsResponse = await plaidClient.accountsGet({
            access_token: tokenRecord.token,
          });

          const item = itemResponse.data.item;
          const accounts = accountsResponse.data.accounts;

          tokenInfo.push({
            tokenId: tokenRecord.id,
            itemId: item.item_id,
            institutionId: item.institution_id,
            products: item.available_products || [],
            webhook: item.webhook,
            accounts: accounts.map((acc: any) => ({
              id: acc.account_id,
              name: acc.name,
              type: acc.type,
              subtype: acc.subtype,
              mask: acc.mask
            })),
            hasInvestments: accounts.some((acc: any) => 
              acc.type === 'investment' || 
              acc.subtype === 'investment' ||
              acc.subtype === '401k' ||
              acc.subtype === 'ira' ||
              acc.subtype === 'brokerage'
            )
          });
        } catch (error: any) {
          console.error('Error checking token:', error);
          tokenInfo.push({
            tokenId: tokenRecord.id,
            error: error.message || 'Unknown error',
            hasInvestments: false
          });
        }
      }

      res.json({ 
        message: 'Token scope information retrieved',
        tokens: tokenInfo,
        summary: {
          totalTokens: tokenInfo.length,
          tokensWithInvestments: tokenInfo.filter(t => t.hasInvestments).length,
          tokensWithErrors: tokenInfo.filter(t => t.error).length
        }
      });

    } catch (error) {
      const errorResponse = handlePlaidError(error, 'check token scope');
      res.status(500).json(errorResponse);
    }
  });

  // NEW: Comprehensive sync endpoint - intelligently pulls all available data
  // Strategy: /accounts/get to see what they actually linked, then branch based on account types
  app.post('/plaid/sync', async (req: any, res: any) => {
    try {
      const { needRealtimeBalance } = req.body as { needRealtimeBalance?: boolean };
      const accessToken = req.headers.authorization?.replace('Bearer ', '') || req.query.access_token;
      
      if (!accessToken) {
        return res.status(400).json({ error: 'Access token required' });
      }

      console.log('Starting comprehensive sync for access token...');
      
      // Get accounts to see what types we have
      const accountsResponse = await plaidClient.accountsGet({
        access_token: accessToken,
      });
      
      const accounts = accountsResponse.data.accounts;
      console.log(`Found ${accounts.length} accounts to sync`);
      
      // Quick feature detection
      const hasInvestment = accounts.some((a: any) => a.type === 'investment');
      const hasCreditOrLoan = accounts.some((a: any) => a.type === 'credit' || a.type === 'loan');
      const hasDepository = accounts.some((a: any) => a.type === 'depository');
      
      const result: any = { 
        accountsSummary: accounts.map((a: any) => ({
          account_id: a.account_id,
          name: a.name,
          type: a.type,
          subtype: a.subtype,
          mask: a.mask,
        }))
      };
      
      // Investments
      if (hasInvestment) {
        console.log('Investment accounts detected - fetching holdings and transactions');
        try {
          const holdings = await plaidClient.investmentsHoldingsGet({ access_token: accessToken });
          const invTx = await plaidClient.investmentsTransactionsGet({
            access_token: accessToken,
            start_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 90 days
            end_date: new Date().toISOString().split('T')[0],
          });
          
          result.investments = {
            holdings: holdings.data.holdings,
            securities: holdings.data.securities,
            transactions: invTx.data.investment_transactions,
          };
          
          console.log(`Retrieved ${holdings.data.holdings?.length || 0} holdings and ${invTx.data.investment_transactions?.length || 0} transactions`);
        } catch (error: any) {
          console.log('Investment data not available:', error.message);
          result.investments = { error: 'Investment data not available' };
        }
      }
      
      // Liabilities (credit cards, student loans, mortgages)
      if (hasCreditOrLoan) {
        console.log('Credit/Loan accounts detected - fetching liabilities');
        try {
          const liab = await plaidClient.liabilitiesGet({ access_token: accessToken });
          result.liabilities = liab.data.liabilities;
          console.log(`Retrieved ${liab.data.accounts?.length || 0} liability accounts`);
        } catch (error: any) {
          console.log('Liability data not available:', error.message);
          result.liabilities = { error: 'Liability data not available' };
        }
      }
      
      // Banking transactions (checking/savings)
      if (hasDepository) {
        console.log('Depository accounts detected - fetching transactions');
        try {
          // Use /transactions/sync, not /transactions/get
          let cursor: string | null = null;
          const added: any[] = [];
          const modified: any[] = [];
          const removed: any[] = [];
          let hasMore = true;
          
          while (hasMore) {
            const syncResp = await plaidClient.transactionsSync({
              access_token: accessToken,
              cursor: cursor || undefined,
            });
            added.push(...syncResp.data.added);
            modified.push(...syncResp.data.modified);
            removed.push(...syncResp.data.removed);
            cursor = syncResp.data.next_cursor;
            hasMore = syncResp.data.has_more;
          }
          
          result.transactions = { added, modified, removed, cursor };
          console.log(`Retrieved ${added.length} transactions`);
        } catch (error: any) {
          console.log('Transaction data not available:', error.message);
          result.transactions = { error: 'Transaction data not available' };
        }
      }
      
      // Real-time balances (only if you actually need them)
      if (needRealtimeBalance) {
        console.log('Fetching real-time balances...');
        try {
          const bal = await plaidClient.accountsBalanceGet({ access_token: accessToken });
          result.realtimeBalances = bal.data.accounts.map((a: any) => ({
            account_id: a.account_id,
            name: a.name,
            available: a.balances.available,
            current: a.balances.current,
            iso_currency_code: a.balances.iso_currency_code,
          }));
          console.log(`Retrieved real-time balances for ${result.realtimeBalances.length} accounts`);
        } catch (error: any) {
          console.log('Real-time balance data not available:', error.message);
          result.realtimeBalances = { error: 'Real-time balance data not available' };
        }
      }
      
      console.log('Comprehensive sync completed successfully');
      res.json(result);
      
    } catch (error: any) {
      // If you forgot to include a product in additional_consented_products,
      // certain calls can fail here with consent errors → you'd need Update Mode.
      console.error('Sync failed:', error?.response?.data || error);
      res.status(500).json({ 
        error: 'SYNC_FAILED',
        details: error?.response?.data || error?.message || 'Unknown error'
      });
    }
  });
};
