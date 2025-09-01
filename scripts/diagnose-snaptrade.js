#!/usr/bin/env node

/**
 * SnapTrade Production Diagnostic Script
 * 
 * This script helps diagnose SnapTrade configuration issues in production.
 * Run this on the production server to check environment variables and connectivity.
 */

const { PrismaClient } = require('@prisma/client');

// Check environment variables
console.log('🔍 SnapTrade Environment Configuration:');
console.log('=====================================');

console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`Platform: ${process.platform}`);

const snapTradeMode = process.env.SNAPTRADE_MODE || 'sandbox';
console.log(`SNAPTRADE_MODE: ${snapTradeMode}`);

const clientId = process.env.SNAPTRADE_CLIENT_ID;
const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
const clientIdProd = process.env.SNAPTRADE_CLIENT_ID_PROD;
const consumerKeyProd = process.env.SNAPTRADE_CONSUMER_KEY_PROD;

console.log(`SNAPTRADE_CLIENT_ID: ${clientId ? 'SET' : 'NOT SET'}`);
console.log(`SNAPTRADE_CONSUMER_KEY: ${consumerKey ? 'SET' : 'NOT SET'}`);
console.log(`SNAPTRADE_CLIENT_ID_PROD: ${clientIdProd ? 'SET' : 'NOT SET'}`);
console.log(`SNAPTRADE_CONSUMER_KEY_PROD: ${consumerKeyProd ? 'SET' : 'NOT SET'}`);

// Check if we're in production and warn about .env file usage
if (process.env.NODE_ENV === 'production') {
  console.log('\n⚠️  PRODUCTION ENVIRONMENT DETECTED');
  console.log('Environment variables should come from Render, not .env files');
  
  // Check if .env files exist (they shouldn't be used in production)
  const fs = require('fs');
  const path = require('path');
  
  const envFiles = ['.env', '.env.local', '.env.production'];
  envFiles.forEach(file => {
    if (fs.existsSync(file)) {
      console.log(`❌ WARNING: ${file} file exists in production - this should not be used!`);
    } else {
      console.log(`✅ ${file} file not found (good for production)`);
    }
  });
}

// Determine which credentials will be used
const getSnapTradeCredentials = () => {
  if (snapTradeMode === 'production') {
    return {
      clientId: clientIdProd || clientId,
      consumerKey: consumerKeyProd || consumerKey,
      env: process.env.SNAPTRADE_ENV_PROD || 'production'
    };
  } else {
    return {
      clientId: clientId,
      consumerKey: consumerKey,
      env: 'sandbox'
    };
  }
};

const credentials = getSnapTradeCredentials();
console.log('\n📋 Active Credentials:');
console.log(`Client ID: ${credentials.clientId ? 'SET' : 'NOT SET'}`);
console.log(`Consumer Key: ${credentials.consumerKey ? 'SET' : 'NOT SET'}`);
console.log(`Environment: ${credentials.env}`);

// Check if credentials are valid
if (!credentials.clientId || !credentials.consumerKey) {
  console.log('\n❌ ERROR: Missing SnapTrade credentials!');
  console.log('Required environment variables:');
  if (snapTradeMode === 'production') {
    console.log('- SNAPTRADE_CLIENT_ID_PROD or SNAPTRADE_CLIENT_ID');
    console.log('- SNAPTRADE_CONSUMER_KEY_PROD or SNAPTRADE_CONSUMER_KEY');
  } else {
    console.log('- SNAPTRADE_CLIENT_ID');
    console.log('- SNAPTRADE_CONSUMER_KEY');
  }
  process.exit(1);
}

// Test SnapTrade SDK initialization
console.log('\n🧪 Testing SnapTrade SDK Initialization:');
try {
  const { Snaptrade } = require('snaptrade-typescript-sdk');
  
  const snaptrade = new Snaptrade({
    consumerKey: credentials.consumerKey,
    clientId: credentials.clientId,
  });
  
  console.log('✅ SnapTrade SDK initialized successfully');
  
  // Test API status check
  console.log('\n🔍 Testing SnapTrade API connectivity:');
  snaptrade.apiStatus.check()
    .then((status) => {
      console.log('✅ SnapTrade API is accessible');
      console.log('API Status:', status.data);
    })
    .catch((error) => {
      console.log('❌ SnapTrade API connection failed:');
      console.log('Error:', error.message);
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Response:', error.response.data);
      }
    });
    
} catch (error) {
  console.log('❌ Failed to initialize SnapTrade SDK:');
  console.log('Error:', error.message);
}

// Check database connectivity
console.log('\n🗄️ Testing Database Connectivity:');
const prisma = new PrismaClient();

prisma.$connect()
  .then(() => {
    console.log('✅ Database connection successful');
    
    // Check if SnapTrade users table exists
    return prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_name = 'snaptrade_users'`;
  })
  .then((tables) => {
    if (tables.length > 0) {
      console.log('✅ SnapTrade users table exists');
      
      // Check table structure
      return prisma.$queryRaw`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'snaptrade_users' ORDER BY ordinal_position`;
    } else {
      console.log('❌ SnapTrade users table does not exist');
      console.log('Run database migrations to create the table');
    }
  })
  .then((columns) => {
    if (columns) {
      console.log('📋 SnapTrade users table structure:');
      columns.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type}`);
      });
    }
  })
  .catch((error) => {
    console.log('❌ Database connection failed:');
    console.log('Error:', error.message);
  })
  .finally(() => {
    prisma.$disconnect();
  });

// Check Node.js environment
console.log('\n🌍 Environment Information:');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`Platform: ${process.platform}`);
console.log(`Node Version: ${process.version}`);

console.log('\n📝 Next Steps:');
console.log('1. Ensure all required SnapTrade environment variables are set');
console.log('2. Verify SnapTrade credentials are valid for the current environment');
console.log('3. Check that database migrations have been run');
console.log('4. Test SnapTrade API connectivity from the production server');
