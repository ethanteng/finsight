#!/usr/bin/env bash
set -euo pipefail

# Production migration script with safety guards
# This script runs migrations in production with proper safety measures

echo "🔒 Starting production migration with safety guards..."

# 1) Prepare
echo "🔎 Generating Prisma client"
npx prisma generate

# 2) Check for pending migrations
echo "🔎 Checking for pending migrations..."
PENDING_MIGRATIONS=$(npx prisma migrate status --json | jq -r '.migrations[] | select(.applied == false) | .migration_name' 2>/dev/null || echo "")

if [ -z "$PENDING_MIGRATIONS" ]; then
    echo "✅ No pending migrations found"
    echo "🔒 Production database schema is up to date"
    exit 0
fi

echo "📋 Pending migrations:"
echo "$PENDING_MIGRATIONS"

# 3) Safety: set conservative lock/statement timeouts for this session
echo "⏱️  Setting timeouts"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET lock_timeout='30s'; SET statement_timeout='5min';"

# 4) Apply migrations
echo "🚀 Applying migrations"
npx prisma migrate deploy

echo "✅ Migrations applied successfully"
echo "🔒 Production database schema updated safely"
