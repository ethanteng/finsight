-- Add email column to user_profiles table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_profiles' 
        AND column_name = 'email'
    ) THEN
        ALTER TABLE "user_profiles" ADD COLUMN "email" TEXT;
    END IF;
END $$; 