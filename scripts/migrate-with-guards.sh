#!/usr/bin/env bash
set -euo pipefail

# Production migration script with safety guards
# This script runs migrations in production with proper safety measures

echo "🔒 Starting production migration with safety guards..."

# 1) Prepare
echo "🔎 Generating Prisma client"
npx prisma generate

# 2) Build migration SQL (diff prod vs migrations)
echo "🔎 Computing migration diff"
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-migrations ./prisma/migrations \
  --script > /tmp/migration.sql

echo "— Proposed migration diff —"
sed -n '1,200p' /tmp/migration.sql

# 3) Block obviously destructive changes (extend as needed)
if grep -Eiq 'DROP TABLE|DROP COLUMN|ALTER TYPE|ALTER TABLE .* DROP CONSTRAINT|PRIMARY KEY' /tmp/migration.sql; then
  echo "❌ Destructive change detected. Handle manually in a scheduled window."
  echo "Blocked operations: DROP TABLE, DROP COLUMN, ALTER TYPE, DROP CONSTRAINT, PRIMARY KEY changes"
  echo "Review the migration and handle manually during maintenance window."
  exit 2
fi

# 4) Safety: set conservative lock/statement timeouts for this session
echo "⏱️  Setting timeouts"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET lock_timeout='30s'; SET statement_timeout='5min';"

# 5) Apply migrations
echo "🚀 Applying migrations"
npx prisma migrate deploy

echo "✅ Migrations applied successfully"
echo "🔒 Production database schema updated safely"
