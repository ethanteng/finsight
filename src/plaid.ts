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

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

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
      const request = {
        user: { client_user_id: 'user-id' },
        client_name: 'Linc',
        products: [Products.Auth, Products.Transactions],
        country_codes: [CountryCode.Us],
        language: 'en',
      };

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
            lastRefreshed: new Date()
          }
        });
      } else {
        // Create a new access token
        console.log(`Creating new token for item ${item_id}`);
        await getPrismaClient().accessToken.create({
          data: { 
            token: access_token,
            itemId: item_id,
            lastRefreshed: new Date()
          }
        });
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
      const accountsResponse = await plaidClient.accountsGet({
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

  // Get accounts from ALL connected access tokens
  app.get('/plaid/all-accounts', async (req: any, res: any) => {
    try {
      // Get all access tokens from the database
      const accessTokens = await getPrismaClient().accessToken.findMany({
        select: { token: true, itemId: true }
      });

      console.log(`Found ${accessTokens.length} access tokens in database`);
      console.log('Item IDs:', accessTokens.map((t: any) => t.itemId).filter(Boolean));

      if (accessTokens.length === 0) {
        return res.json({ accounts: [] });
      }

      let allAccounts: any[] = [];
      const seenAccountKeys = new Set(); // Track unique account combinations

      // Fetch accounts from each access token
      for (const { token } of accessTokens) {
        try {
          const accountsResponse = await plaidClient.accountsGet({
            access_token: token,
          });

          const accounts = accountsResponse.data.accounts.map(account => ({
            id: account.account_id,
            name: account.name,
            type: account.type,
            subtype: account.subtype,
            currentBalance: account.balances.current,
          }));

          // Only add accounts we haven't seen before (deduplicate by name + type + subtype)
          for (const account of accounts) {
            const accountKey = `${account.name}-${account.type}-${account.subtype}`;
            if (!seenAccountKeys.has(accountKey)) {
              seenAccountKeys.add(accountKey);
              allAccounts.push(account);
            }
          }
          
          console.log(`Token ${token.substring(0, 8)}... returned ${accounts.length} accounts`);
        } catch (error) {
          console.error(`Error fetching accounts for token: ${error}`);
          // Continue with other tokens even if one fails
        }
      }

      res.json({ accounts: allAccounts });
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'fetching all accounts');
      res.status(500).json(errorInfo);
    }
  });



  // Sync accounts
  app.post('/plaid/sync_accounts', async (req: any, res: any) => {
    try {
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
};
