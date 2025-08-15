#!/usr/bin/env node

/**
 * Script to resolve the failed init_after_reset migration in production
 * This migration is trying to add columns that already exist in the encrypted_profile_data table
 */

const { execSync } = require('child_process');

console.log('🔧 Resolving failed init_after_reset migration...');

try {
  console.log('📊 Checking migration status...');
  
  // Check current migration status
  const status = execSync('npx prisma migrate status', { encoding: 'utf8' });
  console.log('Migration status:', status);

  console.log('🔧 Creating temporary migration file for resolution...');
  
  // Create the migration directory and file
  const tempMigrationDir = 'prisma/migrations/20250815073301_init_after_reset';
  const tempMigrationFile = `${tempMigrationDir}/migration.sql`;
  
  execSync(`mkdir -p "${tempMigrationDir}"`);
  execSync(`echo "-- Temporary migration for resolution" > "${tempMigrationFile}"`);
  execSync(`echo "-- This migration is redundant - columns already exist" >> "${tempMigrationFile}"`);
  execSync(`echo "-- algorithm, iv, keyVersion, and tag columns are already in the table" >> "${tempMigrationFile}"`);
  
  console.log('✅ Temporary migration file created');
  
  // Mark the migration as resolved
  console.log('🔧 Resolving migration...');
  execSync('npx prisma migrate resolve --applied 20250815073301_init_after_reset');
  
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
