const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testCheckoutSession() {
  try {
    console.log('🧪 Testing Stripe Checkout Session Creation...\n');

    // Mock checkout session request data
    const checkoutRequest = {
      priceId: 'price_starter_monthly', // This would be a real Stripe price ID
      customerEmail: 'testuser@example.com',
      tier: 'standard'
    };

    console.log('📋 Checkout Session Request:');
    console.log(`   Price ID: ${checkoutRequest.priceId}`);
    console.log(`   Customer Email: ${checkoutRequest.customerEmail}`);
    console.log(`   Tier: ${checkoutRequest.tier}`);

    // Simulate what the Stripe service would generate
    console.log('\n🔗 Generated URLs:');
    
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    
    // Success URL (what we generate)
    const successUrl = `${baseUrl}/api/stripe/payment-success?tier=${encodeURIComponent(checkoutRequest.tier)}&customer_email=${encodeURIComponent(checkoutRequest.customerEmail)}`;
    console.log('✅ Success URL:');
    console.log(`   ${successUrl}`);
    
    // Cancel URL
    const cancelUrl = `${baseUrl}/pricing`;
    console.log('❌ Cancel URL:');
    console.log(`   ${cancelUrl}`);

    // Simulate the complete flow
    console.log('\n🔄 Complete Checkout Flow:');
    console.log('1. User clicks "Subscribe" on pricing page');
    console.log('2. Frontend calls POST /api/stripe/create-checkout-session');
    console.log('3. Backend creates Stripe checkout session with:');
    console.log(`   - Success URL: ${successUrl}`);
    console.log(`   - Cancel URL: ${cancelUrl}`);
    console.log(`   - Customer Email: ${checkoutRequest.customerEmail}`);
    console.log('4. User redirected to Stripe Checkout');
    console.log('5. User completes payment');
    console.log('6. Stripe redirects to success URL');
    console.log('7. Our endpoint processes payment and redirects to /register');

    // Show what the register page would receive
    console.log('\n📝 Final Register Page URL:');
    const registerUrl = `${baseUrl}/register?subscription=success&tier=${checkoutRequest.tier}&email=${encodeURIComponent(checkoutRequest.customerEmail)}&session_id=cs_test_session_123`;
    console.log(`   ${registerUrl}`);

    // Test with different tiers
    console.log('\n🎯 Testing Different Tiers:');
    const tiers = ['starter', 'standard', 'premium'];
    
    for (const tier of tiers) {
      const tierSuccessUrl = `${baseUrl}/api/stripe/payment-success?tier=${encodeURIComponent(tier)}&customer_email=${encodeURIComponent(checkoutRequest.customerEmail)}`;
      const tierRegisterUrl = `${baseUrl}/register?subscription=success&tier=${tier}&email=${encodeURIComponent(checkoutRequest.customerEmail)}&session_id=cs_test_session_123`;
      
      console.log(`\n   ${tier.toUpperCase()} Tier:`);
      console.log(`     Success URL: ${tierSuccessUrl}`);
      console.log(`     Register URL: ${tierRegisterUrl}`);
    }

    // Show environment configuration
    console.log('\n⚙️ Environment Configuration:');
    console.log(`   FRONTEND_URL: ${process.env.FRONTEND_URL || 'http://localhost:3001 (default)'}`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development (default)'}`);

    console.log('\n🎉 Checkout session test completed!');
    console.log('\n💡 To test with real Stripe:');
    console.log('   1. Set up real Stripe price IDs in your environment');
    console.log('   2. Use the create-checkout-session endpoint');
    console.log('   3. Test the complete flow end-to-end');

  } catch (error) {
    console.error('❌ Error testing checkout session:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCheckoutSession();
