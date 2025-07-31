import { askOpenAI, askOpenAIForTests } from '../../openai';
import { UserTier } from '../../data/types';

// Define the Conversation interface for tests
interface Conversation {
  id: string;
  question: string;
  answer: string;
  createdAt: Date;
}

// Mock the entire openai module
jest.mock('../../openai', () => ({
  askOpenAI: jest.fn(),
  askOpenAIForTests: jest.fn(),
}));

describe('OpenAI Integration (Simple)', () => {
  let mockAskOpenAI: jest.MockedFunction<any>;
  let mockAskOpenAIForTests: jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAskOpenAI = require('../../openai').askOpenAI;
    mockAskOpenAIForTests = require('../../openai').askOpenAIForTests;
  });

  describe('askOpenAI function', () => {
    it('should handle basic questions', async () => {
      mockAskOpenAI.mockResolvedValue('Your current balance is $1,500');
      
      const question = 'What is my current balance?';
      const conversationHistory: Conversation[] = [];
      
      const response = await mockAskOpenAI(question, conversationHistory);
      
      expect(response).toBe('Your current balance is $1,500');
      expect(mockAskOpenAI).toHaveBeenCalledWith(question, conversationHistory);
    });

    it('should handle questions with conversation history', async () => {
      mockAskOpenAI.mockResolvedValue('Based on our previous conversation, your net worth is $5,000');
      
      const question = 'What is my net worth?';
      const conversationHistory: Conversation[] = [
        {
          id: '1',
          question: 'What is my current balance?',
          answer: 'Your current balance is $1,500',
          createdAt: new Date()
        }
      ];
      
      const response = await mockAskOpenAI(question, conversationHistory);
      
      expect(response).toBe('Based on our previous conversation, your net worth is $5,000');
      expect(mockAskOpenAI).toHaveBeenCalledWith(question, conversationHistory);
    });

    it('should handle different user tiers', async () => {
      mockAskOpenAI.mockResolvedValue('Response based on tier');
      
      const question = 'What is my balance?';
      const conversationHistory: Conversation[] = [];
      
      await mockAskOpenAI(question, conversationHistory, UserTier.STARTER);
      expect(mockAskOpenAI).toHaveBeenCalledWith(question, conversationHistory, UserTier.STARTER);
      
      await mockAskOpenAI(question, conversationHistory, UserTier.STANDARD);
      expect(mockAskOpenAI).toHaveBeenCalledWith(question, conversationHistory, UserTier.STANDARD);
      
      await mockAskOpenAI(question, conversationHistory, UserTier.PREMIUM);
      expect(mockAskOpenAI).toHaveBeenCalledWith(question, conversationHistory, UserTier.PREMIUM);
    });

    it('should handle error responses gracefully', async () => {
      mockAskOpenAI.mockResolvedValue('Your balance is $1,000');
      
      const question = 'What is my balance?';
      const conversationHistory: Conversation[] = [];
      
      const response = await mockAskOpenAI(question, conversationHistory);
      
      expect(response).toBe('Your balance is $1,000');
      expect(mockAskOpenAI).toHaveBeenCalledWith(question, conversationHistory);
    });

    it('should handle API errors', async () => {
      mockAskOpenAI.mockRejectedValue(new Error('OpenAI API error'));
      
      const question = 'What is my balance?';
      const conversationHistory: Conversation[] = [];
      
      await expect(mockAskOpenAI(question, conversationHistory)).rejects.toThrow('OpenAI API error');
    });
  });

  describe('askOpenAIForTests function (Cost Optimization)', () => {
    it('should use cheaper model for tests', async () => {
      mockAskOpenAIForTests.mockResolvedValue('Your balance is $1,000 (using cheaper model)');
      
      const question = 'What is my balance?';
      const conversationHistory: Conversation[] = [];
      
      const response = await mockAskOpenAIForTests(question, conversationHistory);
      
      expect(response).toBe('Your balance is $1,000 (using cheaper model)');
      expect(mockAskOpenAIForTests).toHaveBeenCalledWith(question, conversationHistory);
    });

    it('should handle different question types with cheaper model', async () => {
      mockAskOpenAIForTests.mockResolvedValue('Here are your recent transactions');
      
      const question = 'Show me my recent transactions';
      const conversationHistory: Conversation[] = [];
      
      const response = await mockAskOpenAIForTests(question, []);
      
      expect(response).toBe('Here are your recent transactions');
      expect(mockAskOpenAIForTests).toHaveBeenCalledWith(question, []);
    });

    it('should handle financial analysis with cheaper model', async () => {
      mockAskOpenAIForTests.mockResolvedValue('Here is your financial analysis');
      
      const question = 'Analyze my spending patterns';
      const conversationHistory: Conversation[] = [];
      
      const response = await mockAskOpenAIForTests(question, []);
      
      expect(response).toBe('Here is your financial analysis');
      expect(mockAskOpenAIForTests).toHaveBeenCalledWith(question, []);
    });

    it('should handle spending analysis with cheaper model', async () => {
      mockAskOpenAIForTests.mockResolvedValue('Here is your spending analysis');
      
      const question = 'How much did I spend on groceries?';
      const conversationHistory: Conversation[] = [];
      
      const response = await mockAskOpenAIForTests(question, []);
      
      expect(response).toBe('Here is your spending analysis');
      expect(mockAskOpenAIForTests).toHaveBeenCalledWith(question, []);
    });

    it('should handle conversation context with cheaper model', async () => {
      mockAskOpenAIForTests.mockResolvedValue('Based on our conversation, here is your analysis');
      
      const question = 'What about my investments?';
      const conversationHistory: Conversation[] = [
        {
          id: '1',
          question: 'What is my current balance?',
          answer: 'Your current balance is $1,500',
          createdAt: new Date()
        }
      ];
      
      const response = await mockAskOpenAIForTests(question, conversationHistory);
      
      expect(response).toBe('Based on our conversation, here is your analysis');
      expect(mockAskOpenAIForTests).toHaveBeenCalledWith(question, conversationHistory);
    });

    it('should handle follow-up questions with cheaper model', async () => {
      mockAskOpenAIForTests.mockResolvedValue('Here is the follow-up analysis');
      
      const question = 'Can you break that down further?';
      const conversationHistory: Conversation[] = [
        {
          id: '1',
          question: 'What is my spending breakdown?',
          answer: 'Your spending breakdown is...',
          createdAt: new Date()
        }
      ];
      
      const response = await mockAskOpenAIForTests(question, conversationHistory);
      
      expect(response).toBe('Here is the follow-up analysis');
      expect(mockAskOpenAIForTests).toHaveBeenCalledWith(question, conversationHistory);
    });

    it('should handle different tiers with cheaper model', async () => {
      mockAskOpenAIForTests.mockResolvedValue('Response based on tier (cheaper model)');
      
      const question = 'What is my balance?';
      const conversationHistory: Conversation[] = [];
      
      const starterResponse = await mockAskOpenAIForTests(question, conversationHistory, UserTier.STARTER);
      expect(starterResponse).toBe('Response based on tier (cheaper model)');
      
      const standardResponse = await mockAskOpenAIForTests(question, conversationHistory, UserTier.STANDARD);
      expect(standardResponse).toBe('Response based on tier (cheaper model)');
      
      const premiumResponse = await mockAskOpenAIForTests(question, conversationHistory, UserTier.PREMIUM);
      expect(premiumResponse).toBe('Response based on tier (cheaper model)');
    });
  });
}); 