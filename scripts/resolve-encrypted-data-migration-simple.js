#!/usr/bin/env node

/**
 * Simple script to resolve the failed encrypted data tables migration
 * Run this directly in production (Render) to fix the deployment issue
 */

const { execSync } = require('child_process');

console.log('🔧 Resolving failed encrypted data tables migration...');

try {
  console.log('📊 Checking migration status...');
  
  // Check current migration status
  const status = execSync('npx prisma migrate status', { encoding: 'utf8' });
  console.log('Migration status:', status);

  console.log('🔧 Creating temporary migration file for resolution...');
  
  // Create the migration directory and file
  const tempMigrationDir = 'prisma/migrations/20250805183315_add_encrypted_data_tables';
  const tempMigrationFile = `${tempMigrationDir}/migration.sql`;
  
  execSync(`mkdir -p "${tempMigrationDir}"`);
  execSync(`echo "-- Temporary migration for resolution" > "${tempMigrationFile}"`);
  execSync(`echo "-- This migration already exists in production" >> "${tempMigrationFile}"`);
  execSync(`echo "-- Tables were created manually after the failed migration" >> "${tempMigrationFile}"`);
  
  console.log('✅ Temporary migration file created');
  
  // Mark the migration as resolved
  console.log('🔧 Resolving migration...');
  execSync('npx prisma migrate resolve --applied 20250805183315_add_encrypted_data_tables');
  
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
