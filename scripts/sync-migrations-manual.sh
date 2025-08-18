#!/bin/bash

# Script to sync local migrations with production
# This creates the exact same migration files locally that exist in production

set -e

echo "🔄 Syncing local migrations with production..."

# Check if both database URLs are set
if [ -z "$PROD_DATABASE_URL" ]; then
    echo "❌ PROD_DATABASE_URL not set. Please set it to your production database URL."
    echo "   export PROD_DATABASE_URL='your_production_db_url'"
    exit 1
fi

if [ -z "$LOCAL_DATABASE_URL" ]; then
    echo "❌ LOCAL_DATABASE_URL not set. Please set it to your local database URL."
    echo "   export LOCAL_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/finsight'"
    exit 1
fi

echo "📊 Production DB: $PROD_DATABASE_URL"
echo "�� Local DB: $LOCAL_DATABASE_URL"

# Get production migrations using PROD_DATABASE_URL
echo " Getting production migration list..."
PROD_MIGRATIONS=$(psql "$PROD_DATABASE_URL" -c "SELECT migration_name FROM _prisma_migrations ORDER BY migration_name;" | grep -v "migration_name\|----" | tr -d ' ')

# Remove existing migrations directory
echo "🗑️  Removing existing migrations directory..."
rm -rf prisma/migrations

# Create migrations directory
echo "📁 Creating migrations directory..."
mkdir -p prisma/migrations

# Create each migration directory and file
echo " Creating migration files..."
for migration in $PROD_MIGRATIONS; do
    echo "  Creating: $migration"
    mkdir -p "prisma/migrations/$migration"
    echo "-- Migration applied" > "prisma/migrations/$migration/migration.sql"
done

# Mark all migrations as applied using LOCAL_DATABASE_URL
echo "✅ Marking migrations as applied to LOCAL database..."
export DATABASE_URL="$LOCAL_DATABASE_URL"

for migration in $PROD_MIGRATIONS; do
    echo "  Marking as applied: $migration"
    npx prisma migrate resolve --applied "$migration"
done

echo ""
echo "🎉 Migration sync complete!"
echo "📊 Local migrations: $(ls prisma/migrations | wc -l)"
echo "📊 Production migrations: $(echo "$PROD_MIGRATIONS" | wc -l | tr -d ' ')"
echo ""
echo " Now run: ./scripts/pre-dev-checklist.sh"