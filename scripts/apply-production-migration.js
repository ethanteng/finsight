#!/usr/bin/env node

/**
 * Production Database Migration Script
 * 
 * This script applies pending Prisma migrations to the production database.
 * Run this on the production server to create missing tables like snaptrade_users.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Production Database Migration Script');
console.log('=====================================');

// Check if we're in production
if (process.env.NODE_ENV !== 'production') {
  console.log('⚠️  WARNING: This script is designed for production use');
  console.log('Current NODE_ENV:', process.env.NODE_ENV);
  console.log('Continue anyway? (This will modify the database)');
}

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable not set');
  process.exit(1);
}

console.log('✅ DATABASE_URL is configured');
console.log('Database URL:', process.env.DATABASE_URL.replace(/\/\/.*@/, '//***:***@'));

// Check if Prisma is available
try {
  const prismaVersion = execSync('npx prisma --version', { encoding: 'utf8' });
  console.log('✅ Prisma CLI available:', prismaVersion.trim());
} catch (error) {
  console.error('❌ ERROR: Prisma CLI not available');
  console.error('Make sure Prisma is installed: npm install @prisma/client prisma');
  process.exit(1);
}

// Check migration status
console.log('\n📋 Checking migration status...');
try {
  const migrationStatus = execSync('npx prisma migrate status', { encoding: 'utf8' });
  console.log('Migration Status:');
  console.log(migrationStatus);
} catch (error) {
  console.log('Migration status check failed, but continuing...');
}

// Apply pending migrations
console.log('\n🚀 Applying pending migrations...');
try {
  const result = execSync('npx prisma migrate deploy', { 
    encoding: 'utf8',
    stdio: 'inherit'
  });
  console.log('✅ Migrations applied successfully');
} catch (error) {
  console.error('❌ ERROR: Failed to apply migrations');
  console.error('Error:', error.message);
  process.exit(1);
}

// Verify the snaptrade_users table exists
console.log('\n🔍 Verifying snaptrade_users table...');
try {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  // Try to query the table structure
  const tableInfo = await prisma.$queryRaw`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'snaptrade_users' 
    ORDER BY ordinal_position
  `;
  
  if (tableInfo.length > 0) {
    console.log('✅ snaptrade_users table exists with columns:');
    tableInfo.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });
  } else {
    console.log('❌ snaptrade_users table not found');
  }
  
  await prisma.$disconnect();
} catch (error) {
  console.error('❌ ERROR: Failed to verify table');
  console.error('Error:', error.message);
}

// Test SnapTrade service
console.log('\n🧪 Testing SnapTrade service...');
try {
  const { SnapTradeService } = require('../dist/snaptrade');
  const snapTradeService = new SnapTradeService();
  
  const isHealthy = await snapTradeService.healthCheck();
  console.log('SnapTrade service health:', isHealthy ? '✅ Healthy' : '❌ Unhealthy');
} catch (error) {
  console.log('⚠️  SnapTrade service test failed (this might be expected if credentials are not configured)');
  console.log('Error:', error.message);
}

console.log('\n🎉 Migration script completed!');
console.log('\nNext steps:');
console.log('1. Check the application logs for any remaining errors');
console.log('2. Test SnapTrade initialization in the frontend');
console.log('3. Verify that the 404/500 errors are resolved');
