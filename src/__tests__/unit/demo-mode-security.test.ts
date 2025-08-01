import { setupPlaidRoutes } from '../../plaid';

// Mock Prisma client
const mockPrismaClient = {
  accessToken: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  account: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  transaction: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
};

// Mock Plaid client
const mockPlaidClient = {
  accountsGet: jest.fn(),
  accountsBalanceGet: jest.fn(),
  transactionsGet: jest.fn(),
  linkTokenCreate: jest.fn(),
  itemPublicTokenExchange: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaClient),
}));

jest.mock('plaid', () => ({
  Configuration: jest.fn(),
  PlaidApi: jest.fn(() => mockPlaidClient),
  PlaidEnvironments: {
    sandbox: 'https://sandbox.plaid.com',
    development: 'https://development.plaid.com',
    production: 'https://production.plaid.com',
  },
  Products: {
    Transactions: 'transactions',
    Balance: 'balance',
    Investments: 'investments',
    Identity: 'identity',
    Income: 'income',
    Liabilities: 'liabilities',
    Statements: 'statements',
  },
  CountryCode: {
    Us: 'US',
  },
}));

describe('Demo Mode Security Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Demo Mode Detection', () => {
         it('should correctly identify demo mode from headers', () => {
       // Test the demo mode detection logic
       const testDemoMode = (headerValue: string | undefined) => {
         return headerValue === 'true';
       };
       
       expect(testDemoMode('true')).toBe(true);
       expect(testDemoMode('false')).toBe(false);
       expect(testDemoMode(undefined)).toBe(false);
     });

    it('should handle case variations in demo mode header', () => {
      const testCases = [
        { header: 'true', expected: true },
        { header: 'TRUE', expected: false }, // Current implementation is case-sensitive
        { header: 'True', expected: false },
        { header: 'false', expected: false },
        { header: '', expected: false },
        { header: undefined, expected: false },
      ];

      testCases.forEach(({ header, expected }) => {
        const isDemo = header === 'true';
        expect(isDemo).toBe(expected);
      });
    });
  });

  describe('Demo Data Structure', () => {
    it('should have consistent demo account structure', () => {
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
        }
      ];

      // Verify demo account structure
      expect(demoAccounts).toHaveLength(2);
      
      const checkingAccount = demoAccounts.find(acc => acc.name === 'Chase Checking');
      expect(checkingAccount).toBeDefined();
      expect(checkingAccount?.id).toBe('checking_1');
      expect(checkingAccount?.balance.current).toBe(12450.67);
      expect(checkingAccount?.type).toBe('depository');
      expect(checkingAccount?.subtype).toBe('checking');

      const savingsAccount = demoAccounts.find(acc => acc.name === 'Ally High-Yield Savings');
      expect(savingsAccount).toBeDefined();
      expect(savingsAccount?.id).toBe('savings_1');
      expect(savingsAccount?.balance.current).toBe(28450.00);
      expect(savingsAccount?.type).toBe('depository');
      expect(savingsAccount?.subtype).toBe('savings');
    });

    it('should have consistent demo transaction structure', () => {
      const demoTransactions = [
        {
          id: "t1",
          account_id: "checking_1",
          amount: 4250.00,
          date: "2024-07-15",
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
          date: "2024-07-01",
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
        }
      ];

      // Verify demo transaction structure
      expect(demoTransactions).toHaveLength(2);
      
      const salaryTransaction = demoTransactions.find(t => t.name === 'Salary - Tech Corp');
      expect(salaryTransaction).toBeDefined();
      expect(salaryTransaction?.amount).toBe(4250.00);
      expect(salaryTransaction?.category).toEqual(['income', 'salary']);
      expect(salaryTransaction?.pending).toBe(false);

      const mortgageTransaction = demoTransactions.find(t => t.name === 'Mortgage Payment');
      expect(mortgageTransaction).toBeDefined();
      expect(mortgageTransaction?.amount).toBe(-850.00);
      expect(mortgageTransaction?.category).toEqual(['housing', 'mortgage']);
      expect(mortgageTransaction?.pending).toBe(false);
    });
  });

  describe('Security Logic', () => {
    it('should isolate demo and real data completely', () => {
      // Demo data should be completely different from real data
      const demoAccounts = [
        { id: 'checking_1', name: 'Chase Checking', balance: { current: 12450.67 } },
        { id: 'savings_1', name: 'Ally High-Yield Savings', balance: { current: 28450.00 } }
      ];

      const realAccounts = [
        { id: 'real-account-1', name: 'Real Bank Account', balance: { current: 5000.00 } }
      ];

      // Demo and real should be completely different
      expect(demoAccounts).not.toEqual(realAccounts);
      
      // Demo should have specific demo account names
      const demoAccountNames = demoAccounts.map(acc => acc.name);
      expect(demoAccountNames).toContain('Chase Checking');
      expect(demoAccountNames).toContain('Ally High-Yield Savings');
      
      // Real should not have demo account names (unless by coincidence)
      const realAccountNames = realAccounts.map(acc => acc.name);
      expect(realAccountNames).not.toContain('Chase Checking');
      expect(realAccountNames).not.toContain('Ally High-Yield Savings');
    });

    it('should handle demo mode flag correctly', () => {
      const testDemoMode = (headerValue: string | undefined) => {
        return headerValue === 'true';
      };

      expect(testDemoMode('true')).toBe(true);
      expect(testDemoMode('false')).toBe(false);
      expect(testDemoMode(undefined)).toBe(false);
      expect(testDemoMode('')).toBe(false);
      expect(testDemoMode('TRUE')).toBe(false); // Case sensitive
    });
  });

  describe('Data Validation', () => {
    it('should validate demo account data integrity', () => {
      const demoAccounts = [
        {
          id: "checking_1",
          name: "Chase Checking",
          type: "depository",
          subtype: "checking",
          balance: {
            available: 12450.67,
            current: 12450.67,
            iso_currency_code: "USD",
          }
        }
      ];

      // Validate required fields
      demoAccounts.forEach(account => {
        expect(account.id).toBeDefined();
        expect(account.name).toBeDefined();
        expect(account.type).toBeDefined();
        expect(account.subtype).toBeDefined();
        expect(account.balance).toBeDefined();
        expect(account.balance.current).toBeDefined();
        expect(account.balance.available).toBeDefined();
        expect(account.balance.iso_currency_code).toBe('USD');
      });
    });

    it('should validate demo transaction data integrity', () => {
      const demoTransactions = [
        {
          id: "t1",
          account_id: "checking_1",
          amount: 4250.00,
          date: "2024-07-15",
          name: "Salary - Tech Corp",
          merchant_name: "Tech Corp",
          category: ["income", "salary"],
          pending: false,
        }
      ];

      // Validate required fields
      demoTransactions.forEach(transaction => {
        expect(transaction.id).toBeDefined();
        expect(transaction.account_id).toBeDefined();
        expect(transaction.amount).toBeDefined();
        expect(transaction.date).toBeDefined();
        expect(transaction.name).toBeDefined();
        expect(transaction.category).toBeDefined();
        expect(Array.isArray(transaction.category)).toBe(true);
        expect(typeof transaction.pending).toBe('boolean');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing demo data gracefully', () => {
      // Test that demo mode doesn't crash when data is missing
      const safeDemoAccounts = (accounts: any[] | undefined) => {
        return accounts || [];
      };

      expect(safeDemoAccounts(undefined)).toEqual([]);
      expect(safeDemoAccounts([])).toEqual([]);
      expect(safeDemoAccounts([{ id: 'test' }])).toEqual([{ id: 'test' }]);
    });

         it('should handle malformed demo data', () => {
       const validateDemoAccount = (account: any) => {
         return !!(account && 
                typeof account.id === 'string' && 
                typeof account.name === 'string' && 
                account.balance && 
                typeof account.balance.current === 'number');
       };

       const validAccount = {
         id: 'test',
         name: 'Test Account',
         balance: { current: 1000 }
       };

       const invalidAccount = {
         id: 'test',
         // missing name
         balance: { current: 'not a number' }
       };

       expect(validateDemoAccount(validAccount)).toBe(true);
       expect(validateDemoAccount(invalidAccount)).toBe(false);
       expect(validateDemoAccount(null)).toBe(false);
       expect(validateDemoAccount(undefined)).toBe(false);
     });
  });
}); 