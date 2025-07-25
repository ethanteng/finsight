import { Application, Request, Response } from 'express';
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

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
}
