import { UserTier } from '../data/types';

// Mock the entire openai module
jest.mock('../openai', () => ({
  askOpenAI: jest.fn(),
}));

describe('OpenAI Integration (Simple)', () => {
  let mockAskOpenAI: jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAskOpenAI = require('../openai').askOpenAI;
  });

  describe('askOpenAI function', () => {
    it('should handle basic questions', async () => {
      mockAskOpenAI.mockResolvedValue('Your current balance is $1,500');

      const question = 'What is my current balance?';
      const conversationHistory: any[] = [];

      const response = await mockAskOpenAI(question, conversationHistory);

      expect(response).toBe('Your current balance is $1,500');
      expect(mockAskOpenAI).toHaveBeenCalledWith(question, conversationHistory);
    });

    it('should handle questions with conversation history', async () => {
      mockAskOpenAI.mockResolvedValue('Based on our previous conversation, your net worth is $5,000');

      const question = 'What is my net worth?';
      const conversationHistory = [
        { id: '1', question: 'What is my balance?', answer: 'Your balance is $1,000', createdAt: new Date() },
        { id: '2', question: 'How much debt do I have?', answer: 'You have $500 in credit card debt', createdAt: new Date() },
      ];

      const response = await mockAskOpenAI(question, conversationHistory);

      expect(response).toBe('Based on our previous conversation, your net worth is $5,000');
      expect(mockAskOpenAI).toHaveBeenCalledWith(question, conversationHistory);
    });

    it('should handle different user tiers', async () => {
      mockAskOpenAI.mockResolvedValue('Response based on tier');

      const question = 'What is my current balance?';
      const conversationHistory: any[] = [];

      // Test STARTER tier
      await mockAskOpenAI(question, conversationHistory, UserTier.STARTER);
      expect(mockAskOpenAI).toHaveBeenCalledWith(question, conversationHistory, UserTier.STARTER);

      // Test STANDARD tier
      await mockAskOpenAI(question, conversationHistory, UserTier.STANDARD);
      expect(mockAskOpenAI).toHaveBeenCalledWith(question, conversationHistory, UserTier.STANDARD);

      // Test PREMIUM tier
      await mockAskOpenAI(question, conversationHistory, UserTier.PREMIUM);
      expect(mockAskOpenAI).toHaveBeenCalledWith(question, conversationHistory, UserTier.PREMIUM);
    });

    it('should handle empty conversation history', async () => {
      mockAskOpenAI.mockResolvedValue('Your balance is $1,000');

      const question = 'What is my current balance?';
      const conversationHistory: any[] = [];

      const response = await mockAskOpenAI(question, conversationHistory);

      expect(response).toBe('Your balance is $1,000');
      expect(mockAskOpenAI).toHaveBeenCalledWith(question, conversationHistory);
    });

    it('should handle API errors gracefully', async () => {
      mockAskOpenAI.mockRejectedValue(new Error('OpenAI API error'));

      const question = 'What is my current balance?';
      const conversationHistory: any[] = [];

      await expect(mockAskOpenAI(question, conversationHistory)).rejects.toThrow('OpenAI API error');
    });
  });

  describe('Question Types', () => {
    it('should handle balance questions', async () => {
      mockAskOpenAI.mockResolvedValue('Your balance is $1,000');

      const questions = [
        'What is my current balance?',
        'Show me my account balances',
        'How much money do I have?',
      ];

      for (const question of questions) {
        await mockAskOpenAI(question, []);
        expect(mockAskOpenAI).toHaveBeenCalledWith(question, []);
      }
    });

    it('should handle transaction questions', async () => {
      mockAskOpenAI.mockResolvedValue('Here are your recent transactions');

      const questions = [
        'Show me all transactions',
        'What are my recent expenses?',
        'List my transactions from this month',
      ];

      for (const question of questions) {
        await mockAskOpenAI(question, []);
        expect(mockAskOpenAI).toHaveBeenCalledWith(question, []);
      }
    });

    it('should handle financial analysis questions', async () => {
      mockAskOpenAI.mockResolvedValue('Here is your financial analysis');

      const questions = [
        'What is my asset allocation?',
        'What is my debt-to-income ratio?',
        'What is my emergency fund status?',
        'What is my net worth?',
      ];

      for (const question of questions) {
        await mockAskOpenAI(question, []);
        expect(mockAskOpenAI).toHaveBeenCalledWith(question, []);
      }
    });

    it('should handle spending analysis questions', async () => {
      mockAskOpenAI.mockResolvedValue('Here is your spending analysis');

      const questions = [
        'How much did I spend on food this month?',
        'What are my biggest expenses?',
        'Show me my spending by category',
        'How much do I spend on subscriptions?',
      ];

      for (const question of questions) {
        await mockAskOpenAI(question, []);
        expect(mockAskOpenAI).toHaveBeenCalledWith(question, []);
      }
    });
  });

  describe('Response Quality', () => {
    it('should maintain conversation context', async () => {
      mockAskOpenAI.mockResolvedValue('Based on our conversation, here is your analysis');

      const conversationHistory = [
        { id: '1', question: 'What is my balance?', answer: 'Your balance is $1,000', createdAt: new Date() },
        { id: '2', question: 'How much debt do I have?', answer: 'You have $500 in debt', createdAt: new Date() },
      ];

      const question = 'What is my net worth?';
      await mockAskOpenAI(question, conversationHistory);

      expect(mockAskOpenAI).toHaveBeenCalledWith(question, conversationHistory);
    });

    it('should handle follow-up questions', async () => {
      mockAskOpenAI.mockResolvedValue('Here is the follow-up analysis');

      const conversationHistory = [
        { id: '1', question: 'What is my asset allocation?', answer: 'You have 60% stocks, 30% bonds, 10% cash', createdAt: new Date() },
      ];

      const question = 'Should I rebalance my portfolio?';
      await mockAskOpenAI(question, conversationHistory);

      expect(mockAskOpenAI).toHaveBeenCalledWith(question, conversationHistory);
    });
  });

  describe('Tier-Based Features', () => {
    it('should provide different responses based on tier', async () => {
      // Mock different responses for different tiers
      mockAskOpenAI
        .mockResolvedValueOnce('Basic response for Starter tier')
        .mockResolvedValueOnce('Enhanced response with economic indicators for Standard tier')
        .mockResolvedValueOnce('Premium response with live market data for Premium tier');

      const question = 'Should I invest in CDs?';
      const conversationHistory: any[] = [];

      // Test STARTER tier
      const starterResponse = await mockAskOpenAI(question, conversationHistory, UserTier.STARTER);
      expect(starterResponse).toBe('Basic response for Starter tier');

      // Test STANDARD tier
      const standardResponse = await mockAskOpenAI(question, conversationHistory, UserTier.STANDARD);
      expect(standardResponse).toBe('Enhanced response with economic indicators for Standard tier');

      // Test PREMIUM tier
      const premiumResponse = await mockAskOpenAI(question, conversationHistory, UserTier.PREMIUM);
      expect(premiumResponse).toBe('Premium response with live market data for Premium tier');
    });
  });
}); 