-- SQL script to manually resolve the failed migration issue
-- This should be run directly on the production database

-- Step 1: Check current migration status
SELECT * FROM "_prisma_migrations" WHERE migration_name = '20250805000002_add_email_to_user_profile';

-- Step 2: Update the failed migration to mark it as applied
UPDATE "_prisma_migrations" 
SET 
    finished_at = CURRENT_TIMESTAMP,
    logs = 'Manually resolved - email column already exists'
WHERE migration_name = '20250805000002_add_email_to_user_profile';

-- Step 3: Verify the fix
SELECT * FROM "_prisma_migrations" WHERE migration_name = '20250805000002_add_email_to_user_profile';

-- Step 4: Check if email column exists (it should)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_profiles' AND column_name = 'email'; 