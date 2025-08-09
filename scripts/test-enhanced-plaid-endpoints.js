#!/usr/bin/env node

/**
 * Test script to verify the new enhanced Plaid endpoints work
 * This script tests the new /investments/holdings, /investments/transactions, /liabilities, and /enrich/transactions endpoints
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

async function testEndpoint(endpoint, method = 'GET', data = null, headers = {}) {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    log(`Testing ${method} ${url}`, 'blue');
    
    const config = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    
    log(`✅ Success: ${response.status}`, 'green');
    log(`Response data: ${JSON.stringify(response.data, null, 2)}`, 'green');
    
    return { success: true, data: response.data };
  } catch (error) {
    log(`❌ Error: ${error.response?.status || error.code}`, 'red');
    if (error.response?.data) {
      log(`Error details: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    } else {
      log(`Error message: ${error.message}`, 'red');
    }
    return { success: false, error: error.response?.data || error.message };
  }
}

async function testEnhancedPlaidEndpoints() {
  log('🚀 Testing Enhanced Plaid Endpoints', 'blue');
  log('==================================', 'blue');
  
  // Test 1: Investment holdings endpoint
  log('\n1. Testing /plaid/investments/holdings', 'yellow');
  await testEndpoint('/plaid/investments/holdings', 'GET');
  
  // Test 2: Investment transactions endpoint
  log('\n2. Testing /plaid/investments/transactions', 'yellow');
  await testEndpoint('/plaid/investments/transactions', 'GET');
  
  // Test 3: Liabilities endpoint
  log('\n3. Testing /plaid/liabilities', 'yellow');
  await testEndpoint('/plaid/liabilities', 'GET');
  
  // Test 4: Transaction enrichment endpoint
  log('\n4. Testing /plaid/enrich/transactions', 'yellow');
  await testEndpoint('/plaid/enrich/transactions', 'POST', {
    transaction_ids: ['test_transaction_1', 'test_transaction_2'],
    account_type: 'depository'
  });
  
  log('\n✅ Enhanced Plaid endpoint testing completed!', 'green');
}

// Run the tests
if (require.main === module) {
  testEnhancedPlaidEndpoints().catch(error => {
    log(`❌ Test script failed: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { testEnhancedPlaidEndpoints };
