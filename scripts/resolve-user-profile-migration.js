#!/usr/bin/env node

/**
 * Script to resolve the failed user_profiles migration in production
 * This script checks if the user_profiles table exists and marks the migration as applied
 */

const { PrismaClient } = require('@prisma/client');

console.log('🔧 Resolving user_profiles migration conflict...');

async function resolveMigration() {
  const prisma = new PrismaClient();
  
  try {
    // Check if we're in production environment
    const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('render.com');
    
    if (!isProduction) {
      console.log('❌ This script should only be run in production');
      console.log('Current DATABASE_URL:', process.env.DATABASE_URL);
      process.exit(1);
    }

    console.log('✅ Production environment detected');
    
    // Check if user_profiles table exists
    console.log('📊 Checking if user_profiles table exists...');
    
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_profiles'
      ) as table_exists
    `;
    
    const exists = tableExists[0]?.table_exists;
    console.log('Table exists:', exists);
    
    if (exists) {
      console.log('✅ user_profiles table exists - marking migration as applied');
      
      // Mark the migration as applied
      await prisma.$executeRaw`
        INSERT INTO "_prisma_migrations" (
          id,
          checksum,
          finished_at,
          migration_name,
          logs,
          rolled_back_at,
          started_at,
          applied_steps_count
        ) VALUES (
          gen_random_uuid(),
          'manual_resolution',
          CURRENT_TIMESTAMP,
          '20250805085029_add_user_profile_model',
          'Manually resolved - user_profiles table already exists',
          NULL,
          CURRENT_TIMESTAMP,
          1
        ) ON CONFLICT (migration_name) DO NOTHING
      `;
      
      console.log('✅ Migration marked as applied');
      
      // Verify the fix
      const migration = await prisma.$queryRaw`
        SELECT * FROM "_prisma_migrations" 
        WHERE migration_name = '20250805085029_add_user_profile_model'
      `;
      
      if (migration.length > 0) {
        console.log('✅ Migration resolution verified');
        console.log('Migration record:', migration[0]);
      } else {
        console.log('❌ Migration record not found');
      }
      
    } else {
      console.log('❌ user_profiles table does not exist');
      console.log('The migration should be applied normally');
    }
    
    // Check table structure
    console.log('📋 Checking user_profiles table structure...');
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'user_profiles'
      ORDER BY ordinal_position
    `;
    
    console.log('Table columns:', columns);
    
  } catch (error) {
    console.error('❌ Error resolving migration:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resolveMigration(); 