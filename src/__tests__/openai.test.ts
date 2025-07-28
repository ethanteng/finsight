import { askOpenAI } from '../openai';
import { PrismaClient } from '@prisma/client';
import { UserTier } from '../data/types';

// Mock OpenAI
jest.mock('openai', () => {
  const mockOpenAI = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }));
  return { default: mockOpenAI };
});

// Mock Prisma
jest.mock('@prisma/client');

const mockPrisma = {
  account: {
    findMany: jest.fn(),
  },
  transaction: {
    findMany: jest.fn(),
  },
  conversation: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
};

(PrismaClient as jest.MockedClass<typeof PrismaClient>).mockImplementation(() => mockPrisma as any);

// Mock data orchestrator
jest.mock('../data/orchestrator', () => ({
  dataOrchestrator: {
    getMarketContext: jest.fn(),
  },
}));

describe('OpenAI Integration', () => {
  let mockOpenAI: any;
  let mockDataOrchestrator: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock OpenAI
    mockOpenAI = require('openai').default;
    const mockChatCompletions = {
      create: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'This is a test response' } }],
      }),
    };
    mockOpenAI.mockImplementation(() => ({
      chat: { completions: mockChatCompletions },
    }));

    // Setup mock data orchestrator
    mockDataOrchestrator = require('../data/orchestrator').dataOrchestrator;
    mockDataOrchestrator.getMarketContext.mockResolvedValue({});
  });

  describe('askOpenAI function', () => {
    it('should generate response for basic question', async () => {
      // Mock account and transaction data
      mockPrisma.account.findMany.mockResolvedValue([
        { id: 1, name: 'Test Account', balance: 1000 },
      ]);
      mockPrisma.transaction.findMany.mockResolvedValue([
        { id: 1, name: 'Test Transaction', amount: 50 },
      ]);

      const question = 'What is my current balance?';
      const conversationHistory: any[] = [];

      const response = await askOpenAI(question, conversationHistory);

      expect(response).toBe('This is a test response');
      expect(mockOpenAI).toHaveBeenCalled();
    });

    it('should include conversation history in context', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const question = 'What is my current balance?';
      const conversationHistory = [
        { id: '1', question: 'Previous question', answer: 'Previous answer', createdAt: new Date() },
      ];

      await askOpenAI(question, conversationHistory);

      // Verify that the OpenAI API was called with conversation history
      const mockChatCompletions = mockOpenAI().chat.completions;
      expect(mockChatCompletions.create).toHaveBeenCalled();
      
      const callArgs = mockChatCompletions.create.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(3); // System + User + Assistant
    });

    it('should handle empty account and transaction data', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const question = 'What is my current balance?';
      const conversationHistory: any[] = [];

      const response = await askOpenAI(question, conversationHistory);

      expect(response).toBe('This is a test response');
    });

    it('should include tier-based market context', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      // Mock different market contexts for different tiers
      mockDataOrchestrator.getMarketContext
        .mockResolvedValueOnce({}) // STARTER tier
        .mockResolvedValueOnce({ economicIndicators: { cpi: { value: 3.2 } } }) // STANDARD tier
        .mockResolvedValueOnce({ 
          economicIndicators: { cpi: { value: 3.2 } },
          liveMarketData: { cdRates: [{ term: '1-year', rate: 5.0 }] }
        }); // PREMIUM tier

      const question = 'What is my current balance?';
      const conversationHistory: any[] = [];

      // Test STARTER tier
      await askOpenAI(question, conversationHistory, UserTier.STARTER);
      
      // Test STANDARD tier
      await askOpenAI(question, conversationHistory, UserTier.STANDARD);
      
      // Test PREMIUM tier
      await askOpenAI(question, conversationHistory, UserTier.PREMIUM);

      expect(mockDataOrchestrator.getMarketContext).toHaveBeenCalledTimes(3);
      expect(mockDataOrchestrator.getMarketContext).toHaveBeenCalledWith(UserTier.STARTER);
      expect(mockDataOrchestrator.getMarketContext).toHaveBeenCalledWith(UserTier.STANDARD);
      expect(mockDataOrchestrator.getMarketContext).toHaveBeenCalledWith(UserTier.PREMIUM);
    });

    it('should handle OpenAI API errors gracefully', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      // Mock OpenAI API error
      const mockChatCompletions = {
        create: jest.fn().mockRejectedValue(new Error('OpenAI API error')),
      };
      mockOpenAI.mockImplementation(() => ({
        chat: { completions: mockChatCompletions },
      }));

      const question = 'What is my current balance?';
      const conversationHistory: any[] = [];

      await expect(askOpenAI(question, conversationHistory)).rejects.toThrow('OpenAI API error');
    });

    it('should format account summary correctly', async () => {
      const mockAccounts = [
        { id: 1, name: 'Checking Account', balance: 1500, type: 'depository' },
        { id: 2, name: 'Savings Account', balance: 5000, type: 'depository' },
        { id: 3, name: 'Credit Card', balance: -500, type: 'credit' },
      ];

      mockPrisma.account.findMany.mockResolvedValue(mockAccounts);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const question = 'What is my total net worth?';
      const conversationHistory: any[] = [];

      await askOpenAI(question, conversationHistory);

      // Verify that the account data was included in the prompt
      const mockChatCompletions = mockOpenAI().chat.completions;
      const callArgs = mockChatCompletions.create.mock.calls[0][0];
      const systemPrompt = callArgs.messages[0].content;
      
      expect(systemPrompt).toContain('Checking Account');
      expect(systemPrompt).toContain('Savings Account');
      expect(systemPrompt).toContain('Credit Card');
    });

    it('should format transaction summary correctly', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      
      const mockTransactions = [
        { id: 1, name: 'Grocery Store', amount: 75.50, date: '2024-01-15', category: ['Food and Drink'] },
        { id: 2, name: 'Gas Station', amount: 45.00, date: '2024-01-14', category: ['Transportation'] },
        { id: 3, name: 'Netflix Subscription', amount: 15.99, date: '2024-01-13', category: ['Entertainment'] },
      ];

      mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions);

      const question = 'What are my recent expenses?';
      const conversationHistory: any[] = [];

      await askOpenAI(question, conversationHistory);

      // Verify that the transaction data was included in the prompt
      const mockChatCompletions = mockOpenAI().chat.completions;
      const callArgs = mockChatCompletions.create.mock.calls[0][0];
      const systemPrompt = callArgs.messages[0].content;
      
      expect(systemPrompt).toContain('Grocery Store');
      expect(systemPrompt).toContain('Gas Station');
      expect(systemPrompt).toContain('Netflix Subscription');
    });

    it('should handle different question types appropriately', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const questions = [
        'What is my current balance?',
        'Show me all transactions',
        'What is my asset allocation?',
        'How much did I spend on food this month?',
      ];

      for (const question of questions) {
        await askOpenAI(question, []);
        
        // Verify each question was processed
        const mockChatCompletions = mockOpenAI().chat.completions;
        expect(mockChatCompletions.create).toHaveBeenCalled();
      }
    });
  });

  describe('Response Quality', () => {
    it('should maintain conversation context across multiple questions', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const conversationHistory = [
        { id: '1', question: 'What is my balance?', answer: 'Your balance is $1000', createdAt: new Date() },
        { id: '2', question: 'How much did I spend?', answer: 'You spent $200 this month', createdAt: new Date() },
      ];

      const question = 'What is my net worth?';
      await askOpenAI(question, conversationHistory);

      // Verify conversation history was included
      const mockChatCompletions = mockOpenAI().chat.completions;
      const callArgs = mockChatCompletions.create.mock.calls[0][0];
      const messages = callArgs.messages;
      
      expect(messages.length).toBeGreaterThan(2); // System + User + Assistant pairs
    });

    it('should handle financial terminology correctly', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const financialQuestions = [
        'What is my asset allocation?',
        'What is my debt-to-income ratio?',
        'What is my emergency fund status?',
        'What is my net worth?',
      ];

      for (const question of financialQuestions) {
        await askOpenAI(question, []);
        expect(mockOpenAI).toHaveBeenCalled();
      }
    });
  });
}); 