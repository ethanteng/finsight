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

// Helper function to get Plaid client for demo mode (always sandbox)
const getDemoPlaidClient = () => {
  // Demo mode ALWAYS uses sandbox credentials, regardless of PLAID_MODE setting
  const demoConfiguration = new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, // Always use sandbox credentials
        'PLAID-SECRET': process.env.PLAID_SECRET,       // Always use sandbox credentials
      },
    },
  });
  return new PlaidApi(demoConfiguration);
};

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
  return {
    id: transaction.transaction_id,
    account_id: transaction.account_id,
    amount: transaction.amount,
    date: transaction.date,
    name: transaction.name,
    category: transaction.category || [],
    pending: transaction.pending,
    merchant_name: transaction.merchant_name,
    payment_channel: transaction.payment_channel,
    transaction_type: transaction.transaction_type,
    // Enhanced transaction data fields
    enriched_data: {
      merchant_name: transaction.merchant_name,
      website: transaction.website,
      logo_url: transaction.logo_url,
      primary_color: transaction.primary_color,
      domain: transaction.domain,
      category: transaction.category || [],
      category_id: transaction.category_id,
      brand_logo_url: transaction.brand_logo_url,
      brand_name: transaction.brand_name
    }
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
  // Create link token
  app.post('/plaid/create_link_token', async (req: any, res: any) => {
    try {
      // Check if this is a demo request
      const isDemoRequest = req.headers['x-demo-mode'] === 'true' || req.body.isDemo === true;
      
      // Check if this is an investment-specific request
      const isInvestmentRequest = req.body.productType === 'investments';
      
      // Determine available products based on environment
      const isProduction = plaidMode === 'production';
      const isLimitedProduction = plaidMode === 'production' && process.env.PLAID_ACCESS_LEVEL === 'limited';
      
      // For demo mode, ALWAYS use sandbox regardless of PLAID_MODE setting
      if (isDemoRequest) {
        console.log('Demo mode detected - ALWAYS using sandbox environment for Plaid (ignoring PLAID_MODE)');
        const demoPlaidClient = getDemoPlaidClient();
        
        const request = {
          user: { client_user_id: 'demo-user-id' },
          client_name: 'Ask Linc (Demo)',
          products: [Products.Transactions], // Use only Transactions product
          country_codes: [CountryCode.Us],
          language: 'en',
        };

        console.log('Creating demo link token with sandbox environment');
        const createTokenResponse = await demoPlaidClient.linkTokenCreate(request);
        res.json({ link_token: createTokenResponse.data.link_token });
        return;
      }
      
      // For investment-specific requests, use Investments product
      if (isInvestmentRequest) {
        console.log('Creating investment-specific link token');
        const request = {
          user: { client_user_id: 'user-id' },
          client_name: 'Ask Linc (Investments)',
          products: [Products.Investments], // Use Investments product
          country_codes: [CountryCode.Us],
          language: 'en',
        };

        console.log('Creating investment link token');
        const createTokenResponse = await plaidClient.linkTokenCreate(request);
        res.json({ link_token: createTokenResponse.data.link_token });
        return;
      }
      
      // Note: The regular flow now includes both Transactions and Investments products
      // This ensures all users get access to investment data without needing special requests
      
      // For regular requests, use both Transactions and Investments products
      // This ensures users can access both transaction data and investment data
      let products = [Products.Transactions, Products.Investments];
      
      if (isProduction) {
        console.log('Using production configuration with Transactions + Investments products');
        console.log('Note: Users will have access to both transaction and investment data');
      } else {
        console.log('Using sandbox configuration with Transactions + Investments products');
      }

      const request = {
        user: { client_user_id: 'user-id' },
        client_name: 'Ask Linc',
        products: products,
        country_codes: [CountryCode.Us],
        language: 'en',
        // Remove conflicting configuration options that cause INVALID_CONFIGURATION error
        // webhook: isProduction ? process.env.PLAID_WEBHOOK_URL : undefined,
        // link_customization_name: isProduction ? 'default' : undefined
      };

      console.log(`Creating link token with products: ${products.join(', ')}`);
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
          }
        ];

        return res.json({ accounts: demoAccounts });
      }

      // Real Plaid integration
      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: req.user?.id ? { userId: req.user.id } : {}
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

      // Deduplicate accounts by name and institution to avoid counting the same account multiple times
      const uniqueAccounts = allAccounts.reduce((acc: any[], account: any) => {
        const key = `${account.name}-${account.type}-${account.subtype}`;
        const existing = acc.find(a => `${a.name}-${a.type}-${a.subtype}` === key);
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
            }
          }
        ];

        // Filter by date range if provided
        const endDate = req.query.end_date || new Date().toISOString().split('T')[0];
        const startDate = req.query.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const filteredTransactions = demoTransactions.filter(t => 
          t.date >= startDate && t.date <= endDate
        );

        // Sort by date (newest first)
        filteredTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Limit to requested count
        const count = parseInt(req.query.count as string) || 100;
        const limitedTransactions = filteredTransactions.slice(0, count);

        return res.json({
          transactions: limitedTransactions,
          total: filteredTransactions.length,
          requested: count,
          dateRange: { start_date: startDate, end_date: endDate }
        });
      }

      // Real Plaid integration
      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: req.user?.id ? { userId: req.user.id } : {}
      });
      const allTransactions: any[] = [];
      const seenTransactionIds = new Set<string>();
      const { start_date, end_date, count = 100 } = req.query;

      // Default to last 30 days if no dates provided
      const endDate = end_date || new Date().toISOString().split('T')[0];
      const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      console.log(`Fetching transactions from ${startDate} to ${endDate}, limit: ${count}`);

      for (const tokenRecord of accessTokens) {
        try {
          // Get transactions for this token
          const transactionsResponse = await plaidClient.transactionsGet({
            access_token: tokenRecord.token,
            start_date: startDate,
            end_date: endDate,
            options: {
              count: parseInt(count as string),
              include_personal_finance_category: true
            }
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
            const enrichResponse = await plaidClient.transactionsEnrich({
              account_type: 'depository',
              transactions: transactionsResponse.data.transactions.map((t: any) => ({
                id: t.transaction_id,
                description: t.name,
                amount: t.amount,
                direction: t.amount > 0 ? 'INFLOW' as any : 'OUTFLOW' as any,
                iso_currency_code: t.iso_currency_code || 'USD'
              }))
            });

            // Merge enriched data with processed transactions
            const enrichedTransactions = processedTransactions.map((transaction, index) => {
              const enrichedTransaction = enrichResponse.data.enriched_transactions[index];
              if (enrichedTransaction) {
                return {
                  ...transaction,
                  enriched_data: {
                    merchant_name: (enrichedTransaction as any).merchant_name || transaction.merchant_name,
                    website: (enrichedTransaction as any).website,
                    logo_url: (enrichedTransaction as any).logo_url,
                    primary_color: (enrichedTransaction as any).primary_color,
                    domain: (enrichedTransaction as any).domain,
                    category: (enrichedTransaction as any).category || transaction.category,
                    category_id: (enrichedTransaction as any).category_id || (transaction as any).category_id,
                    brand_logo_url: (enrichedTransaction as any).brand_logo_url,
                    brand_name: (enrichedTransaction as any).brand_name
                  }
                };
              }
              return transaction;
            });

            allTransactions.push(...enrichedTransactions);
          } catch (enrichError) {
            console.warn(`Error enriching transactions for token ${tokenRecord.id}:`, enrichError);
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

      res.json({ 
        transactions: limitedTransactions,
        total: allTransactions.length,
        requested: parseInt(count as string),
        dateRange: { start_date: startDate, end_date: endDate }
      });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'get transactions');
      res.status(500).json(errorResponse);
    }
  });

  // Get comprehensive investment data (automatically combines holdings and transactions)
  app.get('/plaid/investments', async (req: any, res: any) => {
    try {
      // Check if this is a demo request
      const isDemo = req.headers['x-demo-mode'] === 'true';
      
      if (isDemo) {
        // Return demo investment data
        const demoData = {
          portfolio: {
            totalValue: 619951.34,
            assetAllocation: [
              { type: 'Unknown', value: 619951.34, percentage: 100.0 }
            ],
            holdingCount: 60,
            securityCount: 26
          },
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
          transactions: [
            {
              id: 'demo_transaction_1_demo_account_1_demo_security_1_2024-08-10',
              account_id: 'demo_account_1',
              security_id: 'demo_security_1',
              amount: 50000,
              date: '2024-08-10',
              name: 'Demo Stock Purchase',
              quantity: 100,
              fees: 0,
              price: 500.00,
              type: 'buy',
              subtype: 'purchase',
              iso_currency_code: 'USD'
            }
          ]
        };
        
        return res.json(demoData);
      }

      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: req.user?.id ? { userId: req.user.id } : {}
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
      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: req.user?.id ? { userId: req.user.id } : {}
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
      const { start_date, end_date, count = 100 } = req.query;
      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: req.user?.id ? { userId: req.user.id } : {}
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
      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: req.user?.id ? { userId: req.user.id } : {}
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

  // Get comprehensive investment overview (combines holdings and transactions)
  app.get('/plaid/investments', async (req: any, res: any) => {
    try {
      const { start_date, end_date, count = 100 } = req.query;
      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: req.user?.id ? { userId: req.user.id } : {}
      });
      
      const allInvestments: any[] = [];
      
      for (const tokenRecord of accessTokens) {
        try {
          // Fetch both holdings and transactions
          const [holdingsResponse, transactionsResponse] = await Promise.all([
            plaidClient.investmentsHoldingsGet({
              access_token: tokenRecord.token,
            }),
            plaidClient.investmentsTransactionsGet({
              access_token: tokenRecord.token,
              start_date: start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              end_date: end_date || new Date().toISOString().split('T')[0],
            })
          ]);
          
          // Process the data
          const processedHoldings = holdingsResponse.data.holdings.map(processInvestmentHolding);
          const processedSecurities = holdingsResponse.data.securities.map(processSecurity);
          const processedTransactions = transactionsResponse.data.investment_transactions.map(processInvestmentTransaction);
          
          // Generate comprehensive analysis
          const portfolioAnalysis = analyzePortfolio(processedHoldings, processedSecurities);
          const activityAnalysis = analyzeInvestmentActivity(processedTransactions);
          
          allInvestments.push({
            holdings: processedHoldings,
            securities: processedSecurities,
            investment_transactions: processedTransactions,
            total_investment_transactions: transactionsResponse.data.total_investment_transactions,
            accounts: holdingsResponse.data.accounts,
            item: holdingsResponse.data.item,
            analysis: {
              portfolio: portfolioAnalysis,
              activity: activityAnalysis
            }
          });
          
          // Enhance user profile with comprehensive investment data (if user is authenticated)
          if (req.user?.id) {
            try {
              await enhanceProfileWithInvestmentData(
                req.user.id,
                processedHoldings,
                processedTransactions
              );
            } catch (profileError) {
              console.error('Error enhancing profile with investment data:', profileError);
              // Don't fail the request if profile enhancement fails
            }
          }
        } catch (error) {
          console.error(`Error fetching investments for token ${tokenRecord.id}:`, error);
        }
      }
      
      // Sort transactions by date (newest first)
      const sortedTransactions = allInvestments.flatMap(t => t.investment_transactions)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, parseInt(count as string));
      
      res.json({ 
        investments: allInvestments,
        sortedTransactions: sortedTransactions,
        summary: {
          totalAccounts: allInvestments.length,
          totalHoldings: allInvestments.reduce((sum, inv) => sum + inv.holdings.length, 0),
          totalSecurities: allInvestments.reduce((sum, inv) => sum + inv.securities.length, 0),
          totalTransactions: allInvestments.reduce((sum, inv) => sum + inv.investment_transactions.length, 0),
          totalPortfolioValue: allInvestments.reduce((sum, inv) => sum + (inv.analysis?.portfolio?.totalValue || 0), 0),
          dateRange: { 
            start_date: start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            end_date: end_date || new Date().toISOString().split('T')[0]
          }
        }
      });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'get comprehensive investments');
      res.status(500).json(errorResponse);
    }
  });

  // Enrich transactions with merchant data (now automatic in /transactions endpoint)
  app.post('/plaid/enrich/transactions', async (req: any, res: any) => {
    try {
      const { transaction_ids, account_type = 'depository' } = req.body;
      
      if (!transaction_ids || !Array.isArray(transaction_ids)) {
        return res.status(400).json({ error: 'transaction_ids array required' });
      }
      
      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: req.user?.id ? { userId: req.user.id } : {}
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
};
