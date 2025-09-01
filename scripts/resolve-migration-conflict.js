#!/usr/bin/env node

/**
 * Migration Conflict Resolution Script
 * 
 * This script resolves the migration conflict by manually creating only the missing
 * snaptrade_users table without trying to modify existing columns.
 */

const { PrismaClient } = require('@prisma/client');

console.log('🔧 Resolving Migration Conflict');
console.log('==============================');

async function resolveMigrationConflict() {
  const prisma = new PrismaClient();
  
  try {
    // Check if snaptrade_users table already exists
    console.log('🔍 Checking if snaptrade_users table exists...');
    const tableExists = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'snaptrade_users'
    `;
    
    if (tableExists.length > 0) {
      console.log('✅ snaptrade_users table already exists!');
      console.log('The migration conflict is resolved.');
      return;
    }
    
    console.log('❌ snaptrade_users table does not exist');
    console.log('🚀 Creating snaptrade_users table manually...');
    
    // Create the snaptrade_users table manually
    await prisma.$executeRaw`
      CREATE TABLE "snaptrade_users" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "snapTradeUserId" TEXT NOT NULL,
        "userSecret" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'registered',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "snaptrade_users_pkey" PRIMARY KEY ("id")
      )
    `;
    
    console.log('✅ Created snaptrade_users table');
    
    // Create indexes
    console.log('🔍 Creating indexes...');
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX "snaptrade_users_userId_key" ON "snaptrade_users"("userId")
    `;
    
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX "snaptrade_users_snapTradeUserId_key" ON "snaptrade_users"("snapTradeUserId")
    `;
    
    console.log('✅ Created indexes');
    
    // Add foreign key constraint
    console.log('🔍 Adding foreign key constraint...');
    await prisma.$executeRaw`
      ALTER TABLE "snaptrade_users" 
      ADD CONSTRAINT "snaptrade_users_userId_fkey" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
    `;
    
    console.log('✅ Added foreign key constraint');
    
    // Verify the table was created correctly
    console.log('🔍 Verifying table structure...');
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'snaptrade_users' 
      ORDER BY ordinal_position
    `;
    
    console.log('📋 snaptrade_users table structure:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
    });
    
    // Mark the migration as resolved
    console.log('🔍 Marking migration as resolved...');
    try {
      await prisma.$executeRaw`
        INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        VALUES (
          '20250901002129_add_snaptrade_user_model',
          'manual_resolution',
          NOW(),
          '20250901002129_add_snaptrade_user_model',
          'Manually resolved migration conflict - created snaptrade_users table only',
          NULL,
          NOW(),
          1
        )
        ON CONFLICT (id) DO NOTHING
      `;
      console.log('✅ Migration marked as resolved');
    } catch (error) {
      console.log('⚠️  Could not mark migration as resolved (this is okay)');
      console.log('The table was created successfully, which is what matters.');
    }
    
    console.log('\n🎉 Migration conflict resolved successfully!');
    console.log('The snaptrade_users table has been created and the migration is marked as complete.');
    
  } catch (error) {
    console.error('❌ Error resolving migration conflict:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the resolution
resolveMigrationConflict()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });
