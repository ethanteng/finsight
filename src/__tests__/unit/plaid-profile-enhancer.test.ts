import { jest } from '@jest/globals';
import { PlaidProfileEnhancer } from '../../profile/plaid-enhancer';

// Mock OpenAI
jest.mock('../../openai', () => ({
  openai: {
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }
}));

describe('PlaidProfileEnhancer Unit Tests', () => {
  let enhancer: PlaidProfileEnhancer;
  let mockOpenAI: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock OpenAI
    const { openai } = require('../../openai');
    mockOpenAI = openai;
    mockOpenAI.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'Enhanced profile with Plaid insights' } }]
    });
    
    enhancer = new PlaidProfileEnhancer();
  });

  describe('enhanceProfileFromPlaidData', () => {
    it('should return existing profile when no Plaid data is available', async () => {
      const existingProfile = 'Existing user profile';
      
      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        [],
        [],
        existingProfile
      );

      expect(result).toBe(existingProfile);
    });

    it('should return empty string when no data and no existing profile', async () => {
      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        [],
        []
      );

      expect(result).toBe('');
    });

    it('should enhance profile with account data only', async () => {
      const accounts = [
        {
          id: 'account-1',
          name: 'Chase Checking',
          type: 'depository',
          balance: { current: 5000 },
          institution: 'Chase Bank'
        },
        {
          id: 'account-2',
          name: 'Vanguard IRA',
          type: 'investment',
          balance: { current: 50000 },
          institution: 'Vanguard'
        }
      ];

      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        accounts,
        []
      );

      expect(result).toContain('Enhanced profile with Plaid insights');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('The user has total savings of $5000.00 in depository accounts')
            })
          ])
        })
      );
    });

    it('should enhance profile with transaction data only', async () => {
      const transactions = [
        {
          id: 'trans-1',
          account_id: 'account-1',
          amount: 150.00,
          date: '2024-01-15',
          name: 'Grocery Store',
          category: ['Food and Drink', 'Restaurants'],
          pending: false
        },
        {
          id: 'trans-2',
          account_id: 'account-1',
          amount: 200.00,
          date: '2024-01-20',
          name: 'Gas Station',
          category: ['Transportation', 'Gas'],
          pending: false
        }
      ];

      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        [],
        transactions
      );

      expect(result).toContain('Enhanced profile with Plaid insights');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('The user\'s top spending categories are')
            })
          ])
        })
      );
    });

    it('should enhance profile with both accounts and transactions', async () => {
      const accounts = [
        {
          id: 'account-1',
          name: 'Chase Checking',
          type: 'depository',
          balance: { current: 5000 },
          institution: 'Chase Bank'
        }
      ];

      const transactions = [
        {
          id: 'trans-1',
          account_id: 'account-1',
          amount: 150.00,
          date: '2024-01-15',
          name: 'Grocery Store',
          category: ['Food and Drink'],
          pending: false
        }
      ];

      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        accounts,
        transactions,
        'Existing profile'
      );

      expect(result).toContain('Enhanced profile with Plaid insights');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Existing profile')
            })
          ])
        })
      );
    });

    it('should handle OpenAI API errors gracefully', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));
      
      const accounts = [
        {
          id: 'account-1',
          name: 'Chase Checking',
          type: 'depository',
          balance: { current: 5000 },
          institution: 'Chase Bank'
        }
      ];

      const existingProfile = 'Existing profile';
      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        accounts,
        [],
        existingProfile
      );

      expect(result).toContain('Existing profile');
      expect(result).toContain('The user has total savings of $5000.00 in depository accounts');
    });

    it('should handle empty OpenAI response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: null } }]
      });
      
      const accounts = [
        {
          id: 'account-1',
          name: 'Chase Checking',
          type: 'depository',
          balance: { current: 5000 },
          institution: 'Chase Bank'
        }
      ];

      const existingProfile = 'Existing profile';
      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        accounts,
        [],
        existingProfile
      );

      expect(result).toBe(existingProfile);
    });
  });

  describe('analyzePlaidDataForProfile', () => {
    it('should analyze Plaid data for profile enhancement', async () => {
      const accounts = [
        {
          id: 'account-1',
          name: 'Chase Checking',
          type: 'depository',
          balance: { current: 5000 },
          institution: 'Chase Bank'
        }
      ];

      const transactions = [
        {
          id: 'trans-1',
          account_id: 'account-1',
          amount: 150.00,
          date: '2024-01-15',
          name: 'Grocery Store',
          category: ['Food and Drink'],
          pending: false
        }
      ];

      const result = await enhancer.analyzePlaidDataForProfile(
        'test-user-id',
        accounts,
        transactions
      );

      expect(result).toContain('Enhanced profile with Plaid insights');
    });

    it('should handle empty data gracefully', async () => {
      const result = await enhancer.analyzePlaidDataForProfile(
        'test-user-id',
        [],
        []
      );

      expect(result).toBe('');
    });
  });

  describe('Account Analysis', () => {
    it('should analyze different account types correctly', async () => {
      const accounts = [
        {
          id: 'checking-1',
          name: 'Chase Checking',
          type: 'depository',
          balance: { current: 5000 },
          institution: 'Chase Bank'
        },
        {
          id: 'savings-1',
          name: 'Ally Savings',
          type: 'depository',
          balance: { current: 10000 },
          institution: 'Ally Bank'
        },
        {
          id: 'investment-1',
          name: 'Vanguard IRA',
          type: 'investment',
          balance: { current: 50000 },
          institution: 'Vanguard'
        },
        {
          id: 'credit-1',
          name: 'Chase Credit Card',
          type: 'credit',
          balance: { current: -2000 },
          institution: 'Chase Bank'
        },
        {
          id: 'loan-1',
          name: 'Mortgage',
          type: 'loan',
          balance: { current: 200000 },
          institution: 'Wells Fargo'
        }
      ];

      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        accounts,
        []
      );

      expect(result).toContain('Enhanced profile with Plaid insights');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('The user has total savings of $15000.00 in depository accounts')
            })
          ])
        })
      );
    });

    it('should handle accounts with different balance formats', async () => {
      const accounts = [
        {
          id: 'account-1',
          name: 'Chase Checking',
          type: 'depository',
          currentBalance: 5000,
          institution: 'Chase Bank'
        },
        {
          id: 'account-2',
          name: 'Ally Savings',
          type: 'depository',
          availableBalance: 10000,
          institution: 'Ally Bank'
        }
      ];

      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        accounts,
        []
      );

      expect(result).toContain('Enhanced profile with Plaid insights');
    });

    it('should handle accounts without balance information', async () => {
      const accounts = [
        {
          id: 'account-1',
          name: 'Chase Checking',
          type: 'depository',
          institution: 'Chase Bank'
        }
      ];

      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        accounts,
        []
      );

      expect(result).toContain('Enhanced profile with Plaid insights');
    });
  });

  describe('Transaction Analysis', () => {
    it('should analyze spending patterns by category', async () => {
      const transactions = [
        {
          id: 'trans-1',
          account_id: 'account-1',
          amount: 150.00,
          date: '2024-01-15',
          name: 'Grocery Store',
          category: ['Food and Drink', 'Restaurants'],
          pending: false
        },
        {
          id: 'trans-2',
          account_id: 'account-1',
          amount: 200.00,
          date: '2024-01-20',
          name: 'Gas Station',
          category: ['Transportation', 'Gas'],
          pending: false
        },
        {
          id: 'trans-3',
          account_id: 'account-1',
          amount: 300.00,
          date: '2024-01-25',
          name: 'Shopping Mall',
          category: ['Shopping', 'Clothing'],
          pending: false
        }
      ];

      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        [],
        transactions
      );

      expect(result).toContain('Enhanced profile with Plaid insights');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('The user\'s top spending categories are')
            })
          ])
        })
      );
    });

    it('should calculate average monthly spending', async () => {
      const transactions = [
        {
          id: 'trans-1',
          account_id: 'account-1',
          amount: 1000.00,
          date: '2024-01-15',
          name: 'Monthly Expenses',
          category: ['Food and Drink'],
          pending: false
        },
        {
          id: 'trans-2',
          account_id: 'account-1',
          amount: 1200.00,
          date: '2024-02-15',
          name: 'Monthly Expenses',
          category: ['Food and Drink'],
          pending: false
        }
      ];

      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        [],
        transactions
      );

      expect(result).toContain('Enhanced profile with Plaid insights');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('The user\'s average monthly spending is $1100.00')
            })
          ])
        })
      );
    });

    it('should handle transactions without categories', async () => {
      const transactions = [
        {
          id: 'trans-1',
          account_id: 'account-1',
          amount: 150.00,
          date: '2024-01-15',
          name: 'Unknown Transaction',
          pending: false
        }
      ];

      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        [],
        transactions
      );

      expect(result).toContain('Enhanced profile with Plaid insights');
    });

    it('should handle pending transactions', async () => {
      const transactions = [
        {
          id: 'trans-1',
          account_id: 'account-1',
          amount: 150.00,
          date: '2024-01-15',
          name: 'Grocery Store',
          category: ['Food and Drink'],
          pending: true
        }
      ];

      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        [],
        transactions
      );

      expect(result).toContain('Enhanced profile with Plaid insights');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed account data', async () => {
      const accounts = [
        {
          id: 'account-1',
          name: 'Chase Checking',
          type: 'depository',
          // Missing balance information
          institution: 'Chase Bank'
        }
      ];

      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        accounts,
        []
      );

      expect(result).toContain('Enhanced profile with Plaid insights');
    });

    it('should handle malformed transaction data', async () => {
      const transactions = [
        {
          id: 'trans-1',
          account_id: 'account-1',
          amount: NaN, // Invalid amount
          date: '2024-01-15',
          name: 'Grocery Store',
          pending: false
        }
      ];

      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        [],
        transactions
      );

      expect(result).toContain('Enhanced profile with Plaid insights');
    });

    it('should handle network errors gracefully', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('Network Error'));
      
      const accounts = [
        {
          id: 'account-1',
          name: 'Chase Checking',
          type: 'depository',
          balance: { current: 5000 },
          institution: 'Chase Bank'
        }
      ];

      const existingProfile = 'Existing profile';
      const result = await enhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        accounts,
        [],
        existingProfile
      );

      expect(result).toContain('Existing profile');
      expect(result).toContain('The user has total savings of $5000.00 in depository accounts');
    });
  });

  describe('Integration with Demo Data', () => {
    it('should work with realistic demo data', async () => {
      const accounts = [
        {
          id: 'checking_1',
          name: 'Chase Checking',
          type: 'depository',
          balance: { current: 12450.67 },
          institution: 'Chase Bank'
        },
        {
          id: 'savings_1',
          name: 'Ally High-Yield Savings',
          type: 'depository',
          balance: { current: 28450.00 },
          institution: 'Ally Bank'
        },
        {
          id: '401k_1',
          name: 'Fidelity 401(k)',
          type: 'investment',
          balance: { current: 156780.45 },
          institution: 'Fidelity'
        }
      ];

      const transactions = [
        {
          id: 'trans-1',
          account_id: 'checking_1',
          amount: 150.00,
          date: '2024-01-15',
          name: 'Whole Foods Market',
          category: ['Food and Drink', 'Restaurants'],
          pending: false
        },
        {
          id: 'trans-2',
          account_id: 'checking_1',
          amount: 200.00,
          date: '2024-01-20',
          name: 'Shell Gas Station',
          category: ['Transportation', 'Gas'],
          pending: false
        }
      ];

      const result = await enhancer.enhanceProfileFromPlaidData(
        'demo-user-id',
        accounts,
        transactions,
        'Sarah Chen, 32, Software Engineer in Austin, TX'
      );

      expect(result).toContain('Enhanced profile with Plaid insights');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Sarah Chen, 32, Software Engineer in Austin, TX')
            })
          ])
        })
      );
    });
  });
}); 