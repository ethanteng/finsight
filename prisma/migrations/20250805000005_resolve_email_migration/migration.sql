-- This migration resolves the failed 20250805000002_add_email_to_user_profile migration
-- The email column already exists in production, so this migration does nothing
-- This allows Prisma to continue with subsequent migrations

-- DO NOTHING - This migration exists only to resolve the failed migration 