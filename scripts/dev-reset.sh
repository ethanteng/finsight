#!/usr/bin/env bash
set -euo pipefail

# Development Database Reset Script
# This script provides a simple way to reset your local development database

echo "🔄 Development Database Reset Script"
echo "=================================="

# Check if we're in development mode
if [[ "$NODE_ENV" == "production" ]]; then
    echo "❌ ERROR: This script cannot run in production environment"
    echo "   NODE_ENV: $NODE_ENV"
    exit 1
fi

# Check if DATABASE_URL is set
if [[ -z "$DATABASE_URL" ]]; then
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
echo ""

# Confirm the action
echo "Type 'RESET' to confirm database reset:"
read -r confirmation
if [[ "$confirmation" != "RESET" ]]; then
    echo "❌ Aborted by user"
    exit 1
fi

echo ""
echo "🔄 Starting database reset..."

# Step 1: Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Step 2: Reset database (wipe everything and reapply migrations)
echo "🗑️  Resetting database..."
npx prisma migrate reset --force

# Step 3: Verify the reset
echo "✅ Verifying database reset..."
npx prisma migrate status

echo ""
echo "🎉 Database reset complete!"
echo "   Your local development database is now fresh and up-to-date"
echo "   All migrations have been applied successfully"
echo ""
echo "💡 Next steps:"
echo "   - Start your development server: npm run dev"
echo "   - Create test data as needed"
echo "   - Begin development work"
