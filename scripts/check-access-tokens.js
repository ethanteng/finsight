#!/usr/bin/env node

/**
 * Check current access tokens and their scope
 * This helps diagnose why investment data isn't showing up
 */

const { PrismaClient } = require('@prisma/client');

async function checkAccessTokens() {
  console.log('🔍 Checking Access Tokens and Scope');
  console.log('===================================');
  
  const prisma = new PrismaClient();
  
  try {
    // Check if we can connect to the database
    await prisma.$connect();
    console.log('✅ Database connection successful');
    
    // Get all access tokens
    const accessTokens = await prisma.accessToken.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });
    
    console.log(`\n📊 Found ${accessTokens.length} access token(s)`);
    
    if (accessTokens.length === 0) {
      console.log('❌ No access tokens found in database');
      console.log('This explains why you\'re not seeing investment data!');
      console.log('\n💡 Solution: You need to re-link your Plaid account');
      return;
    }
    
    // Check each access token
    for (const token of accessTokens) {
      console.log(`\n🔑 Access Token ID: ${token.id}`);
      console.log(`   User: ${token.user?.email || 'Unknown'} (ID: ${token.userId})`);
      console.log(`   Created: ${token.createdAt}`);
      console.log(`   Updated: ${token.updatedAt}`);
      console.log(`   Token: ${token.token ? 'Present' : 'Missing'}`);
      
      if (token.token) {
        console.log(`   Token preview: ${token.token.substring(0, 20)}...`);
      }
    }
    
    // Check if there are any users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        createdAt: true
      }
    });
    
    console.log(`\n👥 Found ${users.length} user(s) in database`);
    for (const user of users) {
      console.log(`   - ${user.email} (ID: ${user.id}, Created: ${user.createdAt})`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Database connection failed. Make sure:');
      console.log('   1. Your database is running');
      console.log('   2. Your DATABASE_URL environment variable is set correctly');
      console.log('   3. The database exists and is accessible');
    }
  } finally {
    await prisma.$disconnect();
  }
  
  console.log('\n📝 Next steps:');
  console.log('1. If no access tokens found: Re-link your Plaid account');
  console.log('2. If tokens found but no data: Check Plaid API scope');
  console.log('3. If database connection fails: Check your database setup');
}

checkAccessTokens().catch(console.error);
