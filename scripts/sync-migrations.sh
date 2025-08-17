#!/bin/bash

# Migration Sync Script
# This script ensures local and production migration histories are in sync
# Run this before starting any new development work

set -e

echo "🔄 Syncing migration history..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set. Please set it to your production database URL."
    echo "   export DATABASE_URL='your_production_db_url'"
    exit 1
fi

# Get migration counts (clean up the output properly)
LOCAL_COUNT=$(docker exec finsight-postgres psql -U postgres -d finsight -c "SELECT COUNT(*) FROM _prisma_migrations;" | grep -v "count\|----" | head -1 | tr -d ' ' | tr -d '\n' | sed 's/[^0-9]//g')
PROD_COUNT=$(psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM _prisma_migrations;" | grep -v "count\|----" | head -1 | tr -d ' ' | tr -d '\n' | sed 's/[^0-9]//g')

echo "📊 Current migration counts:"
echo "  Local: $LOCAL_COUNT"
echo "  Production: $PROD_COUNT"

if [ "$LOCAL_COUNT" -eq "$PROD_COUNT" ]; then
    echo "✅ Migration counts match!"
else
    echo "⚠️  Migration counts don't match!"
    echo ""
    echo "🔍 Analyzing differences..."
    
    # Get migration names from both databases
    echo "Local migrations:"
    docker exec finsight-postgres psql -U postgres -d finsight -c "SELECT migration_name FROM _prisma_migrations ORDER BY migration_name;" | grep -v "migration_name\|----"
    
    echo ""
    echo "Production migrations:"
    psql "$DATABASE_URL" -c "SELECT migration_name FROM _prisma_migrations ORDER BY migration_name;" | grep -v "migration_name\|----"
    
    echo ""
    echo "💡 To fix this:"
    echo "   1. Run: ./scripts/backup-migration-history.sh"
    echo "   2. Sync your local schema: npx prisma db pull"
    echo "   3. Regenerate client: npx prisma generate"
    echo "   4. Check for drift: npx prisma migrate status"
fi

echo ""
echo "🔄 Syncing local schema with production..."
npx prisma db pull
npx prisma generate

echo ""
echo "✅ Migration sync complete!"
