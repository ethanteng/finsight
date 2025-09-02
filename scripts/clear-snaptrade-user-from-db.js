#!/usr/bin/env node

/**
 * Clear SnapTrade User from Database
 * 
 * This script removes the SnapTrade user from the database so that
 * when the user tries to connect again, it will create a fresh user
 * with new credentials.
 */

// Load environment variables from .env file
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

console.log('🔧 Clear SnapTrade User from Database');
console.log('=====================================');

async function clearUserFromDatabase() {
  try {
    const prisma = new PrismaClient();
    
    const userId = 'cmeghjm9f0000rzrvlp6xuv5v';
    
    console.log(`\n🚀 Looking for SnapTrade user ${userId} in database...`);
    
    // Check if user exists
    const existingUser = await prisma.snapTradeUser.findUnique({
      where: { userId: userId }
    });
    
    if (existingUser) {
      console.log('✅ Found user in database:');
      console.log('  - User ID:', existingUser.userId);
      console.log('  - User Secret:', existingUser.userSecret);
      console.log('  - Status:', existingUser.status);
      console.log('  - Created:', existingUser.createdAt);
      
      // Delete the user
      console.log(`\n🚀 Deleting user ${userId} from database...`);
      
      await prisma.snapTradeUser.delete({
        where: { userId: userId }
      });
      
      console.log('✅ User deleted from database successfully!');
      console.log('\n🎉 Success! The user has been removed from the database.');
      console.log('When you try "Connect Account" again, it will create a fresh user with new credentials.');
      
    } else {
      console.log('✅ User not found in database (already cleared)');
      console.log('This is fine - you can now try the "Connect Account" button again.');
    }
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Run the script
clearUserFromDatabase()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });
