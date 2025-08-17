/*
  Warnings:

  - Added the required column `iv` to the `encrypted_profile_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tag` to the `encrypted_profile_data` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable - Conditional Column Addition to prevent "column already exists" errors
DO $$
BEGIN
    -- Add algorithm column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'encrypted_profile_data' 
        AND column_name = 'algorithm'
    ) THEN
        ALTER TABLE "encrypted_profile_data" ADD COLUMN "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm';
    END IF;

    -- Add iv column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'encrypted_profile_data' 
        AND column_name = 'iv'
    ) THEN
        ALTER TABLE "encrypted_profile_data" ADD COLUMN "iv" TEXT NOT NULL;
    END IF;

    -- Add keyVersion column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'encrypted_profile_data' 
        AND column_name = 'keyVersion'
    ) THEN
        ALTER TABLE "encrypted_profile_data" ADD COLUMN "keyVersion" INTEGER NOT NULL DEFAULT 1;
    END IF;

    -- Add tag column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'encrypted_profile_data' 
        AND column_name = 'tag'
    ) THEN
        ALTER TABLE "encrypted_profile_data" ADD COLUMN "tag" TEXT NOT NULL;
    END IF;
END $$;
