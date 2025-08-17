const { sendWelcomeEmail, sendTierChangeEmail, testStripeEmailConfiguration } = require('../dist/services/stripe-email');

async function testStripeEmails() {
  console.log('🧪 Testing Stripe Email System...\n');

  // Test 1: Test email configuration
  console.log('1️⃣ Testing email configuration...');
  try {
    const configValid = await testStripeEmailConfiguration();
    if (configValid) {
      console.log('✅ Email configuration is valid\n');
    } else {
      console.log('❌ Email configuration failed\n');
      return;
    }
  } catch (error) {
    console.log('❌ Email configuration test failed:', error.message, '\n');
    return;
  }

  // Test 2: Test welcome email (new user)
  console.log('2️⃣ Testing welcome email for new user...');
  try {
    const welcomeSent = await sendWelcomeEmail(
      'test@example.com',
      'premium',
      'John Doe'
    );
    if (welcomeSent) {
      console.log('✅ Welcome email sent successfully\n');
    } else {
      console.log('❌ Welcome email failed to send\n');
    }
  } catch (error) {
    console.log('❌ Welcome email test failed:', error.message, '\n');
  }

  // Test 3: Test tier change email (upgrade)
  console.log('3️⃣ Testing tier change email (upgrade)...');
  try {
    const upgradeSent = await sendTierChangeEmail(
      'test@example.com',
      'premium',
      'standard',
      'John Doe'
    );
    if (upgradeSent) {
      console.log('✅ Tier upgrade email sent successfully\n');
    } else {
      console.log('❌ Tier upgrade email failed to send\n');
    }
  } catch (error) {
    console.log('❌ Tier upgrade email test failed:', error.message, '\n');
  }

  // Test 4: Test tier change email (downgrade)
  console.log('4️⃣ Testing tier change email (downgrade)...');
  try {
    const downgradeSent = await sendTierChangeEmail(
      'test@example.com',
      'starter',
      'premium',
      'John Doe'
    );
    if (downgradeSent) {
      console.log('✅ Tier downgrade email sent successfully\n');
    } else {
      console.log('❌ Tier downgrade email failed to send\n');
    }
  } catch (error) {
    console.log('❌ Tier downgrade email test failed:', error.message, '\n');
  }

  console.log('🎯 Stripe Email System Test Complete!');
  console.log('\n📧 Check your email inbox for test emails.');
  console.log('💡 Make sure your email configuration is set up correctly in .env');
}

// Run the test
testStripeEmails().catch(console.error);
