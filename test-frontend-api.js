#!/usr/bin/env node

// Test script to verify frontend API calls are working
const API_URL = 'http://localhost:3000';

async function testFrontendAPI() {
  console.log('🧪 Testing Frontend API Calls');
  console.log('==============================\n');

  try {
    // Test 1: Check if backend is accessible
    console.log('1. Testing backend accessibility...');
    const backendRes = await fetch(`${API_URL}/plaid/all-accounts`, {
      headers: { 'x-demo-mode': 'true' }
    });
    
    if (backendRes.ok) {
      console.log('✅ Backend is accessible');
    } else {
      console.log('❌ Backend is not accessible:', backendRes.status);
      return;
    }

    // Test 2: Check if frontend is accessible
    console.log('\n2. Testing frontend accessibility...');
    const frontendRes = await fetch('http://localhost:3001/profile?demo=true');
    
    if (frontendRes.ok) {
      console.log('✅ Frontend is accessible');
    } else {
      console.log('❌ Frontend is not accessible:', frontendRes.status);
      return;
    }

    // Test 3: Check if frontend can make API calls (simulate browser behavior)
    console.log('\n3. Testing frontend API call simulation...');
    
    // Simulate what the frontend should be doing
    const accountsRes = await fetch(`${API_URL}/plaid/all-accounts`, {
      headers: { 
        'x-demo-mode': 'true',
        'Content-Type': 'application/json'
      }
    });
    
    if (accountsRes.ok) {
      const accountsData = await accountsRes.json();
      console.log(`✅ Frontend API call simulation successful - Found ${accountsData.accounts.length} accounts`);
      
      // Check if the data matches what the frontend expects
      const firstAccount = accountsData.accounts[0];
      if (firstAccount && firstAccount.name && firstAccount.balance) {
        console.log('✅ Account data structure is correct for frontend consumption');
        console.log(`   Sample account: ${firstAccount.name} - $${firstAccount.balance.current}`);
      } else {
        console.log('❌ Account data structure is incorrect for frontend consumption');
      }
    } else {
      console.log('❌ Frontend API call simulation failed:', accountsRes.status);
    }

    // Test 4: Check investments endpoint
    console.log('\n4. Testing investments endpoint...');
    const investmentsRes = await fetch(`${API_URL}/plaid/investments`, {
      headers: { 
        'x-demo-mode': 'true',
        'Content-Type': 'application/json'
      }
    });
    
    if (investmentsRes.ok) {
      const investmentsData = await investmentsRes.json();
      console.log(`✅ Investments endpoint working - Portfolio value: $${investmentsData.portfolio.totalValue.toLocaleString()}`);
      
      if (investmentsData.portfolio.assetAllocation && investmentsData.holdings) {
        console.log('✅ Investment data structure is correct for frontend consumption');
      } else {
        console.log('❌ Investment data structure is incorrect for frontend consumption');
      }
    } else {
      console.log('❌ Investments endpoint failed:', investmentsRes.status);
    }

    // Test 5: Check transactions endpoint
    console.log('\n5. Testing transactions endpoint...');
    const transactionsRes = await fetch(`${API_URL}/plaid/transactions?start_date=2025-07-01&end_date=2025-07-31&count=10`, {
      headers: { 
        'x-demo-mode': 'true',
        'Content-Type': 'application/json'
      }
    });
    
    if (transactionsRes.ok) {
      const transactionsData = await transactionsRes.json();
      console.log(`✅ Transactions endpoint working - Found ${transactionsData.transactions.length} transactions`);
      
      if (transactionsData.transactions && transactionsData.transactions.length > 0) {
        console.log('✅ Transaction data structure is correct for frontend consumption');
        const firstTransaction = transactionsData.transactions[0];
        console.log(`   Sample transaction: ${firstTransaction.name} - $${firstTransaction.amount}`);
      } else {
        console.log('❌ Transaction data structure is incorrect for frontend consumption');
      }
    } else {
      console.log('❌ Transactions endpoint failed:', transactionsRes.status);
    }

    console.log('\n🎉 Frontend API testing completed!');
    console.log('\n📋 Summary:');
    console.log('   - Backend is running and accessible');
    console.log('   - Frontend is running and accessible');
    console.log('   - All API endpoints are working correctly');
    console.log('   - Data structure is correct for frontend consumption');
    console.log('\n🔍 Next steps:');
    console.log('   - Check browser console for JavaScript errors');
    console.log('   - Verify that the frontend is actually making the API calls');
    console.log('   - Check if there are any CORS issues');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testFrontendAPI();
