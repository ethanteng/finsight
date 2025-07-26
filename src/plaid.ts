import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

export const setupPlaidRoutes = (app: any) => {
  // Create link token
  app.post('/plaid/create_link_token', async (req: any, res: any) => {
    try {
      const request = {
        user: { client_user_id: 'user-id' },
        client_name: 'Linc',
        products: [Products.Auth],
        country_codes: [CountryCode.Us],
        language: 'en',
      };

      const createTokenResponse = await plaidClient.linkTokenCreate(request);
      res.json({ link_token: createTokenResponse.data.link_token });
    } catch (error) {
      console.error('Error creating link token:', error);
      res.status(500).json({ error: 'Failed to create link token' });
    }
  });

  // Exchange public token for access token
  app.post('/plaid/exchange_public_token', async (req: any, res: any) => {
    try {
      const { public_token } = req.body;
      const exchangeResponse = await plaidClient.itemPublicTokenExchange({
        public_token: public_token,
      });
      
      const access_token = exchangeResponse.data.access_token;
      res.json({ access_token });
    } catch (error) {
      console.error('Error exchanging public token:', error);
      res.status(500).json({ error: 'Failed to exchange public token' });
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
        await prisma.account.upsert({
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
      console.error('Error syncing accounts:', error);
      res.status(500).json({ error: 'Failed to sync accounts' });
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
        await prisma.transaction.upsert({
          where: { plaidTransactionId: transaction.transaction_id },
          update: {
            accountId: transaction.account_id,
            amount: transaction.amount,
            date: transaction.date,
            name: transaction.name,
            category: transaction.category?.join(', ') || '',
            pending: transaction.pending,
          },
          create: {
            plaidTransactionId: transaction.transaction_id,
            accountId: transaction.account_id,
            amount: transaction.amount,
            date: transaction.date,
            name: transaction.name,
            category: transaction.category?.join(', ') || '',
            pending: transaction.pending,
          },
        });
        count++;
      }

      res.json({ success: true, count });
    } catch (error) {
      console.error('Error syncing transactions:', error);
      res.status(500).json({ error: 'Failed to sync transactions' });
    }
  });
};
