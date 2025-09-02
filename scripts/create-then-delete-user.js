#!/usr/bin/env node

/**
 * Create Then Delete SnapTrade User Script
 * 
 * This script creates a user in SnapTrade, then immediately deletes it.
 * This ensures the user exists before trying to delete it.
 */

// Load environment variables from .env file
require('dotenv').config();

const { Snaptrade } = require('snaptrade-typescript-sdk');

console.log('🔧 Create Then Delete SnapTrade User');
console.log('===================================');

async function createThenDeleteUser() {
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
    
    const userId = 'cmeghjm9f0000rzrvlp6xuv5v';
    
    // Step 1: Try to create the user
    console.log(`\n🚀 Step 1: Creating user ${userId} in SnapTrade...`);
    
    try {
      const createResponse = await snaptrade.authentication.registerSnapTradeUser({
        userId: userId
      });
      
      console.log('✅ User created successfully!');
      console.log('Response:', createResponse.data);
      
    } catch (createError) {
      if (createError.message.includes('User with the following userId already exist')) {
        console.log('✅ User already exists (this is what we expected)');
      } else {
        console.log('❌ Failed to create user:', createError.message);
        throw createError;
      }
    }
    
    // Step 2: Now try to delete the user
    console.log(`\n🚀 Step 2: Deleting user ${userId} from SnapTrade...`);
    
    try {
      const deleteResponse = await snaptrade.authentication.deleteSnapTradeUser({
        userId: userId
      });
      
      console.log('✅ User deleted successfully!');
      console.log('Response:', deleteResponse.data);
      
      console.log('\n🎉 Success! The user has been created and then deleted from SnapTrade.');
      console.log('You can now try the "Connect Account" button again.');
      
    } catch (deleteError) {
      console.log('❌ Failed to delete user:', deleteError.message);
      throw deleteError;
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Run the script
createThenDeleteUser()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });
