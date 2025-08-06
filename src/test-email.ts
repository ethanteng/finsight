import 'dotenv/config';
import { testEmailConfiguration } from './auth/resend-email';

async function testEmail() {
  console.log('Testing email configuration...');
  
  const result = await testEmailConfiguration();
  
  if (result) {
    console.log('✅ Email configuration is working!');
  } else {
    console.log('❌ Email configuration failed. Check your RESEND_API_KEY.');
  }
}

testEmail().catch(console.error); 