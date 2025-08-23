#!/usr/bin/env node

/**
 * Test script for MailerLite sync functionality
 * Usage: node scripts/test-mailerlite-sync.js [userIdentifier]
 * 
 * If userIdentifier is provided, syncs only that user
 * userIdentifier can be either a user ID or email address
 * If no userIdentifier is provided, syncs all users
 */

require('dotenv/config');

const { PrismaClient } = require('@prisma/client');

async function testMailerLiteSync() {
  const args = process.argv.slice(2);
  const userIdentifier = args[0]; // Optional: specific user ID or email to test
  
  console.log('🧪 Testing MailerLite sync functionality...');
  console.log('Environment:', process.env.NODE_ENV || 'development');
  
  // Check required environment variables
  if (!process.env.MAILER_LITE_API_KEY) {
    console.error('❌ MAILER_LITE_API_KEY environment variable is required');
    process.exit(1);
  }
  
  if (!process.env.MAILER_LITE_GROUP_ID) {
    console.error('❌ MAILER_LITE_GROUP_ID environment variable is required');
    process.exit(1);
  }
  
  console.log('✅ Environment variables configured');
  console.log('📧 MailerLite Group ID:', process.env.MAILER_LITE_GROUP_ID);
  
  try {
    // Import the service from compiled JavaScript
    const { MailerLiteSyncService } = require('../dist/services/mailerlite-sync');
    const mailerLiteService = new MailerLiteSyncService();
    
    if (userIdentifier) {
      const identifierType = userIdentifier.includes('@') ? 'email' : 'user ID';
      console.log(`🔄 Testing single user sync for ${identifierType}: ${userIdentifier}`);
      const success = await mailerLiteService.syncSingleUser(userIdentifier);
      
      if (success) {
        console.log('✅ Single user sync completed successfully');
      } else {
        console.error('❌ Single user sync failed');
        process.exit(1);
      }
    } else {
      console.log('🔄 Testing full user sync...');
      const result = await mailerLiteService.syncAllUsers();
      
      if (result.success) {
        console.log('✅ Full user sync completed successfully');
        console.log(`📊 Results: ${result.usersSynced}/${result.usersProcessed} users synced`);
        console.log(`⏱️  Duration: ${Date.now() - result.timestamp.getTime()}ms`);
      } else {
        console.error('❌ Full user sync failed');
        console.error('Errors:', result.errors);
        process.exit(1);
      }
    }
    
    console.log('🎉 MailerLite sync test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Run the test
testMailerLiteSync().catch(console.error);
