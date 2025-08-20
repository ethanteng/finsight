#!/usr/bin/env bash
set -euo pipefail

# Local Database Reset Script
# This script provides a simple way to reset your local development database
# to match your current local Prisma schema (no production sync)

# Load environment variables from .env file
if [[ -f .env ]]; then
    echo "📁 Loading environment variables from .env file..."
    export $(grep -v '^#' .env | xargs)
fi

echo "🔄 Local Database Reset Script"
echo "=============================="

# Check if we're in development mode
if [[ "${NODE_ENV:-}" == "production" ]]; then
    echo "❌ ERROR: This script cannot run in production environment"
    echo "   NODE_ENV: ${NODE_ENV:-not set}"
    exit 1
fi

# Check if DATABASE_URL is set
if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    echo "   Please set DATABASE_URL in your .env file"
    exit 1
fi

# Check if this looks like a local development database
if [[ "$DATABASE_URL" == *"localhost"* ]] || [[ "$DATABASE_URL" == *"127.0.0.1"* ]]; then
    echo "✅ Local development database detected"
else
    echo "⚠️  WARNING: This doesn't look like a local development database"
    echo "   DATABASE_URL: $DATABASE_URL"
    echo "   Are you sure you want to continue? (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "❌ Aborted by user"
        exit 1
    fi
fi

echo ""
echo "🚨 WARNING: This will completely wipe your local development database!"
echo "   All local data will be lost!"
echo "   The database will be recreated to match your current local Prisma schema"
echo ""

# Confirm the action
echo "Type 'RESET' to confirm database reset:"
read -r confirmation
if [[ "$confirmation" != "RESET" ]]; then
    echo "❌ Aborted by user"
    exit 1
fi

echo ""
echo "🔄 Starting local database reset..."

# Step 1: Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Step 2: Reset database to match current schema (force reset)
echo "🗑️  Resetting database to match current local schema..."
echo "   This will drop all tables and recreate them from your Prisma schema"
npx prisma db push --force-reset

# Step 3: Verify the reset
echo "✅ Verifying database reset..."
echo "   Checking that all tables were created correctly..."

# List all tables to verify they were created
echo "📊 Current database tables:"
npx prisma db execute --stdin <<< "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"

echo ""
echo "🎉 Local database reset complete!"
echo "   Your local development database now matches your local Prisma schema"
echo "   All tables have been recreated from scratch"
echo ""
echo "💡 Next steps:"
echo "   - Start your development server: npm run dev"
echo "   - Create test data as needed"
echo "   - Begin development work"
echo ""
echo "💡 For production sync instead, run:"
echo "   ./scripts/dev-reset.sh (requires PRODUCTION_DATABASE_URL or RENDER_DATABASE_URL)" 