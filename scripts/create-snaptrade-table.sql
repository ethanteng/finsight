-- Create SnapTrade Users Table
-- This script creates the missing snaptrade_users table without conflicting with existing migrations

-- Check if table already exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'snaptrade_users') THEN
        -- Create the table
        CREATE TABLE "snaptrade_users" (
            "id" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "snapTradeUserId" TEXT NOT NULL,
            "userSecret" TEXT NOT NULL,
            "status" TEXT NOT NULL DEFAULT 'registered',
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL,
            CONSTRAINT "snaptrade_users_pkey" PRIMARY KEY ("id")
        );
        
        -- Create indexes
        CREATE UNIQUE INDEX "snaptrade_users_userId_key" ON "snaptrade_users"("userId");
        CREATE UNIQUE INDEX "snaptrade_users_snapTradeUserId_key" ON "snaptrade_users"("snapTradeUserId");
        
        -- Add foreign key constraint
        ALTER TABLE "snaptrade_users" 
        ADD CONSTRAINT "snaptrade_users_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        
        RAISE NOTICE 'snaptrade_users table created successfully';
    ELSE
        RAISE NOTICE 'snaptrade_users table already exists';
    END IF;
END $$;

-- Mark the migration as resolved in Prisma's migration table
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
ON CONFLICT (id) DO NOTHING;

-- Verify the table was created
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'snaptrade_users' 
ORDER BY ordinal_position;
