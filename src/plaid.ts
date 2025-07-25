import { Application, Request, Response } from 'express';
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || '';
const PLAID_SECRET = process.env.PLAID_SECRET || '';
const PLAID_ENV = (process.env.PLAID_ENV || 'sandbox') as keyof typeof PlaidEnvironments;

const config = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(config);

export function setupPlaidRoutes(app: Application) {
  // Create Plaid Link token
  app.post('/plaid/create_link_token', async (req: Request, res: Response) => {
    try {
      const response = await plaidClient.linkTokenCreate({
        user: { client_user_id: 'user-1' }, // single user for MVP
        client_name: 'Finsight',
        products: [Products.Auth, Products.Transactions],
        country_codes: [CountryCode.Us],
        language: 'en',
      });
      res.json({ link_token: response.data.link_token });
    } catch (err) {
      if (err instanceof Error) {
        res.status(500).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Unknown error' });
      }
    }
  });

  // Exchange public_token for access_token
  app.post('/plaid/exchange_public_token', async (req: Request, res: Response) => {
    const { public_token } = req.body;
    if (!public_token) return res.status(400).json({ error: 'Missing public_token' });
    try {
      const response = await plaidClient.itemPublicTokenExchange({ public_token });
      // For MVP, just return the access_token (in production, store it securely!)
      res.json({ access_token: response.data.access_token, item_id: response.data.item_id });
    } catch (err) {
      if (err instanceof Error) {
        res.status(500).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Unknown error' });
      }
    }
  });

  // Sync Plaid accounts to DB
  app.post('/plaid/sync_accounts', async (req: Request, res: Response) => {
    const { access_token } = req.body;
    if (!access_token) return res.status(400).json({ error: 'Missing access_token' });
    try {
      const response = await plaidClient.accountsGet({ access_token });
      const accounts = response.data.accounts;
      // Upsert accounts
      for (const acct of accounts) {
        await prisma.account.upsert({
          where: { plaidAccountId: acct.account_id },
          update: {
            name: acct.name,
            type: acct.type,
            subtype: acct.subtype,
            mask: acct.mask,
            officialName: acct.official_name,
            currentBalance: acct.balances.current ?? undefined,
            availableBalance: acct.balances.available ?? undefined,
            currency: acct.balances.iso_currency_code ?? undefined,
            // institution_id not present on AccountBase, omit
          },
          create: {
            plaidAccountId: acct.account_id,
            name: acct.name,
            type: acct.type,
            subtype: acct.subtype,
            mask: acct.mask,
            officialName: acct.official_name,
            currentBalance: acct.balances.current ?? undefined,
            availableBalance: acct.balances.available ?? undefined,
            currency: acct.balances.iso_currency_code ?? undefined,
            // institution_id not present on AccountBase, omit
          },
        });
      }
      res.json({ success: true, count: accounts.length });
    } catch (err) {
      if (err instanceof Error) {
        res.status(500).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Unknown error' });
      }
    }
  });

  // Sync Plaid transactions to DB
  app.post('/plaid/sync_transactions', async (req: Request, res: Response) => {
    const { access_token } = req.body;
    if (!access_token) return res.status(400).json({ error: 'Missing access_token' });
    try {
      // Fetch all transactions for the last 30 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 30);
      const response = await plaidClient.transactionsGet({
        access_token,
        start_date: startDate.toISOString().slice(0, 10),
        end_date: endDate.toISOString().slice(0, 10),
      });
      const transactions = response.data.transactions;
      // Upsert transactions
      for (const tx of transactions) {
        await prisma.transaction.upsert({
          where: { plaidTransactionId: tx.transaction_id },
          update: {
            accountId: (await prisma.account.findUnique({ where: { plaidAccountId: tx.account_id } }))?.id ?? '',
            amount: tx.amount,
            date: new Date(tx.date),
            name: tx.name,
            category: tx.category?.join(', '),
            pending: tx.pending,
            currency: tx.iso_currency_code ?? undefined,
          },
          create: {
            plaidTransactionId: tx.transaction_id,
            accountId: (await prisma.account.findUnique({ where: { plaidAccountId: tx.account_id } }))?.id ?? '',
            amount: tx.amount,
            date: new Date(tx.date),
            name: tx.name,
            category: tx.category?.join(', '),
            pending: tx.pending,
            currency: tx.iso_currency_code ?? undefined,
          },
        });
      }
      res.json({ success: true, count: transactions.length });
    } catch (err) {
      if (err instanceof Error) {
        res.status(500).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Unknown error' });
      }
    }
  });
}
