#!/usr/bin/env node

/**
 * Script to resolve the failed migration in production
 * This script marks the failed migration as resolved so new migrations can be applied
 */

const { execSync } = require('child_process');

console.log('🔧 Resolving failed migration...');

try {
  // Check if we're in production environment
  const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('render.com');
  
  if (!isProduction) {
    console.log('❌ This script should only be run in production');
    console.log('Current DATABASE_URL:', process.env.DATABASE_URL);
    process.exit(1);
  }

  console.log('✅ Production environment detected');
  console.log('📊 Checking migration status...');
  
  // Check current migration status
  const status = execSync('npx prisma migrate status', { encoding: 'utf8' });
  console.log('Migration status:', status);

  console.log('🔧 Attempting to resolve failed migration...');
  
  // Try to mark the failed migration as resolved
  // Note: This requires the migration file to exist locally
  // Since we deleted it, we need to recreate it temporarily
  console.log('📝 Creating temporary migration file for resolution...');
  
  const tempMigrationDir = 'prisma/migrations/20250805000002_add_email_to_user_profile';
  const tempMigrationFile = `${tempMigrationDir}/migration.sql`;
  
  // Create the directory and file
  execSync(`mkdir -p "${tempMigrationDir}"`);
  execSync(`echo "-- Temporary migration for resolution" > "${tempMigrationFile}"`);
  execSync(`echo "-- This migration already exists in production" >> "${tempMigrationFile}"`);
  
  console.log('✅ Temporary migration file created');
  
  // Now try to resolve it
  console.log('🔧 Resolving migration...');
  execSync('npx prisma migrate resolve --applied 20250805000002_add_email_to_user_profile');
  
  console.log('✅ Migration resolved successfully!');
  
  // Clean up temporary file
  console.log('🧹 Cleaning up temporary files...');
  execSync(`rm -rf "${tempMigrationDir}"`);
  
  console.log('✅ Resolution complete! New migrations should now apply.');
  
} catch (error) {
  console.error('❌ Error resolving migration:', error.message);
  console.error('Full error:', error);
  process.exit(1);
} 