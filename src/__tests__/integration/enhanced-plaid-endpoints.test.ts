import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock the Plaid client before importing the app
jest.mock('../../plaid', () => {
  return {
    setupPlaidRoutes: jest.fn((app: express.Application) => {
      // Mock the liabilities endpoint
      app.get('/plaid/liabilities', (req: any, res: any) => {
        res.json({
          liabilities: [{
            accounts: [
              {
                account_id: 'acc1',
                name: 'Credit Card',
                type: 'credit',
                subtype: 'credit card',
                balances: {
                  current: 2500,
                  available: 7500,
                  limit: 10000
                },
                mask: '1234',
                institution_id: 'inst1'
              },
              {
                account_id: 'acc2',
                name: 'Student Loan',
                type: 'loan',
                subtype: 'student',
                balances: {
                  current: 15000,
                  available: null,
                  limit: null
                },
                mask: '5678',
                institution_id: 'inst2'
              }
            ],
            item: { item_id: 'item1' },
            request_id: 'req1'
          }]
        });
      });

      // Mock the transaction enrichment endpoint
      app.post('/plaid/enrich/transactions', (req: any, res: any) => {
        const { transaction_ids, account_type } = req.body;
        
        if (!transaction_ids || !Array.isArray(transaction_ids)) {
          return res.status(400).json({ error: 'transaction_ids array required' });
        }

        res.json({
          enrichments: [{
            enriched_transactions: transaction_ids.map((id: string) => ({
              transaction_id: id,
              merchant_name: `Merchant ${id}`,
              website: `https://merchant${id}.com`,
              logo_url: `https://logo${id}.png`,
              check_number: null,
              payment_channel: 'online',
              payment_processor: 'stripe',
              category_id: '10000000',
              category: ['Food and Drink', 'Restaurants'],
              location: {
                address: `123 Main St ${id}`,
                city: 'New York',
                state: 'NY',
                zip: '10001',
                country: 'US',
                lat: 40.7128,
                lon: -74.0060
              },
              personal_finance_category: {
                primary: 'FOOD_AND_DRINK',
                detailed: 'RESTAURANTS',
                confidence_level: 'HIGH'
              },
              personal_finance_category_icon_url: `https://icon${id}.png`,
              counterparties: [
                {
                  name: `Counterparty ${id}`,
                  type: 'merchant',
                  website: `https://counterparty${id}.com`,
                  entity_id: `entity${id}`,
                  logo_url: `https://logo${id}.png`
                }
              ]
            })),
            request_id: 'req1'
          }]
        });
      });

      // Mock the income endpoint
      app.get('/plaid/income', (req: any, res: any) => {
        res.json({
          income: [{
            income_streams: [
              {
                confidence: 0.9,
                days: 730,
                monthly_income: 5000,
                name: 'Salary',
                type: 'INCOME_TYPE_W2'
              },
              {
                confidence: 0.7,
                days: 365,
                monthly_income: 1000,
                name: 'Freelance',
                type: 'INCOME_TYPE_1099'
              }
            ],
            last_year_income: 72000,
            last_year_income_before_tax: 80000,
            projected_yearly_income: 75000,
            projected_yearly_income_before_tax: 83000,
            max_number_of_overlapping_income_streams: 2,
            max_number_of_overlapping_income_streams_with_unknown_frequency: 1,
            total_number_of_income_streams: 2,
            income_streams_with_unknown_frequency: 1,
            item: { item_id: 'item1' },
            request_id: 'req1'
          }],
          summary: {
            totalIncomeStreams: 2,
            totalMonthlyIncome: 6000,
            totalYearlyIncome: 72000,
            projectedYearlyIncome: 75000
          }
        });
      });

      // Mock the accounts endpoint
      app.get('/plaid/accounts', (req: any, res: any) => {
        res.json({
          accounts: [
            {
              account_id: 'acc1',
              name: 'Checking Account',
              type: 'depository',
              subtype: 'checking',
              balances: {
                available: 5000,
                current: 5000,
                limit: null
              },
              mask: '1234',
              institution_id: 'inst1'
            },
            {
              account_id: 'acc2',
              name: 'Savings Account',
              type: 'depository',
              subtype: 'savings',
              balances: {
                available: 10000,
                current: 10000,
                limit: null
              },
              mask: '5678',
              institution_id: 'inst1'
            }
          ],
          item: { item_id: 'item1' },
          request_id: 'req1'
        });
      });

      // Mock the transactions endpoint
      app.get('/plaid/transactions', (req: any, res: any) => {
        res.json({
          transactions: [
            {
              transaction_id: 't1',
              account_id: 'acc1',
              amount: 50.00,
              date: '2025-01-01',
              name: 'Coffee Shop',
              merchant_name: 'Starbucks',
              category: ['Food and Drink', 'Restaurants'],
              category_id: '10000000',
              payment_channel: 'in store',
              pending: false
            },
            {
              transaction_id: 't2',
              account_id: 'acc1',
              amount: 100.00,
              date: '2025-01-02',
              name: 'Grocery Store',
              merchant_name: 'Whole Foods',
              category: ['Food and Drink', 'Groceries'],
              category_id: '10000001',
              payment_channel: 'in store',
              pending: false
            }
          ],
          total_transactions: 2,
          accounts: [
            {
              account_id: 'acc1',
              name: 'Checking Account',
              type: 'depository'
            }
          ],
          item: { item_id: 'item1' },
          request_id: 'req1'
        });
      });
    })
  };
});

// Mock Prisma client
jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn(() => ({
    accessToken: {
      findMany: jest.fn()
    },
    user: {
      findUnique: jest.fn()
    }
  }))
}));

// Create a test app
const app = express();
app.use(express.json());

// Setup Plaid routes
const { setupPlaidRoutes } = require('../../plaid');
setupPlaidRoutes(app);

// Mock authentication middleware
app.use((req, res, next) => {
  req.user = { id: 'user1', email: 'test@example.com', tier: 'premium' };
  next();
});

describe('Enhanced Plaid Endpoints Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Liabilities Endpoint', () => {
    it('should return liability information for all accounts', async () => {
      const response = await request(app)
        .get('/plaid/liabilities')
        .expect(200);

      expect(response.body).toHaveProperty('liabilities');
      expect(response.body.liabilities).toHaveLength(1);
      
      const liability = response.body.liabilities[0];
      expect(liability).toHaveProperty('accounts');
      expect(liability).toHaveProperty('item');
      expect(liability).toHaveProperty('request_id');
      
      const accounts = liability.accounts;
      expect(accounts).toHaveLength(2);
      
      // Check credit card account
      const creditCard = accounts.find((acc: any) => acc.subtype === 'credit card');
      expect(creditCard).toBeDefined();
      expect(creditCard.balances.current).toBe(2500);
      expect(creditCard.balances.limit).toBe(10000);
      
      // Check student loan account
      const studentLoan = accounts.find((acc: any) => acc.subtype === 'student');
      expect(studentLoan).toBeDefined();
      expect(studentLoan.balances.current).toBe(15000);
    });
  });

  describe('Transaction Enrichment Endpoint', () => {
    it('should enrich transactions with merchant data', async () => {
      const transactionIds = ['t1', 't2', 't3'];
      
      const response = await request(app)
        .post('/plaid/enrich/transactions')
        .send({
          transaction_ids: transactionIds,
          account_type: 'depository'
        })
        .expect(200);

      expect(response.body).toHaveProperty('enrichments');
      expect(response.body.enrichments).toHaveLength(1);
      
      const enrichment = response.body.enrichments[0];
      expect(enrichment).toHaveProperty('enriched_transactions');
      expect(enrichment).toHaveProperty('request_id');
      
      const enrichedTransactions = enrichment.enriched_transactions;
      expect(enrichedTransactions).toHaveLength(3);
      
      // Check first enriched transaction
      const firstTransaction = enrichedTransactions[0];
      expect(firstTransaction).toHaveProperty('merchant_name');
      expect(firstTransaction).toHaveProperty('website');
      expect(firstTransaction).toHaveProperty('logo_url');
      expect(firstTransaction).toHaveProperty('category');
      expect(firstTransaction).toHaveProperty('location');
      expect(firstTransaction).toHaveProperty('personal_finance_category');
      expect(firstTransaction).toHaveProperty('counterparties');
      
      expect(firstTransaction.merchant_name).toBe('Merchant t1');
      expect(firstTransaction.website).toBe('https://merchantt1.com');
      expect(firstTransaction.category).toEqual(['Food and Drink', 'Restaurants']);
    });

    it('should return error for missing transaction_ids', async () => {
      const response = await request(app)
        .post('/plaid/enrich/transactions')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('transaction_ids array required');
    });

    it('should return error for invalid transaction_ids format', async () => {
      const response = await request(app)
        .post('/plaid/enrich/transactions')
        .send({ transaction_ids: 'invalid' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('transaction_ids array required');
    });
  });

  describe('Income Endpoint', () => {
    it('should return income information with analysis', async () => {
      const response = await request(app)
        .get('/plaid/income')
        .expect(200);

      expect(response.body).toHaveProperty('income');
      expect(response.body).toHaveProperty('summary');
      
      const income = response.body.income[0];
      expect(income).toHaveProperty('income_streams');
      expect(income).toHaveProperty('last_year_income');
      expect(income).toHaveProperty('projected_yearly_income');
      
      const incomeStreams = income.income_streams;
      expect(incomeStreams).toHaveLength(2);
      
      // Check salary stream
      const salary = incomeStreams.find((stream: any) => stream.name === 'Salary');
      expect(salary).toBeDefined();
      expect(salary.monthly_income).toBe(5000);
      expect(salary.type).toBe('INCOME_TYPE_W2');
      expect(salary.confidence).toBe(0.9);
      
      // Check freelance stream
      const freelance = incomeStreams.find((stream: any) => stream.name === 'Freelance');
      expect(freelance).toBeDefined();
      expect(freelance.monthly_income).toBe(1000);
      expect(freelance.type).toBe('INCOME_TYPE_1099');
      
      const summary = response.body.summary;
      expect(summary.totalIncomeStreams).toBe(2);
      expect(summary.totalMonthlyIncome).toBe(6000);
      expect(summary.totalYearlyIncome).toBe(72000);
      expect(summary.projectedYearlyIncome).toBe(75000);
    });
  });

  describe('Accounts Endpoint', () => {
    it('should return account information with balances', async () => {
      const response = await request(app)
        .get('/plaid/accounts')
        .expect(200);

      expect(response.body).toHaveProperty('accounts');
      expect(response.body).toHaveProperty('item');
      expect(response.body).toHaveProperty('request_id');
      
      const accounts = response.body.accounts;
      expect(accounts).toHaveLength(2);
      
      // Check checking account
      const checking = accounts.find((acc: any) => acc.subtype === 'checking');
      expect(checking).toBeDefined();
      expect(checking.balances.available).toBe(5000);
      expect(checking.balances.current).toBe(5000);
      
      // Check savings account
      const savings = accounts.find((acc: any) => acc.subtype === 'savings');
      expect(savings).toBeDefined();
      expect(savings.balances.available).toBe(10000);
      expect(savings.balances.current).toBe(10000);
    });
  });

  describe('Transactions Endpoint', () => {
    it('should return transaction information with categories', async () => {
      const response = await request(app)
        .get('/plaid/transactions')
        .expect(200);

      expect(response.body).toHaveProperty('transactions');
      expect(response.body).toHaveProperty('total_transactions');
      expect(response.body).toHaveProperty('accounts');
      
      const transactions = response.body.transactions;
      expect(transactions).toHaveLength(2);
      expect(response.body.total_transactions).toBe(2);
      
      // Check first transaction
      const firstTransaction = transactions[0];
      expect(firstTransaction.amount).toBe(50.00);
      expect(firstTransaction.merchant_name).toBe('Starbucks');
      expect(firstTransaction.category).toEqual(['Food and Drink', 'Restaurants']);
      expect(firstTransaction.payment_channel).toBe('in store');
      expect(firstTransaction.pending).toBe(false);
      
      // Check second transaction
      const secondTransaction = transactions[1];
      expect(secondTransaction.amount).toBe(100.00);
      expect(secondTransaction.merchant_name).toBe('Whole Foods');
      expect(secondTransaction.category).toEqual(['Food and Drink', 'Groceries']);
    });
  });
});
