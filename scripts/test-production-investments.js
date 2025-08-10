#!/usr/bin/env node

/**
 * Test script to check production Plaid investments endpoint
 * This helps diagnose why investment data isn't showing up
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testProductionInvestments() {
  console.log('🔍 Testing Production Plaid Investments Endpoint');
  console.log('===============================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');

  try {
    // Test the investments endpoint
    console.log('Testing /plaid/investments endpoint...');
    const response = await fetch(`${BASE_URL}/plaid/investments`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Note: You'll need to add authentication here
        // 'Authorization': 'Bearer YOUR_JWT_TOKEN'
      }
    });

    console.log(`Response status: ${response.status}`);
    console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));

    if (response.ok) {
      const data = await response.json();
      console.log('\n✅ Success! Response data:');
      console.log('Portfolio:', data.portfolio ? 'Present' : 'Missing');
      console.log('Holdings count:', data.holdings ? data.holdings.length : 'Missing');
      console.log('Transactions count:', data.transactions ? data.transactions.length : 'Missing');
      
      if (data.portfolio) {
        console.log('Portfolio details:', JSON.stringify(data.portfolio, null, 2));
      }
      
      if (data.holdings && data.holdings.length > 0) {
        console.log('First holding:', JSON.stringify(data.holdings[0], null, 2));
      }
      
      if (data.transactions && data.transactions.length > 0) {
        console.log('First transaction:', JSON.stringify(data.transactions[0], null, 2));
      }
    } else {
      const errorData = await response.text();
      console.log('\n❌ Error response:');
      console.log(errorData);
    }
  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
  }

  console.log('\n📝 Next steps:');
  console.log('1. If you get "Authentication required", you need to add a valid JWT token');
  console.log('2. If you get Plaid API errors, check your access token scope');
  console.log('3. If you get empty data, check if your accounts have investment data');
}

testProductionInvestments().catch(console.error);
