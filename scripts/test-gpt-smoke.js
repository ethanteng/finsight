#!/usr/bin/env node

// Load environment variables from .env files
require('dotenv').config();

/**
 * GPT Smoke Test Script
 * 
 * This script tests real OpenAI API calls to validate that the current model
 * is working correctly. It's designed to catch issues like:
 * - Model availability problems (like GPT-5 failures)
 * - API key issues
 * - Model configuration problems
 * - Prompt formatting issues
 * 
 * Usage:
 *   node scripts/test-gpt-smoke.js
 * 
 * Environment Variables:
 *   OPENAI_API_KEY - Your OpenAI API key
 *   OPENAI_MODEL - Model to test (defaults to gpt-4o)
 */

const OpenAI = require('openai');

// Helper function to get the right parameters for different models
function getModelParams(model, maxTokens) {
  const baseParams = {
    model
  };

  // GPT-5 has different parameter requirements
  if (model.startsWith('gpt-5')) {
    return { 
      ...baseParams, 
      max_completion_tokens: maxTokens
      // GPT-5 only supports default temperature (1), so we don't set it
    };
  } else {
    return { 
      ...baseParams, 
      temperature: 0.7,
      max_tokens: maxTokens 
    };
  }
}

async function testGPTSmoke() {
  console.log('🧪 GPT Model Smoke Test');
  console.log('=' .repeat(50));

  // Check environment
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    console.error('💡 Make sure you have a .env file with OPENAI_API_KEY set');
    console.error('💡 Or set the environment variable: export OPENAI_API_KEY=your_key');
    process.exit(1);
  }

  if (apiKey.startsWith('test_')) {
    console.error('❌ Cannot use test API key for smoke test');
    process.exit(1);
  }

  console.log('🔑 API Key:', apiKey ? 'SET' : 'NOT SET');
  console.log('🤖 Model:', model);
  console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
  console.log('');

  try {
    const openai = new OpenAI({ apiKey });

    // Test 1: Basic math question
    console.log('📝 Test 1: Basic math question...');
    const mathResponse = await openai.chat.completions.create({
      ...getModelParams(model, 100),
      messages: [{ role: 'user', content: 'What is 2+2?' }]
    });

    const mathAnswer = mathResponse.choices[0]?.message?.content || '';
    console.log('✅ Math test passed');
    console.log('📝 Response:', mathAnswer.substring(0, 100) + '...');
    console.log('');

    // Test 2: Financial question
    console.log('📝 Test 2: Financial question...');
    const financialResponse = await openai.chat.completions.create({
      ...getModelParams(model, 200),
      messages: [{ role: 'user', content: 'What is a good savings rate?' }]
    });

    const financialAnswer = financialResponse.choices[0]?.message?.content || '';
    console.log('✅ Financial test passed');
    console.log('📝 Response:', financialAnswer.substring(0, 100) + '...');
    console.log('');

    // Test 3: Complex prompt (similar to what we use in production)
    console.log('📝 Test 3: Complex financial prompt...');
    const complexPrompt = `You are Linc, an AI-powered financial analyst. Help users understand their finances by analyzing their account data and providing clear, actionable insights.

User Question: I have $50,000 in savings and make $120,000 per year. What should I do with my money?

Please provide specific, actionable advice.`;

    const complexResponse = await openai.chat.completions.create({
      ...getModelParams(model, 300),
      messages: [{ role: 'user', content: complexPrompt }]
    });

    const complexAnswer = complexResponse.choices[0]?.message?.content || '';
    console.log('✅ Complex prompt test passed');
    console.log('📝 Response:', complexAnswer.substring(0, 150) + '...');
    console.log('');

    // Summary
    console.log('🎉 All GPT smoke tests passed successfully!');
    console.log('✅ Model:', model, 'is working correctly');
    console.log('✅ API key is valid and functional');
    console.log('✅ Prompt handling is working');
    console.log('✅ Response generation is working');
    
    // Cost estimation
    const totalTokens = (mathResponse.usage?.total_tokens || 0) + 
                       (financialResponse.usage?.total_tokens || 0) + 
                       (complexResponse.usage?.total_tokens || 0);
    console.log('💰 Total tokens used:', totalTokens);
    console.log('💡 Estimated cost: ~$' + (totalTokens * 0.000005).toFixed(4));

  } catch (error) {
    console.error('❌ GPT smoke test failed:');
    console.error('Error:', error.message);
    
    if (error.status) {
      console.error('Status:', error.status);
    }
    
    if (error.code) {
      console.error('Code:', error.code);
    }
    
    // Provide helpful debugging information
    if (error.message.includes('model')) {
      console.error('💡 This might be a model availability issue');
      console.error('💡 Try checking if the model name is correct');
    }
    
    if (error.message.includes('authentication')) {
      console.error('💡 This might be an API key issue');
      console.error('💡 Check that your OPENAI_API_KEY is correct');
    }
    
    if (error.message.includes('quota')) {
      console.error('💡 This might be a quota/billing issue');
      console.error('💡 Check your OpenAI account billing status');
    }
    
    if (error.message.includes('max_tokens') || error.message.includes('max_completion_tokens')) {
      console.error('💡 This might be a model parameter compatibility issue');
      console.error('💡 Different GPT models have different parameter requirements');
      console.error('💡 GPT-5 uses max_completion_tokens, others use max_tokens');
    }
    
    process.exit(1);
  }
}

// Run the test
testGPTSmoke().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
