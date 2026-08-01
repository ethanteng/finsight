#!/usr/bin/env bash
set -euo pipefail

# Production migration script with safety guards
# This script runs migrations in production with proper safety measures

echo "🔒 Starting production migration with safety guards..."

# 1) Prepare
echo "🔎 Generating Prisma client"
npx prisma generate

# 2) Check for pending migrations
# NOTE: Prisma 6 removed `migrate status --json`. Parse the text output instead.
echo "🔎 Checking for pending migrations..."
MIGRATE_STATUS=$(npx prisma migrate status 2>&1) || {
  echo "❌ prisma migrate status failed:"
  echo "$MIGRATE_STATUS"
  exit 1
}

echo "$MIGRATE_STATUS"

if echo "$MIGRATE_STATUS" | grep -q "Database schema is up to date"; then
  echo "✅ No pending migrations found"
  echo "🔒 Production database schema is up to date"
  exit 0
fi

if ! echo "$MIGRATE_STATUS" | grep -q "have not yet been applied"; then
  echo "❌ Unexpected prisma migrate status output; aborting instead of guessing"
  exit 1
fi

echo "📋 Pending migrations detected — will apply via migrate deploy"

# 3) Safety: set conservative lock/statement timeouts for this session
echo "⏱️  Setting timeouts"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET lock_timeout='30s'; SET statement_timeout='5min';"

# 4) Apply migrations
echo "🚀 Applying migrations"
npx prisma migrate deploy

echo "✅ Migrations applied successfully"
echo "🔒 Production database schema updated safely"
