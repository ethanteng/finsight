const jwt = require('jsonwebtoken');

// The token we're testing
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbWVlbDQ2ZnQwMDAycno4dW5jYXQxZnFjIiwiZW1haWwiOiJldGhhbnRlbmcrdGVzdDE3QGdtYWlsLmNvbSIsInRpZXIiOiJzdGFuZGFyZCIsImlhdCI6MTc1NTM2OTIxOSwiZXhwIjoxNzU1MzcyODE5fQ.DB7nxbCnuMcmuSKKNkzE2WXTwsB_onpdOHuo_VaWrfU';

// The secret used by the backend
const JWT_SECRET = 'your-secret-key-change-in-production';

console.log('🔍 Debugging JWT token...');
console.log('Token:', token);

try {
  // Decode without verification first
  const decoded = jwt.decode(token);
  console.log('\n📋 Decoded payload (without verification):');
  console.log(JSON.stringify(decoded, null, 2));
  
  // Now verify with the secret
  const verified = jwt.verify(token, JWT_SECRET);
  console.log('\n✅ Verified payload:');
  console.log(JSON.stringify(verified, null, 2));
  
  console.log('\n🔑 Key fields:');
  console.log('userId:', verified.userId);
  console.log('email:', verified.email);
  console.log('tier:', verified.tier);
  console.log('iat:', verified.iat);
  console.log('exp:', verified.exp);
  
  // Check if expired
  const now = Math.floor(Date.now() / 1000);
  console.log('\n⏰ Token status:');
  console.log('Current time:', now);
  console.log('Token expires:', verified.exp);
  console.log('Is expired:', now > verified.exp ? 'YES' : 'NO');
  
} catch (error) {
  console.error('❌ Error verifying token:', error.message);
}
