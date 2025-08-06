import 'dotenv/config';
import { testEmailConfiguration } from './auth/email';

async function testEmail() {
  console.log('Testing email configuration...');
  
  const result = await testEmailConfiguration();
  
  if (result) {
    console.log('✅ Email configuration is working!');
  } else {
    console.log('❌ Email configuration failed. Check your EMAIL_HOST, EMAIL_USER, and EMAIL_PASS.');
  }
}

testEmail().catch(console.error); 