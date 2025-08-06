-- SQL script to resolve the failed user_profiles migration
-- This should be run directly on the production database

-- Step 1: Check if user_profiles table already exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles'
) as table_exists;

-- Step 2: If table exists, mark the migration as applied
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_profiles'
    ) THEN
        -- Insert the migration record to mark it as applied
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
        ) ON CONFLICT (migration_name) DO NOTHING;
        
        RAISE NOTICE 'Migration 20250805085029_add_user_profile_model marked as applied';
    ELSE
        RAISE NOTICE 'user_profiles table does not exist - migration should be applied normally';
    END IF;
END $$;

-- Step 3: Verify the fix
SELECT * FROM "_prisma_migrations" 
WHERE migration_name = '20250805085029_add_user_profile_model';

-- Step 4: Check if user_profiles table structure is correct
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'user_profiles'
ORDER BY ordinal_position; 