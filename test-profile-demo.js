#!/usr/bin/env node

// Test script to verify profile page demo mode is working correctly
const API_URL = 'http://localhost:3000';

async function testProfileDemo() {
  console.log('🧪 Testing Profile Page Demo Mode');
  console.log('================================\n');

  try {
    // Test 1: Demo accounts endpoint
    console.log('1. Testing /plaid/all-accounts (demo mode)...');
    const accountsRes = await fetch(`${API_URL}/plaid/all-accounts`, {
      headers: { 'x-demo-mode': 'true' }
    });
    
    if (accountsRes.ok) {
      const accountsData = await accountsRes.json();
      console.log(`✅ Accounts endpoint working - Found ${accountsData.accounts.length} accounts`);
      
      // Verify account data structure
      const firstAccount = accountsData.accounts[0];
      if (firstAccount.name === 'Chase Checking' && firstAccount.balance.current === 12450.67) {
        console.log('✅ Account data structure correct');
      } else {
        console.log('❌ Account data structure incorrect');
      }
    } else {
      console.log('❌ Accounts endpoint failed:', accountsRes.status);
    }

    // Test 2: Demo investments endpoint
    console.log('\n2. Testing /plaid/investments (demo mode)...');
    const investmentsRes = await fetch(`${API_URL}/plaid/investments`, {
      headers: { 'x-demo-mode': 'true' }
    });
    
    if (investmentsRes.ok) {
      const investmentsData = await investmentsRes.json();
      console.log(`✅ Investments endpoint working - Portfolio value: $${investmentsData.portfolio.totalValue.toLocaleString()}`);
      
      // Verify investment data structure
      if (investmentsData.portfolio.assetAllocation.length > 0 && 
          investmentsData.holdings.length > 0) {
        console.log('✅ Investment data structure correct');
      } else {
        console.log('❌ Investment data structure incorrect');
      }
    } else {
      console.log('❌ Investments endpoint failed:', investmentsRes.status);
    }

    // Test 3: Demo transactions endpoint
    console.log('\n3. Testing /plaid/transactions (demo mode)...');
    const transactionsRes = await fetch(`${API_URL}/plaid/transactions?start_date=2025-07-01&end_date=2025-07-31&count=10`, {
      headers: { 'x-demo-mode': 'true' }
    });
    
    if (transactionsRes.ok) {
      const transactionsData = await transactionsRes.json();
      console.log(`✅ Transactions endpoint working - Found ${transactionsData.transactions.length} transactions`);
      
      // Verify transaction data structure
      const firstTransaction = transactionsData.transactions[0];
      if (firstTransaction.merchant_name && firstTransaction.category) {
        console.log('✅ Transaction data structure correct');
      } else {
        console.log('❌ Transaction data structure incorrect');
      }
    } else {
      console.log('❌ Transactions endpoint failed:', transactionsRes.status);
    }

    // Test 4: Frontend profile page
    console.log('\n4. Testing frontend profile page...');
    const frontendRes = await fetch('http://localhost:3001/profile?demo=true');
    
    if (frontendRes.ok) {
      const html = await frontendRes.text();
      if (html.includes('Your Connected Accounts') && 
          html.includes('Investment Portfolio') && 
          html.includes('Transaction History')) {
        console.log('✅ Frontend profile page working correctly');
      } else {
        console.log('❌ Frontend profile page missing expected content');
      }
    } else {
      console.log('❌ Frontend profile page failed:', frontendRes.status);
    }

    console.log('\n🎉 Profile page demo mode testing completed!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testProfileDemo();
