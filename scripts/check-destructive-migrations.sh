#!/usr/bin/env bash
set -euo pipefail

# Tripwire for destructive SQL in Prisma migrations.
#
# Usage: check-destructive-migrations.sh <migration-dir>...
#
# Each argument is a migration directory (the one holding migration.sql). A
# migration that drops a table, column, schema or type, changes a column's type,
# truncates, or deletes rows fails this check unless its migration.sql carries an
# explicit opt-in comment with a reason:
#
#   -- allow-destructive: <why this data loss is intended>
#
# This is not a SQL parser. It matches the SQL Prisma generates and the common
# hand-written forms, after stripping comments so Prisma's own "Warnings" block
# and commented-out statements do not count. Production migrations apply with no
# human approval step, so this is the one place a destructive change is stopped
# and has to be acknowledged in the migration itself.

if [ "$#" -eq 0 ]; then
  echo "✅ No migrations to check for destructive SQL"
  exit 0
fi

# Extended regex, matched case-insensitively against the migration with comments
# removed and all whitespace collapsed to single spaces.
DESTRUCTIVE_PATTERN='DROP (TABLE|COLUMN|SCHEMA|DATABASE|TYPE)\b|DROP (IF EXISTS )?"|ALTER COLUMN ("[^"]+"|[^ ]+) (SET DATA )?TYPE\b|\bTRUNCATE\b|\bDELETE FROM\b'
OPT_IN_PATTERN='^[[:space:]]*--[[:space:]]*allow-destructive:[[:space:]]*[^[:space:]]'

blocked=0

for dir in "$@"; do
  name=$(basename "$dir")
  sql="$dir/migration.sql"

  if [ ! -f "$sql" ]; then
    echo "❌ $name: no migration.sql found at $sql"
    blocked=1
    continue
  fi

  hits=$(perl -0777 -pe 's{/\*.*?\*/}{ }gs; s{--[^\n]*}{}g; s{\s+}{ }g' "$sql" \
    | grep -oiE "$DESTRUCTIVE_PATTERN" | sort | uniq -c || true)

  if [ -z "$hits" ]; then
    echo "✅ $name: no destructive SQL"
    continue
  fi

  opt_in=$(grep -iE -m1 "$OPT_IN_PATTERN" "$sql" || true)
  if [ -n "$opt_in" ]; then
    echo "⚠️  $name: destructive SQL allowed by opt-in"
    echo "    ${opt_in#"${opt_in%%[![:space:]]*}"}"
    echo "$hits" | sed 's/^/    /'
    continue
  fi

  echo "❌ $name: destructive SQL without an opt-in"
  echo "$hits" | sed 's/^/    /'
  blocked=1
done

if [ "$blocked" -ne 0 ]; then
  echo ""
  echo "Destructive migrations apply to production automatically once merged."
  echo "If the data loss is intended, add this line to the migration's migration.sql:"
  echo "  -- allow-destructive: <why this is safe>"
  exit 1
fi
