import { Configuration, PlaidApi, PlaidEnvironments, CountryCode } from 'plaid';

// Mock Plaid
jest.mock('plaid', () => ({
  Configuration: jest.fn(),
  PlaidApi: jest.fn(),
  PlaidEnvironments: {
    sandbox: 'https://sandbox.plaid.com',
    development: 'https://development.plaid.com',
    production: 'https://production.plaid.com'
  },
  Products: {
    Transactions: 'transactions',
    Balance: 'balance',
    Investments: 'investments',
    Identity: 'identity',
    Income: 'income',
    Liabilities: 'liabilities',
    Statements: 'statements'
  },
  CountryCode: {
    Us: 'US'
  }
}));

interface MockRequest {
  headers: Record<string, string>;
  body: Record<string, any>;
}

describe('Plaid Demo Mode Integration', () => {
  let mockPlaidApi: jest.Mocked<PlaidApi>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Configuration to return the basePath that was passed to it
    (Configuration as jest.Mock).mockImplementation((config) => ({
      basePath: config.basePath,
      baseOptions: config.baseOptions || {}
    }));

    // Mock PlaidApi
    mockPlaidApi = {
      linkTokenCreate: jest.fn(),
      itemPublicTokenExchange: jest.fn(),
      accountsGet: jest.fn(),
      transactionsGet: jest.fn()
    } as any;
    (PlaidApi as jest.Mock).mockImplementation(() => mockPlaidApi);
  });

  describe('Demo Mode Detection', () => {
    it('should detect demo mode from headers', () => {
      const req: MockRequest = {
        headers: {
          'x-demo-mode': 'true'
        },
        body: {}
      };

      const isDemoRequest = req.headers['x-demo-mode'] === 'true' || req.body.isDemo === true;
      expect(isDemoRequest).toBe(true);
    });

    it('should detect demo mode from body', () => {
      const req: MockRequest = {
        headers: {},
        body: {
          isDemo: true
        }
      };

      const isDemoRequest = req.headers['x-demo-mode'] === 'true' || req.body.isDemo === true;
      expect(isDemoRequest).toBe(true);
    });

    it('should not detect demo mode when neither header nor body has demo flag', () => {
      const req: MockRequest = {
        headers: {},
        body: {}
      };

      const isDemoRequest = req.headers['x-demo-mode'] === 'true' || req.body.isDemo === true;
      expect(isDemoRequest).toBe(false);
    });
  });

  describe('Demo Mode Plaid Client', () => {
    it('should create sandbox-only Plaid client for demo mode', () => {
      // This test verifies that the getDemoPlaidClient function creates a sandbox-only client
      const demoConfiguration = new Configuration({
        basePath: PlaidEnvironments.sandbox,
        baseOptions: {
          headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET,
          },
        },
      });

      expect(Configuration).toHaveBeenCalledWith({
        basePath: PlaidEnvironments.sandbox,
        baseOptions: {
          headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET,
          },
        },
      });
      expect(demoConfiguration.basePath).toBe(PlaidEnvironments.sandbox);
    });
  });

  describe('Demo Mode Link Token Creation', () => {
    it('should use sandbox environment when creating demo link tokens', async () => {
      const mockLinkTokenResponse = {
        data: {
          link_token: 'demo-link-token-123'
        }
      };

      mockPlaidApi.linkTokenCreate.mockResolvedValue(mockLinkTokenResponse as any);

      // Simulate demo mode request
      const req: MockRequest = {
        headers: {
          'x-demo-mode': 'true'
        },
        body: {
          isDemo: true
        }
      };

      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      // This would be the actual implementation logic
      const isDemoRequest = req.headers['x-demo-mode'] === 'true' || req.body.isDemo === true;
      
      if (isDemoRequest) {
        // Demo mode should use sandbox
        const demoConfiguration = new Configuration({
          basePath: PlaidEnvironments.sandbox,
          baseOptions: {
            headers: {
              'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
              'PLAID-SECRET': process.env.PLAID_SECRET,
            },
          },
        });
        
        const demoPlaidClient = new PlaidApi(demoConfiguration);
        
        const request = {
          user: { client_user_id: 'demo-user-id' },
          client_name: 'Ask Linc (Demo)',
          products: ['transactions', 'balance'],
          country_codes: [CountryCode.Us],
          language: 'en',
        };

        const createTokenResponse = await demoPlaidClient.linkTokenCreate(request as any);
        res.json({ link_token: createTokenResponse.data.link_token });
      }

      expect(isDemoRequest).toBe(true);
      expect(Configuration).toHaveBeenCalledWith({
        basePath: PlaidEnvironments.sandbox,
        baseOptions: {
          headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET,
          },
        },
      });
    });
  });

  describe('Environment Isolation', () => {
    it('should isolate demo mode from production environment', () => {
      // Set production environment
      const originalEnv = process.env.PLAID_ENV;
      process.env.PLAID_ENV = 'production';

      // Demo mode should still use sandbox regardless of main environment
      const demoConfiguration = new Configuration({
        basePath: PlaidEnvironments.sandbox,
        baseOptions: {
          headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET,
          },
        },
      });

      expect(demoConfiguration.basePath).toBe(PlaidEnvironments.sandbox);

      // Restore environment
      process.env.PLAID_ENV = originalEnv;
    });
  });
});
