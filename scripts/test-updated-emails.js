const { sendEmailVerificationCode, sendPasswordResetEmail, testEmailConfiguration } = require('../dist/auth/resend-email');

async function testUpdatedEmails() {
  console.log('🧪 Testing Updated Email Templates...\n');

  // Test 1: Test email configuration
  console.log('1️⃣ Testing email configuration...');
  try {
    const configValid = await testEmailConfiguration();
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

  // Test 2: Test updated email verification template
  console.log('2️⃣ Testing updated email verification template...');
  try {
    const verificationSent = await sendEmailVerificationCode(
      'test@example.com',
      '123456',
      'John Doe'
    );
    if (verificationSent) {
      console.log('✅ Email verification template sent successfully\n');
    } else {
      console.log('❌ Email verification template failed to send\n');
    }
  } catch (error) {
    console.log('❌ Email verification template test failed:', error.message, '\n');
  }

  // Test 3: Test updated password reset template
  console.log('3️⃣ Testing updated password reset template...');
  try {
    const resetSent = await sendPasswordResetEmail(
      'test@example.com',
      'reset_token_123456789',
      'John Doe'
    );
    if (resetSent) {
      console.log('✅ Password reset template sent successfully\n');
    } else {
      console.log('❌ Password reset template failed to send\n');
    }
  } catch (error) {
    console.log('❌ Password reset template test failed:', error.message, '\n');
  }

  console.log('🎯 Updated Email Templates Test Complete!');
  console.log('\n📧 Check your email inbox for test emails.');
  console.log('💡 Make sure your email configuration is set up correctly in .env');
  console.log('\n🎨 New Features:');
  console.log('   - Ask Linc branding with brain icon');
  console.log('   - Primary green color scheme (#10b981)');
  console.log('   - Responsive design for mobile devices');
  console.log('   - Professional layout with proper spacing');
  console.log('   - Consistent footer with navigation links');
}

// Run the test
testUpdatedEmails().catch(console.error);
