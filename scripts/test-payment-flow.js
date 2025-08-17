const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testPaymentFlow() {
  try {
    console.log('🧪 Testing Payment Success Flow...\n');

    // Simulate the payment success callback parameters
    const mockParams = {
      session_id: 'cs_test_session_123',
      subscription_id: 'sub_test_subscription_456',
      customer_email: 'newuser@example.com',
      tier: 'premium'
    };

    console.log('📋 Mock Payment Success Parameters:');
    console.log(`   Session ID: ${mockParams.session_id}`);
    console.log(`   Subscription ID: ${mockParams.subscription_id}`);
    console.log(`   Customer Email: ${mockParams.customer_email}`);
    console.log(`   Tier: ${mockParams.tier}`);

    // Check if user exists
    console.log('\n🔍 Checking if user exists...');
    const existingUser = await prisma.user.findUnique({
      where: { email: mockParams.customer_email }
    });

    if (existingUser) {
      console.log('✅ User already exists');
      console.log(`   User ID: ${existingUser.id}`);
      console.log(`   Current Tier: ${existingUser.tier}`);
      console.log(`   Subscription Status: ${existingUser.subscriptionStatus}`);
      
      // Would redirect to: /profile?subscription=active&tier=premium
      const redirectUrl = `http://localhost:3001/profile?subscription=active&tier=${mockParams.tier}`;
      console.log(`\n🔄 Redirect URL: ${redirectUrl}`);
      
    } else {
      console.log('❌ User does not exist - new user');
      
      // Would redirect to: /register?subscription=success&tier=premium&email=newuser@example.com&session_id=cs_test_session_123
      const registerUrl = `http://localhost:3001/register?` + 
        `subscription=success&tier=${mockParams.tier}&email=${encodeURIComponent(mockParams.customer_email)}&session_id=${mockParams.session_id}`;
      
      console.log(`\n🔄 Redirect URL: ${registerUrl}`);
      
      // Show what the register page would receive
      console.log('\n📝 Query Parameters for Register Page:');
      console.log(`   subscription: success`);
      console.log(`   tier: ${mockParams.tier}`);
      console.log(`   email: ${mockParams.customer_email}`);
      console.log(`   session_id: ${mockParams.session_id}`);
      
      console.log('\n💡 Frontend can use these parameters to:');
      console.log('   1. Pre-fill the email field');
      console.log('   2. Show success message about payment');
      console.log('   3. Highlight the selected tier');
      console.log('   4. Store session_id for verification');
    }

    console.log('\n🎉 Payment flow test completed!');

  } catch (error) {
    console.error('❌ Error testing payment flow:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPaymentFlow();
