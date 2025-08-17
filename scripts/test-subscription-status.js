const jwt = require('jsonwebtoken');
require('dotenv').config();

// Create a test JWT token for ethanteng+test17@gmail.com with the real user ID
// Use the same secret as the backend
const JWT_SECRET = 'your-secret-key-change-in-production';

const testToken = jwt.sign(
  {
    userId: 'cmeel46ft0002rz8uncat1fqc', // Real user ID from database
    email: 'ethanteng+test17@gmail.com',
    tier: 'standard'
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

console.log('🔑 Test JWT Token created:');
console.log(testToken);
console.log('\n🧪 Now test the subscription status endpoint:');
console.log(`curl -H "Authorization: Bearer ${testToken}" http://localhost:3000/api/stripe/subscription-status`);
