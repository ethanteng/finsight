# Local Database Reset Guide

## Overview
This guide explains how to completely reset your local database to match production exactly. Use this when you have migration drift or need a clean sync.

## When to Use This
- Migration counts don't match between local and production
- You have migration drift errors
- You want to start fresh with production state
- Your local database is in an inconsistent state

## Prerequisites
1. **Set environment variables:**
   ```bash
   export PROD_DATABASE_URL="postgresql://username:password@host:port/database"
   export LOCAL_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/finsight"
   ```

2. **Ensure Docker is running** and you have access to create containers

## On production (Render), create a single migration that represents current state
   ```bash
   cd ~/project/src
   rm -rf prisma/migrations
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > migration.sql
   mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_master_production_state
   mv migration.sql prisma/migrations/$(date +%Y%m%d%H%M%S)_master_production_state/migration.sql
   npx prisma migrate deploy
   ```

## Quick Reset Command
```bash
./scripts/reset-local-db-to-production.sh
```

## What This Script Does
1. **Stops and removes** the existing `finsight-postgres` container
2. **Removes all related Docker volumes** (this wipes ALL data)
3. **Creates a fresh PostgreSQL container**
4. **Pulls the current production schema** using `npx prisma db pull`
5. **Creates a master migration** that represents the current production state
6. **Applies the migration** to the fresh local database

## Expected Outcome
After running this script:
- ✅ Local database will have exactly the same schema as production
- ✅ Local database will have 1 migration (the master migration)
- ✅ Production database will have 1 migration (the master migration)
- ✅ Migration counts will match perfectly
- ✅ No drift between environments

## Verification
After the reset, run:
```bash
./scripts/pre-dev-checklist.sh
```

You should see:
- Migration counts match
- Database schema is up to date
- No migration drift detected

## Important Notes
- **This will delete ALL local data** - make sure you don't need anything from your local database
- **This creates a clean slate** - you'll lose any local-only data or test data
- **The master migration represents the cumulative effect** of all previous migrations
- **Future migrations** will be created on top of this clean baseline

## Troubleshooting
If you get errors:
1. **Check Docker is running:** `docker ps`
2. **Verify environment variables:** `echo $PROD_DATABASE_URL` and `echo $LOCAL_DATABASE_URL`
3. **Check container status:** `docker logs finsight-postgres`
4. **Verify port availability:** Make sure port 5432 isn't used by another service

## Alternative Approaches
If you don't want to completely wipe your local database:
1. **Sync migrations manually** using `./scripts/sync-migrations-manual.sh`
2. **Reset just the migration history** using `npx prisma migrate reset`
3. **Create a baseline migration** without wiping data

## Future Prevention
To avoid needing this reset again:
1. **Always run** `./scripts/pre-dev-checklist.sh` before starting development
2. **Don't manually edit** migration files
3. **Keep local and production in sync** by running the checklist regularly
4. **Use feature branches** for development work