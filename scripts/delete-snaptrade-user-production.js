#!/usr/bin/env node

/**
 * Delete SnapTrade User from Production Environment
 * 
 * This script deletes a specific user from SnapTrade using production credentials.
 * Run this on your production server (Render) where production credentials are configured.
 */

// Load environment variables from .env file
require('dotenv').config();

const { Snaptrade } = require('snaptrade-typescript-sdk');

console.log('🔧 Delete SnapTrade User from Production');
console.log('========================================');

async function deleteUserFromProduction() {
  try {
    // Get production credentials
    const snapTradeMode = process.env.SNAPTRADE_MODE || 'production';
    
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
      console.error('❌ SnapTrade production credentials not configured');
      console.error('Required environment variables:');
      console.error('- SNAPTRADE_CLIENT_ID_PROD or SNAPTRADE_CLIENT_ID');
      console.error('- SNAPTRADE_CONSUMER_KEY_PROD or SNAPTRADE_CONSUMER_KEY');
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
    
    // Try to delete the user
    console.log(`\n🚀 Deleting user ${userId} from SnapTrade production...`);
    
    try {
      const deleteResponse = await snaptrade.authentication.deleteSnapTradeUser({
        userId: userId
      });
      
      console.log('✅ User deleted successfully!');
      console.log('Response:', deleteResponse.data);
      
      console.log('\n🎉 Success! The user has been deleted from SnapTrade production.');
      console.log('You can now try the "Connect Account" button again.');
      
    } catch (deleteError) {
      if (deleteError.message.includes('User not found') || 
          (deleteError.responseBody && deleteError.responseBody.detail && deleteError.responseBody.detail.includes('User not found'))) {
        console.log('✅ User not found in SnapTrade (already deleted or never existed)');
        console.log('This is fine - you can now try the "Connect Account" button again.');
      } else {
        console.log('❌ Failed to delete user:', deleteError.message);
        throw deleteError;
      }
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Run the script
deleteUserFromProduction()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });
