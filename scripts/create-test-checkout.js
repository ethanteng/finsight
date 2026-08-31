// Load environment variables from .env file
require('dotenv').config();

const axios = require('axios');

async function createTestCheckout() {
  try {
    console.log('🚀 Creating Real Stripe Checkout Session for Manual Testing...\n');

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const apiUrl = 'http://localhost:3000/api/stripe/create-checkout-session'; // Always use local backend for testing

    console.log('🌐 API Endpoint:');
    console.log(`   ${apiUrl}`);

    // Test checkout session data - using real Stripe price IDs
    const checkoutData = {
      priceId: process.env.STRIPE_PRICE_DEFAULT || process.env.STRIPE_PRICE_STANDARD || 'price_standard',
      customerEmail: 'ethanteng+test17@gmail.com',
      successUrl: `${baseUrl}/api/stripe/payment-success?session_id={CHECKOUT_SESSION_ID}&tier=standard`,
      cancelUrl: `${baseUrl}/pricing`
    };

    console.log('📋 Checkout Session Data:');
    console.log(`   Price ID: ${checkoutData.priceId}`);
    console.log(`   Customer Email: ${checkoutData.customerEmail}`);
    console.log(`   Success URL: ${checkoutData.successUrl}`);
    console.log(`   Cancel URL: ${checkoutData.cancelUrl}`);

    console.log('\n🚀 Creating checkout session...');

    try {
      const response = await axios.post(apiUrl, checkoutData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      console.log('\n✅ Checkout Session Created Successfully!');
      console.log(`   Session ID: ${response.data.sessionId}`);
      console.log(`   Checkout URL: ${response.data.url}`);

      console.log('\n🎯 Manual Testing Instructions:');
      console.log('1. Click the checkout URL above to open Stripe Checkout');
      console.log('2. Use Stripe test card: 4242 4242 4242 4242');
      console.log('3. Any future date for expiry (e.g., 12/25)');
      console.log('4. Any 3-digit CVC (e.g., 123)');
      console.log('5. Any name and email');
      console.log('6. Click "Subscribe" to complete payment');

      console.log('\n🔄 Expected Flow:');
      console.log('   Payment Success → Stripe redirects to success URL');
      console.log('   Our endpoint processes → Redirects to /register');
      console.log('   Register page shows: subscription=success&tier=standard');

      console.log('\n🔗 Test Links:');
      console.log(`   Checkout: ${response.data.url}`);
      console.log(`   Success URL: ${checkoutData.successUrl}`);
      console.log(`   Expected Register: ${baseUrl}/register?subscription=success&tier=standard&email=${encodeURIComponent(checkoutData.customerEmail)}`);

    } catch (error) {
      if (error.response) {
        console.log('\n❌ API Error:');
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Error: ${error.response.data.error || 'Unknown error'}`);
        if (error.response.data.details) {
          console.log(`   Details: ${error.response.data.details}`);
        }

        if (error.response.status === 500 && error.response.data.details?.includes('Invalid price ID')) {
          console.log('\n💡 Price ID Issue:');
          console.log('   The price ID is not valid. You need to:');
          console.log('   1. Create real Stripe products and prices in your Stripe dashboard');
          console.log('   2. Set environment variables:');
          console.log('      export STRIPE_PRICE_DEFAULT=price_1ABC123...');
          console.log('      export STRIPE_PRICE_STANDARD=price_1DEF456...');
          console.log('      export STRIPE_PRICE_PREMIUM=price_1GHI789...');
          console.log('   3. Or use Stripe test price IDs from your test dashboard');
        }
      } else if (error.code === 'ECONNREFUSED') {
        console.log('\n❌ Connection Error: Backend server not running');
        console.log('   Make sure to run: npm run dev:backend');
      } else {
        console.log('\n❌ Error:', error.message);
      }
    }

  } catch (error) {
    console.error('❌ Error in createTestCheckout:', error.message);
  }
}

// Check if we have the required environment variables
console.log('🔍 Environment Check:');
console.log(`   STRIPE_SECRET_KEY: ${process.env.STRIPE_SECRET_KEY ? '✅ Set' : '❌ Not set'}`);
console.log(`   STRIPE_PUBLISHABLE_KEY: ${process.env.STRIPE_PUBLISHABLE_KEY ? '✅ Set' : '❌ Not set'}`);
console.log(`   FRONTEND_URL: ${process.env.FRONTEND_URL || 'http://localhost:3001 (default)'}`);

if (!process.env.STRIPE_SECRET_KEY) {
  console.log('\n⚠️  Warning: STRIPE_SECRET_KEY not set');
  console.log('   Set it with: export STRIPE_SECRET_KEY=sk_test_...');
  console.log('   Or add to your .env file');
}

console.log(''); // Empty line for spacing

createTestCheckout();
