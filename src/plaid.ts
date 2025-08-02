import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { PrismaClient } from '@prisma/client';

// Initialize Prisma client lazily to avoid import issues during ts-node startup
let prisma: PrismaClient | null = null;

const getPrismaClient = () => {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
};

// For testing, use sandbox environment to avoid Data Transparency Messaging requirements
// TODO: Switch back to production once Data Transparency Messaging is properly configured
const useSandbox = false; // Back to production mode

const configuration = new Configuration({
  basePath: useSandbox ? PlaidEnvironments.sandbox : PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

// Log Plaid environment configuration
console.log('Plaid Configuration:', {
  environment: useSandbox ? 'sandbox' : (process.env.PLAID_ENV || 'sandbox'),
  accessLevel: useSandbox ? 'sandbox' : (process.env.PLAID_ACCESS_LEVEL || 'sandbox'),
  hasClientId: !!process.env.PLAID_CLIENT_ID,
  hasSecret: !!process.env.PLAID_SECRET,
  useSandbox: useSandbox
});

const plaidClient = new PlaidApi(configuration);

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
    merchant_name: transaction.merchant_name,
    category: transaction.category,
    category_id: transaction.category_id,
    pending: transaction.pending,
    payment_channel: transaction.payment_channel,
    // Enhanced metadata
    location: transaction.location,
    payment_meta: transaction.payment_meta,
    pending_transaction_id: transaction.pending_transaction_id,
    account_owner: transaction.account_owner,
    transaction_code: transaction.transaction_code
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

export const setupPlaidRoutes = (app: any) => {
  // Create link token
  app.post('/plaid/create_link_token', async (req: any, res: any) => {
    try {
      // Determine available products based on environment
      const isProduction = process.env.PLAID_ENV === 'production';
      const isLimitedProduction = process.env.PLAID_ENV === 'production' && process.env.PLAID_ACCESS_LEVEL === 'limited';
      
      // For limited production, use only Transactions (most compatible)
      // This should work with your limited production access
      let products = [Products.Transactions];
      
      // Only add Balance if we're sure it's available
      if (isLimitedProduction) {
        // Start with just Transactions to test
        products = [Products.Transactions];
        console.log('Using limited production configuration with Transactions only');
        console.log('Note: Limited production access may not work with OAuth institutions like Bank of America');
        console.log('Consider using sandbox mode for testing or request full production access');
      }
      
      // For full production, add more products
      if (isProduction && !isLimitedProduction) {
        products = [
          Products.Transactions,
          Products.Balance,
          Products.Investments,
          Products.Identity,
          Products.Income,
          Products.Liabilities,
          Products.Statements
        ];
        console.log('Using full production configuration');
      }

      const request = {
        user: { client_user_id: 'user-id' },
        client_name: 'Ask Linc',
        products: products,
        country_codes: [CountryCode.Us],
        language: 'en',
        // Add webhook for production
        webhook: isProduction ? process.env.PLAID_WEBHOOK_URL : undefined,
        // Add Link customization name for production (Data Transparency Messaging configured in Dashboard)
        link_customization_name: isProduction ? 'default' : undefined
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
      const accessTokens = await getPrismaClient().accessToken.findMany();
      const allAccounts: any[] = [];

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

          // Merge account and balance data
          const accountsWithBalances = accountsResponse.data.accounts.map((account: any) => {
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

      res.json({ accounts: allAccounts });
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
      const accessTokens = await getPrismaClient().accessToken.findMany();
      const allTransactions: any[] = [];
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

          // Process and add transactions
          const processedTransactions = transactionsResponse.data.transactions.map((transaction: any) => {
            return processTransactionData(transaction);
          });

          allTransactions.push(...processedTransactions);
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

  // Get investment data (if available)
  app.get('/plaid/investments', async (req: any, res: any) => {
    try {
      const accessTokens = await getPrismaClient().accessToken.findMany();
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

          allInvestments.push({
            holdings: holdingsResponse.data.holdings,
            securities: holdingsResponse.data.securities,
            accounts: holdingsResponse.data.accounts,
            investment_transactions: transactionsResponse.data.investment_transactions,
            total_investment_transactions: transactionsResponse.data.total_investment_transactions
          });
        } catch (error) {
          console.error(`Error fetching investments for token ${tokenRecord.id}:`, error);
        }
      }

      res.json({ investments: allInvestments });
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
};
