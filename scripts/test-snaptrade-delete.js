#!/usr/bin/env node

/**
 * Test SnapTrade Delete Script
 * 
 * This script tests the SnapTrade delete functionality.
 * You'll need to provide a valid JWT token for authentication.
 */

const https = require('https');

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'https://finsight-backend-hrel.onrender.com';
const JWT_TOKEN = process.env.JWT_TOKEN; // You'll need to set this

if (!JWT_TOKEN) {
  console.log('❌ ERROR: JWT_TOKEN environment variable not set');
  console.log('');
  console.log('To get a JWT token:');
  console.log('1. Log into your app in the browser');
  console.log('2. Open browser dev tools');
  console.log('3. Go to Application/Storage tab');
  console.log('4. Find the JWT token in localStorage or cookies');
  console.log('5. Set it as an environment variable:');
  console.log('   export JWT_TOKEN="your_jwt_token_here"');
  console.log('6. Run this script again');
  process.exit(1);
}

async function testSnapTradeDelete() {
  console.log('🧪 Testing SnapTrade Delete');
  console.log('==========================');
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log(`JWT Token: ${JWT_TOKEN.substring(0, 20)}...`);
  console.log('');

  const options = {
    hostname: 'finsight-backend-hrel.onrender.com',
    port: 443,
    path: '/snaptrade/delete',
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${JWT_TOKEN}`,
      'Content-Type': 'application/json'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Headers:`, res.headers);
        console.log(`Response:`, data);
        
        try {
          const response = JSON.parse(data);
          if (response.success) {
            console.log('✅ SnapTrade user deleted successfully');
            console.log('You can now try registering again');
          } else {
            console.log('❌ Delete failed:', response.error);
          }
        } catch (e) {
          console.log('❌ Failed to parse response:', data);
        }
        
        resolve();
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request failed:', error);
      reject(error);
    });

    req.end();
  });
}

// Run the test
testSnapTradeDelete()
  .then(() => {
    console.log('\n🎉 Test completed');
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
