#!/usr/bin/env bash
set -euo pipefail

# Production migration script with safety guards
# This script runs migrations in production with proper safety measures

echo "🔒 Starting production migration with safety guards..."

# 1) Prepare
echo "🔎 Generating Prisma client"
npx prisma generate

# 2) Inspect migration history without treating every non-zero status as fatal.
# Prisma exits with status 1 for both ordinary pending migrations and migration
# history divergence. Production has four legacy baseline records that predate
# the canonical migration history in this repository, so allow only those exact
# database-only records and reject any new divergence.
echo "🔎 Checking migration status..."
set +e
MIGRATE_STATUS=$(npx prisma migrate status 2>&1)
MIGRATE_STATUS_EXIT=$?
set -e

echo "$MIGRATE_STATUS"

DATABASE_ONLY_MARKER='The migrations? from the database are not found locally in prisma/migrations:'
DATABASE_ONLY_MIGRATIONS=$(printf '%s\n' "$MIGRATE_STATUS" | awk '
  /The migrations? from the database are not found locally in prisma\/migrations:/ {
    reading_database_only = 1
    next
  }
  reading_database_only && /^[[:space:]]*$/ { next }
  reading_database_only && /^[[:space:]]*[0-9]+_[A-Za-z0-9_-]+[[:space:]]*$/ {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "")
    print
    next
  }
  reading_database_only { exit }
' | sort -u)

if printf '%s\n' "$MIGRATE_STATUS" | grep -Eq "$DATABASE_ONLY_MARKER"; then
  if [ -z "$DATABASE_ONLY_MIGRATIONS" ]; then
    echo "❌ Could not parse database-only migrations; aborting instead of guessing"
    exit 1
  fi

  while IFS= read -r migration; do
    case "$migration" in
      20250817223318_production_baseline | \
      20250817223804_production_sync | \
      20250818021629_init_after_reset | \
      20250818060533_master_production_state)
        ;;
      *)
        echo "❌ Unknown database-only migration: $migration"
        echo "Resolve the migration history explicitly before deploying"
        exit 1
        ;;
    esac
  done <<< "$DATABASE_ONLY_MIGRATIONS"

  echo "⚠️  Ignoring known legacy production-only migration records:"
  echo "$DATABASE_ONLY_MIGRATIONS"
elif [ "$MIGRATE_STATUS_EXIT" -ne 0 ] && \
     ! printf '%s\n' "$MIGRATE_STATUS" | grep -q "have not yet been applied"; then
  echo "❌ Unexpected prisma migrate status failure; aborting instead of guessing"
  exit 1
fi

if printf '%s\n' "$MIGRATE_STATUS" | grep -q "have not yet been applied"; then
  echo "📋 Pending migrations detected — will apply via migrate deploy"
else
  echo "✅ No pending repository migrations detected; migrate deploy will verify"
fi

# 3) Safety: set conservative lock/statement timeouts for this session
echo "⏱️  Setting timeouts"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET lock_timeout='30s'; SET statement_timeout='5min';"

# 4) Apply migrations
echo "🚀 Applying migrations"
npx prisma migrate deploy

echo "✅ Migrations applied successfully"
echo "🔒 Production database schema updated safely"
