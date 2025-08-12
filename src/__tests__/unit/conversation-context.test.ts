import { describe, it, expect } from '@jest/globals';
import { analyzeConversationContext } from '../../openai';

// Mock conversation type
interface Conversation {
  id: string;
  question: string;
  answer: string;
  createdAt: Date;
}

describe('Conversation Context Analysis', () => {
  it('should detect portfolio analysis context opportunities', () => {
    const history: Conversation[] = [
      {
        id: '1',
        question: 'Can you analyze my investment portfolio?',
        answer: 'I can help analyze your portfolio, but I need more information about your age and financial goals.',
        createdAt: new Date()
      }
    ];
    
    const currentQuestion = 'I am 35 years old';
    
    const result = analyzeConversationContext(history, currentQuestion);
    
    expect(result.hasContextOpportunities).toBe(true);
    expect(result.instruction).toContain('portfolio analysis');
    expect(result.instruction).toContain('age');
  });

  it('should detect financial planning context opportunities', () => {
    const history: Conversation[] = [
      {
        id: '1',
        question: 'I want to plan for retirement',
        answer: 'Retirement planning requires knowing your current age and timeline.',
        createdAt: new Date()
      }
    ];
    
    const currentQuestion = 'I want to retire in 20 years';
    
    const result = analyzeConversationContext(history, currentQuestion);
    
    expect(result.hasContextOpportunities).toBe(true);
    expect(result.instruction).toContain('financial planning');
    expect(result.instruction).toContain('timeline');
  });

  it('should detect debt analysis context opportunities', () => {
    const history: Conversation[] = [
      {
        id: '1',
        question: 'How is my debt situation?',
        answer: 'To analyze your debt, I need to know your income and expenses.',
        createdAt: new Date()
      }
    ];
    
    const currentQuestion = 'My income is $75,000 per year';
    
    const result = analyzeConversationContext(history, currentQuestion);
    
    expect(result.hasContextOpportunities).toBe(true);
    expect(result.instruction).toContain('debt analysis');
    expect(result.instruction).toContain('income');
  });

  it('should detect budgeting context opportunities', () => {
    const history: Conversation[] = [
      {
        id: '1',
        question: 'Help me create a budget',
        answer: 'I can help with budgeting. What is your income and family situation?',
        createdAt: new Date()
      }
    ];
    
    const currentQuestion = 'I have 2 children and make $60,000';
    
    const result = analyzeConversationContext(history, currentQuestion);
    
    expect(result.hasContextOpportunities).toBe(true);
    expect(result.instruction).toContain('budgeting');
    expect(result.instruction).toContain('income');
    expect(result.instruction).toContain('family');
  });

  it('should return no opportunities when no context exists', () => {
    const history: Conversation[] = [
      {
        id: '1',
        question: 'What is the weather like?',
        answer: 'I cannot provide weather information.',
        createdAt: new Date()
      }
    ];
    
    const currentQuestion = 'Hello, how are you?';
    
    const result = analyzeConversationContext(history, currentQuestion);
    
    expect(result.hasContextOpportunities).toBe(false);
    expect(result.instruction).toBe('');
  });

  it('should handle empty conversation history', () => {
    const history: Conversation[] = [];
    const currentQuestion = 'I am 30 years old';
    
    const result = analyzeConversationContext(history, currentQuestion);
    
    expect(result.hasContextOpportunities).toBe(false);
    expect(result.instruction).toBe('');
  });

  it('should detect multiple context opportunities', () => {
    const history: Conversation[] = [
      {
        id: '1',
        question: 'Analyze my portfolio',
        answer: 'Need more information about your situation.',
        createdAt: new Date()
      },
      {
        id: '2',
        question: 'Help me budget',
        answer: 'Need to know your income and expenses.',
        createdAt: new Date()
      }
    ];
    
    const currentQuestion = 'I am 40 years old and make $80,000';
    
    const result = analyzeConversationContext(history, currentQuestion);
    
    expect(result.hasContextOpportunities).toBe(true);
    expect(result.instruction).toContain('portfolio analysis');
    expect(result.instruction).toContain('budgeting');
  });
});
