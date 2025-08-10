const API_URL = 'http://localhost:3000';

async function testEnhancedEndpoints() {
  console.log('🧪 Testing Enhanced Plaid Endpoints...\n');

  try {
    // Test 1: Comprehensive Investment Endpoint
    console.log('1️⃣ Testing /plaid/investments endpoint...');
    const investmentsRes = await fetch(`${API_URL}/plaid/investments`, {
      headers: {
        'x-demo-mode': 'true'
      }
    });
    
    if (investmentsRes.ok) {
      const investmentsData = await investmentsRes.json();
      console.log('✅ Investments endpoint working!');
      console.log('   Portfolio value:', investmentsData.portfolio?.total_value || 'N/A');
      console.log('   Holdings count:', investmentsData.portfolio?.holding_count || 'N/A');
      console.log('   Securities count:', investmentsData.portfolio?.security_count || 'N/A');
      console.log('   Asset allocation:', Object.keys(investmentsData.portfolio?.asset_allocation || {}).length, 'types');
    } else {
      console.log('❌ Investments endpoint failed:', investmentsRes.status);
    }

    // Test 2: Enhanced Transactions Endpoint
    console.log('\n2️⃣ Testing /plaid/transactions endpoint (with enrichment)...');
    const transactionsRes = await fetch(`${API_URL}/plaid/transactions?count=5`, {
      headers: {
        'x-demo-mode': 'true'
      }
    });
    
    if (transactionsRes.ok) {
      const transactionsData = await transactionsRes.json();
      console.log('✅ Transactions endpoint working!');
      console.log('   Total transactions:', transactionsData.total || 0);
      console.log('   Sample transaction with enriched data:');
      
      if (transactionsData.transactions && transactionsData.transactions.length > 0) {
        const sampleTx = transactionsData.transactions[0];
        console.log('     Name:', sampleTx.name);
        console.log('     Amount:', sampleTx.amount);
        console.log('     Category:', sampleTx.category?.join(', ') || 'N/A');
        console.log('     Enriched data available:', !!sampleTx.enriched_data);
        if (sampleTx.enriched_data) {
          console.log('     Merchant name:', sampleTx.enriched_data.merchant_name || 'N/A');
          console.log('     Website:', sampleTx.enriched_data.website || 'N/A');
          console.log('     Logo URL:', sampleTx.enriched_data.logo_url ? 'Yes' : 'No');
        }
      }
    } else {
      console.log('❌ Transactions endpoint failed:', transactionsRes.status);
    }

    // Test 3: Investment Holdings Endpoint
    console.log('\n3️⃣ Testing /plaid/investments/holdings endpoint...');
    const holdingsRes = await fetch(`${API_URL}/plaid/investments/holdings`, {
      headers: {
        'x-demo-mode': 'true'
      }
    });
    
    if (holdingsRes.ok) {
      const holdingsData = await holdingsRes.json();
      console.log('✅ Holdings endpoint working!');
      console.log('   Holdings count:', holdingsData.analysis?.portfolio?.holding_count || 'N/A');
      console.log('   Securities count:', holdingsData.analysis?.portfolio?.security_count || 'N/A');
    } else {
      console.log('❌ Holdings endpoint failed:', holdingsRes.status);
    }

    // Test 4: Investment Transactions Endpoint
    console.log('\n4️⃣ Testing /plaid/investments/transactions endpoint...');
    const invTransactionsRes = await fetch(`${API_URL}/plaid/investments/transactions`, {
      headers: {
        'x-demo-mode': 'true'
      }
    });
    
    if (invTransactionsRes.ok) {
      const invTransactionsData = await invTransactionsRes.json();
      console.log('✅ Investment transactions endpoint working!');
      console.log('   Transaction count:', invTransactionsData.analysis?.activity?.totalTransactions || 'N/A');
      console.log('   Total volume:', invTransactionsData.analysis?.activity?.totalVolume || 'N/A');
    } else {
      console.log('❌ Investment transactions endpoint failed:', invTransactionsRes.status);
    }

    console.log('\n🎉 Enhanced Plaid endpoints test completed!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

testEnhancedEndpoints();
