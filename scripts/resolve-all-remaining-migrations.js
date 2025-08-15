#!/usr/bin/env node

/**
 * Comprehensive script to resolve ALL remaining failed migrations in production
 * This will resolve the cascading migration failures one by one
 */

const { execSync } = require('child_process');

console.log('🔧 Resolving ALL remaining failed migrations...');

// List of migrations that need to be resolved
const migrationsToResolve = [
  {
    name: '20250815081729_add_stripe_subscription_models',
    description: 'Redundant - Stripe subscription tables already exist',
    content: [
      '-- Temporary migration for resolution',
      '-- This migration is redundant - tables already exist',
      '-- subscription_events and subscriptions tables are already in the schema'
    ]
  },
  {
    name: '20250815081800_add_stripe_user_fields',
    description: 'Redundant - Stripe user fields already exist',
    content: [
      '-- Temporary migration for resolution',
      '-- This migration is redundant - fields already exist',
      '-- Stripe user fields are already in the User model'
    ]
  }
];

async function resolveMigration(migration) {
  console.log(`\n🔧 Resolving migration: ${migration.name}`);
  console.log(`📝 Description: ${migration.description}`);
  
  try {
    // Create temporary migration file
    const tempMigrationDir = `prisma/migrations/${migration.name}`;
    const tempMigrationFile = `${tempMigrationDir}/migration.sql`;
    
    console.log('📁 Creating temporary migration file...');
    execSync(`mkdir -p "${tempMigrationDir}"`);
    
    // Write migration content
    migration.content.forEach((line, index) => {
      if (index === 0) {
        execSync(`echo "${line}" > "${tempMigrationFile}"`);
      } else {
        execSync(`echo "${line}" >> "${tempMigrationFile}"`);
      }
    });
    
    console.log('✅ Temporary migration file created');
    
    // Mark migration as resolved
    console.log('🔧 Resolving migration...');
    execSync(`npx prisma migrate resolve --applied ${migration.name}`);
    
    console.log('✅ Migration resolved successfully!');
    
    // Clean up temporary file
    console.log('🧹 Cleaning up temporary files...');
    execSync(`rm -rf "${tempMigrationDir}"`);
    
    console.log(`✅ Migration ${migration.name} resolved and cleaned up!`);
    
  } catch (error) {
    console.error(`❌ Error resolving migration ${migration.name}:`, error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('📊 Checking current migration status...');
    const status = execSync('npx prisma migrate status', { encoding: 'utf8' });
    console.log('Migration status:', status);
    
    console.log(`\n🚀 Resolving ${migrationsToResolve.length} migrations...`);
    
    // Resolve each migration one by one
    for (const migration of migrationsToResolve) {
      await resolveMigration(migration);
    }
    
    console.log('\n🎉 ALL migrations resolved successfully!');
    console.log('📊 Final migration status:');
    
    const finalStatus = execSync('npx prisma migrate status', { encoding: 'utf8' });
    console.log(finalStatus);
    
    console.log('\n✅ Resolution complete! New deployments should now succeed.');
    
  } catch (error) {
    console.error('❌ Error during migration resolution:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

main();
