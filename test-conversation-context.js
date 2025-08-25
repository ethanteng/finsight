const { analyzeConversationContext } = require('./dist/openai');

// Test conversation history
const conversationHistory = [
  {
    id: '1',
    question: 'I want to open a business savings account for my LLC. What banks would you recommend for that?',
    answer: 'When considering a business savings account for your LLC, here are some banks that are known for their favorable business savings account options...',
    createdAt: new Date('2025-08-24T10:00:00Z')
  }
];

// Test current question
const currentQuestion = 'which of these have the highest interest rates right now?';

console.log('Testing conversation context analysis...');
console.log('Conversation history:', conversationHistory.map(c => ({ 
  question: c.question.substring(0, 50) + '...',
  answer: c.answer.substring(0, 50) + '...'
})));

console.log('Current question:', currentQuestion);

const result = analyzeConversationContext(conversationHistory, currentQuestion);

console.log('\nContext analysis result:', result);

if (result.hasContextOpportunities) {
  console.log('✅ Context building opportunity detected!');
  console.log('Instruction:', result.instruction);
} else {
  console.log('❌ No context building opportunities detected');
}
