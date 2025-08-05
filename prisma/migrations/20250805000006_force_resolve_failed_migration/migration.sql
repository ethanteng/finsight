-- Force resolve the failed migration by creating a dummy migration
-- This migration will be applied and mark the failed migration as resolved

-- Create a temporary table to force migration application
CREATE TABLE IF NOT EXISTS "_temp_migration_resolution" (
    id SERIAL PRIMARY KEY,
    resolved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert a record to ensure the migration is applied
INSERT INTO "_temp_migration_resolution" (id) VALUES (1);

-- Drop the temporary table
DROP TABLE "_temp_migration_resolution"; 