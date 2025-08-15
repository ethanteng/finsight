# 🔧 Resolving Failed Migrations in Production

## The Problem
The deployment is failing because of **TWO failed migrations** that are blocking new migrations from being applied:

1. `20250805183315_add_encrypted_data_tables` - Failed during previous deployment
2. `20250815073301_init_after_reset` - Failed because it's trying to add columns that already exist

## The Solution
We need to mark BOTH migrations as resolved in production so that new migrations can be applied.

## Steps to Fix

### Option 1: Run Commands in Render Console (Recommended)
1. Go to your Render dashboard
2. Navigate to your backend service
3. Click on "Console" tab
4. Run the following commands **ONE BY ONE**:

#### **Step 1: Resolve the first failed migration**
```bash
# Check current migration status
npx prisma migrate status

# Create temporary migration file for encrypted data tables
mkdir -p prisma/migrations/20250805183315_add_encrypted_data_tables
echo "-- Temporary migration for resolution" > prisma/migrations/20250805183315_add_encrypted_data_tables/migration.sql
echo "-- This migration already exists in production" >> prisma/migrations/20250805183315_add_encrypted_data_tables/migration.sql
echo "-- Tables were created manually after the failed migration" >> prisma/migrations/20250805183315_add_encrypted_data_tables/migration.sql

# Mark migration as resolved
npx prisma migrate resolve --applied 20250805183315_add_encrypted_data_tables

# Clean up
rm -rf prisma/migrations/20250805183315_add_encrypted_data_tables
```

#### **Step 2: Resolve the second failed migration**
```bash
# Create temporary migration file for init_after_reset
mkdir -p prisma/migrations/20250815073301_init_after_reset
echo "-- Temporary migration for resolution" > prisma/migrations/20250815073301_init_after_reset/migration.sql
echo "-- This migration is redundant - columns already exist" >> prisma/migrations/20250815073301_init_after_reset/migration.sql
echo "-- algorithm, iv, keyVersion, and tag columns are already in the table" >> prisma/migrations/20250815073301_init_after_reset/migration.sql

# Mark migration as resolved
npx prisma migrate resolve --applied 20250815073301_init_after_reset

# Clean up
rm -rf prisma/migrations/20250815073301_init_after_reset

# Verify both are resolved
npx prisma migrate status
```

### Option 2: Use the Scripts
If you prefer, you can also run the provided scripts:

```bash
# Resolve first migration
node scripts/resolve-encrypted-data-migration-simple.js

# Resolve second migration  
node scripts/resolve-init-after-reset-migration.js
```

## What This Does
1. Creates temporary migration files that match the failed migrations
2. Marks both migrations as "applied" in the database
3. Cleans up the temporary files
4. Allows new migrations to proceed

## After Resolution
Once both migrations are resolved:
1. Commit and push the script changes
2. Redeploy - the migrations should now succeed
3. New migrations will be applied normally

## Why This Happened
- **First migration**: Failed during production deployment, tables were created manually
- **Second migration**: Tried to add columns that already exist in the schema
- Prisma won't apply new migrations until ALL failed ones are resolved
- Since the required data structures already exist, we just need to mark them as resolved

## ⚠️ **IMPORTANT**: Run BOTH migrations in order!
You must resolve BOTH migrations for the deployment to succeed.
