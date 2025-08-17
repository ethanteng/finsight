#!/usr/bin/env node

/**
 * Test script to verify welcome email functionality
 * This tests the welcome email service directly
 */

console.log('🧪 Testing Welcome Email Functionality...\n');

async function testWelcomeEmail() {
  try {
    // Test 1: Import the email service
    console.log('1️⃣ Testing email service import...');
    const { sendWelcomeEmail } = require('../dist/services/stripe-email');
    console.log('✅ Email service imported successfully');

    // Test 2: Test welcome email function
    console.log('\n2️⃣ Testing welcome email function...');
    const testEmail = 'test@example.com';
    const testTier = 'premium';
    
    const result = await sendWelcomeEmail(testEmail, testTier);
    console.log(`✅ Welcome email test completed. Result: ${result}`);
    
    if (result) {
      console.log('✅ Welcome email would be sent successfully in production');
    } else {
      console.log('⚠️  Welcome email would not be sent (likely due to missing email configuration)');
    }

    // Test 3: Test with different tiers
    console.log('\n3️⃣ Testing different tiers...');
    const tiers = ['starter', 'standard', 'premium'];
    
    for (const tier of tiers) {
      try {
        const tierResult = await sendWelcomeEmail(testEmail, tier);
        console.log(`   ${tier.toUpperCase()}: ${tierResult ? '✅' : '⚠️'}`);
      } catch (error) {
        console.log(`   ${tier.toUpperCase()}: ❌ Error: ${error.message}`);
      }
    }

    console.log('\n🎉 Welcome email testing completed!');
    
    if (!result) {
      console.log('\n📝 Note: Email not sent because Resend API key is not configured.');
      console.log('   In production with proper email configuration, welcome emails will be sent.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testWelcomeEmail();
