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

# Prints each destructive match in a migration.sql, after removing comments and
# collapsing whitespace. Perl rather than grep -E: telling a column drop from
# DROP CONSTRAINT needs a lookahead, because PostgreSQL makes COLUMN optional in
# both `DROP [COLUMN] name` and `ALTER [COLUMN] name [SET DATA] TYPE`.
# shellcheck disable=SC2016  # $-sigils below are Perl's, not the shell's
FIND_DESTRUCTIVE='
  s{/\*.*?\*/}{ }gs; s{--[^\n]*}{}g; s{\s+}{ }g;
  my $id = qr/(?:"[^"]+"|[^\s,;()"]+)/;
  my @patterns = (
    # DROP TABLE / COLUMN / SCHEMA / DATABASE / TYPE statements and actions
    qr/\bDROP (?:TABLE|COLUMN|SCHEMA|DATABASE|TYPE)\b/i,
    # A column drop without COLUMN: in ALTER TABLE action position (right after
    # the table name, or after a comma in an action list) DROP is either
    # DROP CONSTRAINT or a column drop
    qr/(?:\bALTER TABLE (?:IF EXISTS )?(?:ONLY )?$id(?:\.$id)? |, ?)\KDROP (?!CONSTRAINT\b|COLUMN\b)(?:IF EXISTS )?$id/i,
    # A column type change, with or without COLUMN. Without it, the lookahead
    # keeps ALTER TABLE/TYPE on something named "type" from reading as one
    qr/\bALTER (?:COLUMN |(?!(?:COLUMN|TABLE|TYPE)\b))$id (?:SET DATA )?TYPE\b/i,
    qr/\bTRUNCATE\b/i,
    qr/\bDELETE FROM\b/i,
  );
  for my $pattern (@patterns) { print "$&\n" while /$pattern/g }
'
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

  hits=$(perl -0777 -ne "$FIND_DESTRUCTIVE" "$sql" | sort | uniq -c)

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
