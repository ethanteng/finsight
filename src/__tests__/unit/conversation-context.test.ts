import { describe, it, expect } from '@jest/globals';
import { analyzeConversationContext } from '../../openai';

describe('analyzeConversationContext', () => {
  const mockConversation = (question: string, answer: string = 'Mock answer') => ({
    id: 'test-id',
    question,
    answer,
    createdAt: new Date()
  });

  describe('Business Banking Context Detection', () => {
    it('should detect business banking follow-up questions about rates', () => {
      const history = [
        mockConversation('I want to open a business savings account for my LLC. What banks would you recommend?')
      ];
      
      const currentQuestion = 'which of these have the highest interest rates right now?';
      
      const result = analyzeConversationContext(history, currentQuestion);
      
      expect(result.hasContextOpportunities).toBe(true);
      expect(result.instruction).toContain('business banking/savings accounts');
      expect(result.instruction).toContain('rates or comparing options');
    });

    it('should detect business banking follow-up questions about APY', () => {
      const history = [
        mockConversation('I need a business checking account for my startup')
      ];
      
      const currentQuestion = 'What is the APY on business accounts?';
      
      const result = analyzeConversationContext(history, currentQuestion);
      
      expect(result.hasContextOpportunities).toBe(true);
      expect(result.instruction).toContain('business banking');
    });

    it('should detect LLC-related follow-up questions', () => {
      const history = [
        mockConversation('How do I set up banking for my LLC?')
      ];
      
      const currentQuestion = 'Which banks offer the best rates for LLCs?';
      
      const result = analyzeConversationContext(history, currentQuestion);
      
      expect(result.hasContextOpportunities).toBe(true);
      expect(result.instruction).toContain('business banking');
    });
  });

  describe('General Savings and Banking Context Detection', () => {
    it('should detect savings account follow-up questions about rates', () => {
      const history = [
        mockConversation('I want to open a high-yield savings account')
      ];
      
      const currentQuestion = 'What are the current rates on savings accounts?';
      
      const result = analyzeConversationContext(history, currentQuestion);
      
      expect(result.hasContextOpportunities).toBe(true);
      expect(result.instruction).toContain('savings, banking, or accounts');
    });

    it('should detect CD follow-up questions about rates', () => {
      const history = [
        mockConversation('I want to invest in CDs')
      ];
      
      const currentQuestion = 'Which CD has the highest yield?';
      
      const result = analyzeConversationContext(history, currentQuestion);
      
      expect(result.hasContextOpportunities).toBe(true);
      expect(result.instruction).toContain('savings, banking, or accounts');
    });

    it('should detect bank account follow-up questions about rates', () => {
      const history = [
        mockConversation('I need to open a new bank account')
      ];
      
      const currentQuestion = 'Which bank offers the best interest rates?';
      
      const result = analyzeConversationContext(history, currentQuestion);
      
      expect(result.hasContextOpportunities).toBe(true);
      expect(result.instruction).toContain('savings, banking, or accounts');
    });
  });

  describe('Rate Question Detection', () => {
    it('should detect various rate-related question formats', () => {
      const history = [
        mockConversation('I want to open a savings account')
      ];
      
      const rateQuestions = [
        'What are the current rates?',
        'Which has the highest APY?',
        'Compare the yields',
        'Which is better?',
        'What are the interest rates?',
        'Which offers the best yield?',
        'What is the highest rate?'
      ];
      
      rateQuestions.forEach(question => {
        const result = analyzeConversationContext(history, question);
        expect(result.hasContextOpportunities).toBe(true);
        expect(result.instruction).toContain('rates or comparing options');
      });
    });
  });

  describe('No Context Opportunities', () => {
    it('should return false when no conversation history exists', () => {
      const result = analyzeConversationContext([], 'What are the current rates?');
      
      expect(result.hasContextOpportunities).toBe(false);
      expect(result.instruction).toBe('');
    });

    it('should return false when current question is not rate-related', () => {
      const history = [
        mockConversation('I want to open a savings account')
      ];
      
      const result = analyzeConversationContext(history, 'What is the weather like?');
      
      expect(result.hasContextOpportunities).toBe(false);
      expect(result.instruction).toBe('');
    });

    it('should return false when history has no banking-related questions', () => {
      const history = [
        mockConversation('What is the stock market doing today?')
      ];
      
      const result = analyzeConversationContext(history, 'What are the current rates?');
      
      expect(result.hasContextOpportunities).toBe(false);
      expect(result.instruction).toBe('');
    });
  });

  describe('Multiple Context Opportunities', () => {
    it('should detect multiple context patterns', () => {
      const history = [
        mockConversation('I want to open a business savings account'),
        mockConversation('I also need a personal savings account')
      ];
      
      const currentQuestion = 'Which accounts have the highest rates?';
      
      const result = analyzeConversationContext(history, currentQuestion);
      
      expect(result.hasContextOpportunities).toBe(true);
      expect(result.instruction).toContain('business banking/savings accounts');
      expect(result.instruction).toContain('savings, banking, or accounts');
    });
  });

  describe('Edge Cases', () => {
    it('should handle case-insensitive matching', () => {
      const history = [
        mockConversation('I want to open a BUSINESS SAVINGS ACCOUNT')
      ];
      
      const currentQuestion = 'WHICH HAS THE HIGHEST RATES?';
      
      const result = analyzeConversationContext(history, currentQuestion);
      
      expect(result.hasContextOpportunities).toBe(true);
    });

    it('should handle partial matches', () => {
      const history = [
        mockConversation('I need business banking services')
      ];
      
      const currentQuestion = 'What are the rates?';
      
      const result = analyzeConversationContext(history, currentQuestion);
      
      expect(result.hasContextOpportunities).toBe(true);
    });
  });
});
