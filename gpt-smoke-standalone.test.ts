import { askOpenAI } from './src/openai';

// This is a standalone test file that runs outside the Jest mocking system
// to test real OpenAI API calls with the current model

describe('GPT Model Smoke Test (Standalone)', () => {
  it('should successfully complete a real prompt with current model', async () => {
    // Skip in CI/CD to avoid costs and external dependencies
    if (process.env.GITHUB_ACTIONS || process.env.CI) {
      console.log('Skipping GPT smoke test in CI/CD environment');
      return;
    }

    // Only run if we have a real OpenAI API key
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith('test_')) {
      console.log('Skipping GPT smoke test - no real API key');
      return;
    }

    console.log('🧪 Running GPT smoke test with real API...');
    console.log('🔑 API Key:', process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET');
    console.log('🌍 Environment:', process.env.NODE_ENV || 'undefined');

    const response = await askOpenAI('What is 2+2?', [], 'starter', true);
    
    // Basic validation that we got a coherent response
    expect(response).toBeDefined();
    expect(response.length).toBeGreaterThan(10);
    expect(response.toLowerCase()).toContain('4');
    
    console.log('✅ GPT smoke test passed successfully');
    console.log('📝 Response preview:', response.substring(0, 100) + '...');
  }, 30000); // 30 second timeout for API call

  it('should handle model configuration correctly', async () => {
    // Skip in CI/CD
    if (process.env.GITHUB_ACTIONS || process.env.CI) {
      return;
    }

    // Only run with real API key
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith('test_')) {
      return;
    }

    // Test that we can get a response with a simple financial question
    const response = await askOpenAI('What is a good savings rate?', [], 'starter', true);
    
    expect(response).toBeDefined();
    expect(response.length).toBeGreaterThan(20);
    
    // Should provide some financial advice
    const financialTerms = ['savings', 'rate', 'interest', 'account', 'bank', 'money'];
    const hasFinancialContent = financialTerms.some(term => 
      response.toLowerCase().includes(term)
    );
    
    expect(hasFinancialContent).toBe(true);
    
    console.log('✅ Financial prompt test passed');
  }, 30000);
});
