#!/usr/bin/env node

/**
 * Test script to verify that the transaction category extraction fix is working
 * This script tests the /ask endpoint to see if GPT can now see transaction categories
 */

const axios = require('axios');
require('dotenv').config();

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testCategoryFix() {
  log('🧪 Testing Transaction Category Extraction Fix', 'blue');
  log('============================================', 'blue');
  
  try {
    // Test the /ask endpoint with a question about transactions
    log('\n📝 Testing OpenAI ask endpoint with transaction question...', 'yellow');
    
    const question = "What are my recent spending patterns? Can you categorize my transactions?";
    
    // Test with real user data (not demo mode)
    log('\n🔐 Testing with real user data...', 'yellow');
    
    // First, we need to authenticate to get a user token
    // This will test the actual production flow with real transaction data
    log('Note: This test requires a valid user account with Plaid data', 'yellow');
    log('To test this properly, you need to:', 'yellow');
    log('1. Have a user account with Plaid transactions', 'yellow');
    log('2. Get a valid authentication token', 'yellow');
    log('3. Test the /ask endpoint with real user data', 'yellow');
    
    log('\n📝 Testing OpenAI ask endpoint with transaction question...', 'yellow');
    
    const response = await axios.post(`${API_BASE_URL}/ask`, {
      question: question,
      isDemo: false, // Use real user data, not demo mode
      userTier: 'starter'
    }, {
      headers: {
        'Authorization': 'Bearer YOUR_AUTH_TOKEN_HERE' // Replace with actual token
      }
    });
    
    log('✅ OpenAI response received successfully!', 'green');
    log('\n📊 Response:', 'blue');
    log(response.data.answer || response.data.response || 'No answer field found', 'green');
    
    // Check if the response contains category information
    const answer = response.data.answer || response.data.response || '';
    log('\n📊 Response Analysis:', 'blue');
    
    if (answer.includes('Unknown Category')) {
      log('\n❌ FAILURE: Still showing "Unknown Category"', 'red');
      log('The category extraction fix is not working', 'red');
    } else if (answer.includes('food') || answer.includes('transportation') || answer.includes('software') || answer.includes('recreation') || 
               answer.includes('dining') || answer.includes('gas') || answer.includes('subscription') || answer.includes('fitness')) {
      log('\n🎉 SUCCESS: Categories are being detected!', 'green');
      log('GPT can now see transaction categories instead of "Unknown Category"', 'green');
    } else {
      log('\n⚠️  UNCLEAR: Response format is different than expected', 'yellow');
      log('Check the response manually to see if categories are visible', 'yellow');
    }
    
    log('\n💡 To test this properly:', 'blue');
    log('1. Replace YOUR_AUTH_TOKEN_HERE with a real user token', 'blue');
    log('2. Ensure the user has Plaid transactions with categories', 'blue');
    log('3. Run the test again', 'blue');
    
  } catch (error) {
    log(`❌ Error testing category fix: ${error.message}`, 'red');
    if (error.response?.data) {
      log(`Error details: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    }
  }
}

// Run the test
if (require.main === module) {
  testCategoryFix().catch(error => {
    log(`❌ Test script failed: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { testCategoryFix };
