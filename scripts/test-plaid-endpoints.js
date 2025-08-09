#!/usr/bin/env node

/**
 * Test script to verify Plaid endpoints work in production
 * This script tests the current /accounts and /transactions endpoints
 */

const axios = require('axios');
require('dotenv').config();

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_ACCESS_TOKEN = process.env.TEST_PLAID_ACCESS_TOKEN;

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

async function testPlaidEndpoints() {
  log('🚀 Testing Plaid Endpoints', 'blue');
  log('========================', 'blue');
  
  // Test 1: Create link token
  log('\n1. Testing /plaid/create_link_token', 'yellow');
  const linkTokenResult = await testEndpoint('/plaid/create_link_token', 'POST', {
    user: { client_user_id: 'test-user' }
  });
  
  if (!linkTokenResult.success) {
    log('❌ Failed to create link token. Cannot proceed with other tests.', 'red');
    return;
  }
  
  // Test 2: Test accounts endpoint (demo mode)
  log('\n2. Testing /plaid/all-accounts (demo mode)', 'yellow');
  await testEndpoint('/plaid/all-accounts', 'GET', null, {
    'x-demo-mode': 'true'
  });
  
  // Test 3: Test transactions endpoint (demo mode)
  log('\n3. Testing /plaid/transactions (demo mode)', 'yellow');
  await testEndpoint('/plaid/transactions', 'GET', null, {
    'x-demo-mode': 'true'
  });
  
  // Test 4: Test accounts endpoint (real mode - if access token available)
  if (TEST_ACCESS_TOKEN) {
    log('\n4. Testing /plaid/all-accounts (real mode)', 'yellow');
    await testEndpoint('/plaid/all-accounts', 'GET', null, {
      'Authorization': `Bearer ${TEST_ACCESS_TOKEN}`
    });
    
    log('\n5. Testing /plaid/transactions (real mode)', 'yellow');
    await testEndpoint('/plaid/transactions', 'GET', null, {
      'Authorization': `Bearer ${TEST_ACCESS_TOKEN}`
    });
  } else {
    log('\n4. Skipping real mode tests (no TEST_PLAID_ACCESS_TOKEN provided)', 'yellow');
  }
  
  // Test 5: Test investments endpoint (if available)
  log('\n6. Testing /plaid/investments', 'yellow');
  await testEndpoint('/plaid/investments', 'GET');
  
  log('\n✅ Plaid endpoint testing completed!', 'green');
}

// Run the tests
if (require.main === module) {
  testPlaidEndpoints().catch(error => {
    log(`❌ Test script failed: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { testPlaidEndpoints };
