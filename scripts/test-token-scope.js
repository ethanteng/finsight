#!/usr/bin/env node

/**
 * Test script to check Plaid access token scope and products
 * This helps diagnose ADDITIONAL_CONSENT_REQUIRED errors
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testTokenScope() {
  console.log('🔍 Testing Plaid Token Scope Check');
  console.log('==================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');

  try {
    // Test the token scope endpoint
    const response = await fetch(`${BASE_URL}/plaid/check-token-scope`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // You'll need to add authentication here
        // 'Authorization': 'Bearer YOUR_JWT_TOKEN'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Token scope check successful!');
      console.log('');
      console.log('📊 Token Information:');
      console.log(JSON.stringify(data, null, 2));
      
      // Analyze the results
      if (data.tokens && data.tokens.length > 0) {
        console.log('');
        console.log('🔍 Analysis:');
        data.tokens.forEach((token, index) => {
          console.log(`\nToken ${index + 1}:`);
          console.log(`  - ID: ${token.tokenId}`);
          console.log(`  - Has Investments: ${token.hasInvestments ? '✅ YES' : '❌ NO'}`);
          if (token.products && token.products.length > 0) {
            console.log(`  - Available Products: ${token.products.join(', ')}`);
          }
          if (token.accounts && token.accounts.length > 0) {
            console.log(`  - Account Types: ${token.accounts.map(acc => acc.type).join(', ')}`);
          }
          if (token.error) {
            console.log(`  - Error: ${token.error}`);
          }
        });
        
        console.log('');
        console.log('📈 Summary:');
        console.log(`  - Total Tokens: ${data.summary.totalTokens}`);
        console.log(`  - Tokens with Investments: ${data.summary.tokensWithInvestments}`);
        console.log(`  - Tokens with Errors: ${data.summary.tokensWithErrors}`);
        
        if (data.summary.tokensWithInvestments === 0) {
          console.log('');
          console.log('⚠️  ISSUE IDENTIFIED: No tokens have investment access!');
          console.log('   This explains the ADDITIONAL_CONSENT_REQUIRED error.');
          console.log('');
          console.log('🔧 SOLUTION: Re-link your Plaid account with investment products selected.');
        }
      }
    } else {
      const errorData = await response.text();
      console.log('❌ Token scope check failed!');
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${errorData}`);
      
      if (response.status === 401) {
        console.log('');
        console.log('🔐 Authentication required. You need to:');
        console.log('   1. Get a valid JWT token from your login endpoint');
        console.log('   2. Add it to the Authorization header in this script');
        console.log('   3. Or test this endpoint from your authenticated frontend');
      }
    }
  } catch (error) {
    console.error('❌ Error testing token scope:', error.message);
  }
}

// Run the test
testTokenScope().catch(console.error);
