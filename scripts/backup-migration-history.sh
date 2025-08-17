#!/bin/bash

# Backup Migration History Script
# This script backs up the migration history before any database operations
# to prevent migration drift between local and production

set -e

echo "🔒 Backing up migration history..."

# Get current timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create backup directory
BACKUP_DIR="migration-backups"
mkdir -p "$BACKUP_DIR"

# Backup local migration history
echo "📋 Backing up local migration history..."
docker exec finsight-postgres psql -U postgres -d finsight -c "COPY (SELECT * FROM _prisma_migrations ORDER BY started_at) TO STDOUT WITH CSV HEADER" > "$BACKUP_DIR/local_migrations_$TIMESTAMP.csv"

# Backup production migration history (if accessible)
if [ -n "$DATABASE_URL" ]; then
    echo "📋 Backing up production migration history..."
    psql "$DATABASE_URL" -c "COPY (SELECT * FROM _prisma_migrations ORDER BY started_at) TO STDOUT WITH CSV HEADER" > "$BACKUP_DIR/production_migrations_$TIMESTAMP.csv"
    
    echo "📊 Migration counts:"
    echo "  Local: $(docker exec finsight-postgres psql -U postgres -d finsight -c "SELECT COUNT(*) FROM _prisma_migrations;" | grep -v "count\|----")"
    echo "  Production: $(psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM _prisma_migrations;" | grep -v "count\|----")"
else
    echo "⚠️  DATABASE_URL not set, skipping production backup"
fi

echo "✅ Migration history backed up to $BACKUP_DIR/"
echo "📁 Backup files:"
ls -la "$BACKUP_DIR/"*"$TIMESTAMP.csv"
