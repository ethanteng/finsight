#!/usr/bin/env node

/**
 * Delete SnapTrade User Only Script
 * 
 * This script deletes the user from SnapTrade without trying to delete from the database.
 * Useful when the user exists in SnapTrade but not in our database.
 */

// Load environment variables from .env file
require('dotenv').config();

const { Snaptrade } = require('snaptrade-typescript-sdk');

console.log('🔧 Deleting SnapTrade User Only');
console.log('==============================');

async function deleteSnapTradeUserOnly() {
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
    console.log(`✅ Consumer Key length: ${credentials.consumerKey ? credentials.consumerKey.length : 0}`);
    console.log(`✅ Consumer Key starts with: ${credentials.consumerKey ? credentials.consumerKey.substring(0, 20) : 'N/A'}`);
    
    // Initialize SnapTrade client
    const snaptrade = new Snaptrade({
      consumerKey: credentials.consumerKey,
      clientId: credentials.clientId,
    });
    
    // Delete the user from SnapTrade
    const userId = 'cmeghjm9f0000rzrvlp6xuv5v';
    console.log(`\n🚀 Deleting user ${userId} from SnapTrade...`);
    console.log(`Using clientId: ${credentials.clientId}`);
    console.log(`Using consumerKey: ${credentials.consumerKey.substring(0, 10)}...`);
    
    const deleteResponse = await snaptrade.authentication.deleteSnapTradeUser({
      userId: userId,
      clientId: credentials.clientId  // Explicitly pass clientId
    });
    
    console.log('✅ User deleted from SnapTrade successfully!');
    console.log('Response:', deleteResponse.data);
    
    console.log('\n🎉 Success! The user has been deleted from SnapTrade.');
    console.log('You can now try the "Connect Account" button again.');
    
  } catch (error) {
    console.error('❌ Failed to delete user from SnapTrade:', error);
    
    if (error.message.includes('User not found')) {
      console.log('ℹ️  User not found in SnapTrade (might already be deleted)');
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.log('❌ Authentication failed. Check your SnapTrade credentials.');
    } else if (error.message.includes('400') || error.message.includes('Bad Request')) {
      console.log('❌ Bad request. Check the user ID and request format.');
    }
    
    process.exit(1);
  }
}

// Run the deletion
deleteSnapTradeUserOnly()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });
