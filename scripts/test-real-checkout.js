const axios = require('axios');

async function testRealCheckout() {
  try {
    console.log('🧪 Testing Real Stripe Checkout Session API...\n');

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const apiUrl = `${baseUrl.replace('3001', '3000')}/api/stripe/create-checkout-session`;

    console.log('🌐 API Endpoint:');
    console.log(`   ${apiUrl}`);

    // Test data for different tiers
    const testRequests = [
      {
        name: 'Starter Tier',
        data: {
          priceId: 'price_starter_monthly',
          customerEmail: 'starter@test.com',
          successUrl: `${baseUrl}/api/stripe/payment-success?tier=starter`,
          cancelUrl: `${baseUrl}/pricing`
        }
      },
      {
        name: 'Standard Tier',
        data: {
          priceId: 'price_standard_monthly',
          customerEmail: 'standard@test.com',
          successUrl: `${baseUrl}/api/stripe/payment-success?tier=standard`,
          cancelUrl: `${baseUrl}/pricing`
        }
      },
      {
        name: 'Premium Tier',
        data: {
          priceId: 'price_premium_monthly',
          customerEmail: 'premium@test.com',
          successUrl: `${baseUrl}/api/stripe/payment-success?tier=premium`,
          cancelUrl: `${baseUrl}/pricing`
        }
      }
    ];

    console.log('\n📋 Test Requests:');
    for (const test of testRequests) {
      console.log(`\n   ${test.name}:`);
      console.log(`     Price ID: ${test.data.priceId}`);
      console.log(`     Email: ${test.data.customerEmail}`);
      console.log(`     Success URL: ${test.data.successUrl}`);
      console.log(`     Cancel URL: ${test.data.cancelUrl}`);
    }

    console.log('\n🚀 Attempting to create checkout sessions...');
    console.log('   Note: This will fail with real Stripe price IDs, but shows the API structure');

    for (const test of testRequests) {
      try {
        console.log(`\n   Testing ${test.name}...`);
        
        const response = await axios.post(apiUrl, test.data, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });

        console.log(`   ✅ Success! Response:`);
        console.log(`      Session ID: ${response.data.sessionId}`);
        console.log(`      Checkout URL: ${response.data.url}`);
        
        // Show the complete flow
        console.log(`   🔄 Complete Flow:`);
        console.log(`      1. User visits: ${response.data.url}`);
        console.log(`      2. Completes payment on Stripe`);
        console.log(`      3. Redirected to: ${test.data.successUrl}`);
        console.log(`      4. Our endpoint processes and redirects to /register`);

      } catch (error) {
        if (error.response) {
          console.log(`   ❌ API Error (${error.response.status}):`);
          console.log(`      ${error.response.data.error || 'Unknown error'}`);
          if (error.response.data.details) {
            console.log(`      Details: ${error.response.data.details}`);
          }
        } else if (error.code === 'ECONNREFUSED') {
          console.log(`   ❌ Connection Error: Backend server not running`);
          console.log(`      Make sure to run: npm run dev:backend`);
        } else {
          console.log(`   ❌ Error: ${error.message}`);
        }
      }
    }

    console.log('\n💡 Expected Behavior:');
    console.log('   - With real Stripe price IDs: Creates checkout sessions');
    console.log('   - With fake price IDs: Returns validation error');
    console.log('   - With server down: Connection refused error');

    console.log('\n🎯 To Test Successfully:');
    console.log('   1. Set up real Stripe price IDs in your environment');
    console.log('   2. Ensure backend server is running');
    console.log('   3. Test with real Stripe test mode');

  } catch (error) {
    console.error('❌ Error in test:', error.message);
  }
}

// Check if axios is available
try {
  require('axios');
  testRealCheckout();
} catch (error) {
  console.log('❌ Axios not available. Install with: npm install axios');
  console.log('   Or use the mock test: node scripts/test-checkout-session.js');
}
