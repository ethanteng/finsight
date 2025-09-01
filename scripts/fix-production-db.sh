#!/bin/bash

# Production Database Fix Script
# This script applies the missing SnapTrade migration to production

echo "🔧 Fixing Production Database - SnapTrade Migration"
echo "=================================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ ERROR: Not in project root directory"
    exit 1
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    exit 1
fi

echo "✅ DATABASE_URL is configured"

# Apply the migration
echo "🚀 Applying Prisma migration..."
npx prisma migrate deploy

if [ $? -eq 0 ]; then
    echo "✅ Migration applied successfully"
else
    echo "❌ Migration failed"
    exit 1
fi

# Verify the table exists
echo "🔍 Verifying snaptrade_users table..."
npx prisma db execute --stdin <<EOF
SELECT table_name FROM information_schema.tables WHERE table_name = 'snaptrade_users';
EOF

echo "🎉 Database fix completed!"
echo ""
echo "The snaptrade_users table should now exist."
echo "Try testing SnapTrade initialization again."
