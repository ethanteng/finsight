-- Database initialization script for Finsight
-- This script runs when the PostgreSQL container starts for the first time
-- It creates the finsight database and ensures proper user permissions

-- Create the finsight database
CREATE DATABASE finsight;

-- Connect to the finsight database
\c finsight;

-- Grant all privileges on the finsight database to the postgres user
GRANT ALL PRIVILEGES ON DATABASE finsight TO postgres;

-- Grant all privileges on the public schema to the postgres user
GRANT ALL PRIVILEGES ON SCHEMA public TO postgres;

-- Grant all privileges on all tables in the public schema to the postgres user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;

-- Grant all privileges on all sequences in the public schema to the postgres user
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Set default privileges for future tables and sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO postgres;

-- Ensure the postgres user can create databases (for development)
ALTER USER postgres CREATEDB;

-- Display success message
\echo 'Database initialization complete!'
\echo 'Database: finsight'
\echo 'User: postgres'
\echo 'Password: postgres'
\echo 'Connection string: postgresql://postgres:postgres@localhost:5433/finsight'
