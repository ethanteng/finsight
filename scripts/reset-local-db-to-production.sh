#!/bin/bash

# Reset Local Database to Production Script
# This script completely wipes your local database and recreates it to match production exactly
# Use this when you have migration drift or need a clean sync with production

set -e

echo "🔄 Reset Local Database to Production"
echo "====================================="

# Check if required environment variables are set
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
echo " Local DB: $LOCAL_DATABASE_URL"
echo ""

# Step 1: Wipe local database completely
echo "🗑️  Step 1: Wiping local database..."
docker stop finsight-postgres 2>/dev/null || true
docker rm -f finsight-postgres 2>/dev/null || true

# Remove all finsight-related volumes
echo "   Removing Docker volumes..."
docker volume ls | grep -i finsight | awk '{print $2}' | xargs -I {} docker volume rm {} 2>/dev/null || true

# Recreate the container fresh
echo "   Creating fresh Docker container..."
docker run --name finsight-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=finsight -p 5432:5432 -d postgres:15

# Wait for it to be ready
echo "   Waiting for database to be ready..."
sleep 5

# Step 2: Pull production schema
echo ""
echo "📥 Step 2: Pulling production schema..."
export DATABASE_URL="$PROD_DATABASE_URL"
npx prisma db pull

# Step 3: Create master migration
echo ""
echo "📝 Step 3: Creating master migration..."
export DATABASE_URL="$LOCAL_DATABASE_URL"

# Remove existing migrations
rm -rf prisma/migrations

# Create master migration
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > migration.sql
mkdir -p prisma/migrations/20250818060533_master_production_state
mv migration.sql prisma/migrations/20250818060533_master_production_state/migration.sql

# Apply the migration to the fresh local database
echo ""
echo "🚀 Step 4: Applying migration to local database..."
npx prisma migrate deploy

echo ""
echo "✅ Reset complete! Your local database now matches production exactly."
echo ""
echo "💡 Next steps:"
echo "   1. Run: ./scripts/pre-dev-checklist.sh"
echo "   2. Create a feature branch: git checkout -b feature/your-feature"
echo "   3. Start developing!"