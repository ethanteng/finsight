#!/bin/bash

# Pre-Development Checklist Script
# Run this before starting any new development work to prevent migration drift

set -e

echo "🔍 Pre-Development Checklist"
echo "=============================="

# 1. Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "❌ You're not on main branch (currently on: $CURRENT_BRANCH)"
    echo "   Please checkout main first: git checkout main"
    exit 1
else
    echo "✅ On main branch"
fi

# 2. Pull latest changes
echo ""
echo "📥 Pulling latest changes..."
git pull origin main

# 3. Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set. Please set it to your production database URL."
    echo "   export DATABASE_URL='your_production_db_url'"
    exit 1
else
    echo "✅ DATABASE_URL is set"
fi

# 4. Backup migration history
echo ""
echo "🔒 Backing up migration history..."
./scripts/backup-migration-history.sh

# 5. Sync migrations
echo ""
echo "🔄 Syncing migrations..."
./scripts/sync-migrations.sh

# 6. Check for any drift
echo ""
echo "🔍 Checking for migration drift..."
npx prisma migrate status

echo ""
echo "✅ Pre-development checklist complete!"
echo ""
echo "💡 You can now safely:"
echo "   1. Create a feature branch: git checkout -b feature/your-feature"
echo "   2. Make your changes"
echo "   3. Create migrations: npx prisma migrate dev --name descriptive_name"
echo "   4. Test everything locally"
echo "   5. Commit and push: git add . && git commit -m 'feat: your feature' && git push"
