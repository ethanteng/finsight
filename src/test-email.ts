import 'dotenv/config';
import { testEmailConfiguration } from './auth/email';

async function testEmail() {
  console.log('Testing email configuration...');
  
  try {
    const result = await testEmailConfiguration();
    
    if (result) {
      console.log('✅ Email configuration is working!');
    } else {
      console.log('❌ Email configuration failed. Check your RESEND_API_KEY.');
    }
  } catch (error) {
    console.log('❌ Email configuration failed. Check your RESEND_API_KEY.');
    console.error('Error:', error);
  }
}

testEmail().catch(console.error); 