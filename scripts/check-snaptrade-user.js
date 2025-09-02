#!/usr/bin/env node

/**
 * Check SnapTrade User Script
 * 
 * This script checks if a user exists in SnapTrade before trying to delete them.
 */

// Load environment variables from .env file
require('dotenv').config();

const { Snaptrade } = require('snaptrade-typescript-sdk');

console.log('🔍 Checking SnapTrade User');
console.log('=========================');

async function checkSnapTradeUser() {
  try {
    // Get credentials
    const snapTradeMode = process.env.SNAPTRADE_MODE || 'sandbox';
    
    const getSnapTradeCredentials = () => {
      if (snapTradeMode === 'production') {
        return {
          clientId: process.env.SNAPTRADE_CLIENT_ID_PROD || process.env.SNAPTRADE_CLIENT_ID,
          consumerKey: process.env.SNAPTRADE_CONSUMER_KEY_PROD || process.env.SNAPTRADE_CONSUMER_KEY,
          env: process.env.SNAPTRADE_ENV_PROD || 'production'
        };
      } else {
        return {
          clientId: process.env.SNAPTRADE_CLIENT_ID,
          consumerKey: process.env.SNAPTRADE_CONSUMER_KEY,
          env: 'sandbox'
        };
      }
    };
    
    const credentials = getSnapTradeCredentials();
    
    if (!credentials.clientId || !credentials.consumerKey) {
      console.error('❌ SnapTrade credentials not configured');
      process.exit(1);
    }
    
    console.log(`✅ Using ${snapTradeMode} mode`);
    console.log(`✅ Client ID: ${credentials.clientId}`);
    console.log(`✅ Consumer Key: ${credentials.consumerKey ? 'SET' : 'NOT SET'}`);
    
    // Initialize SnapTrade client
    const snaptrade = new Snaptrade({
      consumerKey: credentials.consumerKey,
      clientId: credentials.clientId,
    });
    
    // Check if the user exists by trying to get their status
    const userId = 'cmeghjm9f0000rzrvlp6xuv5v';
    console.log(`\n🔍 Checking if user ${userId} exists in SnapTrade...`);
    
    try {
      // Try to get user status - this will tell us if the user exists
      const userStatus = await snaptrade.authentication.getUserDetails({
        userId: userId
      });
      
      console.log('✅ User exists in SnapTrade!');
      console.log('User details:', userStatus.data);
      
    } catch (error) {
      if (error.message.includes('404') || error.message.includes('User not found')) {
        console.log('❌ User does not exist in SnapTrade');
        console.log('This explains why the delete failed with 401 - the user was never created in this environment');
      } else {
        console.log('❌ Error checking user:', error.message);
      }
    }
    
    // Also try to list all users to see what's available
    console.log('\n🔍 Listing all users in SnapTrade...');
    try {
      const allUsers = await snaptrade.authentication.listUsers();
      console.log('✅ Found users:', allUsers.data);
    } catch (error) {
      console.log('❌ Could not list users:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Run the check
checkSnapTradeUser()
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error.message);
    process.exit(1);
  });
