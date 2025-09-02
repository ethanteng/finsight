#!/usr/bin/env node

/**
 * Check SnapTrade Environments Script
 * 
 * This script checks what environments you have configured and suggests where the user might be.
 */

// Load environment variables from .env file
require('dotenv').config();

console.log('🔍 Checking SnapTrade Environments');
console.log('==================================');

function checkEnvironments() {
  console.log('\n📋 Environment Configuration:');
  
  // Check sandbox credentials
  console.log('\n🔧 SANDBOX Environment:');
  console.log(`  SNAPTRADE_MODE: ${process.env.SNAPTRADE_MODE || 'sandbox'}`);
  console.log(`  SNAPTRADE_CLIENT_ID: ${process.env.SNAPTRADE_CLIENT_ID ? 'SET' : 'NOT SET'}`);
  console.log(`  SNAPTRADE_CONSUMER_KEY: ${process.env.SNAPTRADE_CONSUMER_KEY ? 'SET' : 'NOT SET'}`);
  
  if (process.env.SNAPTRADE_CLIENT_ID) {
    console.log(`  Client ID: ${process.env.SNAPTRADE_CLIENT_ID}`);
  }
  
  // Check production credentials
  console.log('\n🔧 PRODUCTION Environment:');
  console.log(`  SNAPTRADE_CLIENT_ID_PROD: ${process.env.SNAPTRADE_CLIENT_ID_PROD ? 'SET' : 'NOT SET'}`);
  console.log(`  SNAPTRADE_CONSUMER_KEY_PROD: ${process.env.SNAPTRADE_CONSUMER_KEY_PROD ? 'SET' : 'NOT SET'}`);
  
  if (process.env.SNAPTRADE_CLIENT_ID_PROD) {
    console.log(`  Client ID: ${process.env.SNAPTRADE_CLIENT_ID_PROD}`);
  }
  
  // Analysis
  console.log('\n💡 Analysis:');
  
  const hasSandbox = process.env.SNAPTRADE_CLIENT_ID && process.env.SNAPTRADE_CONSUMER_KEY;
  const hasProduction = process.env.SNAPTRADE_CLIENT_ID_PROD && process.env.SNAPTRADE_CONSUMER_KEY_PROD;
  
  if (hasSandbox && hasProduction) {
    console.log('✅ You have BOTH sandbox and production credentials');
    console.log('🤔 The user might exist in production but you\'re trying to delete from sandbox');
    console.log('💡 Try setting SNAPTRADE_MODE=production and running the delete script again');
  } else if (hasSandbox) {
    console.log('✅ You have sandbox credentials only');
    console.log('🤔 The user should exist in sandbox if that\'s where you tested');
  } else if (hasProduction) {
    console.log('✅ You have production credentials only');
    console.log('🤔 The user might exist in production');
  } else {
    console.log('❌ No credentials found');
  }
  
  // Recommendations
  console.log('\n🎯 Recommendations:');
  console.log('1. If you tested in production, set SNAPTRADE_MODE=production');
  console.log('2. If you tested in sandbox, the user should be deletable from sandbox');
  console.log('3. The 401 error suggests the user doesn\'t exist in the current environment');
  console.log('4. You might need to create the user first, then delete it');
}

checkEnvironments();
